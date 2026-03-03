// const express = require("express");
// const router = express.Router();
// const db = require("../db");

// /* GET ALL ORDERS */
// router.get("/", async (req, res) => {
//   try {
//     const result = await db.execute(
//       "SELECT * FROM orders ORDER BY createdAt DESC"
//     );

//     // Convert BigInt + parse items safely
//     const orders = result.rows.map(o => ({
//       id: Number(o.id), // 🔥 FIX BigInt → Number
//       customerName: o.customerName,
//       phone: o.phone,
//       address: o.address,
//       items: JSON.parse(o.items || "[]"),
//       totalPrice: o.totalPrice,
//       paymentMethod: o.paymentMethod,
//       status: o.status,
//       createdAt: o.createdAt
//     }));

//     res.json(orders);
//   } catch (err) {
//     console.error("Orders error:", err);
//     res.status(500).json({ error: "Failed to fetch orders" });
//   }
// });

// /* CREATE ORDER */
// router.post("/", async (req, res) => {
//   try {
//     const { customerName, phone, address, items, totalPrice, paymentMethod } =
//       req.body;

//     const result = await db.execute({
//       sql: `INSERT INTO orders 
//       (customerName, phone, address, items, totalPrice, paymentMethod, status)
//       VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       args: [
//         customerName,
//         phone,
//         address,
//         JSON.stringify(items),
//         totalPrice,
//         paymentMethod,
//         "pending",
//       ],
//     });

//     // 🔥 FIX BigInt crash here
//     res.status(201).json({
//       message: "Order created successfully",
//       orderId: result.lastInsertRowid.toString()
//     });

//   } catch (err) {
//     console.error("Create order error:", err);
//     res.status(500).json({ error: "Failed to create order" });
//   }
// });

// /* DELETE ORDER */
// router.delete("/:id", async (req, res) => {
//   try {
//     await db.execute({
//       sql: "DELETE FROM orders WHERE id = ?",
//       args: [req.params.id],
//     });

//     res.json({ message: "Order deleted" });
//   } catch (err) {
//     console.error("Delete error:", err);
//     res.status(500).json({ error: "Failed to delete order" });
//   }
// });

// module.exports = router;

const express = require("express");
const router = express.Router();
const db = require("../db");
const { sendNewOrderNotification } = require("../notify");

/* =========================
   GET ALL ORDERS
========================= */
router.get("/", async (req, res) => {
  try {
    const result = await db.execute(
      "SELECT * FROM orders ORDER BY createdAt DESC"
    );

    const orders = result.rows.map(o => ({
      id: Number(o.id),
      customerName: o.customerName,
      phone: o.phone,
      address: o.address,
      items: JSON.parse(o.items || "[]"),
      totalPrice: o.totalPrice,
      paymentMethod: o.paymentMethod,
      status: o.status,
      workerName: o.workerName || null,
      createdAt: o.createdAt
    }));

    res.json(orders);
  } catch (err) {
    console.error("Orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* =========================
   CREATE ORDER
========================= */
router.post("/", async (req, res) => {
  try {
    const { customerName, phone, address, items, totalPrice, paymentMethod } =
      req.body;

    const result = await db.execute({
      sql: `INSERT INTO orders
      (customerName, phone, address, items, totalPrice, paymentMethod, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        customerName,
        phone,
        address,
        JSON.stringify(items),
        totalPrice,
        paymentMethod,
        "pending",
      ],
    });

    const orderId = result.lastInsertRowid.toString();

    await sendNewOrderNotification(orderId);

    res.status(201).json({
      message: "Order created successfully",
      orderId: orderId,
    });

  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

/* =========================
   DELETE ORDER
========================= */
router.delete("/:id", async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM orders WHERE id = ?",
      args: [req.params.id],
    });

    res.json({ message: "Order deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

/* =========================
   UPDATE ORDER STATUS
   (Start Preparing / Done)
========================= */
router.put("/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    await db.execute({
      sql: "UPDATE orders SET status = ? WHERE id = ?",
      args: [status, id],
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/* =========================
   UPDATE WORKER NAME
========================= */
router.put("/:id/worker", async (req, res) => {
  try {
    const id = req.params.id;
    const { workerName } = req.body;

    if (!workerName) {
      return res.status(400).json({ error: "workerName required" });
    }

    await db.execute({
      sql: "UPDATE orders SET workerName = ? WHERE id = ?",
      args: [workerName, id],
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Worker update error:", err);
    res.status(500).json({ error: "Failed to update worker" });
  }
});

module.exports = router;