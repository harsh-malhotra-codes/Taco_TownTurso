const express = require("express");
const router = express.Router();
const db = require("../turso");
const crypto = require("crypto");

router.post("/register-push-token", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const id = crypto.randomUUID();

    await db.execute({
      sql: "INSERT OR IGNORE INTO push_tokens (id, token) VALUES (?, ?)",
      args: [id, token],
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Push token error:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

module.exports = router;