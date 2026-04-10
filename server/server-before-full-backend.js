require("dotenv").config()

const express = require("express")
const cors = require("cors")
const sqlite3 = require("sqlite3").verbose()
const Stripe = require("stripe")
const nodemailer = require("nodemailer")

const app = express()
const PORT = process.env.PORT || 5001
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// ======================
// DATABASE
// ======================
const db = new sqlite3.Database("./database.db")

db.run(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  rental TEXT,
  date TEXT,
  price INTEGER,
  status TEXT,
  waiverSigned TEXT,
  stripeSessionId TEXT,
  depositSessionId TEXT
)
`)

// ======================
// MIDDLEWARE
// ======================
app.use(cors())
app.use(express.json())

// ======================
// EMAIL SETUP
// ======================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// ======================
// HELPERS
// ======================
function isWithin3Days(dateStr) {
  const rentalDate = new Date(dateStr)
  const now = new Date()
  return (rentalDate - now) <= 3 * 24 * 60 * 60 * 1000
}

// ======================
// CREATE BOOKING
// ======================
app.post("/api/create-booking", (req, res) => {
  const { name, email, rental, date, price, waiverSigned } = req.body

  db.run(
    `INSERT INTO bookings (name, email, rental, date, price, status, waiverSigned)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, email, rental, date, price, "pending", waiverSigned],
    async function (err) {
      if (err) {
        console.error(err)
        return res.status(500).send("Error creating booking")
      }

      const bookingId = this.lastID
      const approveLink = `http://localhost:5001/api/admin/approve/${bookingId}`

      // 📧 EMAIL YOU
      await transporter.sendMail({
        to: "clearedtocruise@gmail.com",
        subject: "New Booking Request",
        html: `
          <h2>New Booking</h2>
          <p>Name: ${name}</p>
          <p>Email: ${email}</p>
          <p>Rental: ${rental}</p>
          <p>Date: ${date}</p>

          <a href="${approveLink}" style="padding:12px;background:green;color:white;">
            APPROVE BOOKING
          </a>
        `
      })

      res.send({ bookingId })
    }
  )
})

// ======================
// APPROVE BOOKING
// ======================
app.get("/api/admin/approve/:id", (req, res) => {
  const id = req.params.id

  db.get("SELECT * FROM bookings WHERE id = ?", [id], async (err, booking) => {
    if (!booking) return res.send("Booking not found")

    db.run(
      "UPDATE bookings SET status = 'approved' WHERE id = ?",
      [id],
      async () => {

        // 💳 CREATE PAYMENT SESSION
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: { name: booking.rental },
              unit_amount: booking.price
            },
            quantity: 1
          }],
          success_url: `${CLIENT_URL}/success?bookingId=${booking.id}`,
          cancel_url: `${CLIENT_URL}/cancel`,
          metadata: {
            bookingId: booking.id
          }
        })

        // 📧 SEND CUSTOMER PAYMENT LINK
        await transporter.sendMail({
          to: booking.email,
          subject: "Booking Approved - Payment Required",
          html: `
            <h2>Your booking is approved!</h2>
            <a href="${session.url}" style="padding:12px;background:blue;color:white;">
              PAY NOW
            </a>
          `
        })

        res.send("✅ Booking approved + payment sent!")
      }
    )
  })
})

// ======================
// WEBHOOK
// ======================
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const event = JSON.parse(req.body)

  if (event.type === "checkout.session.completed") {
    const session = event.data.object
    const bookingId = session.metadata.bookingId

    db.get("SELECT * FROM bookings WHERE id = ?", [bookingId], async (err, booking) => {
      if (!booking) return

      if (isWithin3Days(booking.date)) {
        await sendDepositEmail(booking)
      } else {
        setTimeout(() => sendDepositEmail(booking), 3 * 24 * 60 * 60 * 1000)
      }
    })
  }

  res.sendStatus(200)
})

// ======================
// DEPOSIT EMAIL
// ======================
async function sendDepositEmail(booking) {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: "Security Deposit" },
        unit_amount: 50000
      },
      quantity: 1
    }],
    success_url: `${CLIENT_URL}/success`,
    cancel_url: `${CLIENT_URL}/cancel`,
    payment_intent_data: {
      capture_method: "manual"
    }
  })

  await transporter.sendMail({
    to: booking.email,
    subject: "Security Deposit Required",
    html: `
      <h2>$500 Deposit Required</h2>
      <a href="${session.url}" style="padding:12px;background:red;color:white;">
        Submit Deposit
      </a>
    `
  })
}

// ======================
// ADMIN: UPDATE BOOKING
// ======================
app.post("/api/admin/update/:id", (req, res) => {
  const id = req.params.id
  const { date, price, rental } = req.body

  db.run(
    "UPDATE bookings SET date=?, price=?, rental=? WHERE id=?",
    [date, price, rental, id],
    function () {
      res.send("Updated")
    }
  )
})

// ======================
// ADMIN: GET BOOKINGS
// ======================
app.get("/api/admin/bookings", (req, res) => {
  db.all("SELECT * FROM bookings", [], (err, rows) => {
    res.send(rows)
  })
})

// ======================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})