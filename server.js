require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DATABASE_FILE || "./data/orders.sqlite";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new SQLiteStore(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 uid TEXT NOT NULL,
 player_name TEXT DEFAULT '',
 package_name TEXT NOT NULL,
 price_bdt INTEGER NOT NULL,
 payment_method TEXT NOT NULL CHECK(payment_method IN ('bKash','Nagad')),
 trx_id TEXT NOT NULL,
 customer_phone TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Paid','Processing','Completed','Rejected')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL
);
`);
if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_USERNAME) {
  console.error("Missing SESSION_SECRET, ADMIN_USERNAME or ADMIN_PASSWORD. Copy .env.example to .env and set them.");
  process.exit(1);
}
const adminExists = db.prepare("SELECT id FROM admins WHERE username=?").get(process.env.ADMIN_USERNAME);
if (!adminExists) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(process.env.ADMIN_USERNAME, hash);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

const packages = [
  { id: "d25", name: "25 Diamonds", price: 25 },
  { id: "d50", name: "50 Diamonds", price: 40 },
  { id: "d115", name: "115 Diamonds", price: 80 },
  { id: "d240", name: "240 Diamonds", price: 160 },
  { id: "d355", name: "355 Diamonds", price: 235 },
  { id: "d610", name: "610 Diamonds", price: 400 },
  { id: "d1240", name: "1240 Diamonds", price: 800 },
  { id: "weekly", name: "Weekly Membership", price: 160 },
  { id: "monthly", name: "Monthly Membership", price: 800 }
];
const safeOrder = o => ({
  id: o.id, uid: o.uid, player_name: o.player_name, package_name: o.package_name,
  price_bdt: o.price_bdt, payment_method: o.payment_method, trx_id: o.trx_id,
  customer_phone: o.customer_phone, status: o.status, created_at: o.created_at
});
const requireAdmin = (req,res,next) => req.session.admin ? next() : res.status(401).json({error:"Admin login required"});
app.get("/api/config", (req,res) => res.json({
  packages,
  paymentNumbers: {
    bKash: process.env.BKASH_MERCHANT_NUMBER || "Admin-এর সাথে যোগাযোগ করুন",
    Nagad: process.env.NAGAD_MERCHANT_NUMBER || "Admin-এর সাথে যোগাযোগ করুন"
  },
  whatsapp: process.env.STORE_WHATSAPP || "8801729315989"
}));
app.post("/api/orders", orderLimiter, (req,res) => {
  const { uid, playerName="", packageId, paymentMethod, trxId, customerPhone="" } = req.body || {};
  const pack = packages.find(p => p.id === packageId);
  if (!/^\d{5,20}$/.test(String(uid || ""))) return res.status(400).json({error:"সঠিক Player UID দিন (৫–২০ সংখ্যা)।"});
  if (!pack) return res.status(400).json({error:"সঠিক প্যাকেজ নির্বাচন করুন।"});
  if (!["bKash","Nagad"].includes(paymentMethod)) return res.status(400).json({error:"bKash অথবা Nagad নির্বাচন করুন।"});
  if (typeof trxId !== "string" || trxId.trim().length < 5 || trxId.trim().length > 80) return res.status(400).json({error:"সঠিক Transaction ID দিন।"});
  if (String(playerName).length > 40 || String(customerPhone).length > 20) return res.status(400).json({error:"তথ্য সীমার বাইরে।"});
  const result = db.prepare(`INSERT INTO orders(uid,player_name,package_name,price_bdt,payment_method,trx_id,customer_phone)
    VALUES(?,?,?,?,?,?,?)`).run(String(uid),String(playerName).trim(),pack.name,pack.price,paymentMethod,trxId.trim(),String(customerPhone).trim());
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(result.lastInsertRowid);
  res.status(201).json({message:"অর্ডার জমা হয়েছে। পেমেন্ট যাচাইয়ের পর Admin আপডেট করবেন।",order:safeOrder(order)});
});
app.post("/api/admin/login", loginLimiter, (req,res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare("SELECT * FROM admins WHERE username=?").get(String(username || ""));
  if (!admin || !bcrypt.compareSync(String(password || ""), admin.password_hash)) return res.status(401).json({error:"Username অথবা password ভুল।"});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Login failed"});
    req.session.admin = { id: admin.id, username: admin.username };
    res.json({message:"Login successful",username:admin.username});
  });
});
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(() => res.json({message:"Logged out"})));
app.get("/api/admin/me", (req,res) => res.json({loggedIn:!!req.session.admin,username:req.session.admin?.username || null}));
app.get("/api/admin/orders", requireAdmin, (req,res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all().map(safeOrder);
  const stats = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN status='Completed' THEN price_bdt ELSE 0 END) completed_sales FROM orders`).get();
  res.json({orders,stats});
});
app.patch("/api/admin/orders/:id", requireAdmin, (req,res) => {
  const allowed = ["Pending","Paid","Processing","Completed","Rejected"];
  const status = req.body?.status;
  if (!allowed.includes(status)) return res.status(400).json({error:"Invalid status"});
  const result = db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({error:"Order not found"});
  res.json({message:"Order updated"});
});
app.use(express.static(path.join(__dirname,"public")));
app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`ALAMIN BHAI PRO running on port ${PORT}`));
