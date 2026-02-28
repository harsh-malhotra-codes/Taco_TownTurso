require("dotenv").config();

const { createClient } = require("@libsql/client");

if (!process.env.TURSO_DATABASE_URL) {
  console.error("❌ TURSO_DATABASE_URL missing in .env");
}

if (!process.env.TURSO_AUTH_TOKEN) {
  console.error("❌ TURSO_AUTH_TOKEN missing in .env");
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = db;