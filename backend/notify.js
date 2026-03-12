const db = require("./db");

let ExpoClass = null;
let expoClient = null;

const MAX_RETRIES = Number(process.env.EXPO_PUSH_MAX_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.EXPO_PUSH_RETRY_BASE_DELAY_MS || 500);
const RETRY_MAX_DELAY_MS = Number(process.env.EXPO_PUSH_RETRY_MAX_DELAY_MS || 5000);
const TOKEN_DELETE_CHUNK_SIZE = 100;

async function getExpoResources() {
  if (!ExpoClass) {
    const expoModule = await import("expo-server-sdk");
    ExpoClass = expoModule.Expo;
  }

  if (!expoClient) {
    const options = {};
    if (process.env.EXPO_ACCESS_TOKEN) {
      options.accessToken = process.env.EXPO_ACCESS_TOKEN;
    }
    expoClient = new ExpoClass(options);
  }

  return { expo: expoClient, Expo: ExpoClass };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const retryableCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
  ]);

  if (error && retryableCodes.has(error.code)) {
    return true;
  }

  const statusCode = Number(error && (error.statusCode || error.status));
  if (statusCode >= 500 || statusCode === 429) {
    return true;
  }

  const message = String((error && error.message) || "").toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("429") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function withRetry(label, fn) {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt += 1;

    try {
      return await fn();
    } catch (error) {
      const retryable = isRetryableError(error);
      if (!retryable || attempt >= MAX_RETRIES) {
        throw error;
      }

      const backoff = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        RETRY_MAX_DELAY_MS
      );
      const jitter = Math.floor(Math.random() * 250);
      const delayMs = backoff + jitter;

      console.warn(
        `[push] ${label} failed (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delayMs}ms.`,
        {
          error: error && error.message ? error.message : String(error),
          code: error && error.code ? error.code : null,
          status: error && (error.statusCode || error.status)
            ? error.statusCode || error.status
            : null,
        }
      );

      await sleep(delayMs);
    }
  }

  return null;
}

function normalizeTokens(rows) {
  return rows
    .map((row) => (row && typeof row.token === "string" ? row.token.trim() : ""))
    .filter(Boolean);
}

async function deleteTokens(tokens, reason, orderId) {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return 0;
  }

  let deleted = 0;

  for (let index = 0; index < uniqueTokens.length; index += TOKEN_DELETE_CHUNK_SIZE) {
    const chunk = uniqueTokens.slice(index, index + TOKEN_DELETE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");

    await db.execute({
      sql: `DELETE FROM push_tokens WHERE token IN (${placeholders})`,
      args: chunk,
    });

    deleted += chunk.length;
  }

  console.warn(`[push][order:${orderId}] removed ${deleted} token(s). reason=${reason}`);
  return deleted;
}

async function isExpoPushToken(token) {
  const { Expo } = await getExpoResources();
  return Expo.isExpoPushToken(token);
}

async function sendNewOrderNotification(orderId) {
  const startedAt = Date.now();
  const summary = {
    orderId: String(orderId),
    fetchedTokens: 0,
    validTokens: 0,
    invalidFormatTokens: 0,
    sentMessages: 0,
    ticketErrors: 0,
    receiptErrors: 0,
    removedTokens: 0,
    durationMs: 0,
  };

  try {
    const { expo, Expo } = await getExpoResources();

    const tokenResult = await db.execute("SELECT token FROM push_tokens");
    const allTokens = normalizeTokens(tokenResult.rows || []);
    summary.fetchedTokens = allTokens.length;

    console.log(`[push][order:${orderId}] fetched ${allTokens.length} token(s) from push_tokens.`);

    if (allTokens.length === 0) {
      summary.durationMs = Date.now() - startedAt;
      console.log(`[push][order:${orderId}] no tokens to notify.`);
      return summary;
    }

    const validTokens = [];
    const invalidFormatTokens = [];

    for (const token of allTokens) {
      if (Expo.isExpoPushToken(token)) {
        validTokens.push(token);
      } else {
        invalidFormatTokens.push(token);
      }
    }

    summary.validTokens = validTokens.length;
    summary.invalidFormatTokens = invalidFormatTokens.length;

    if (invalidFormatTokens.length > 0) {
      summary.removedTokens += await deleteTokens(
        invalidFormatTokens,
        "invalid_format",
        orderId
      );
    }

    if (validTokens.length === 0) {
      summary.durationMs = Date.now() - startedAt;
      console.log(`[push][order:${orderId}] no valid Expo tokens after filtering.`);
      return summary;
    }

    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "🌮 New Order Received!",
      body: "A new order has been placed in TacoTown",
      data: { orderId: String(orderId) },
    }));

    summary.sentMessages = messages.length;

    const chunks = expo.chunkPushNotifications(messages);
    console.log(
      `[push][order:${orderId}] sending ${messages.length} notification(s) in ${chunks.length} chunk(s).`
    );

    const ticketById = new Map();
    const tokensMarkedForDeletion = new Set();
    const ticketErrors = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const tickets = await withRetry(
        `send chunk ${chunkIndex + 1}/${chunks.length}`,
        () => expo.sendPushNotificationsAsync(chunk)
      );

      console.log(`[push][order:${orderId}] Expo tickets chunk ${chunkIndex + 1}:`, tickets);

      for (let ticketIndex = 0; ticketIndex < tickets.length; ticketIndex += 1) {
        const ticket = tickets[ticketIndex];
        const token = chunk[ticketIndex] ? chunk[ticketIndex].to : null;

        if (ticket && ticket.status === "ok" && ticket.id) {
          ticketById.set(ticket.id, token);
          continue;
        }

        if (ticket && ticket.status === "error") {
          const errorCode = ticket.details && ticket.details.error
            ? ticket.details.error
            : "UnknownError";

          ticketErrors.push({
            token,
            error: errorCode,
            message: ticket.message || null,
          });

          if (errorCode === "DeviceNotRegistered" && token) {
            tokensMarkedForDeletion.add(token);
          }
        }
      }
    }

    summary.ticketErrors = ticketErrors.length;
    if (ticketErrors.length > 0) {
      console.warn(`[push][order:${orderId}] ticket errors:`, ticketErrors);
    }

    const receiptIds = Array.from(ticketById.keys());
    const receiptErrors = [];

    if (receiptIds.length > 0) {
      const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

      for (let chunkIndex = 0; chunkIndex < receiptChunks.length; chunkIndex += 1) {
        const chunk = receiptChunks[chunkIndex];

        const receipts = await withRetry(
          `fetch receipt chunk ${chunkIndex + 1}/${receiptChunks.length}`,
          () => expo.getPushNotificationReceiptsAsync(chunk)
        );

        console.log(`[push][order:${orderId}] Expo receipts chunk ${chunkIndex + 1}:`, receipts);

        for (const receiptId of chunk) {
          const receipt = receipts[receiptId];
          if (!receipt || receipt.status !== "error") {
            continue;
          }

          const token = ticketById.get(receiptId) || null;
          const errorCode = receipt.details && receipt.details.error
            ? receipt.details.error
            : "UnknownError";

          receiptErrors.push({
            token,
            error: errorCode,
            message: receipt.message || null,
          });

          if (errorCode === "DeviceNotRegistered" && token) {
            tokensMarkedForDeletion.add(token);
          }
        }
      }
    }

    summary.receiptErrors = receiptErrors.length;
    if (receiptErrors.length > 0) {
      console.warn(`[push][order:${orderId}] receipt errors:`, receiptErrors);
    }

    if (tokensMarkedForDeletion.size > 0) {
      summary.removedTokens += await deleteTokens(
        Array.from(tokensMarkedForDeletion),
        "DeviceNotRegistered",
        orderId
      );
    }

    summary.durationMs = Date.now() - startedAt;
    console.log(`[push][order:${orderId}] dispatch summary:`, summary);
    return summary;
  } catch (error) {
    summary.durationMs = Date.now() - startedAt;
    console.error(`[push][order:${orderId}] notification dispatch failed:`, error);
    throw error;
  }
}

module.exports = { sendNewOrderNotification, isExpoPushToken };
