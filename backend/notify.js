const db = require("./turso");

let Expo = null;

async function getExpo() {
  if (!Expo) {
    const expoModule = await import("expo-server-sdk");
    Expo = expoModule.Expo;
  }
  return new Expo();
}

async function sendNewOrderNotification(orderId) {
  try {
    const expo = await getExpo();

    // 1. Get all tokens
    const result = await db.execute("SELECT token FROM push_tokens");
    const tokens = result.rows.map((row) => row.token);

    if (tokens.length === 0) {
      console.log("No registered devices.");
      return;
    }

    // 2. Create messages
    let messages = [];

    for (let pushToken of tokens) {
      if (!expo.constructor.isExpoPushToken(pushToken)) {
        console.log("Invalid token:", pushToken);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: "default",
        title: "🌮 New Order Received!",
        body: "A new order has been placed in TacoTown",
        data: { orderId },
      });
    }

    // 3. Send notifications
    const chunks = expo.chunkPushNotifications(messages);

    for (let chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === "error" && ticket.details && ticket.details.error === "DeviceNotRegistered") {
            const token = chunk[i].to;
            console.log(`Removing invalid token: ${token}`);
            await db.execute({
              sql: "DELETE FROM push_tokens WHERE token = ?",
              args: [token],
            });
          }
        }
      } catch (error) {
        console.log("Push send error:", error);
      }
    }

    console.log("NOTIFICATION SENT SUCCESSFULLY");
  } catch (error) {
    console.error("Notification system error:", error);
  }
}

module.exports = { sendNewOrderNotification };