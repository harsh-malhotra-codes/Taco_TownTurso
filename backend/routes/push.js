const express = require("express");
const router = express.Router();
const db = require("../turso");

router.post("/register-push-token", async (req, res) => {
  try {
    // ensure body exists
    if (!req.body || !req.body.token) {
      return res.status(400).json({
        error: "Token is required in request body"
      });
    }

    const token = req.body.token;

    await db.execute({
      sql: `
        INSERT INTO push_tokens (id, token)
        VALUES (?, ?)
        ON CONFLICT(token) DO NOTHING
      `,
      args: [Date.now().toString(), token],
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Push token error:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

module.exports = router;