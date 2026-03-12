const express = require("express");
const router = express.Router();
const db = require("../db");
const { isExpoPushToken } = require("../notify");

router.post("/register-push-token", async (req, res) => {
  try {
    // ensure body exists
    if (!req.body || !req.body.token) {
      return res.status(400).json({
        error: "Token is required in request body"
      });
    }

    const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
    if (!token) {
      return res.status(400).json({ error: "Token must be a non-empty string" });
    }

    if (!(await isExpoPushToken(token))) {
      return res.status(400).json({ error: "Invalid Expo push token format" });
    }

    await db.execute({
      sql: `
        INSERT INTO push_tokens (id, token, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(token) DO UPDATE SET created_at = CURRENT_TIMESTAMP
      `,
      args: [`${Date.now()}${Math.floor(Math.random() * 1000)}`, token],
    });

    const tokenPreview = `${token.slice(0, 14)}...${token.slice(-8)}`;
    console.log(`[push] Registered token ${tokenPreview}`);

    res.json({ success: true });

  } catch (err) {
    console.error("Push token error:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

module.exports = router;
