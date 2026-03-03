require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const orderRoutes = require("./routes/order");
const pushRoutes = require("./routes/push");
const menuData = require("./menu-data");

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= WEBSITE STATIC FILES ================= */

app.use(express.static(path.join(__dirname, "../public")));

/* ================= API ROUTES ================= */

app.use("/orders", orderRoutes);
app.use("/api", pushRoutes);

app.get("/api/menu", (req, res) => {
  res.json({ success: true, data: menuData });
});

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 TacoTown Website + API Running");
  console.log(`🌍 http://localhost:${PORT}`);
  console.log("=================================");
});