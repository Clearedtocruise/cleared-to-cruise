const path = require("path")
const sqlite3 = require("sqlite3").verbose()

const dbPath = path.join(__dirname, "database.db")

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database connection error:", err.message)
  } else {
    console.log("Connected to database.")
  }
})

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      vessel_type TEXT NOT NULL,
      rental_option TEXT NOT NULL,
      rental_date TEXT NOT NULL,
      trip_details TEXT DEFAULT '',
      status TEXT DEFAULT 'confirmed',
      review_status TEXT DEFAULT 'pending',
      payment_intent_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vessel_type TEXT NOT NULL,
      rental_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
})
db.run(`
  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT,
    rating INTEGER,
    message TEXT NOT NULL,
    approved INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    photos TEXT
  )
`)
module.exports = db