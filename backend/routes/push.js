const express = require("express");
const router = express.Router();
const db = require("../turso");

router.post("/register-push-token", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    await db.execute({
      sql: `
        INSERT INTO push_tokens (token)
        VALUES (?)
        ON CONFLICT(token) DO NOTHING
      `,
      args: [token],
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Push token error:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

module.exports = router;