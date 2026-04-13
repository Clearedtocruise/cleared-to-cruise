require("dotenv").config()

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err)
})

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err)
})

const express = require("express")
const cors = require("cors")
const sqlite3 = require("sqlite3").verbose()
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const Stripe = require("stripe")
const nodemailer = require("nodemailer")

const app = express()

const PORT = Number(process.env.PORT || 5001)
const CLIENT_URL = String(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "")
const SITE_URL = String(process.env.SITE_URL || CLIENT_URL).replace(/\/$/, "")
const API_URL = String(process.env.API_URL || `http://localhost:${PORT}`).replace(/\/$/, "")
const ADMIN_ACTION_TOKEN = String(process.env.ADMIN_ACTION_TOKEN || "").trim()
const ADMIN_NOTIFICATION_EMAIL = String(
  process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER || ""
).trim()
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "admin").trim()
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim()

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY is not set.")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "")

// -----------------------------
// HELPERS
// -----------------------------
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function statusLabel(value) {
  return String(value || "").replaceAll("_", " ")
}

function rentalBoatType(label) {
  const lower = String(label || "").toLowerCase()
  if (lower.includes("pontoon")) return "Pontoon"
  if (lower.includes("bass")) return "Bass Boat"
  if (lower.includes("jet ski")) return "Jet Ski"
  return "All Rentals"
}

function rentalBasePrice(label) {
  switch (label) {
    case "Jet Ski (Single)":
      return 40000
    case "Jet Ski (Double)":
      return 75000
    case "Pontoon - 6 Hours":
      return 60000
    case "Pontoon - 8 Hours":
      return 75000
    case "Pontoon - 10 Hours":
      return 90000
    case "Bass Boat - Full Day":
      return 40000
    default:
      return 0
  }
}

function towFeeForLocation(location) {
  if (location === "Castaic") return 7500
  if (location === "Pyramid") return 15000
  return 0
}

function centsFromDollars(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

function dollarsFromCents(value) {
  return (Number(value || 0) / 100).toFixed(2)
}

function formatDepositRequestUrl(bookingId) {
  return `${SITE_URL}/deposit/${bookingId}`
}

function formatPaymentUrl(bookingId) {
  return `${SITE_URL}/pay/${bookingId}`
}

function adminApproveUrl(bookingId) {
  return `${API_URL}/api/admin/approve/${bookingId}?token=${encodeURIComponent(ADMIN_ACTION_TOKEN)}`
}

function adminDenyUrl(bookingId) {
  return `${API_URL}/api/admin/deny/${bookingId}?token=${encodeURIComponent(ADMIN_ACTION_TOKEN)}`
}

function adminViewUrl() {
  return `${SITE_URL}/admin`
}

function startOfDay(dateValue) {
  return new Date(`${dateValue}T00:00:00`)
}

function daysUntilBooking(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY
  const now = new Date()
  const target = startOfDay(dateValue)
  const diffMs = target.getTime() - now.getTime()
  return diffMs / (1000 * 60 * 60 * 24)
}

function isWithinNextThreeDays(dateValue) {
  const diffDays = daysUntilBooking(dateValue)
  return diffDays <= 3
}

function requireAdminToken(req, res, next) {
  if (!ADMIN_ACTION_TOKEN) {
    return res.status(500).send("ADMIN_ACTION_TOKEN is not configured on the server.")
  }

  const token = String(req.query.token || req.headers["x-admin-token"] || "").trim()

  if (!token || token !== ADMIN_ACTION_TOKEN) {
    return res.status(403).send("Forbidden")
  }

  next()
}

function requireAdminLogin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server." })
  }

  const authHeader = String(req.headers.authorization || "")

  if (!authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const encoded = authHeader.slice(6).trim()
    const decoded = Buffer.from(encoded, "base64").toString("utf8")
    const separatorIndex = decoded.indexOf(":")

    if (separatorIndex === -1) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const username = decoded.slice(0, separatorIndex).trim()
    const password = decoded.slice(separatorIndex + 1).trim()

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" })
  }
}

// -----------------------------
// EMAIL
// -----------------------------
const mailer =
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null

async function sendEmail({ to, subject, text, html, attachments = [] }) {
  if (!to) {
    console.warn("Email skipped: missing recipient.")
    return
  }

  if (!mailer) {
    console.warn("Email skipped: mailer not configured.")
    return
  }

  return mailer.sendMail({
    from: `"Cleared to Cruise" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  })
}

function bookingPhotoAttachment(photoIdPath) {
  if (!photoIdPath) return []
  const resolved = path.resolve(__dirname, String(photoIdPath).replace(/^\.\//, ""))
  if (!fs.existsSync(resolved)) return []
  return [
    {
      filename: path.basename(resolved),
      path: resolved,
    },
  ]
}

async function sendAdminApprovalEmail(booking) {
  const approveUrl = adminApproveUrl(booking.id)
  const denyUrl = adminDenyUrl(booking.id)
  const photoUrl = booking.photoIdPath
    ? `${API_URL}/${String(booking.photoIdPath).replace(/^\.?\//, "")}`
    : ""

  return sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: `Approve or deny booking #${booking.id}`,
    text: `
A new booking requires review.

Booking ID: ${booking.id}
Name: ${booking.waiverPrintedName || "No name"}
Email: ${booking.customerEmail || "No email"}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
Tow Location: ${booking.towLocation || "None"}
Status: ${statusLabel(booking.status || "pending_approval")}

Approve:
${approveUrl}

Deny:
${denyUrl}

Admin page:
${adminViewUrl()}

Photo ID:
${photoUrl || "Not available"}
    `.trim(),
    html: `
      <h2>New booking requires review</h2>
      <p><strong>Booking ID:</strong> ${booking.id}</p>
      <p><strong>Name:</strong> ${escapeHtml(booking.waiverPrintedName || "No name")}</p>
      <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
      <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
      <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
      <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
      <p><strong>Tow Location:</strong> ${escapeHtml(booking.towLocation || "None")}</p>
      <p><strong>Status:</strong> ${escapeHtml(statusLabel(booking.status || "pending_approval"))}</p>
      ${
        photoUrl
          ? `<p><strong>Photo ID Link:</strong> <a href="${photoUrl}" target="_blank" rel="noopener noreferrer">View uploaded ID</a></p>`
          : ""
      }
      <div style="margin-top:24px;">
        <a href="${approveUrl}" style="display:inline-block;padding:12px 18px;background:#157347;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:10px;">Approve Booking</a>
        <a href="${denyUrl}" style="display:inline-block;padding:12px 18px;background:#b42318;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Deny Booking</a>
      </div>
      <p style="margin-top:18px;">
        <a href="${adminViewUrl()}" target="_blank" rel="noopener noreferrer">Open admin page</a>
      </p>
    `,
    attachments: bookingPhotoAttachment(booking.photoIdPath),
  })
}

// -----------------------------
// CORS
// -----------------------------
const allowedOrigins = [
  CLIENT_URL,
  SITE_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://clearedtocruiserentals.com",
  "https://www.clearedtocruiserentals.com",
  "https://cleared-to-cruise.vercel.app",
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS not allowed for origin: ${origin}`))
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
    credentials: true,
  })
)

// -----------------------------
// DATABASE HELPERS
// -----------------------------
const dbPath = path.join(__dirname, "database.db")
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("DATABASE ERROR:", err)
  } else {
    console.log("Connected to SQLite database.")
  }
})

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err)
      resolve(this)
    })
  })
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err)
      resolve(row)
    })
  })
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

async function getHolidayPriceOverride(date, rentalLabel) {
  if (!date || !rentalLabel) return null

  return getAsync(
    `
    SELECT *
    FROM pricing_overrides
    WHERE isActive = 1
      AND overrideType = 'holiday'
      AND date = ?
      AND rentalLabel = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [date, rentalLabel]
  )
}

async function getManualPriceOverrideForBooking(booking) {
  if (!booking) return null

  const byBookingId = booking.id
    ? await getAsync(
        `
        SELECT *
        FROM pricing_overrides
        WHERE isActive = 1
          AND overrideType IN ('manual_discount', 'manual_price')
          AND bookingId = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [booking.id]
      )
    : null

  if (byBookingId) return byBookingId

  if (!booking.customerEmail) return null

  return getAsync(
    `
    SELECT *
    FROM pricing_overrides
    WHERE isActive = 1
      AND overrideType IN ('manual_discount', 'manual_price')
      AND LOWER(COALESCE(customerEmail, '')) = ?
      AND (
        bookingId IS NULL
        OR bookingId = ''
      )
    ORDER BY id DESC
    LIMIT 1
    `,
    [normalizeEmail(booking.customerEmail)]
  )
}

async function calculateBookingAmounts(booking) {
  const baseRentalAmount = rentalBasePrice(booking.rentalLabel)
  const towFeeAmount = towFeeForLocation(booking.towLocation)

  let finalRentalAmount = baseRentalAmount
  let appliedPricing = null

  const holidayOverride = await getHolidayPriceOverride(booking.date, booking.rentalLabel)
  if (holidayOverride && Number(holidayOverride.overrideAmount || 0) > 0) {
    finalRentalAmount = Number(holidayOverride.overrideAmount || 0)
    appliedPricing = {
      source: "holiday",
      label: holidayOverride.overrideLabel || "Holiday Pricing",
      amount: finalRentalAmount,
      id: holidayOverride.id,
    }
  }

  const manualOverride = await getManualPriceOverrideForBooking(booking)
  if (manualOverride) {
    const overrideAmount = Number(manualOverride.overrideAmount || 0)

    if (manualOverride.overrideType === "manual_price" && overrideAmount > 0) {
      finalRentalAmount = overrideAmount
      appliedPricing = {
        source: "manual_price",
        label: manualOverride.overrideLabel || "Manual Price Override",
        amount: finalRentalAmount,
        id: manualOverride.id,
      }
    }

    if (manualOverride.overrideType === "manual_discount" && overrideAmount > 0) {
      finalRentalAmount = Math.max(0, finalRentalAmount - overrideAmount)
      appliedPricing = {
        source: "manual_discount",
        label: manualOverride.overrideLabel || "Manual Discount",
        amount: overrideAmount,
        id: manualOverride.id,
      }
    }
  }

  return {
    baseRentalAmount,
    towFeeAmount,
    finalRentalAmount,
    totalAmount: finalRentalAmount + towFeeAmount,
    appliedPricing,
  }
}

// -----------------------------
// STRIPE WEBHOOK FIRST
// -----------------------------
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"]

  let event
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("WEBHOOK SIGNATURE ERROR:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const bookingId = Number(session.metadata?.bookingId || 0)

      if (!bookingId) {
        return res.json({ received: true })
      }

      if (session.mode === "payment") {
        db.run(
          `
          UPDATE bookings
          SET paymentStatus = 'paid',
              status = CASE
                WHEN status IN ('approved_unpaid', 'pending_payment') THEN 'confirmed'
                ELSE status
              END,
              stripeSessionId = ?,
              stripePaymentIntentId = ?
          WHERE id = ?
          `,
          [session.id || null, session.payment_intent || null, bookingId],
          async function (err) {
            if (err) {
              console.error("WEBHOOK PAYMENT UPDATE ERROR:", err)
              return
            }

            db.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId], async (_lookupErr, booking) => {
              if (!booking) return

              try {
                const amounts = await calculateBookingAmounts(booking)

                if (booking.customerEmail) {
                  await sendEmail({
                    to: booking.customerEmail,
                    subject: `Payment received for booking #${booking.id}`,
                    text: `
Your payment has been received.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
Paid Total: $${dollarsFromCents(amounts.totalAmount)}
Status: ${booking.status || "confirmed"}
                    `.trim(),
                    html: `
                      <h2>Payment received</h2>
                      <p><strong>Booking ID:</strong> ${booking.id}</p>
                      <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
                      <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
                      <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
                      <p><strong>Paid Total:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
                      <p><strong>Status:</strong> ${escapeHtml(booking.status || "confirmed")}</p>
                    `,
                  })
                }

                await sendEmail({
                  to: ADMIN_NOTIFICATION_EMAIL,
                  subject: `Rental payment received for booking #${booking.id}`,
                  text: `
Rental payment received.

Booking ID: ${booking.id}
Name: ${booking.waiverPrintedName || "No name"}
Email: ${booking.customerEmail || "No email"}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
Paid Total: $${dollarsFromCents(amounts.totalAmount)}
                  `.trim(),
                  html: `
                    <h2>Rental payment received</h2>
                    <p><strong>Booking ID:</strong> ${booking.id}</p>
                    <p><strong>Name:</strong> ${escapeHtml(booking.waiverPrintedName || "No name")}</p>
                    <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
                    <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
                    <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
                    <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
                    <p><strong>Paid Total:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
                  `,
                })
              } catch (emailErr) {
                console.error("WEBHOOK PAYMENT EMAIL ERROR:", emailErr)
              }
            })
          }
        )
      }

      if (session.mode === "setup") {
        let paymentMethodId = null

        if (session.setup_intent) {
          const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent)
          paymentMethodId = setupIntent.payment_method || null
        }

        db.run(
          `
          UPDATE bookings
          SET stripeCustomerId = ?,
              stripePaymentMethodId = ?,
              depositSetupSessionId = ?,
              depositSetupIntentId = ?,
              depositStatus = 'card_on_file'
          WHERE id = ?
          `,
          [
            session.customer || null,
            paymentMethodId,
            session.id,
            session.setup_intent || null,
            bookingId,
          ],
          async function (err) {
            if (err) {
              console.error("WEBHOOK SETUP UPDATE ERROR:", err)
              return
            }

            db.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId], async (_e, booking) => {
              if (!booking) return
              try {
                if (booking.customerEmail) {
                  await sendEmail({
                    to: booking.customerEmail,
                    subject: `Security deposit card saved for booking #${booking.id}`,
                    text: `
Your security deposit card authorization has been saved.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
                    `.trim(),
                    html: `
                      <h2>Security deposit card saved</h2>
                      <p><strong>Booking ID:</strong> ${booking.id}</p>
                      <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
                      <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
                    `,
                  })
                }
              } catch (emailErr) {
                console.error("WEBHOOK DEPOSIT EMAIL ERROR:", emailErr)
              }
            })
          }
        )
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error("WEBHOOK PROCESSING ERROR:", err)
    res.status(500).send("Webhook processing failed")
  }
})

// normal JSON after webhook
app.use(express.json())

// -----------------------------
// ADMIN LOGIN
// -----------------------------
app.post("/api/admin/login", (req, res) => {
  const username = String(req.body?.username || "").trim()
  const password = String(req.body?.password || "").trim()

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server." })
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid username or password." })
  }

  return res.json({
    success: true,
    token: ADMIN_PASSWORD,
  })
})

// -----------------------------
// FILES / UPLOADS
// -----------------------------
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

app.use("/uploads", express.static(uploadsDir))

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-")
    cb(null, `${Date.now()}-${safeName}`)
  },
})

const upload = multer({ storage })

// -----------------------------
// SCHEMA + MIGRATIONS
// -----------------------------
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      rentalLabel TEXT,
      boatType TEXT,
      date TEXT,
      rentalTime TEXT,
      towLocation TEXT,
      towFee INTEGER DEFAULT 0,
      waiverPrintedName TEXT,
      waiverAccepted INTEGER DEFAULT 0,
      waiverAcceptedAt TEXT,
      waiverStatus TEXT DEFAULT 'not_started',
      paymentStatus TEXT DEFAULT 'unpaid',
      status TEXT DEFAULT 'pending_approval',
      customerEmail TEXT,
      photoIdPath TEXT,
      stripeSessionId TEXT,
      stripePaymentIntentId TEXT,
      stripeCustomerId TEXT,
      stripePaymentMethodId TEXT,
      depositSetupSessionId TEXT,
      depositSetupIntentId TEXT,
      depositPaymentIntentId TEXT,
      depositRequestedAt TEXT,
      depositPlacedAt TEXT,
      depositReleasedAt TEXT,
      depositStatus TEXT DEFAULT 'not_scheduled',
      depositLinkSentAt TEXT,
      createdAt TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boatType TEXT NOT NULL,
      date TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL,
      rentalLabel TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS pricing_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      overrideType TEXT NOT NULL,
      overrideLabel TEXT,
      rentalLabel TEXT,
      date TEXT,
      bookingId TEXT,
      customerEmail TEXT,
      overrideAmount INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)

  const bookingColumns = [
    ["userId", "TEXT"],
    ["rentalLabel", "TEXT"],
    ["boatType", "TEXT"],
    ["date", "TEXT"],
    ["rentalTime", "TEXT"],
    ["towLocation", "TEXT"],
    ["towFee", "INTEGER DEFAULT 0"],
    ["waiverPrintedName", "TEXT"],
    ["waiverAccepted", "INTEGER DEFAULT 0"],
    ["waiverAcceptedAt", "TEXT"],
    ["waiverStatus", "TEXT DEFAULT 'not_started'"],
    ["paymentStatus", "TEXT DEFAULT 'unpaid'"],
    ["status", "TEXT DEFAULT 'pending_approval'"],
    ["customerEmail", "TEXT"],
    ["photoIdPath", "TEXT"],
    ["stripeSessionId", "TEXT"],
    ["stripePaymentIntentId", "TEXT"],
    ["stripeCustomerId", "TEXT"],
    ["stripePaymentMethodId", "TEXT"],
    ["depositSetupSessionId", "TEXT"],
    ["depositSetupIntentId", "TEXT"],
    ["depositPaymentIntentId", "TEXT"],
    ["depositRequestedAt", "TEXT"],
    ["depositPlacedAt", "TEXT"],
    ["depositReleasedAt", "TEXT"],
    ["depositStatus", "TEXT DEFAULT 'not_scheduled'"],
    ["depositLinkSentAt", "TEXT"],
    ["createdAt", "TEXT"],
  ]

  db.all(`PRAGMA table_info(bookings)`, [], (err, rows) => {
    if (err) {
      console.error("BOOKINGS PRAGMA ERROR:", err)
      return
    }

    const existing = new Set(rows.map((r) => r.name))
    bookingColumns.forEach(([name, type]) => {
      if (!existing.has(name)) {
        db.run(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`, [], (alterErr) => {
          if (alterErr) {
            console.error(`ALTER bookings add ${name} ERROR:`, alterErr)
          }
        })
      }
    })

    db.run(
      `UPDATE bookings SET createdAt = COALESCE(createdAt, datetime('now')) WHERE createdAt IS NULL OR createdAt = ''`,
      [],
      (updateErr) => {
        if (updateErr) console.error("BOOKINGS createdAt backfill ERROR:", updateErr)
      }
    )
  })

  db.all(`PRAGMA table_info(blocked_dates)`, [], (err, rows) => {
    if (err) {
      console.error("BLOCKED DATES PRAGMA ERROR:", err)
      return
    }

    const existing = new Set(rows.map((r) => r.name))
    if (!existing.has("rentalLabel")) {
      db.run(`ALTER TABLE blocked_dates ADD COLUMN rentalLabel TEXT`, [], (alterErr) => {
        if (alterErr) console.error("ALTER blocked_dates rentalLabel ERROR:", alterErr)
      })
    }
    if (!existing.has("createdAt")) {
      db.run(`ALTER TABLE blocked_dates ADD COLUMN createdAt TEXT`, [], (alterErr) => {
        if (alterErr) console.error("ALTER blocked_dates createdAt ERROR:", alterErr)
      })
    }
  })

  db.get(`SELECT seq FROM sqlite_sequence WHERE name = 'bookings'`, [], (err, row) => {
    if (err) return
    if (!row) {
      db.run(`INSERT INTO sqlite_sequence(name, seq) VALUES('bookings', 999)`, [], () => {})
    } else if ((row.seq || 0) < 999) {
      db.run(`UPDATE sqlite_sequence SET seq = 999 WHERE name = 'bookings'`, [], () => {})
    }
  })
})

// -----------------------------
// HEALTH
// -----------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true })
})

// -----------------------------
// AVAILABILITY
// -----------------------------
app.get("/api/availability", async (req, res) => {
  const { rentalLabel, date } = req.query

  if (!rentalLabel || !date) {
    return res.status(400).json({ error: "rentalLabel and date are required." })
  }

  try {
    const boatType = rentalBoatType(rentalLabel)

    const blockedRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM blocked_dates
      WHERE date = ?
        AND (
          rentalLabel = ?
          OR rentalLabel = 'All Rentals'
          OR rentalLabel IS NULL
          OR boatType = ?
          OR boatType = 'All Rentals'
        )
      `,
      [date, rentalLabel, boatType]
    )

    if ((blockedRow?.count || 0) > 0) {
      return res.json({ available: false })
    }

    if (boatType === "Jet Ski") {
      const rows = await allAsync(
        `
        SELECT rentalLabel
        FROM bookings
        WHERE date = ?
          AND boatType = 'Jet Ski'
          AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
        `,
        [date]
      )

      const singleCount = rows.filter((r) => r.rentalLabel === "Jet Ski (Single)").length
      const hasDouble = rows.some((r) => r.rentalLabel === "Jet Ski (Double)")

      let available = true

      if (rentalLabel === "Jet Ski (Double)") {
        available = !hasDouble && singleCount === 0
      } else if (rentalLabel === "Jet Ski (Single)") {
        available = !hasDouble && singleCount < 2
      }

      return res.json({ available })
    }

    const bookingRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE date = ?
        AND rentalLabel = ?
        AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
      `,
      [date, rentalLabel]
    )

    return res.json({ available: (bookingRow?.count || 0) === 0 })
  } catch (err) {
    console.error("AVAILABILITY ERROR:", err)
    return res.status(500).json({ error: "Could not check availability." })
  }
})

// -----------------------------
// BOOKING LOOKUP
// -----------------------------
app.post("/api/bookings/lookup", async (req, res) => {
  const bookingId = String(req.body.bookingId || "").trim()
  const email = normalizeEmail(req.body.email)

  if (!bookingId && !email) {
    return res.status(400).json({ error: "Booking ID or email is required." })
  }

  try {
    if (bookingId) {
      const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [bookingId])

      if (!booking) {
        return res.status(404).json({ error: "Booking not found." })
      }

      if (email && normalizeEmail(booking.customerEmail) !== email) {
        return res.status(404).json({ error: "Booking not found." })
      }

      return res.json({ mode: "single", booking })
    }

    const bookings = await allAsync(
      `SELECT * FROM bookings WHERE LOWER(COALESCE(customerEmail, '')) = ? ORDER BY id DESC`,
      [email]
    )

    if (!bookings.length) {
      return res.status(404).json({ error: "No bookings found for that email." })
    }

    return res.json({ mode: "list", bookings })
  } catch (err) {
    console.error("BOOKING LOOKUP ERROR:", err)
    return res.status(500).json({ error: "Could not lookup booking." })
  }
})

// -----------------------------
// CREATE BOOKING + WAIVER UPLOAD
// -----------------------------
app.post("/api/bookings/waiver", upload.single("photoId"), async (req, res) => {
  console.log("BOOKING REQUEST FILE:", req.file ? req.file.filename : "NO FILE")

  const {
    rentalLabel,
    date,
    rentalTime,
    towLocation,
    waiverPrintedName,
    waiverAccepted,
    customerEmail,
  } = req.body

  if (!rentalLabel || !date || !waiverPrintedName) {
    return res.status(400).json({ error: "Missing required booking fields." })
  }

  if (!req.file) {
    return res.status(400).json({ error: "Photo ID is required." })
  }

  const boatType = rentalBoatType(rentalLabel)
  const towFee = towFeeForLocation(towLocation)
  const accepted = waiverAccepted === "true" || waiverAccepted === true ? 1 : 0
  const createdAt = new Date().toISOString()
  const normalizedCustomerEmail = normalizeEmail(customerEmail)

  try {
    const blockedRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM blocked_dates
      WHERE date = ?
        AND (
          rentalLabel = ?
          OR rentalLabel = 'All Rentals'
          OR rentalLabel IS NULL
          OR boatType = ?
          OR boatType = 'All Rentals'
        )
      `,
      [date, rentalLabel, boatType]
    )

    if ((blockedRow?.count || 0) > 0) {
      return res.status(409).json({ error: "That rental is blocked for the selected date." })
    }

    if (boatType === "Jet Ski") {
      const rows = await allAsync(
        `
        SELECT rentalLabel
        FROM bookings
        WHERE date = ?
          AND boatType = 'Jet Ski'
          AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
        `,
        [date]
      )

      const singleCount = rows.filter((r) => r.rentalLabel === "Jet Ski (Single)").length
      const hasDouble = rows.some((r) => r.rentalLabel === "Jet Ski (Double)")

      let available = true
      if (rentalLabel === "Jet Ski (Double)") {
        available = !hasDouble && singleCount === 0
      } else if (rentalLabel === "Jet Ski (Single)") {
        available = !hasDouble && singleCount < 2
      }

      if (!available) {
        return res
          .status(409)
          .json({ error: "That jet ski option is no longer available for the selected date." })
      }
    } else {
      const existingRow = await getAsync(
        `
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE date = ?
          AND rentalLabel = ?
          AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
        `,
        [date, rentalLabel]
      )

      if ((existingRow?.count || 0) > 0) {
        return res
          .status(409)
          .json({ error: "That rental is already booked or pending for the selected date." })
      }
    }

    const result = await runAsync(
      `
      INSERT INTO bookings (
        userId,
        rentalLabel,
        boatType,
        date,
        rentalTime,
        towLocation,
        towFee,
        waiverPrintedName,
        waiverAccepted,
        waiverStatus,
        paymentStatus,
        status,
        customerEmail,
        photoIdPath,
        createdAt,
        depositStatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "1",
        rentalLabel,
        boatType,
        date,
        rentalTime || "",
        towLocation || "None",
        towFee,
        waiverPrintedName,
        accepted,
        accepted ? "signed" : "not_started",
        "unpaid",
        "pending_approval",
        normalizedCustomerEmail || "",
        req.file ? `./uploads/${req.file.filename}` : null,
        createdAt,
        "not_scheduled",
      ]
    )

    const bookingId = result.lastID

    const bookingForEmail = {
      id: bookingId,
      rentalLabel,
      date,
      rentalTime: rentalTime || "",
      towLocation: towLocation || "None",
      customerEmail: normalizedCustomerEmail || "",
      waiverPrintedName,
      photoIdPath: req.file ? `./uploads/${req.file.filename}` : null,
      status: "pending_approval",
    }

    sendAdminApprovalEmail(bookingForEmail).catch((emailErr) => {
      console.error("ADMIN APPROVAL EMAIL ERROR:", emailErr)
    })

    Promise.allSettled([
      sendEmail({
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `New booking request #${bookingId}`,
        text: `
New booking request received.

Booking ID: ${bookingId}
Name: ${waiverPrintedName}
Email: ${normalizedCustomerEmail || "No email provided"}
Rental: ${rentalLabel}
Date: ${date}
Time: ${rentalTime || "Not provided"}
Tow Location: ${towLocation || "None"}
Photo ID Path: /uploads/${req.file.filename}
        `.trim(),
        html: `
          <h2>New booking request received</h2>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Name:</strong> ${escapeHtml(waiverPrintedName)}</p>
          <p><strong>Email:</strong> ${escapeHtml(normalizedCustomerEmail || "No email provided")}</p>
          <p><strong>Rental:</strong> ${escapeHtml(rentalLabel)}</p>
          <p><strong>Date:</strong> ${escapeHtml(date)}</p>
          <p><strong>Time:</strong> ${escapeHtml(rentalTime || "Not provided")}</p>
          <p><strong>Tow Location:</strong> ${escapeHtml(towLocation || "None")}</p>
          <p><strong>Photo ID Path:</strong> /uploads/${escapeHtml(req.file.filename)}</p>
        `,
        attachments: bookingPhotoAttachment(`./uploads/${req.file.filename}`),
      }),
      normalizedCustomerEmail
        ? sendEmail({
            to: normalizedCustomerEmail,
            subject: `Cleared to Cruise booking request #${bookingId} received`,
            text: `
Your booking request has been received.

Booking ID: ${bookingId}
Rental: ${rentalLabel}
Date: ${date}
Time: ${rentalTime || "Not provided"}
Tow Location: ${towLocation || "None"}

You can check your status later with:
Booking ID: ${bookingId}
Email: ${normalizedCustomerEmail}
            `.trim(),
            html: `
              <h2>Your booking request has been received</h2>
              <p><strong>Booking ID:</strong> ${bookingId}</p>
              <p><strong>Rental:</strong> ${escapeHtml(rentalLabel)}</p>
              <p><strong>Date:</strong> ${escapeHtml(date)}</p>
              <p><strong>Time:</strong> ${escapeHtml(rentalTime || "Not provided")}</p>
              <p><strong>Tow Location:</strong> ${escapeHtml(towLocation || "None")}</p>
              <p>You can check your status later using your booking ID and email.</p>
            `,
          })
        : Promise.resolve(),
    ]).then((results) => {
      results.forEach((resultItem, index) => {
        if (resultItem.status === "rejected") {
          console.error(
            index === 0 ? "ADMIN BOOKING EMAIL ERROR:" : "CUSTOMER BOOKING EMAIL ERROR:",
            resultItem.reason
          )
        }
      })
    })

    return res.json({ success: true, bookingId })
  } catch (err) {
    console.error("CREATE BOOKING ERROR:", err)
    return res.status(500).json({ error: "Could not create booking." })
  }
})

// -----------------------------
// BOOKING GET
// -----------------------------
app.get("/api/bookings/:id", async (req, res) => {
  try {
    const row = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!row) {
      return res.status(404).json({ error: "Booking not found." })
    }

    const amounts = await calculateBookingAmounts(row)

    return res.json({
      ...row,
      pricing: {
        baseRentalAmount: amounts.baseRentalAmount,
        towFeeAmount: amounts.towFeeAmount,
        finalRentalAmount: amounts.finalRentalAmount,
        totalAmount: amounts.totalAmount,
        appliedPricing: amounts.appliedPricing,
      },
    })
  } catch (err) {
    console.error("GET BOOKING ERROR:", err)
    return res.status(500).json({ error: "Could not load booking." })
  }
})

// -----------------------------
// WAIVER SIGNED
// -----------------------------
app.post("/api/waiver/signed/:id", async (req, res) => {
  try {
    const updateResult = await runAsync(
      `
      UPDATE bookings
      SET waiverStatus = 'signed',
          waiverAccepted = 1,
          waiverAcceptedAt = datetime('now')
      WHERE id = ?
      `,
      [req.params.id]
    )

    if (updateResult.changes === 0) {
      return res.status(404).json({ error: "Booking not found." })
    }

    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])
    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    try {
      if (booking.customerEmail) {
        await sendEmail({
          to: booking.customerEmail,
          subject: `Waiver signed for booking #${booking.id}`,
          text: `
Your waiver has been signed.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
          `.trim(),
          html: `
            <h2>Waiver signed</h2>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
            <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
          `,
        })
      }

      await sendEmail({
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `Waiver signed for booking #${booking.id}`,
        text: `
Waiver signed.

Booking ID: ${booking.id}
Name: ${booking.waiverPrintedName || "No name"}
Email: ${booking.customerEmail || "No email"}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
        `.trim(),
        html: `
          <h2>Waiver signed</h2>
          <p><strong>Booking ID:</strong> ${booking.id}</p>
          <p><strong>Name:</strong> ${escapeHtml(booking.waiverPrintedName || "No name")}</p>
          <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
          <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
          <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
        `,
      })
    } catch (emailErr) {
      console.error("WAIVER EMAIL ERROR:", emailErr)
    }

    return res.json({ success: true })
  } catch (err) {
    console.error("WAIVER SIGN ERROR:", err)
    return res.status(500).json({ error: "Could not update waiver." })
  }
})

// -----------------------------
// MAIN CHECKOUT
// -----------------------------
app.post("/api/create-checkout/:id", async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (booking.waiverStatus !== "signed") {
      return res.status(400).json({ error: "Waiver must be signed before payment." })
    }

    if (booking.status !== "approved_unpaid") {
      return res.status(400).json({ error: "Booking not approved yet." })
    }

    const amounts = await calculateBookingAmounts(booking)

    if (!amounts.totalAmount || amounts.totalAmount <= 0) {
      return res.status(400).json({ error: "Calculated payment total is invalid." })
    }

    const descriptionParts = ["Fuel is charged separately."]
    if (amounts.appliedPricing?.source === "holiday") {
      descriptionParts.push(`Holiday pricing applied: ${amounts.appliedPricing.label}`)
    }
    if (amounts.appliedPricing?.source === "manual_discount") {
      descriptionParts.push(`Discount applied: ${amounts.appliedPricing.label}`)
    }
    if (amounts.appliedPricing?.source === "manual_price") {
      descriptionParts.push(`Manual price override applied: ${amounts.appliedPricing.label}`)
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: booking.rentalLabel || "Boat Rental",
              description: descriptionParts.join(" "),
            },
            unit_amount: amounts.totalAmount,
          },
          quantity: 1,
        },
      ],
      customer_email: booking.customerEmail || undefined,
      success_url: `${SITE_URL}/success?bookingId=${booking.id}`,
      cancel_url: `${SITE_URL}/cancel`,
      metadata: {
        bookingId: String(booking.id),
        type: "rental_payment",
        pricingSource: amounts.appliedPricing?.source || "",
        pricingLabel: amounts.appliedPricing?.label || "",
      },
    })

    await runAsync(
      `UPDATE bookings SET stripeSessionId = ?, status = 'pending_payment' WHERE id = ?`,
      [session.id, booking.id]
    )

    return res.json({
      url: session.url,
      totalAmount: amounts.totalAmount,
      totalAmountDollars: dollarsFromCents(amounts.totalAmount),
      appliedPricing: amounts.appliedPricing,
    })
  } catch (error) {
    console.error("CREATE CHECKOUT ERROR:", error)
    return res.status(500).json({ error: "Could not create checkout session." })
  }
})

// -----------------------------
// DEPOSIT SETUP
// -----------------------------
app.post("/api/deposit/:id", async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer_email: booking.customerEmail || undefined,
      success_url: `${SITE_URL}/success?bookingId=${booking.id}`,
      cancel_url: `${SITE_URL}/cancel`,
      metadata: {
        bookingId: String(booking.id),
        type: "deposit_setup",
      },
    })

    await runAsync(
      `
      UPDATE bookings
      SET depositSetupSessionId = ?,
          depositRequestedAt = datetime('now'),
          depositStatus = 'requested'
      WHERE id = ?
      `,
      [session.id, booking.id]
    )

    return res.json({ success: true, url: session.url })
  } catch (error) {
    console.error("DEPOSIT LINK ERROR:", error)
    return res.status(500).json({ error: "Could not create deposit link." })
  }
})

// -----------------------------
// ADMIN LOAD
// -----------------------------
app.get("/api/admin/bookings", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(`SELECT * FROM bookings ORDER BY id DESC`)
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const amounts = await calculateBookingAmounts(row)
        return {
          ...row,
          pricing: {
            baseRentalAmount: amounts.baseRentalAmount,
            towFeeAmount: amounts.towFeeAmount,
            finalRentalAmount: amounts.finalRentalAmount,
            totalAmount: amounts.totalAmount,
            totalAmountDollars: dollarsFromCents(amounts.totalAmount),
            appliedPricing: amounts.appliedPricing,
          },
        }
      })
    )
    return res.json(enriched)
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR:", err)
    return res.status(500).json({ error: "Could not load bookings." })
  }
})

app.get("/api/admin/blocked-dates", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(`SELECT * FROM blocked_dates ORDER BY date ASC, id DESC`)
    return res.json(rows)
  } catch (err) {
    console.error("BLOCKED DATES LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load blocked dates." })
  }
})

app.get("/api/admin/pricing-overrides", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(
      `SELECT * FROM pricing_overrides WHERE isActive = 1 ORDER BY createdAt DESC, id DESC`
    )
    return res.json(rows)
  } catch (err) {
    console.error("PRICING OVERRIDES LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load pricing overrides." })
  }
})

// -----------------------------
// ADMIN HELPERS
// -----------------------------
async function sendStatusEmails(booking, newStatus) {
  const readableStatus = statusLabel(newStatus)
  const paymentUrl = formatPaymentUrl(booking.id)

  try {
    if (booking.customerEmail) {
      await sendEmail({
        to: booking.customerEmail,
        subject: `Booking #${booking.id} status updated: ${readableStatus}`,
        text: `
Your booking status has been updated.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Status: ${readableStatus}

${
  newStatus === "approved_unpaid"
    ? `Your booking has been approved. Pay here:\n${paymentUrl}`
    : ""
}
        `.trim(),
        html: `
          <h2>Booking status updated</h2>
          <p><strong>Booking ID:</strong> ${booking.id}</p>
          <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
          <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
          <p><strong>Status:</strong> ${escapeHtml(readableStatus)}</p>
          ${
            newStatus === "approved_unpaid"
              ? `<p><a href="${paymentUrl}" style="display:inline-block;padding:12px 18px;background:#0f2233;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Pay Rental Now</a></p>`
              : ""
          }
        `,
      })
    }

    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `Booking #${booking.id} status changed to ${readableStatus}`,
      text: `
Booking status updated.

Booking ID: ${booking.id}
Name: ${booking.waiverPrintedName || "No name"}
Email: ${booking.customerEmail || "No email"}
Status: ${readableStatus}
      `.trim(),
      html: `
        <h2>Booking status updated</h2>
        <p><strong>Booking ID:</strong> ${booking.id}</p>
        <p><strong>Name:</strong> ${escapeHtml(booking.waiverPrintedName || "No name")}</p>
        <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
        <p><strong>Status:</strong> ${escapeHtml(readableStatus)}</p>
      `,
    })
  } catch (err) {
    console.error("STATUS EMAIL ERROR:", err)
  }
}

async function approveBookingCore(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  if (!booking) {
    return { notFound: true }
  }

  await runAsync(`UPDATE bookings SET status = 'approved_unpaid' WHERE id = ?`, [id])
  const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
  await sendStatusEmails(updated, "approved_unpaid")

  return { booking: updated }
}

async function denyBookingCore(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  if (!booking) {
    return { notFound: true }
  }

  await runAsync(`UPDATE bookings SET status = 'denied' WHERE id = ?`, [id])
  const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
  await sendStatusEmails(updated, "denied")

  return { booking: updated }
}

async function confirmBookingCore(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  if (!booking) {
    return { notFound: true }
  }

  await runAsync(`UPDATE bookings SET status = 'confirmed' WHERE id = ?`, [id])
  const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
  await sendStatusEmails(updated, "confirmed")

  return { booking: updated }
}

// -----------------------------
// ADMIN ACTION HANDLERS
// -----------------------------
async function approveBookingHandler(req, res) {
  const { id } = req.params

  try {
    const result = await approveBookingCore(id)

    if (result.notFound) {
      return res.status(404).json({ error: "Booking not found" })
    }

    return res.json({ success: true, message: "Booking approved" })
  } catch (err) {
    console.error("APPROVE ERROR:", err)
    return res.status(500).json({ error: "Failed to approve booking" })
  }
}

async function denyBookingHandler(req, res) {
  const { id } = req.params

  try {
    const result = await denyBookingCore(id)

    if (result.notFound) {
      return res.status(404).json({ error: "Booking not found" })
    }

    return res.json({ success: true, message: "Booking denied" })
  } catch (err) {
    console.error("DENY ERROR:", err)
    return res.status(500).json({ error: "Failed to deny booking" })
  }
}

async function confirmBookingHandler(req, res) {
  const { id } = req.params

  try {
    const result = await confirmBookingCore(id)

    if (result.notFound) {
      return res.status(404).json({ error: "Booking not found" })
    }

    return res.json({ success: true, message: "Booking confirmed" })
  } catch (err) {
    console.error("CONFIRM ERROR:", err)
    return res.status(500).json({ error: "Failed to confirm booking" })
  }
}

async function depositLinkHandler(req, res) {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    const depositUrl = formatDepositRequestUrl(booking.id)

    await runAsync(
      `
      UPDATE bookings
      SET depositRequestedAt = datetime('now'),
          depositLinkSentAt = datetime('now'),
          depositStatus = 'requested'
      WHERE id = ?
      `,
      [booking.id]
    )

    if (booking.customerEmail) {
      await sendEmail({
        to: booking.customerEmail,
        subject: `Deposit authorization requested for booking #${booking.id}`,
        text: `
Please authorize your $500 security deposit card for booking #${booking.id}.

Deposit link:
${depositUrl}
        `.trim(),
        html: `
          <h2>Deposit authorization requested</h2>
          <p>Please authorize your $500 security deposit card for booking #${booking.id}.</p>
          <p><a href="${depositUrl}">Authorize Deposit</a></p>
        `,
      })
    }

    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `Deposit link created for booking #${booking.id}`,
      text: `
Deposit authorization link created.

Booking ID: ${booking.id}
Customer Email: ${booking.customerEmail || "No email"}
Link: ${depositUrl}
      `.trim(),
      html: `
        <h2>Deposit link created</h2>
        <p><strong>Booking ID:</strong> ${booking.id}</p>
        <p><strong>Customer Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
        <p><a href="${depositUrl}">${depositUrl}</a></p>
      `,
    })

    return res.json({ success: true, url: depositUrl })
  } catch (error) {
    console.error("ADMIN DEPOSIT LINK ERROR:", error)
    return res.status(500).json({ error: "Could not create deposit link." })
  }
}

// -----------------------------
// PROTECTED EMAIL ACTION LINKS
// -----------------------------
app.get("/api/admin/approve/:id", requireAdminToken, async (req, res) => {
  try {
    const result = await approveBookingCore(req.params.id)

    if (result.notFound) {
      return res.status(404).send("Booking not found.")
    }

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>Booking #${req.params.id} approved</h2>
          <p>The booking has been marked <strong>approved unpaid</strong>.</p>
          <p><a href="${adminViewUrl()}">Open admin page</a></p>
        </body>
      </html>
    `)
  } catch (err) {
    console.error("GET APPROVE ERROR:", err)
    return res.status(500).send("Failed to approve booking.")
  }
})

app.get("/api/admin/deny/:id", requireAdminToken, async (req, res) => {
  try {
    const result = await denyBookingCore(req.params.id)

    if (result.notFound) {
      return res.status(404).send("Booking not found.")
    }

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 30px;">
          <h2>Booking #${req.params.id} denied</h2>
          <p>The booking has been marked <strong>denied</strong>.</p>
          <p><a href="${adminViewUrl()}">Open admin page</a></p>
        </body>
      </html>
    `)
  } catch (err) {
    console.error("GET DENY ERROR:", err)
    return res.status(500).send("Failed to deny booking.")
  }
})

// -----------------------------
// ADMIN API ROUTES
// -----------------------------
app.post("/api/admin/approve/:id", requireAdminLogin, approveBookingHandler)
app.post("/api/admin/bookings/:id/approve", requireAdminLogin, approveBookingHandler)

app.post("/api/admin/deny/:id", requireAdminLogin, denyBookingHandler)
app.post("/api/admin/bookings/:id/deny", requireAdminLogin, denyBookingHandler)

app.post("/api/admin/confirm/:id", requireAdminLogin, confirmBookingHandler)
app.post("/api/admin/bookings/:id/confirm", requireAdminLogin, confirmBookingHandler)

app.post("/api/admin/deposit-link/:id", requireAdminLogin, depositLinkHandler)
app.post("/api/admin/bookings/:id/deposit-link", requireAdminLogin, depositLinkHandler)
app.post("/api/admin/bookings/:id/send-deposit-link", requireAdminLogin, depositLinkHandler)

// -----------------------------
// ADMIN BOOKING UPDATE
// -----------------------------
app.post("/api/admin/bookings/:id", requireAdminLogin, async (req, res) => {
  const id = req.params.id
  const {
    date,
    rentalTime,
    rentalLabel,
    towLocation,
    customerEmail,
    waiverPrintedName,
    status,
  } = req.body

  try {
    await runAsync(
      `
      UPDATE bookings
      SET date = ?,
          rentalTime = ?,
          rentalLabel = ?,
          boatType = ?,
          towLocation = ?,
          towFee = ?,
          customerEmail = ?,
          waiverPrintedName = ?,
          status = ?
      WHERE id = ?
      `,
      [
        date || "",
        rentalTime || "",
        rentalLabel || "",
        rentalBoatType(rentalLabel || ""),
        towLocation || "None",
        towFeeForLocation(towLocation || "None"),
        normalizeEmail(customerEmail || ""),
        waiverPrintedName || "",
        status || "pending_approval",
        id,
      ]
    )

    return res.json({ success: true, message: "Booking updated" })
  } catch (err) {
    console.error("UPDATE BOOKING ERROR:", err)
    return res.status(500).json({ error: "Could not update booking" })
  }
})

// -----------------------------
// ADMIN PRICING OVERRIDES
// -----------------------------
app.post("/api/admin/pricing/holiday", requireAdminLogin, async (req, res) => {
  const { date, rentalLabel, overrideAmount, overrideLabel } = req.body

  if (!date || !rentalLabel || !overrideAmount) {
    return res.status(400).json({ error: "date, rentalLabel, and overrideAmount are required." })
  }

  try {
    const amountCents = centsFromDollars(overrideAmount)
    if (amountCents <= 0) {
      return res.status(400).json({ error: "Holiday override amount must be greater than 0." })
    }

    const createdAt = new Date().toISOString()

    const result = await runAsync(
      `
      INSERT INTO pricing_overrides (
        overrideType,
        overrideLabel,
        rentalLabel,
        date,
        bookingId,
        customerEmail,
        overrideAmount,
        isActive,
        createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "holiday",
        overrideLabel || "Holiday Pricing",
        rentalLabel,
        date,
        null,
        null,
        amountCents,
        1,
        createdAt,
      ]
    )

    return res.json({ success: true, id: result.lastID })
  } catch (err) {
    console.error("HOLIDAY PRICING ERROR:", err)
    return res.status(500).json({ error: "Could not save holiday pricing." })
  }
})

app.post("/api/admin/pricing/manual", requireAdminLogin, async (req, res) => {
  const { bookingId, customerEmail, overrideAmount, overrideType, overrideLabel } = req.body

  if (!overrideAmount || (!bookingId && !customerEmail)) {
    return res.status(400).json({
      error: "overrideAmount and either bookingId or customerEmail are required.",
    })
  }

  const cleanType = overrideType === "manual_price" ? "manual_price" : "manual_discount"

  try {
    const amountCents = centsFromDollars(overrideAmount)
    if (amountCents <= 0) {
      return res.status(400).json({ error: "Manual override amount must be greater than 0." })
    }

    const createdAt = new Date().toISOString()

    const result = await runAsync(
      `
      INSERT INTO pricing_overrides (
        overrideType,
        overrideLabel,
        rentalLabel,
        date,
        bookingId,
        customerEmail,
        overrideAmount,
        isActive,
        createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanType,
        overrideLabel ||
          (cleanType === "manual_price" ? "Manual Price Override" : "Friends & Family"),
        null,
        null,
        bookingId ? String(bookingId) : null,
        customerEmail ? normalizeEmail(customerEmail) : null,
        amountCents,
        1,
        createdAt,
      ]
    )

    return res.json({ success: true, id: result.lastID })
  } catch (err) {
    console.error("MANUAL PRICING ERROR:", err)
    return res.status(500).json({ error: "Could not save manual pricing override." })
  }
})

app.delete("/api/admin/pricing/:id", requireAdminLogin, async (req, res) => {
  try {
    const result = await runAsync(`UPDATE pricing_overrides SET isActive = 0 WHERE id = ?`, [
      req.params.id,
    ])

    if (result.changes === 0) {
      return res.status(404).json({ error: "Pricing override not found." })
    }

    return res.json({ success: true, message: "Pricing override deactivated." })
  } catch (err) {
    console.error("DELETE PRICING OVERRIDE ERROR:", err)
    return res.status(500).json({ error: "Could not deactivate pricing override." })
  }
})

// -----------------------------
// ADMIN DEPOSIT ACTIONS
// -----------------------------
app.post("/api/admin/place-deposit/:id", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) {
      return res.status(400).json({ error: "No saved deposit card found." })
    }

    const intent = await stripe.paymentIntents.create({
      amount: 50000,
      currency: "usd",
      customer: booking.stripeCustomerId,
      payment_method: booking.stripePaymentMethodId,
      confirm: true,
      capture_method: "manual",
      off_session: true,
      metadata: {
        bookingId: String(booking.id),
        type: "security_deposit_hold",
      },
    })

    await runAsync(
      `
      UPDATE bookings
      SET depositPaymentIntentId = ?,
          depositPlacedAt = datetime('now'),
          depositStatus = 'held'
      WHERE id = ?
      `,
      [intent.id, booking.id]
    )

    return res.json({ success: true, paymentIntentId: intent.id })
  } catch (error) {
    console.error("PLACE DEPOSIT ERROR:", error)
    return res.status(500).json({ error: "Could not place deposit hold." })
  }
})

app.post("/api/admin/release-deposit/:id", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.depositPaymentIntentId) {
      return res.status(400).json({ error: "No deposit hold found." })
    }

    await stripe.paymentIntents.cancel(booking.depositPaymentIntentId)

    await runAsync(
      `
      UPDATE bookings
      SET depositStatus = 'released',
          depositReleasedAt = datetime('now')
      WHERE id = ?
      `,
      [booking.id]
    )

    return res.json({ success: true, message: "Deposit released" })
  } catch (error) {
    console.error("RELEASE DEPOSIT ERROR:", error)
    return res.status(500).json({ error: "Could not release deposit." })
  }
})

app.post("/api/admin/charge-damage/:id", requireAdminLogin, async (req, res) => {
  const amount = Number(req.body.amount || 0)

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "A valid amount is required." })
  }

  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) {
      return res.status(400).json({ error: "No saved payment method found." })
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: booking.stripeCustomerId,
      payment_method: booking.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        bookingId: String(booking.id),
        type: "damage_charge",
      },
    })

    return res.json({ success: true, paymentIntentId: intent.id })
  } catch (error) {
    console.error("CHARGE DAMAGE ERROR:", error)
    return res.status(500).json({ error: "Could not charge damage." })
  }
})

// -----------------------------
// BLOCKED DATES
// -----------------------------
app.post("/api/admin/block-date", requireAdminLogin, async (req, res) => {
  const { date, rentalType, rentalLabel, reason } = req.body
  const selectedRental = rentalLabel || rentalType || "All Rentals"

  if (!date) {
    return res.status(400).json({ error: "Date is required" })
  }

  try {
    const createdAt = new Date().toISOString()

    const result = await runAsync(
      `
      INSERT INTO blocked_dates (boatType, date, reason, createdAt, rentalLabel)
      VALUES (?, ?, ?, ?, ?)
      `,
      [selectedRental, date, reason || "", createdAt, selectedRental]
    )

    return res.json({ success: true, id: result.lastID })
  } catch (err) {
    console.error("BLOCK DATE ERROR:", err)
    return res.status(500).json({ error: "Failed to block date" })
  }
})

app.delete("/api/admin/block-date/:id", requireAdminLogin, async (req, res) => {
  try {
    const result = await runAsync(`DELETE FROM blocked_dates WHERE id = ?`, [req.params.id])

    if (result.changes === 0) {
      return res.status(404).json({ error: "Blocked date not found" })
    }

    return res.json({ success: true, message: "Blocked date removed" })
  } catch (err) {
    console.error("DELETE BLOCK ERROR:", err)
    return res.status(500).json({ error: "Failed to delete blocked date" })
  }
})

app.delete("/api/admin/blocked-dates/:id", requireAdminLogin, async (req, res) => {
  try {
    const result = await runAsync(`DELETE FROM blocked_dates WHERE id = ?`, [req.params.id])

    if (result.changes === 0) {
      return res.status(404).json({ error: "Blocked date not found" })
    }

    return res.json({ success: true, message: "Blocked date removed" })
  } catch (err) {
    console.error("DELETE BLOCK ERROR:", err)
    return res.status(500).json({ error: "Failed to delete blocked date" })
  }
})

// -----------------------------
// TEST EMAIL
// -----------------------------
app.get("/api/test-email", async (_req, res) => {
  try {
    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: "Cleared to Cruise test email",
      text: "This is a test email from your backend.",
      html: "<p>This is a test email from your backend.</p>",
    })

    return res.json({ success: true, message: "Test email sent." })
  } catch (err) {
    console.error("TEST EMAIL ERROR:", err)
    return res.status(500).json({ error: err.message || "Could not send test email." })
  }
})

// -----------------------------
// SCHEDULED DEPOSIT REQUESTS
// -----------------------------
async function processScheduledDepositRequests() {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status IN ('approved_unpaid', 'confirmed', 'pending_payment')
        AND (
          depositStatus IS NULL
          OR depositStatus IN ('not_scheduled')
        )
      `
    )

    for (const booking of rows) {
      if (!isWithinNextThreeDays(booking.date)) {
        continue
      }

      const depositUrl = formatDepositRequestUrl(booking.id)

      try {
        await sendEmail({
          to: booking.customerEmail,
          subject: `Deposit authorization requested for booking #${booking.id}`,
          text: `
Please authorize your $500 security deposit card for booking #${booking.id}.

Deposit link:
${depositUrl}
          `.trim(),
          html: `
            <h2>Deposit authorization requested</h2>
            <p>Please authorize your $500 security deposit card for booking #${booking.id}.</p>
            <p><a href="${depositUrl}">Authorize Deposit</a></p>
          `,
        })

        await runAsync(
          `
          UPDATE bookings
          SET depositRequestedAt = datetime('now'),
              depositLinkSentAt = datetime('now'),
              depositStatus = 'requested'
          WHERE id = ?
          `,
          [booking.id]
        )

        console.log(`Scheduled deposit request sent for booking ${booking.id}`)
      } catch (err) {
        console.error(`Scheduled deposit request failed for booking ${booking.id}:`, err)
      }
    }
  } catch (err) {
    console.error("SCHEDULED DEPOSIT PROCESS ERROR:", err)
  }
}

setInterval(processScheduledDepositRequests, 60 * 60 * 1000)
setTimeout(processScheduledDepositRequests, 10 * 1000)

// -----------------------------
// START
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})