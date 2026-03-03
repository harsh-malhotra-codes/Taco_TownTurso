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
        await expo.sendPushNotificationsAsync(chunk);
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