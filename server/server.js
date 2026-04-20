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
// CONSTANTS
// -----------------------------
const DEFAULT_PRICING = [
  {
    rentalKey: "Jet Ski (Single)",
    rentalLabel: "Jet Ski (Single)",
    priceCents: 35000,
    sortOrder: 1,
  },
  {
    rentalKey: "Jet Ski (Double)",
    rentalLabel: "Jet Ski (Double)",
    priceCents: 65000,
    sortOrder: 2,
  },
  {
    rentalKey: "Pontoon - Half Day",
    rentalLabel: "Pontoon - Half Day",
    priceCents: 50000,
    sortOrder: 3,
  },
  {
    rentalKey: "Pontoon - Full Day",
    rentalLabel: "Pontoon - Full Day",
    priceCents: 80000,
    sortOrder: 4,
  },
  {
    rentalKey: "Bass Boat - Full Day",
    rentalLabel: "Bass Boat - Full Day",
    priceCents: 30000,
    sortOrder: 5,
  },
]

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

function normalizeRentalLabel(label) {
  const value = String(label || "").trim()

  if (value === "Pontoon - 6 Hours") return "Pontoon - Half Day"
  if (value === "Pontoon - 8 Hours") return "Pontoon - Full Day"
  if (value === "Pontoon - 10 Hours") return "Pontoon - Full Day"

  return value
}

function rentalBoatType(label) {
  const lower = String(label || "").toLowerCase()
  if (lower.includes("pontoon")) return "Pontoon"
  if (lower.includes("bass")) return "Bass Boat"
  if (lower.includes("jet ski")) return "Jet Ski"
  return "All Rentals"
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

function buildUploadsUrl(filePath) {
  if (!filePath) return ""
  return `${API_URL}/${String(filePath).replace(/^\.?\//, "")}`
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
  const photoUrl = buildUploadsUrl(booking.photoIdPath)

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

async function sendManualReviewRequestEmail(booking) {
  if (!booking?.customerEmail) return

  const lookupText = `
Booking ID: ${booking.id}
Email: ${booking.customerEmail}
  `.trim()

  return sendEmail({
    to: booking.customerEmail,
    subject: `How was your Cleared to Cruise rental?`,
    text: `
Thank you for renting with Cleared to Cruise.

If you had a great experience, we would really appreciate a testimonial and optional photo.

You can submit a testimonial directly on the website.

Booking lookup details:
${lookupText}
    `.trim(),
    html: `
      <h2>Thank you for renting with Cleared to Cruise</h2>
      <p>If you had a great experience, we would really appreciate a testimonial and optional photo.</p>
      <p>You can submit your testimonial directly on the website.</p>
      <p><strong>Booking ID:</strong> ${booking.id}</p>
      <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail)}</p>
      <p><a href="${SITE_URL}" target="_blank" rel="noopener noreferrer">Open Cleared to Cruise</a></p>
    `,
  })
}

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

async function getBasePricingRow(rentalLabel) {
  return getAsync(
    `
    SELECT *
    FROM pricing_settings
    WHERE isActive = 1
      AND rentalKey = ?
    LIMIT 1
    `,
    [normalizeRentalLabel(rentalLabel)]
  )
}

async function getRentalBasePrice(rentalLabel) {
  const normalized = normalizeRentalLabel(rentalLabel)
  const row = await getBasePricingRow(normalized)
  if (row && Number(row.priceCents || 0) > 0) {
    return Number(row.priceCents || 0)
  }

  const fallback = DEFAULT_PRICING.find((item) => item.rentalKey === normalized)
  return fallback ? fallback.priceCents : 0
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
    [date, normalizeRentalLabel(rentalLabel)]
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
  const normalizedRentalLabel = normalizeRentalLabel(booking.rentalLabel)
  const baseRentalAmount = await getRentalBasePrice(normalizedRentalLabel)
  const towFeeAmount = towFeeForLocation(booking.towLocation)

  let finalRentalAmount = baseRentalAmount
  let appliedPricing = null

  const holidayOverride = await getHolidayPriceOverride(booking.date, normalizedRentalLabel)
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
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token", "stripe-signature"],
    credentials: true,
  })
)

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

      // -------------------------
      // RENTAL PAYMENT COMPLETE
      // -------------------------
      if (session.mode === "payment" && session.metadata?.type === "rental_payment") {
        await runAsync(
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
          [session.id || null, session.payment_intent || null, bookingId]
        )

        const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [bookingId])

        if (booking) {
          const amounts = await calculateBookingAmounts(booking)

          try {
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
Status: confirmed
                `.trim(),
                html: `
                  <h2>Payment received</h2>
                  <p><strong>Booking ID:</strong> ${booking.id}</p>
                  <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
                  <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
                  <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
                  <p><strong>Paid Total:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
                  <p><strong>Status:</strong> confirmed</p>
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
        }
      }

      // -------------------------
      // DEPOSIT CARD SAVED
      // -------------------------
      if (session.mode === "setup" && session.metadata?.type === "deposit_setup") {
        let paymentMethodId = null

        if (session.setup_intent) {
          const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent)
          paymentMethodId = setupIntent.payment_method || null
        }

        await runAsync(
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
            session.id || null,
            session.setup_intent || null,
            bookingId,
          ]
        )

        const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [bookingId])

        if (booking) {
          try {
            if (booking.customerEmail) {
              await sendEmail({
                to: booking.customerEmail,
                subject: `Security deposit card saved for booking #${booking.id}`,
                text: `
Your security deposit card has been saved.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}

A $500 authorization hold may be placed later based on your booking schedule.
                `.trim(),
                html: `
                  <h2>Security deposit card saved</h2>
                  <p><strong>Booking ID:</strong> ${booking.id}</p>
                  <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
                  <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
                  <p>A $500 authorization hold may be placed later based on your booking schedule.</p>
                `,
              })
            }
          } catch (emailErr) {
            console.error("WEBHOOK DEPOSIT SETUP EMAIL ERROR:", emailErr)
          }
        }
      }
    }

    // -------------------------
    // DEPOSIT HOLD AUTHORIZED
    // -------------------------
    if (event.type === "payment_intent.amount_capturable_updated") {
      const intent = event.data.object
      const bookingId = Number(intent.metadata?.bookingId || 0)

      if (bookingId && intent.metadata?.type === "security_deposit_hold") {
        await runAsync(
          `
          UPDATE bookings
          SET depositPaymentIntentId = ?,
              depositPlacedAt = datetime('now'),
              depositAuthorizedAt = datetime('now'),
              depositStatus = 'held',
              depositAmountAuthorized = ?,
              depositCaptureBefore = ?
          WHERE id = ?
          `,
          [
            intent.id,
            Number(intent.amount || 0),
            intent.capture_before ? String(intent.capture_before) : null,
            bookingId,
          ]
        )
      }
    }

    // -------------------------
    // DEPOSIT HOLD CANCELED
    // -------------------------
    if (event.type === "payment_intent.canceled") {
      const intent = event.data.object
      const bookingId = Number(intent.metadata?.bookingId || 0)

      if (bookingId && intent.metadata?.type === "security_deposit_hold") {
        await runAsync(
          `
          UPDATE bookings
          SET depositStatus = 'released',
              depositReleasedAt = datetime('now')
          WHERE id = ?
          `,
          [bookingId]
        )
      }
    }

    // -------------------------
    // DEPOSIT CAPTURED
    // -------------------------
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object
      const bookingId = Number(intent.metadata?.bookingId || 0)

      if (bookingId && intent.metadata?.type === "security_deposit_hold") {
        await runAsync(
          `
          UPDATE bookings
          SET depositStatus = 'captured',
              depositAmountCaptured = ?,
              depositReleasedAt = datetime('now')
          WHERE id = ?
          `,
          [Number(intent.amount_received || intent.amount || 0), bookingId]
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
    ok: true,
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
      depositAuthorizedAt TEXT,
      depositCaptureBefore TEXT,
      depositAmountAuthorized INTEGER DEFAULT 0,
      depositAmountCaptured INTEGER DEFAULT 0,
      depositAmountReleased INTEGER DEFAULT 0,
      finalPacketSentAt TEXT,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS pricing_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rentalKey TEXT NOT NULL UNIQUE,
      rentalLabel TEXT NOT NULL,
      priceCents INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    )
  `)

db.run(`
  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerName TEXT NOT NULL,
    customerEmail TEXT,
    rentalLabel TEXT,
    testimonialText TEXT NOT NULL,
    photoPath TEXT,
    photos TEXT,
    isApproved INTEGER NOT NULL DEFAULT 0,
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
    ["depositAuthorizedAt", "TEXT"],
    ["depositCaptureBefore", "TEXT"],
    ["depositAmountAuthorized", "INTEGER DEFAULT 0"],
    ["depositAmountCaptured", "INTEGER DEFAULT 0"],
    ["depositAmountReleased", "INTEGER DEFAULT 0"],
    ["finalPacketSentAt", "TEXT"],
    ["createdAt", "TEXT"],
  ]

db.all(`PRAGMA table_info(testimonials)`, [], (err, rows) => {
  if (err) {
    console.error("TESTIMONIALS PRAGMA ERROR:", err)
    return
  }

  const existing = new Set(rows.map((r) => r.name))

  if (!existing.has("photos")) {
    db.run(`ALTER TABLE testimonials ADD COLUMN photos TEXT`, [], (alterErr) => {
      if (alterErr) {
        console.error("ALTER testimonials photos ERROR:", alterErr)
      } else {
        console.log("Added photos column to testimonials")
      }
    })
  }
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

    db.run(
      `
      UPDATE blocked_dates
      SET rentalLabel = CASE
        WHEN rentalLabel = 'Pontoon - 6 Hours' THEN 'Pontoon - Half Day'
        WHEN rentalLabel IN ('Pontoon - 8 Hours', 'Pontoon - 10 Hours') THEN 'Pontoon - Full Day'
        ELSE rentalLabel
      END
      WHERE rentalLabel IN ('Pontoon - 6 Hours', 'Pontoon - 8 Hours', 'Pontoon - 10 Hours')
      `,
      [],
      (migrateErr) => {
        if (migrateErr) console.error("BLOCKED DATES pontoon migration ERROR:", migrateErr)
      }
    )
  })

  db.all(`PRAGMA table_info(testimonials)`, [], (err) => {
    if (err) {
      console.error("TESTIMONIALS PRAGMA ERROR:", err)
    }
  })

  // seed pricing settings
  DEFAULT_PRICING.forEach((item) => {
    db.run(
      `
      INSERT INTO pricing_settings (rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(rentalKey) DO UPDATE SET
        rentalLabel = excluded.rentalLabel,
        priceCents = COALESCE(pricing_settings.priceCents, excluded.priceCents),
        sortOrder = excluded.sortOrder,
        isActive = 1
      `,
      [item.rentalKey, item.rentalLabel, item.priceCents, item.sortOrder],
      (seedErr) => {
        if (seedErr) console.error(`PRICING seed ERROR for ${item.rentalKey}:`, seedErr)
      }
    )
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
// PUBLIC PRICING ROUTES
// -----------------------------
app.get("/api/pricing", async (_req, res) => {
  try {
    const rows = await allAsync(
      `
      SELECT rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt
      FROM pricing_settings
      WHERE isActive = 1
      ORDER BY sortOrder ASC, id ASC
      `
    )

    return res.json(rows)
  } catch (err) {
    console.error("PUBLIC PRICING ERROR:", err)
    return res.status(500).json({ error: "Could not load pricing." })
  }
})

app.get("/api/admin/pricing", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(
      `
      SELECT rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt
      FROM pricing_settings
      ORDER BY sortOrder ASC, id ASC
      `
    )

    return res.json(rows)
  } catch (err) {
    console.error("ADMIN PRICING LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load admin pricing." })
  }
})

app.post("/api/admin/pricing", requireAdminLogin, async (req, res) => {
  const pricing = Array.isArray(req.body?.pricing) ? req.body.pricing : []

  if (!pricing.length) {
    return res.status(400).json({ error: "Pricing array is required." })
  }

  try {
    for (const item of pricing) {
      const rentalKey = normalizeRentalLabel(item.rentalKey)
      const rentalLabel = normalizeRentalLabel(item.rentalLabel || item.rentalKey)
      const priceCents = Number(item.priceCents || 0)
      const sortOrder = Number(item.sortOrder || 0)

      if (!rentalKey || priceCents <= 0) {
        continue
      }

      await runAsync(
        `
        INSERT INTO pricing_settings (rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(rentalKey) DO UPDATE SET
          rentalLabel = excluded.rentalLabel,
          priceCents = excluded.priceCents,
          sortOrder = excluded.sortOrder,
          isActive = 1,
          updatedAt = datetime('now')
        `,
        [rentalKey, rentalLabel, priceCents, sortOrder]
      )
    }

    return res.json({ success: true })
  } catch (err) {
    console.error("ADMIN PRICING SAVE ERROR:", err)
    return res.status(500).json({ error: "Could not save pricing." })
  }
})
// ===============================
// TESTIMONIAL ROUTES
// ===============================

// Public testimonials
app.get("/api/testimonials", async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT id, fullName, message, rating, approved, photos, createdAt
      FROM testimonials
      WHERE approved = 1
      ORDER BY id DESC
    `)

    res.json(rows)
  } catch (err) {
    console.error("TESTIMONIAL LOAD ERROR:", err)
    res.status(500).json({ error: "Failed to load testimonials", details: err.message })
  }
})

// Submit testimonial
app.post("/api/testimonials", upload.array("photos", 7), async (req, res) => {
  const fullName = String(req.body.fullName || req.body.customerName || req.body.name || "").trim()
  const message = String(req.body.message || req.body.testimonialText || req.body.text || "").trim()
  const rating = Number(req.body.rating || 5)
  const createdAt = new Date().toISOString()

  if (!fullName || !message) {
    return res.status(400).json({ error: "Name and testimonial text are required." })
  }

  try {
    const files = Array.isArray(req.files) ? req.files : []
    const photoPaths = files.map((file) => `/uploads/${file.filename}`)

    const result = await runAsync(
      `
      INSERT INTO testimonials (
        fullName,
        rating,
        message,
        approved,
        createdAt,
        photos
      )
      VALUES (?, ?, ?, 0, ?, ?)
      `,
      [
        fullName,
        rating,
        message,
        createdAt,
        JSON.stringify(photoPaths),
      ]
    )

    res.json({
      success: true,
      id: result.lastID,
      message: "Submitted for approval!",
    })
  } catch (err) {
    console.error("SUBMIT TESTIMONIAL ERROR:", err)
    res.status(500).json({ error: "Could not submit testimonial." })
  }
})

// Admin testimonials list
app.get("/api/admin/testimonials", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(`
      SELECT id, fullName, rating, message, approved, createdAt, photos
      FROM testimonials
      ORDER BY datetime(createdAt) DESC, id DESC
    `)

    const normalized = rows.map((row) => ({
      id: row.id,
      fullName: row.fullName || "",
      rating: Number(row.rating || 5),
      message: row.message || "",
      approved: Number(row.approved || 0),
      createdAt: row.createdAt || "",
      photos: row.photos ? JSON.parse(row.photos) : [],
    }))

    res.json(normalized)
  } catch (err) {
    console.error("ADMIN TESTIMONIALS ERROR:", err)
    res.status(500).json({ error: "Could not load admin testimonials." })
  }
})

// Approve testimonial
app.post("/api/admin/testimonials/:id/approve", requireAdminLogin, async (req, res) => {
  try {
    const result = await runAsync(
      `UPDATE testimonials SET approved = 1 WHERE id = ?`,
      [req.params.id]
    )

    if (!result.changes) {
      return res.status(404).json({ error: "Testimonial not found." })
    }

    res.json({ success: true })
  } catch (err) {
    console.error("APPROVE TESTIMONIAL ERROR:", err)
    res.status(500).json({ error: "Could not approve testimonial." })
  }
})

// Deny testimonial
app.post("/api/admin/testimonials/:id/deny", requireAdminLogin, async (req, res) => {
  try {
    const result = await runAsync(
      `DELETE FROM testimonials WHERE id = ?`,
      [req.params.id]
    )

    if (!result.changes) {
      return res.status(404).json({ error: "Testimonial not found." })
    }

    res.json({ success: true })
  } catch (err) {
    console.error("DENY TESTIMONIAL ERROR:", err)
    res.status(500).json({ error: "Could not deny testimonial." })
  }
})

// -----------------------------
// MANUAL REVIEW REQUEST ROUTE
// -----------------------------
app.post("/api/admin/bookings/:id/send-review-request", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    await sendManualReviewRequestEmail(booking)

    return res.json({ success: true, message: "Review request sent." })
  } catch (err) {
    console.error("SEND REVIEW REQUEST ERROR:", err)
    return res.status(500).json({ error: "Could not send review request." })
  }
})

// -----------------------------
// AVAILABILITY
// -----------------------------
async function checkRentalAvailability(date, rentalLabel) {
  const normalizedRentalLabel = normalizeRentalLabel(rentalLabel)
  const boatType = rentalBoatType(normalizedRentalLabel)

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
    [date, normalizedRentalLabel, boatType]
  )

  if ((blockedRow?.count || 0) > 0) {
    return false
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

    const normalizedRows = rows.map((r) => ({
      rentalLabel: normalizeRentalLabel(r.rentalLabel),
    }))

    const singleCount = normalizedRows.filter(
      (r) => r.rentalLabel === "Jet Ski (Single)"
    ).length

    const hasDouble = normalizedRows.some(
      (r) => r.rentalLabel === "Jet Ski (Double)"
    )

    if (normalizedRentalLabel === "Jet Ski (Double)") {
      return !hasDouble && singleCount === 0
    }

    if (normalizedRentalLabel === "Jet Ski (Single)") {
      return !hasDouble && singleCount < 2
    }

    return true
  }

  if (boatType === "Pontoon") {
    const bookingRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE date = ?
        AND boatType = 'Pontoon'
        AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
      `,
      [date]
    )

    return (bookingRow?.count || 0) === 0
  }

  if (boatType === "Bass Boat") {
    const bookingRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE date = ?
        AND boatType = 'Bass Boat'
        AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
      `,
      [date]
    )

    return (bookingRow?.count || 0) === 0
  }

  const bookingRow = await getAsync(
    `
    SELECT COUNT(*) AS count
    FROM bookings
    WHERE date = ?
      AND rentalLabel = ?
      AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
    `,
    [date, normalizedRentalLabel]
  )

  return (bookingRow?.count || 0) === 0
}

app.get("/api/availability", async (req, res) => {
  const rentalLabel = normalizeRentalLabel(req.query.rentalLabel)
  const { date } = req.query

  if (!rentalLabel || !date) {
    return res.status(400).json({ error: "rentalLabel and date are required." })
  }

  try {
    const available = await checkRentalAvailability(date, rentalLabel)
    return res.json({ available })
  } catch (err) {
    console.error("AVAILABILITY ERROR:", err)
    return res.status(500).json({ error: "Could not check availability." })
  }
})
app.get("/api/calendar-unavailable", async (req, res) => {
  const rentalLabel = normalizeRentalLabel(req.query.rentalLabel)
  const month = String(req.query.month || "").trim() // YYYY-MM

  if (!rentalLabel || !month) {
    return res.status(400).json({ error: "rentalLabel and month are required." })
  }

  try {
    const [yearStr, monthStr] = month.split("-")
    const year = Number(yearStr)
    const monthIndex = Number(monthStr) - 1

    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return res.status(400).json({ error: "month must be YYYY-MM" })
    }

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const unavailableDates = []

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const available = await checkRentalAvailability(date, rentalLabel)

      if (!available) {
        unavailableDates.push(date)
      }
    }

    return res.json({ rentalLabel, month, unavailableDates })
  } catch (err) {
    console.error("CALENDAR UNAVAILABLE ERROR:", err)
    return res.status(500).json({ error: "Could not load unavailable dates." })
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

  const rentalLabel = normalizeRentalLabel(req.body.rentalLabel)
  const {
    date,
    rentalTime,
    towLocation,
    waiverPrintedName,
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

      const normalizedRows = rows.map((r) => ({
        rentalLabel: normalizeRentalLabel(r.rentalLabel),
      }))

      const singleCount = normalizedRows.filter(
        (r) => r.rentalLabel === "Jet Ski (Single)"
      ).length
      const hasDouble = normalizedRows.some((r) => r.rentalLabel === "Jet Ski (Double)")

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
        0,
        "not_started",
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

    const normalizedRow = {
      ...row,
      rentalLabel: normalizeRentalLabel(row.rentalLabel),
    }

    const amounts = await calculateBookingAmounts(normalizedRow)

    return res.json({
      ...normalizedRow,
      pricing: {
        baseRentalAmount: amounts.baseRentalAmount,
        towFeeAmount: amounts.towFeeAmount,
        finalRentalAmount: amounts.finalRentalAmount,
        totalAmount: amounts.totalAmount,
        totalAmountDollars: dollarsFromCents(amounts.totalAmount),
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

    const normalizedBooking = {
      ...booking,
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
    }

    try {
      if (normalizedBooking.customerEmail) {
        await sendEmail({
          to: normalizedBooking.customerEmail,
          subject: `Waiver signed for booking #${normalizedBooking.id}`,
          text: `
Your waiver has been signed.

Booking ID: ${normalizedBooking.id}
Rental: ${normalizedBooking.rentalLabel || "Boat Rental"}
Date: ${normalizedBooking.date || "Not provided"}
          `.trim(),
          html: `
            <h2>Waiver signed</h2>
            <p><strong>Booking ID:</strong> ${normalizedBooking.id}</p>
            <p><strong>Rental:</strong> ${escapeHtml(normalizedBooking.rentalLabel || "Boat Rental")}</p>
            <p><strong>Date:</strong> ${escapeHtml(normalizedBooking.date || "Not provided")}</p>
          `,
        })
      }

      await sendEmail({
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `Waiver signed for booking #${normalizedBooking.id}`,
        text: `
Waiver signed.

Booking ID: ${normalizedBooking.id}
Name: ${normalizedBooking.waiverPrintedName || "No name"}
Email: ${normalizedBooking.customerEmail || "No email"}
Rental: ${normalizedBooking.rentalLabel || "Boat Rental"}
Date: ${normalizedBooking.date || "Not provided"}
        `.trim(),
        html: `
          <h2>Waiver signed</h2>
          <p><strong>Booking ID:</strong> ${normalizedBooking.id}</p>
          <p><strong>Name:</strong> ${escapeHtml(normalizedBooking.waiverPrintedName || "No name")}</p>
          <p><strong>Email:</strong> ${escapeHtml(normalizedBooking.customerEmail || "No email")}</p>
          <p><strong>Rental:</strong> ${escapeHtml(normalizedBooking.rentalLabel || "Boat Rental")}</p>
          <p><strong>Date:</strong> ${escapeHtml(normalizedBooking.date || "Not provided")}</p>
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

    const normalizedBooking = {
      ...booking,
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
    }

    if (normalizedBooking.waiverStatus !== "signed") {
      return res.status(400).json({ error: "Waiver must be signed before payment." })
    }

    if (normalizedBooking.status !== "approved_unpaid") {
      return res.status(400).json({ error: "Booking not approved yet." })
    }

    const amounts = await calculateBookingAmounts(normalizedBooking)

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
              name: normalizedBooking.rentalLabel || "Boat Rental",
              description: descriptionParts.join(" "),
            },
            unit_amount: amounts.totalAmount,
          },
          quantity: 1,
        },
      ],
      customer_email: normalizedBooking.customerEmail || undefined,
      success_url: `${SITE_URL}/success?bookingId=${normalizedBooking.id}`,
      cancel_url: `${SITE_URL}/cancel`,
      metadata: {
        bookingId: String(normalizedBooking.id),
        type: "rental_payment",
        pricingSource: amounts.appliedPricing?.source || "",
        pricingLabel: amounts.appliedPricing?.label || "",
      },
    })

    await runAsync(
      `UPDATE bookings SET stripeSessionId = ?, status = 'pending_payment' WHERE id = ?`,
      [session.id, normalizedBooking.id]
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

    const normalizedBooking = {
      ...booking,
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
    }

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer_email: normalizedBooking.customerEmail || undefined,
      success_url: `${SITE_URL}/success?bookingId=${normalizedBooking.id}`,
      cancel_url: `${SITE_URL}/cancel`,
      metadata: {
        bookingId: String(normalizedBooking.id),
        type: "deposit_setup",
      },
    })

    await runAsync(
      `
      UPDATE bookings
      SET depositSetupSessionId = ?,
          depositRequestedAt = datetime('now'),
          depositStatus = CASE
            WHEN depositStatus IN ('held', 'captured') THEN depositStatus
            ELSE 'requested'
          END
      WHERE id = ?
      `,
      [session.id, normalizedBooking.id]
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
        const normalizedRow = {
          ...row,
          rentalLabel: normalizeRentalLabel(row.rentalLabel),
        }

        const amounts = await calculateBookingAmounts(normalizedRow)
        return {
          ...normalizedRow,
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
    const normalizedRows = rows.map((row) => ({
      ...row,
      rentalLabel: normalizeRentalLabel(row.rentalLabel),
    }))
    return res.json(normalizedRows)
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

    const normalizedRows = rows.map((row) => ({
      ...row,
      rentalLabel: normalizeRentalLabel(row.rentalLabel),
    }))

    return res.json(normalizedRows)
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

  const normalizedUpdated = {
    ...updated,
    rentalLabel: normalizeRentalLabel(updated.rentalLabel),
  }
if (
  normalizedUpdated.customerEmail &&
  isWithinNextThreeDays(normalizedUpdated.date) &&
  (
    !normalizedUpdated.depositStatus ||
    normalizedUpdated.depositStatus === "not_scheduled"
  )
) {
  const depositUrl = formatDepositRequestUrl(normalizedUpdated.id)

  try {
    await sendEmail({
      to: normalizedUpdated.customerEmail,
      subject: `Security deposit authorization for booking #${normalizedUpdated.id}`,
      text: `
Your rental is coming up soon.

Please authorize your refundable $500 security deposit using the link below.

Booking ID: ${normalizedUpdated.id}
Rental: ${normalizedUpdated.rentalLabel || "Boat Rental"}
Date: ${normalizedUpdated.date || "Not provided"}

Authorize deposit:
${depositUrl}
      `.trim(),
      html: `
        <h2>Security deposit authorization needed</h2>
        <p>Your rental is coming up soon.</p>
        <p>Please authorize your refundable <strong>$500 security deposit</strong> using the button below.</p>
        <p><strong>Booking ID:</strong> ${normalizedUpdated.id}</p>
        <p><strong>Rental:</strong> ${escapeHtml(normalizedUpdated.rentalLabel || "Boat Rental")}</p>
        <p><strong>Date:</strong> ${escapeHtml(normalizedUpdated.date || "Not provided")}</p>
        <p>
          <a href="${depositUrl}" style="display:inline-block;padding:12px 18px;background:#0f2233;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">
            Authorize Deposit
          </a>
        </p>
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
      [normalizedUpdated.id]
    )

    normalizedUpdated.depositStatus = "requested"
  } catch (err) {
    console.error("IMMEDIATE DEPOSIT EMAIL ERROR:", err)
  }
}
  await sendStatusEmails(normalizedUpdated, "approved_unpaid")

  return { booking: normalizedUpdated }
}

async function denyBookingCore(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  if (!booking) {
    return { notFound: true }
  }

  await runAsync(`UPDATE bookings SET status = 'denied' WHERE id = ?`, [id])
  const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  const normalizedUpdated = {
    ...updated,
    rentalLabel: normalizeRentalLabel(updated.rentalLabel),
  }

  await sendStatusEmails(normalizedUpdated, "denied")

  return { booking: normalizedUpdated }
}

async function confirmBookingCore(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  if (!booking) {
    return { notFound: true }
  }

  await runAsync(`UPDATE bookings SET status = 'confirmed' WHERE id = ?`, [id])
  const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

  const normalizedUpdated = {
    ...updated,
    rentalLabel: normalizeRentalLabel(updated.rentalLabel),
  }

  await sendStatusEmails(normalizedUpdated, "confirmed")

  return { booking: normalizedUpdated }
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

    const normalizedBooking = {
      ...booking,
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
    }

    const depositUrl = formatDepositRequestUrl(normalizedBooking.id)

    await runAsync(
      `
      UPDATE bookings
      SET depositRequestedAt = datetime('now'),
          depositLinkSentAt = datetime('now'),
          depositStatus = CASE
            WHEN depositStatus IN ('held', 'captured') THEN depositStatus
            ELSE 'requested'
          END
      WHERE id = ?
      `,
      [normalizedBooking.id]
    )

    if (normalizedBooking.customerEmail) {
      await sendEmail({
        to: normalizedBooking.customerEmail,
        subject: `Deposit authorization requested for booking #${normalizedBooking.id}`,
        text: `
Please authorize your $500 security deposit card for booking #${normalizedBooking.id}.

Deposit link:
${depositUrl}
        `.trim(),
        html: `
          <h2>Deposit authorization requested</h2>
          <p>Please authorize your $500 security deposit card for booking #${normalizedBooking.id}.</p>
          <p><a href="${depositUrl}">Authorize Deposit</a></p>
        `,
      })
    }

    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `Deposit link created for booking #${normalizedBooking.id}`,
      text: `
Deposit authorization link created.

Booking ID: ${normalizedBooking.id}
Customer Email: ${normalizedBooking.customerEmail || "No email"}
Link: ${depositUrl}
      `.trim(),
      html: `
        <h2>Deposit link created</h2>
        <p><strong>Booking ID:</strong> ${normalizedBooking.id}</p>
        <p><strong>Customer Email:</strong> ${escapeHtml(normalizedBooking.customerEmail || "No email")}</p>
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
  const date = String(req.body?.date || "").trim()
  const rentalTime = String(req.body?.rentalTime || "").trim()
  const rentalLabel = normalizeRentalLabel(req.body?.rentalLabel || "")
  const towLocation = String(req.body?.towLocation || "None").trim() || "None"
  const customerEmail = normalizeEmail(req.body?.customerEmail || "")
  const waiverPrintedName = String(req.body?.waiverPrintedName || "").trim()
  const status = String(req.body?.status || "pending_approval").trim()

  if (!date || !rentalLabel) {
    return res.status(400).json({ error: "Date and rentalLabel are required." })
  }

  try {
    const existingBooking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

    if (!existingBooking) {
      return res.status(404).json({ error: "Booking not found." })
    }

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
      return res.status(409).json({ error: "That rental is blocked for the selected date." })
    }

    if (boatType === "Jet Ski") {
      const rows = await allAsync(
        `
        SELECT id, rentalLabel
        FROM bookings
        WHERE date = ?
          AND boatType = 'Jet Ski'
          AND id != ?
          AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
        `,
        [date, id]
      )

      const normalizedRows = rows.map((r) => ({
        id: r.id,
        rentalLabel: normalizeRentalLabel(r.rentalLabel),
      }))

      const singleCount = normalizedRows.filter(
        (r) => r.rentalLabel === "Jet Ski (Single)"
      ).length
      const hasDouble = normalizedRows.some((r) => r.rentalLabel === "Jet Ski (Double)")

      let available = true
      if (rentalLabel === "Jet Ski (Double)") {
        available = !hasDouble && singleCount === 0
      } else if (rentalLabel === "Jet Ski (Single)") {
        available = !hasDouble && singleCount < 2
      }

      if (!available) {
        return res
          .status(409)
          .json({ error: "That jet ski option conflicts with an existing booking." })
      }
    } else {
      const conflictRow = await getAsync(
        `
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE date = ?
          AND rentalLabel = ?
          AND id != ?
          AND status IN ('pending_approval', 'approved_unpaid', 'pending_payment', 'confirmed')
        `,
        [date, rentalLabel, id]
      )

      if ((conflictRow?.count || 0) > 0) {
        return res
          .status(409)
          .json({ error: "That rental is already booked or pending for the selected date." })
      }
    }

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
        date,
        rentalTime || "",
        rentalLabel,
        boatType,
        towLocation,
        towFeeForLocation(towLocation),
        customerEmail,
        waiverPrintedName,
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
  const date = String(req.body?.date || "").trim()
  const rentalLabel = normalizeRentalLabel(req.body?.rentalLabel || "")
  const overrideAmount = req.body?.overrideAmount
  const overrideLabel = String(req.body?.overrideLabel || "Holiday Pricing").trim()

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
  const bookingId = String(req.body?.bookingId || "").trim()
  const customerEmail = normalizeEmail(req.body?.customerEmail || "")
  const overrideAmount = req.body?.overrideAmount
  const overrideType = req.body?.overrideType
  const overrideLabel = String(req.body?.overrideLabel || "").trim()

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
        customerEmail || null,
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

    if (booking.depositStatus === "held") {
      return res.status(400).json({ error: "Deposit hold is already active." })
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
          depositAuthorizedAt = datetime('now'),
          depositStatus = 'held',
          depositAmountAuthorized = ?,
          depositCaptureBefore = ?
      WHERE id = ?
      `,
      [
        intent.id,
        Number(intent.amount || 0),
        intent.capture_before ? String(intent.capture_before) : null,
        booking.id,
      ]
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
          depositReleasedAt = datetime('now'),
          depositAmountReleased = depositAmountAuthorized
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

app.post("/api/admin/capture-deposit/:id", requireAdminLogin, async (req, res) => {
  const amount = Number(req.body?.amount || 0)

  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.depositPaymentIntentId) {
      return res.status(400).json({ error: "No deposit hold found." })
    }

    const capturePayload = {}
    if (amount > 0) {
      capturePayload.amount_to_capture = amount
    }

    const intent = await stripe.paymentIntents.capture(
      booking.depositPaymentIntentId,
      capturePayload
    )

    await runAsync(
      `
      UPDATE bookings
      SET depositStatus = 'captured',
          depositReleasedAt = datetime('now'),
          depositAmountCaptured = ?
      WHERE id = ?
      `,
      [Number(intent.amount_received || intent.amount || 0), booking.id]
    )

    return res.json({
      success: true,
      paymentIntentId: intent.id,
      amountCaptured: Number(intent.amount_received || intent.amount || 0),
    })
  } catch (error) {
    console.error("CAPTURE DEPOSIT ERROR:", error)
    return res.status(500).json({ error: "Could not capture deposit." })
  }
})

app.post("/api/admin/charge-damage/:id", requireAdminLogin, async (req, res) => {
  const amount = Number(req.body?.amount || 0)

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
  const selectedRental = normalizeRentalLabel(rentalLabel || rentalType || "All Rentals")

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

// -----------------------------
// AUTOMATIC DEPOSIT HOLD PLACEMENT
// -----------------------------
async function processAutomaticDepositHolds() {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM bookings
      WHERE status IN ('approved_unpaid', 'confirmed', 'pending_payment')
        AND stripeCustomerId IS NOT NULL
        AND stripeCustomerId != ''
        AND stripePaymentMethodId IS NOT NULL
        AND stripePaymentMethodId != ''
        AND (
          depositStatus = 'card_on_file'
          OR depositStatus = 'requested'
        )
      `
    )

    for (const booking of rows) {
      if (!isWithinNextThreeDays(booking.date)) {
        continue
      }

      try {
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
              depositAuthorizedAt = datetime('now'),
              depositStatus = 'held',
              depositAmountAuthorized = ?,
              depositCaptureBefore = ?
          WHERE id = ?
          `,
          [
            intent.id,
            Number(intent.amount || 0),
            intent.capture_before ? String(intent.capture_before) : null,
            booking.id,
          ]
        )

        console.log(`Automatic deposit hold placed for booking ${booking.id}`)

        if (booking.customerEmail) {
          await sendEmail({
            to: booking.customerEmail,
            subject: `Security deposit hold placed for booking #${booking.id}`,
            text: `
Your $500 security deposit authorization hold has been placed.

Booking ID: ${booking.id}
Rental: ${normalizeRentalLabel(booking.rentalLabel) || "Boat Rental"}
Date: ${booking.date || "Not provided"}

This is an authorization hold and may be released after the rental if no damage or other chargeable issues occur.
            `.trim(),
            html: `
              <h2>Security deposit hold placed</h2>
              <p><strong>Booking ID:</strong> ${booking.id}</p>
              <p><strong>Rental:</strong> ${escapeHtml(normalizeRentalLabel(booking.rentalLabel) || "Boat Rental")}</p>
              <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
              <p>This is an authorization hold and may be released after the rental if no damage or other chargeable issues occur.</p>
            `,
          }).catch((emailErr) => {
            console.error("AUTOMATIC DEPOSIT HOLD CUSTOMER EMAIL ERROR:", emailErr)
          })
        }
      } catch (err) {
        console.error(`Automatic deposit hold failed for booking ${booking.id}:`, err)
      }
    }
  } catch (err) {
    console.error("AUTOMATIC DEPOSIT HOLD PROCESS ERROR:", err)
  }
}

// -----------------------------
// AUTOMATIC REVIEW REQUEST SEND
// -----------------------------
async function processAutomaticReviewRequests() {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status = 'confirmed'
        AND paymentStatus = 'paid'
        AND waiverStatus = 'signed'
        AND COALESCE(finalPacketSentAt, '') = ''
      `
    )

    for (const booking of rows) {
      const daysPastBooking = -daysUntilBooking(booking.date)

      // send only after the rental date has passed by at least 0.5 days
      if (!Number.isFinite(daysPastBooking) || daysPastBooking < 0.5) {
        continue
      }

      try {
        await sendManualReviewRequestEmail({
          ...booking,
          rentalLabel: normalizeRentalLabel(booking.rentalLabel),
        })

        await runAsync(
          `
          UPDATE bookings
          SET finalPacketSentAt = datetime('now')
          WHERE id = ?
          `,
          [booking.id]
        )

        console.log(`Automatic review request sent for booking ${booking.id}`)
      } catch (err) {
        console.error(`Automatic review request failed for booking ${booking.id}:`, err)
      }
    }
  } catch (err) {
    console.error("AUTOMATIC REVIEW REQUEST PROCESS ERROR:", err)
  }
}

// hourly jobs
setInterval(processScheduledDepositRequests, 60 * 60 * 1000)
setInterval(processAutomaticDepositHolds, 60 * 60 * 1000)
setInterval(processAutomaticReviewRequests, 60 * 60 * 1000)

// startup runs
setTimeout(processScheduledDepositRequests, 10 * 1000)
setTimeout(processAutomaticDepositHolds, 20 * 1000)
setTimeout(processAutomaticReviewRequests, 30 * 1000)

// -----------------------------
// POST-SCHEMA MIGRATION CLEANUP
// -----------------------------
db.serialize(() => {
  db.all(`PRAGMA table_info(bookings)`, [], (err, rows) => {
    if (err) {
      console.error("POST MIGRATION BOOKINGS PRAGMA ERROR:", err)
      return
    }

    const existing = new Set(rows.map((r) => r.name))

    if (!existing.has("reviewRequestSentAt")) {
      db.run(`ALTER TABLE bookings ADD COLUMN reviewRequestSentAt TEXT`, [], (alterErr) => {
        if (alterErr) console.error("ALTER bookings reviewRequestSentAt ERROR:", alterErr)
      })
    }

    if (!existing.has("finalConfirmationSentAt")) {
      db.run(`ALTER TABLE bookings ADD COLUMN finalConfirmationSentAt TEXT`, [], (alterErr) => {
        if (alterErr) console.error("ALTER bookings finalConfirmationSentAt ERROR:", alterErr)
      })
    }
  })
})

// -----------------------------
// FINAL CONFIRMATION EMAIL HELPER
// -----------------------------
async function sendFinalConfirmationEmail(booking) {
  if (!booking?.customerEmail) return

  const normalizedBooking = {
    ...booking,
    rentalLabel: normalizeRentalLabel(booking.rentalLabel),
  }

  const amounts = await calculateBookingAmounts(normalizedBooking)

  return sendEmail({
    to: normalizedBooking.customerEmail,
    subject: `Final confirmation for booking #${normalizedBooking.id}`,
    text: `
Your Cleared to Cruise rental is confirmed.

Booking ID: ${normalizedBooking.id}
Rental: ${normalizedBooking.rentalLabel || "Boat Rental"}
Date: ${normalizedBooking.date || "Not provided"}
Time: ${normalizedBooking.rentalTime || "Not provided"}
Tow Location: ${normalizedBooking.towLocation || "None"}
Rental Paid: $${dollarsFromCents(amounts.totalAmount)}
Deposit Status: ${statusLabel(normalizedBooking.depositStatus || "not_requested")}

Please keep this email as proof of rental.
    `.trim(),
    html: `
      <h2>Your Cleared to Cruise rental is confirmed</h2>
      <p><strong>Booking ID:</strong> ${normalizedBooking.id}</p>
      <p><strong>Rental:</strong> ${escapeHtml(normalizedBooking.rentalLabel || "Boat Rental")}</p>
      <p><strong>Date:</strong> ${escapeHtml(normalizedBooking.date || "Not provided")}</p>
      <p><strong>Time:</strong> ${escapeHtml(normalizedBooking.rentalTime || "Not provided")}</p>
      <p><strong>Tow Location:</strong> ${escapeHtml(normalizedBooking.towLocation || "None")}</p>
      <p><strong>Rental Paid:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
      <p><strong>Deposit Status:</strong> ${escapeHtml(statusLabel(normalizedBooking.depositStatus || "not_requested"))}</p>
      <p>Please keep this email as proof of rental.</p>
    `,
  })
}

// -----------------------------
// ADMIN REVIEW / CONFIRMATION ROUTES
// -----------------------------
app.post("/api/admin/bookings/:id/resend-review-request", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    await sendManualReviewRequestEmail({
      ...booking,
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
    })

    await runAsync(
      `
      UPDATE bookings
      SET reviewRequestSentAt = datetime('now')
      WHERE id = ?
      `,
      [booking.id]
    )

    return res.json({ success: true, message: "Review request sent." })
  } catch (err) {
    console.error("RESEND REVIEW REQUEST ERROR:", err)
    return res.status(500).json({ error: "Could not resend review request." })
  }
})

app.post("/api/admin/bookings/:id/send-final-confirmation", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    await sendFinalConfirmationEmail(booking)

    await runAsync(
      `
      UPDATE bookings
      SET finalConfirmationSentAt = datetime('now')
      WHERE id = ?
      `,
      [booking.id]
    )

    return res.json({ success: true, message: "Final confirmation sent." })
  } catch (err) {
    console.error("SEND FINAL CONFIRMATION ERROR:", err)
    return res.status(500).json({ error: "Could not send final confirmation." })
  }
})

app.get("/api/admin/bookings/:id/audit", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [req.params.id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    return res.json({
      id: booking.id,
      customerEmail: booking.customerEmail || "",
      rentalLabel: normalizeRentalLabel(booking.rentalLabel),
      date: booking.date || "",
      status: booking.status || "",
      paymentStatus: booking.paymentStatus || "",
      waiverStatus: booking.waiverStatus || "",
      depositStatus: booking.depositStatus || "",
      depositSetupSessionId: booking.depositSetupSessionId || "",
      depositSetupIntentId: booking.depositSetupIntentId || "",
      depositPaymentIntentId: booking.depositPaymentIntentId || "",
      depositRequestedAt: booking.depositRequestedAt || "",
      depositLinkSentAt: booking.depositLinkSentAt || "",
      depositAuthorizedAt: booking.depositAuthorizedAt || "",
      depositCaptureBefore: booking.depositCaptureBefore || "",
      depositPlacedAt: booking.depositPlacedAt || "",
      depositReleasedAt: booking.depositReleasedAt || "",
      depositAmountAuthorized: Number(booking.depositAmountAuthorized || 0),
      depositAmountCaptured: Number(booking.depositAmountCaptured || 0),
      depositAmountReleased: Number(booking.depositAmountReleased || 0),
      reviewRequestSentAt: booking.reviewRequestSentAt || "",
      finalConfirmationSentAt: booking.finalConfirmationSentAt || "",
    })
  } catch (err) {
    console.error("BOOKING AUDIT ERROR:", err)
    return res.status(500).json({ error: "Could not load booking audit." })
  }
})

// -----------------------------
// REVIEW / CONFIRMATION AUTOMATION PATCH
// -----------------------------
async function processAutomaticFinalConfirmations() {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status = 'confirmed'
        AND paymentStatus = 'paid'
        AND waiverStatus = 'signed'
        AND COALESCE(finalConfirmationSentAt, '') = ''
      `
    )

    for (const booking of rows) {
      try {
        await sendFinalConfirmationEmail(booking)

        await runAsync(
          `
          UPDATE bookings
          SET finalConfirmationSentAt = datetime('now')
          WHERE id = ?
          `,
          [booking.id]
        )

        console.log(`Automatic final confirmation sent for booking ${booking.id}`)
      } catch (err) {
        console.error(`Automatic final confirmation failed for booking ${booking.id}:`, err)
      }
    }
  } catch (err) {
    console.error("AUTOMATIC FINAL CONFIRMATION PROCESS ERROR:", err)
  }
}

async function processAutomaticReviewRequestsV2() {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status = 'confirmed'
        AND paymentStatus = 'paid'
        AND waiverStatus = 'signed'
        AND COALESCE(reviewRequestSentAt, '') = ''
      `
    )

    for (const booking of rows) {
      const daysPastBooking = -daysUntilBooking(booking.date)

      if (!Number.isFinite(daysPastBooking) || daysPastBooking < 0.5) {
        continue
      }

      try {
        await sendManualReviewRequestEmail({
          ...booking,
          rentalLabel: normalizeRentalLabel(booking.rentalLabel),
        })

        await runAsync(
          `
          UPDATE bookings
          SET reviewRequestSentAt = datetime('now')
          WHERE id = ?
          `,
          [booking.id]
        )

        console.log(`Automatic review request sent for booking ${booking.id}`)
      } catch (err) {
        console.error(`Automatic review request failed for booking ${booking.id}:`, err)
      }
    }
  } catch (err) {
    console.error("AUTOMATIC REVIEW REQUEST V2 PROCESS ERROR:", err)
  }
}

// -----------------------------
// JOB SCHEDULER CLEANUP
// -----------------------------
const SCHEDULE_INTERVAL_MS = 60 * 60 * 1000

setInterval(processScheduledDepositRequests, SCHEDULE_INTERVAL_MS)
setInterval(processAutomaticDepositHolds, SCHEDULE_INTERVAL_MS)
setInterval(processAutomaticFinalConfirmations, SCHEDULE_INTERVAL_MS)
setInterval(processAutomaticReviewRequestsV2, SCHEDULE_INTERVAL_MS)

// startup runs
setTimeout(processScheduledDepositRequests, 10 * 1000)
setTimeout(processAutomaticDepositHolds, 20 * 1000)
setTimeout(processAutomaticFinalConfirmations, 30 * 1000)
setTimeout(processAutomaticReviewRequestsV2, 40 * 1000)

// -----------------------------
// ADMIN DIAGNOSTICS / CONFIG
// -----------------------------
app.get("/api/admin/stripe-config", requireAdminLogin, async (_req, res) => {
  try {
    return res.json({
      ok: true,
      stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      adminNotificationEmailConfigured: Boolean(ADMIN_NOTIFICATION_EMAIL),
      gmailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
      siteUrl: SITE_URL,
      apiUrl: API_URL,
    })
  } catch (err) {
    console.error("STRIPE CONFIG ERROR:", err)
    return res.status(500).json({ error: "Could not load Stripe configuration." })
  }
})

app.get("/api/admin/stripe-webhook-checklist", requireAdminLogin, async (_req, res) => {
  try {
    return res.json({
      ok: true,
      steps: [
        "1. In Stripe, create a webhook endpoint pointing to: " + `${API_URL}/webhook`,
        "2. Use the signing secret from Stripe as STRIPE_WEBHOOK_SECRET in your server environment.",
        "3. Ensure STRIPE_SECRET_KEY is set in your environment.",
        "4. For deposit card collection, the customer uses /api/deposit/:id which creates a setup-mode Checkout Session.",
        "5. After card-on-file exists, the server or admin places the $500 manual-capture hold using a PaymentIntent.",
        "6. The webhook listens for checkout.session.completed, payment_intent.amount_capturable_updated, payment_intent.canceled, and payment_intent.succeeded.",
        "7. Make sure your deployed API_URL is public and reachable by Stripe.",
        "8. Confirm the /success route is live on your frontend so customers return correctly after deposit setup or payment.",
      ],
      endpoint: `${API_URL}/webhook`,
      recommendedStripeEvents: [
        "checkout.session.completed",
        "payment_intent.amount_capturable_updated",
        "payment_intent.canceled",
        "payment_intent.succeeded",
      ],
    })
  } catch (err) {
    console.error("STRIPE WEBHOOK CHECKLIST ERROR:", err)
    return res.status(500).json({ error: "Could not load webhook checklist." })
  }
})

app.get("/api/admin/jobs-status", requireAdminLogin, async (_req, res) => {
  try {
    const pendingDepositRequests = await getAsync(
      `
      SELECT COUNT(*) AS count
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

    const pendingAutoDepositHolds = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE status IN ('approved_unpaid', 'confirmed', 'pending_payment')
        AND stripeCustomerId IS NOT NULL
        AND stripeCustomerId != ''
        AND stripePaymentMethodId IS NOT NULL
        AND stripePaymentMethodId != ''
        AND (
          depositStatus = 'card_on_file'
          OR depositStatus = 'requested'
        )
      `
    )

    const pendingFinalConfirmations = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status = 'confirmed'
        AND paymentStatus = 'paid'
        AND waiverStatus = 'signed'
        AND COALESCE(finalConfirmationSentAt, '') = ''
      `
    )

    const pendingReviewRequests = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE customerEmail IS NOT NULL
        AND customerEmail != ''
        AND status = 'confirmed'
        AND paymentStatus = 'paid'
        AND waiverStatus = 'signed'
        AND COALESCE(reviewRequestSentAt, '') = ''
      `
    )

    return res.json({
      ok: true,
      pendingDepositRequests: Number(pendingDepositRequests?.count || 0),
      pendingAutoDepositHolds: Number(pendingAutoDepositHolds?.count || 0),
      pendingFinalConfirmations: Number(pendingFinalConfirmations?.count || 0),
      pendingReviewRequests: Number(pendingReviewRequests?.count || 0),
    })
  } catch (err) {
    console.error("JOBS STATUS ERROR:", err)
    return res.status(500).json({ error: "Could not load jobs status." })
  }
})

app.get("/debug/testimonials", async (req, res) => {
  try {
    const rows = await allAsync(`SELECT * FROM testimonials`)
    res.json(rows)
  } catch (err) {
    res.json({ error: err.message })
  }
})
app.get("/debug/add-testimonial", async (req, res) => {
  try {
    await runAsync(`
      INSERT INTO testimonials (fullName, message, rating, approved)
      VALUES ('Tim Test', 'This is a live testimonial', 5, 1)
    `)

    res.send("Inserted")
  } catch (err) {
    res.json({ error: err.message })
  }
})
app.get("/debug/reset-testimonials", async (req, res) => {
  try {
    await runAsync(`DROP TABLE IF EXISTS testimonials`)

    await runAsync(`
      CREATE TABLE testimonials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        message TEXT,
        rating INTEGER,
        approved INTEGER DEFAULT 0,
        createdAt TEXT,
        photos TEXT
      )
    `)

    res.send("reset complete")
  } catch (err) {
    res.json({ error: err.message })
  }
})

// -----------------------------
// START
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// -----------------------------
// BOOKING FETCH HELPERS
// -----------------------------
async function getBookingOrNull(id) {
  const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
  if (!booking) return null

  return {
    ...booking,
    rentalLabel: normalizeRentalLabel(booking.rentalLabel),
  }
}

async function sendCustomerBookingStatusEmail(booking) {
  if (!booking?.customerEmail) return

  const amounts = await calculateBookingAmounts(booking)

  return sendEmail({
    to: booking.customerEmail,
    subject: `Booking update for #${booking.id}`,
    text: `
Here is your current booking status.

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
Tow Location: ${booking.towLocation || "None"}
Status: ${statusLabel(booking.status || "pending_approval")}
Waiver: ${statusLabel(booking.waiverStatus || "not_started")}
Payment: ${statusLabel(booking.paymentStatus || "unpaid")}
Deposit: ${statusLabel(booking.depositStatus || "not_requested")}
Current Total: $${dollarsFromCents(amounts.totalAmount)}
    `.trim(),
    html: `
      <h2>Your booking update</h2>
      <p><strong>Booking ID:</strong> ${booking.id}</p>
      <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
      <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
      <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
      <p><strong>Tow Location:</strong> ${escapeHtml(booking.towLocation || "None")}</p>
      <p><strong>Status:</strong> ${escapeHtml(statusLabel(booking.status || "pending_approval"))}</p>
      <p><strong>Waiver:</strong> ${escapeHtml(statusLabel(booking.waiverStatus || "not_started"))}</p>
      <p><strong>Payment:</strong> ${escapeHtml(statusLabel(booking.paymentStatus || "unpaid"))}</p>
      <p><strong>Deposit:</strong> ${escapeHtml(statusLabel(booking.depositStatus || "not_requested"))}</p>
      <p><strong>Current Total:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
    `,
  })
}

// -----------------------------
// ADMIN MANUAL JOB RUNNER
// -----------------------------
app.post("/api/admin/run-jobs-now", requireAdminLogin, async (_req, res) => {
  try {
    await processScheduledDepositRequests()
    await processAutomaticDepositHolds()
    await processAutomaticFinalConfirmations()
    await processAutomaticReviewRequestsV2()

    return res.json({ success: true, message: "Background jobs executed." })
  } catch (err) {
    console.error("RUN JOBS NOW ERROR:", err)
    return res.status(500).json({ error: "Could not run jobs." })
  }
})

// -----------------------------
// ADMIN RESEND ROUTES
// -----------------------------
app.post("/api/admin/bookings/:id/resend-deposit-request", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getBookingOrNull(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    const depositUrl = formatDepositRequestUrl(booking.id)

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
          depositStatus = CASE
            WHEN depositStatus IN ('held', 'captured') THEN depositStatus
            ELSE 'requested'
          END
      WHERE id = ?
      `,
      [booking.id]
    )

    return res.json({ success: true, message: "Deposit request resent." })
  } catch (err) {
    console.error("RESEND DEPOSIT REQUEST ERROR:", err)
    return res.status(500).json({ error: "Could not resend deposit request." })
  }
})

app.post("/api/admin/bookings/:id/resend-payment-request", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getBookingOrNull(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    const paymentUrl = formatPaymentUrl(booking.id)

    await sendEmail({
      to: booking.customerEmail,
      subject: `Payment link for booking #${booking.id}`,
      text: `
Your Cleared to Cruise booking is ready for payment.

Payment link:
${paymentUrl}
      `.trim(),
      html: `
        <h2>Your booking is ready for payment</h2>
        <p><strong>Booking ID:</strong> ${booking.id}</p>
        <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
        <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
        <p><a href="${paymentUrl}" style="display:inline-block;padding:12px 18px;background:#0f2233;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Pay Rental Now</a></p>
      `,
    })

    return res.json({ success: true, message: "Payment request resent." })
  } catch (err) {
    console.error("RESEND PAYMENT REQUEST ERROR:", err)
    return res.status(500).json({ error: "Could not resend payment request." })
  }
})

app.post("/api/admin/bookings/:id/resend-final-confirmation", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getBookingOrNull(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    await sendFinalConfirmationEmail(booking)

    await runAsync(
      `
      UPDATE bookings
      SET finalConfirmationSentAt = datetime('now')
      WHERE id = ?
      `,
      [booking.id]
    )

    return res.json({ success: true, message: "Final confirmation resent." })
  } catch (err) {
    console.error("RESEND FINAL CONFIRMATION ERROR:", err)
    return res.status(500).json({ error: "Could not resend final confirmation." })
  }
})

app.post("/api/admin/bookings/:id/resend-approval-email", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getBookingOrNull(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    await sendAdminApprovalEmail(booking)

    return res.json({ success: true, message: "Approval email resent to admin." })
  } catch (err) {
    console.error("RESEND APPROVAL EMAIL ERROR:", err)
    return res.status(500).json({ error: "Could not resend approval email." })
  }
})

app.post("/api/admin/bookings/:id/resend-customer-status", requireAdminLogin, async (req, res) => {
  try {
    const booking = await getBookingOrNull(req.params.id)

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." })
    }

    if (!booking.customerEmail) {
      return res.status(400).json({ error: "Booking does not have a customer email." })
    }

    await sendCustomerBookingStatusEmail(booking)

    return res.json({ success: true, message: "Customer status email sent." })
  } catch (err) {
    console.error("RESEND CUSTOMER STATUS ERROR:", err)
    return res.status(500).json({ error: "Could not send customer status email." })
  }
})

// -----------------------------
// TESTIMONIALS TABLE
// -----------------------------
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookingId INTEGER,
      name TEXT,
      email TEXT,
      message TEXT,
      photos TEXT,
      rating INTEGER,
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now')),
      approvedAt TEXT
    )
  `)
})

// -----------------------------
// PRICING NORMALIZATION / AUDIT HELPERS
// -----------------------------
function sanitizePricingInputRows(rows) {
  if (!Array.isArray(rows)) return []

  return rows
    .map((item, index) => {
      const rentalKey = normalizeRentalLabel(item?.rentalKey || item?.value || "")
      const rentalLabel = normalizeRentalLabel(item?.rentalLabel || item?.label || rentalKey)
      const rawPriceCents = Number(item?.priceCents || 0)
      const rawPriceDollars = Number(item?.priceDollars || item?.price || 0)

      const priceCents =
        rawPriceCents > 0
          ? rawPriceCents
          : rawPriceDollars > 0
            ? centsFromDollars(rawPriceDollars)
            : 0

      const sortOrder = Number(item?.sortOrder || index + 1)

      if (!rentalKey || !rentalLabel || priceCents <= 0) {
        return null
      }

      return {
        rentalKey,
        rentalLabel,
        priceCents,
        sortOrder,
      }
    })
    .filter(Boolean)
}

async function getAllActivePricingSettings() {
  const rows = await allAsync(
    `
    SELECT rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt
    FROM pricing_settings
    WHERE isActive = 1
    ORDER BY sortOrder ASC, id ASC
    `
  )

  if (rows.length) return rows

  return DEFAULT_PRICING.map((item) => ({
    ...item,
    isActive: 1,
    updatedAt: new Date().toISOString(),
  }))
}

async function buildBookingPricingAudit(bookingId) {
  const booking = await getBookingOrNull(bookingId)
  if (!booking) return null

  const amounts = await calculateBookingAmounts(booking)

  return {
    id: booking.id,
    rentalLabel: booking.rentalLabel,
    date: booking.date,
    towLocation: booking.towLocation,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    pricing: {
      baseRentalAmount: amounts.baseRentalAmount,
      towFeeAmount: amounts.towFeeAmount,
      finalRentalAmount: amounts.finalRentalAmount,
      totalAmount: amounts.totalAmount,
      baseRentalAmountDollars: dollarsFromCents(amounts.baseRentalAmount),
      towFeeAmountDollars: dollarsFromCents(amounts.towFeeAmount),
      finalRentalAmountDollars: dollarsFromCents(amounts.finalRentalAmount),
      totalAmountDollars: dollarsFromCents(amounts.totalAmount),
      appliedPricing: amounts.appliedPricing,
    },
  }
}

// -----------------------------
// ADMIN PRICING UTILITIES
// -----------------------------
app.post("/api/admin/pricing/reset-defaults", requireAdminLogin, async (_req, res) => {
  try {
    for (const item of DEFAULT_PRICING) {
      await runAsync(
        `
        INSERT INTO pricing_settings (rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(rentalKey) DO UPDATE SET
          rentalLabel = excluded.rentalLabel,
          priceCents = excluded.priceCents,
          sortOrder = excluded.sortOrder,
          isActive = 1,
          updatedAt = datetime('now')
        `,
        [item.rentalKey, item.rentalLabel, item.priceCents, item.sortOrder]
      )
    }

    return res.json({ success: true, message: "Default pricing restored." })
  } catch (err) {
    console.error("RESET DEFAULT PRICING ERROR:", err)
    return res.status(500).json({ error: "Could not reset default pricing." })
  }
})

app.post("/api/admin/pricing/preview", requireAdminLogin, async (req, res) => {
  try {
    const pricingRows = sanitizePricingInputRows(req.body?.pricing || [])
    const percentAdjustment = Number(req.body?.percentAdjustment || 0)
    const multiplier = 1 + percentAdjustment / 100

    const sourceRows = pricingRows.length ? pricingRows : await getAllActivePricingSettings()

    const preview = sourceRows.map((item) => {
      const adjusted = Math.max(0, Math.round(Number(item.priceCents || 0) * multiplier))
      return {
        rentalKey: item.rentalKey,
        rentalLabel: item.rentalLabel,
        originalPriceCents: Number(item.priceCents || 0),
        originalPriceDollars: dollarsFromCents(item.priceCents || 0),
        previewPriceCents: adjusted,
        previewPriceDollars: dollarsFromCents(adjusted),
        sortOrder: Number(item.sortOrder || 0),
      }
    })

    return res.json({
      success: true,
      percentAdjustment,
      preview,
    })
  } catch (err) {
    console.error("PRICING PREVIEW ERROR:", err)
    return res.status(500).json({ error: "Could not preview pricing." })
  }
})

app.get("/api/admin/bookings/:id/pricing-audit", requireAdminLogin, async (req, res) => {
  try {
    const audit = await buildBookingPricingAudit(req.params.id)

    if (!audit) {
      return res.status(404).json({ error: "Booking not found." })
    }

    return res.json(audit)
  } catch (err) {
    console.error("BOOKING PRICING AUDIT ERROR:", err)
    return res.status(500).json({ error: "Could not load booking pricing audit." })
  }
})

app.get("/api/admin/pricing/defaults", requireAdminLogin, async (_req, res) => {
  try {
    return res.json(DEFAULT_PRICING)
  } catch (err) {
    console.error("DEFAULT PRICING LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load default pricing." })
  }
})

// -----------------------------
// PRICING PROFILE TABLE
// -----------------------------
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS pricing_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileKey TEXT NOT NULL UNIQUE,
      profileValue TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  db.run(
    `
    INSERT INTO pricing_profiles (profileKey, profileValue, updatedAt)
    VALUES ('globalPercentAdjustment', '0', datetime('now'))
    ON CONFLICT(profileKey) DO NOTHING
    `
  )
})

// -----------------------------
// PRICING PROFILE HELPERS
// -----------------------------
async function getPricingProfileValue(profileKey, fallbackValue = "") {
  const row = await getAsync(
    `
    SELECT profileValue
    FROM pricing_profiles
    WHERE profileKey = ?
    LIMIT 1
    `,
    [profileKey]
  )

  if (!row) return fallbackValue
  return String(row.profileValue ?? fallbackValue)
}

async function setPricingProfileValue(profileKey, profileValue) {
  await runAsync(
    `
    INSERT INTO pricing_profiles (profileKey, profileValue, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(profileKey) DO UPDATE SET
      profileValue = excluded.profileValue,
      updatedAt = datetime('now')
    `,
    [profileKey, String(profileValue)]
  )
}

async function savePricingRows(rows) {
  const cleanRows = sanitizePricingInputRows(rows)

  if (!cleanRows.length) {
    throw new Error("No valid pricing rows were provided.")
  }

  for (const item of cleanRows) {
    await runAsync(
      `
      INSERT INTO pricing_settings (rentalKey, rentalLabel, priceCents, sortOrder, isActive, updatedAt)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(rentalKey) DO UPDATE SET
        rentalLabel = excluded.rentalLabel,
        priceCents = excluded.priceCents,
        sortOrder = excluded.sortOrder,
        isActive = 1,
        updatedAt = datetime('now')
      `,
      [item.rentalKey, item.rentalLabel, item.priceCents, item.sortOrder]
    )
  }

  return cleanRows
}

// -----------------------------
// ADMIN PRICING PROFILE ROUTES
// -----------------------------
app.get("/api/admin/pricing/profile", requireAdminLogin, async (_req, res) => {
  try {
    const globalPercentAdjustment = Number(
      await getPricingProfileValue("globalPercentAdjustment", "0")
    )

    const activePricing = await getAllActivePricingSettings()

    return res.json({
      success: true,
      globalPercentAdjustment,
      pricing: activePricing,
    })
  } catch (err) {
    console.error("PRICING PROFILE LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load pricing profile." })
  }
})

app.post("/api/admin/pricing/profile/percent", requireAdminLogin, async (req, res) => {
  try {
    const percentAdjustment = Number(req.body?.percentAdjustment || 0)

    if (!Number.isFinite(percentAdjustment)) {
      return res.status(400).json({ error: "A valid percentAdjustment is required." })
    }

    await setPricingProfileValue("globalPercentAdjustment", String(percentAdjustment))

    return res.json({
      success: true,
      globalPercentAdjustment: percentAdjustment,
    })
  } catch (err) {
    console.error("SAVE PRICING PERCENT ERROR:", err)
    return res.status(500).json({ error: "Could not save pricing percentage." })
  }
})

app.post("/api/admin/pricing/apply-percent", requireAdminLogin, async (req, res) => {
  try {
    const percentAdjustment = Number(req.body?.percentAdjustment || 0)

    if (!Number.isFinite(percentAdjustment)) {
      return res.status(400).json({ error: "A valid percentAdjustment is required." })
    }

    const currentPricing = await getAllActivePricingSettings()
    const multiplier = 1 + percentAdjustment / 100

    const adjustedRows = currentPricing.map((item) => {
      const adjustedPrice = Math.max(
        0,
        Math.round(Number(item.priceCents || 0) * multiplier)
      )

      return {
        rentalKey: item.rentalKey,
        rentalLabel: item.rentalLabel,
        priceCents: adjustedPrice,
        sortOrder: Number(item.sortOrder || 0),
      }
    })

    await savePricingRows(adjustedRows)
    await setPricingProfileValue("globalPercentAdjustment", "0")

    return res.json({
      success: true,
      message: "Pricing percentage applied.",
      pricing: await getAllActivePricingSettings(),
    })
  } catch (err) {
    console.error("APPLY PRICING PERCENT ERROR:", err)
    return res.status(500).json({ error: "Could not apply pricing percentage." })
  }
})

app.post("/api/admin/pricing/sync", requireAdminLogin, async (req, res) => {
  try {
    const cleanRows = await savePricingRows(req.body?.pricing || [])

    return res.json({
      success: true,
      pricing: cleanRows,
    })
  } catch (err) {
    console.error("PRICING SYNC ERROR:", err)
    return res.status(500).json({ error: err.message || "Could not sync pricing." })
  }
})

// -----------------------------
// PUBLIC PRICING PROFILE ROUTE
// -----------------------------
app.get("/api/pricing/profile", async (_req, res) => {
  try {
    const globalPercentAdjustment = Number(
      await getPricingProfileValue("globalPercentAdjustment", "0")
    )

    const pricing = await getAllActivePricingSettings()

    return res.json({
      success: true,
      globalPercentAdjustment,
      pricing,
    })
  } catch (err) {
    console.error("PUBLIC PRICING PROFILE ERROR:", err)
    return res.status(500).json({ error: "Could not load pricing profile." })
  }
})

// ===============================
// RENTAL PACKET BUILDERS (UPDATED)
// ===============================

function buildRentalPacketText(booking) {
  return `
CLEARED TO CRUISE RENTAL CONFIRMATION

Booking ID: ${booking.id}
Customer: ${booking.waiverPrintedName || "N/A"}
Email: ${booking.customerEmail || "N/A"}

Rental:
${booking.rentalLabel}

Date:
${booking.date}

Time:
${booking.rentalTime || "N/A"}

Tow Location:
${booking.towLocation || "None"}

----------------------------------------

PAYMENT SUMMARY

Rental Paid: ${formatCurrency(booking.amountPaid || 0)}
Deposit Authorized: ${formatCurrency(booking.depositAmountAuthorized || 500)}

----------------------------------------

IMPORTANT INFORMATION

Please arrive on time for your rental.
Ensure all passengers follow safety guidelines.
Driver must comply with all California boating laws.

VESSEL REGISTRATION:
(To be provided at time of rental)

LAKE EMERGENCY CONTACTS:
Castaic Lake: (661) 257-4050
Pyramid Lake: (661) 944-2743

----------------------------------------

Important:
Fuel is charged separately unless otherwise stated.
Security deposit terms remain subject to damage, loss, late return, cleaning, or other contract violations.

IMPORTANT FOR YOUR RENTAL DAY:
Please bring a copy of this rental confirmation with you.
You may present it on your phone or as a printed copy.
This serves as your proof of rental if requested by lake staff, rangers, or authorities.
`.trim()
}

function buildRentalPacketHtml(booking) {
  return `
<div style="font-family: Arial, sans-serif; line-height:1.6; color:#102030;">

<h2>Cleared to Cruise Rental Confirmation</h2>

<p><strong>Booking ID:</strong> ${booking.id}</p>
<p><strong>Customer:</strong> ${booking.waiverPrintedName || "N/A"}</p>
<p><strong>Email:</strong> ${booking.customerEmail || "N/A"}</p>

<hr />

<p><strong>Rental:</strong> ${booking.rentalLabel}</p>
<p><strong>Date:</strong> ${booking.date}</p>
<p><strong>Time:</strong> ${booking.rentalTime || "N/A"}</p>
<p><strong>Tow Location:</strong> ${booking.towLocation || "None"}</p>

<hr />

<h3>Payment Summary</h3>
<p><strong>Rental Paid:</strong> ${formatCurrency(booking.amountPaid || 0)}</p>
<p><strong>Deposit Authorized:</strong> ${formatCurrency(booking.depositAmountAuthorized || 500)}</p>

<hr />

<h3>Important Information</h3>
<p>Please arrive on time for your rental.</p>
<p>Ensure all passengers follow safety guidelines.</p>
<p>Driver must comply with all California boating laws.</p>

<hr />

<h3>Vessel Registration</h3>
<p>(Provided at time of rental)</p>

<h3>Lake Emergency Contacts</h3>
<p>Castaic Lake: (661) 257-4050</p>
<p>Pyramid Lake: (661) 944-2743</p>

<hr />

<p>
Fuel is charged separately unless otherwise stated.<br/>
Security deposit terms remain subject to damage, loss, late return, cleaning, or other contract violations.
</p>

<hr />

<p style="color:#b42318; font-weight:700;">
IMPORTANT FOR YOUR RENTAL DAY:
</p>
<p>
Please bring a copy of this rental confirmation with you.<br/>
You may present it on your phone or as a printed copy.<br/>
This serves as your proof of rental if requested by lake staff, rangers, or authorities.
</p>

</div>
`
}

// -----------------------------
// VESSEL / LAKE CONFIG TABLES
// -----------------------------
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS vessel_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rentalLabel TEXT NOT NULL UNIQUE,
      vesselRegistrationNumber TEXT,
      vesselDisplayName TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS lake_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lakeKey TEXT NOT NULL UNIQUE,
      lakeLabel TEXT NOT NULL,
      emergencyContact TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    )
  `)

  db.run(
    `
    INSERT INTO vessel_registry (
      rentalLabel,
      vesselRegistrationNumber,
      vesselDisplayName,
      isActive,
      updatedAt
    )
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(rentalLabel) DO UPDATE SET
      vesselRegistrationNumber = excluded.vesselRegistrationNumber,
      vesselDisplayName = excluded.vesselDisplayName,
      isActive = 1,
      updatedAt = datetime('now')
    `,
    ["Pontoon - Half Day", "CF2591UY", "Pontoon Boat"],
    (err) => {
      if (err) console.error("VESSEL REGISTRY seed error (Pontoon - Half Day):", err)
    }
  )

  db.run(
    `
    INSERT INTO vessel_registry (
      rentalLabel,
      vesselRegistrationNumber,
      vesselDisplayName,
      isActive,
      updatedAt
    )
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(rentalLabel) DO UPDATE SET
      vesselRegistrationNumber = excluded.vesselRegistrationNumber,
      vesselDisplayName = excluded.vesselDisplayName,
      isActive = 1,
      updatedAt = datetime('now')
    `,
    ["Pontoon - Full Day", "CF2591UY", "Pontoon Boat"],
    (err) => {
      if (err) console.error("VESSEL REGISTRY seed error (Pontoon - Full Day):", err)
    }
  )

  db.run(
    `
    INSERT INTO vessel_registry (
      rentalLabel,
      vesselRegistrationNumber,
      vesselDisplayName,
      isActive,
      updatedAt
    )
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(rentalLabel) DO UPDATE SET
      vesselRegistrationNumber = excluded.vesselRegistrationNumber,
      vesselDisplayName = excluded.vesselDisplayName,
      isActive = 1,
      updatedAt = datetime('now')
    `,
    ["Bass Boat - Full Day", "CF4049NZ", "Bass Boat"],
    (err) => {
      if (err) console.error("VESSEL REGISTRY seed error (Bass Boat - Full Day):", err)
    }
  )

  db.run(
    `
    INSERT INTO lake_contacts (
      lakeKey,
      lakeLabel,
      emergencyContact,
      isActive,
      updatedAt
    )
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(lakeKey) DO UPDATE SET
      lakeLabel = excluded.lakeLabel,
      emergencyContact = excluded.emergencyContact,
      isActive = 1,
      updatedAt = datetime('now')
    `,
    ["Castaic", "Castaic Lake", "(661) 257-4050"],
    (err) => {
      if (err) console.error("LAKE CONTACT seed error (Castaic):", err)
    }
  )

  db.run(
    `
    INSERT INTO lake_contacts (
      lakeKey,
      lakeLabel,
      emergencyContact,
      isActive,
      updatedAt
    )
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(lakeKey) DO UPDATE SET
      lakeLabel = excluded.lakeLabel,
      emergencyContact = excluded.emergencyContact,
      isActive = 1,
      updatedAt = datetime('now')
    `,
    ["Pyramid", "Pyramid Lake", "(661) 944-2743"],
    (err) => {
      if (err) console.error("LAKE CONTACT seed error (Pyramid):", err)
    }
  )
})

// -----------------------------
// VESSEL / LAKE HELPERS
// -----------------------------
async function getVesselRegistrationInfo(rentalLabel) {
  const normalizedLabel = normalizeRentalLabel(rentalLabel)

  const row = await getAsync(
    `
    SELECT rentalLabel, vesselRegistrationNumber, vesselDisplayName
    FROM vessel_registry
    WHERE rentalLabel = ?
      AND isActive = 1
    LIMIT 1
    `,
    [normalizedLabel]
  )

  return row || null
}

async function getLakeEmergencyInfo(towLocation) {
  const lakeKey = String(towLocation || "").trim()

  if (!lakeKey || lakeKey === "None") {
    return {
      lakeLabel: "Your selected lake",
      emergencyContact: "Use the official lake emergency and ranger contacts for your booked location.",
    }
  }

  const row = await getAsync(
    `
    SELECT lakeKey, lakeLabel, emergencyContact
    FROM lake_contacts
    WHERE lakeKey = ?
      AND isActive = 1
    LIMIT 1
    `,
    [lakeKey]
  )

  if (!row) {
    return {
      lakeLabel: lakeKey,
      emergencyContact: "Use the official lake emergency and ranger contacts for your booked location.",
    }
  }

  return row
}

// -----------------------------
// ADMIN VESSEL / LAKE ROUTES
// -----------------------------
app.get("/api/admin/vessels", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM vessel_registry
      WHERE isActive = 1
      ORDER BY rentalLabel ASC
      `
    )

    return res.json(rows)
  } catch (err) {
    console.error("LOAD VESSELS ERROR:", err)
    return res.status(500).json({ error: "Could not load vessels." })
  }
})

app.post("/api/admin/vessels", requireAdminLogin, async (req, res) => {
  try {
    const rentalLabel = normalizeRentalLabel(req.body?.rentalLabel || "")
    const vesselRegistrationNumber = String(req.body?.vesselRegistrationNumber || "").trim()
    const vesselDisplayName = String(req.body?.vesselDisplayName || "").trim()

    if (!rentalLabel) {
      return res.status(400).json({ error: "rentalLabel is required." })
    }

    await runAsync(
      `
      INSERT INTO vessel_registry (
        rentalLabel,
        vesselRegistrationNumber,
        vesselDisplayName,
        isActive,
        updatedAt
      )
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(rentalLabel) DO UPDATE SET
        vesselRegistrationNumber = excluded.vesselRegistrationNumber,
        vesselDisplayName = excluded.vesselDisplayName,
        isActive = 1,
        updatedAt = datetime('now')
      `,
      [rentalLabel, vesselRegistrationNumber, vesselDisplayName]
    )

    return res.json({ success: true, message: "Vessel registration saved." })
  } catch (err) {
    console.error("SAVE VESSEL ERROR:", err)
    return res.status(500).json({ error: "Could not save vessel registration." })
  }
})

app.get("/api/admin/lake-contacts", requireAdminLogin, async (_req, res) => {
  try {
    const rows = await allAsync(
      `
      SELECT *
      FROM lake_contacts
      WHERE isActive = 1
      ORDER BY lakeLabel ASC
      `
    )

    return res.json(rows)
  } catch (err) {
    console.error("LOAD LAKE CONTACTS ERROR:", err)
    return res.status(500).json({ error: "Could not load lake contacts." })
  }
})

app.post("/api/admin/lake-contacts", requireAdminLogin, async (req, res) => {
  try {
    const lakeKey = String(req.body?.lakeKey || "").trim()
    const lakeLabel = String(req.body?.lakeLabel || "").trim()
    const emergencyContact = String(req.body?.emergencyContact || "").trim()

    if (!lakeKey || !lakeLabel) {
      return res.status(400).json({ error: "lakeKey and lakeLabel are required." })
    }

    await runAsync(
      `
      INSERT INTO lake_contacts (
        lakeKey,
        lakeLabel,
        emergencyContact,
        isActive,
        updatedAt
      )
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(lakeKey) DO UPDATE SET
        lakeLabel = excluded.lakeLabel,
        emergencyContact = excluded.emergencyContact,
        isActive = 1,
        updatedAt = datetime('now')
      `,
      [lakeKey, lakeLabel, emergencyContact]
    )

    return res.json({ success: true, message: "Lake contact saved." })
  } catch (err) {
    console.error("SAVE LAKE CONTACT ERROR:", err)
    return res.status(500).json({ error: "Could not save lake contact." })
  }
})

// -----------------------------
// UPDATED RENTAL PACKET BUILDERS
// -----------------------------
async function buildRentalPacketText(booking, amounts) {
  const vesselInfo = await getVesselRegistrationInfo(booking.rentalLabel)
  const lakeInfo = await getLakeEmergencyInfo(booking.towLocation)

  return `
Cleared to Cruise Rental Packet

Booking ID: ${booking.id}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
Tow Location: ${booking.towLocation || "None"}
Customer Name: ${booking.waiverPrintedName || "Not provided"}
Customer Email: ${booking.customerEmail || "Not provided"}

Rental Total Paid: $${dollarsFromCents(amounts.totalAmount)}
Base Rental Amount: $${dollarsFromCents(amounts.finalRentalAmount)}
Tow Fee: $${dollarsFromCents(amounts.towFeeAmount)}

Deposit Status: ${statusLabel(booking.depositStatus || "not_requested")}
Deposit Authorized: ${
    booking.depositAmountAuthorized ? `$${dollarsFromCents(booking.depositAmountAuthorized)}` : "Not authorized"
  }
Deposit Captured: ${
    booking.depositAmountCaptured ? `$${dollarsFromCents(booking.depositAmountCaptured)}` : "0.00"
  }
Deposit Released: ${
    booking.depositAmountReleased ? `$${dollarsFromCents(booking.depositAmountReleased)}` : "0.00"
  }

Vessel Registration:
${vesselInfo?.vesselRegistrationNumber || "To be provided at time of rental"}

Lake Emergency Contact:
${lakeInfo?.lakeLabel || "Your selected lake"}: ${
    lakeInfo?.emergencyContact || "Use the official lake emergency and ranger contacts for your booked location."
  }

Proof of Rental:
This email confirms that the renter named above has an active Cleared to Cruise rental associated with the booking ID shown above.

Business Contact:
Cleared to Cruise

Important:
Fuel is charged separately unless otherwise stated.
Security deposit terms remain subject to damage, loss, late return, cleaning, or other contract violations.

IMPORTANT FOR YOUR RENTAL DAY:
Please bring a copy of this rental confirmation with you.
You may present it on your phone or as a printed copy.
This serves as your proof of rental if requested by lake staff, rangers, or authorities.
  `.trim()
}

async function buildRentalPacketHtml(booking, amounts) {
  const vesselInfo = await getVesselRegistrationInfo(booking.rentalLabel)
  const lakeInfo = await getLakeEmergencyInfo(booking.towLocation)

  return `
    <h2>Cleared to Cruise Rental Packet</h2>
    <p><strong>Booking ID:</strong> ${booking.id}</p>
    <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
    <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
    <p><strong>Time:</strong> ${escapeHtml(booking.rentalTime || "Not provided")}</p>
    <p><strong>Tow Location:</strong> ${escapeHtml(booking.towLocation || "None")}</p>
    <p><strong>Customer Name:</strong> ${escapeHtml(booking.waiverPrintedName || "Not provided")}</p>
    <p><strong>Customer Email:</strong> ${escapeHtml(booking.customerEmail || "Not provided")}</p>

    <hr />

    <p><strong>Rental Total Paid:</strong> $${escapeHtml(dollarsFromCents(amounts.totalAmount))}</p>
    <p><strong>Base Rental Amount:</strong> $${escapeHtml(dollarsFromCents(amounts.finalRentalAmount))}</p>
    <p><strong>Tow Fee:</strong> $${escapeHtml(dollarsFromCents(amounts.towFeeAmount))}</p>

    <p><strong>Deposit Status:</strong> ${escapeHtml(statusLabel(booking.depositStatus || "not_requested"))}</p>
    <p><strong>Deposit Authorized:</strong> ${
      booking.depositAmountAuthorized
        ? `$${escapeHtml(dollarsFromCents(booking.depositAmountAuthorized))}`
        : "Not authorized"
    }</p>
    <p><strong>Deposit Captured:</strong> ${
      booking.depositAmountCaptured
        ? `$${escapeHtml(dollarsFromCents(booking.depositAmountCaptured))}`
        : "$0.00"
    }</p>
    <p><strong>Deposit Released:</strong> ${
      booking.depositAmountReleased
        ? `$${escapeHtml(dollarsFromCents(booking.depositAmountReleased))}`
        : "$0.00"
    }</p>

    <hr />

    <p><strong>Vessel Registration:</strong> ${escapeHtml(
      vesselInfo?.vesselRegistrationNumber || "To be provided at time of rental"
    )}</p>
    <p><strong>Lake Emergency Contact:</strong> ${escapeHtml(
      lakeInfo?.lakeLabel || "Your selected lake"
    )}: ${escapeHtml(
      lakeInfo?.emergencyContact ||
        "Use the official lake emergency and ranger contacts for your booked location."
    )}</p>

    <p><strong>Proof of Rental:</strong> This email confirms that the renter named above has an active Cleared to Cruise rental associated with the booking ID shown above.</p>
    <p><strong>Business Contact:</strong> Cleared to Cruise</p>

    <p><strong>Important:</strong> Fuel is charged separately unless otherwise stated. Security deposit terms remain subject to damage, loss, late return, cleaning, or other contract violations.</p>

    <hr />

    <p style="color:#b42318; font-weight:700;">
      IMPORTANT FOR YOUR RENTAL DAY:
    </p>
    <p>
      Please bring a copy of this rental confirmation with you.<br/>
      You may present it on your phone or as a printed copy.<br/>
      This serves as your proof of rental if requested by lake staff, rangers, or authorities.
    </p>
  `
}

async function sendRentalPacketEmail(booking) {
  if (!booking?.customerEmail) return

  const normalizedBooking = {
    ...booking,
    rentalLabel: normalizeRentalLabel(booking.rentalLabel),
  }

  const amounts = await calculateBookingAmounts(normalizedBooking)
  const text = await buildRentalPacketText(normalizedBooking, amounts)
  const html = await buildRentalPacketHtml(normalizedBooking, amounts)

  return sendEmail({
    to: normalizedBooking.customerEmail,
    subject: `Rental packet for booking #${normalizedBooking.id}`,
    text,
    html,
  })
}

// -----------------------------
// FINAL SCHEDULER CLEANUP
// -----------------------------
const FINAL_SCHEDULE_INTERVAL_MS = 60 * 60 * 1000


// -----------------------------
// FINAL ADMIN DIAGNOSTICS
// -----------------------------
app.get("/api/admin/system-summary", requireAdminLogin, async (_req, res) => {
  try {
    const bookingCount = await getAsync(`SELECT COUNT(*) AS count FROM bookings`)
    const testimonialCount = await getAsync(`SELECT COUNT(*) AS count FROM testimonials`)
    const vesselCount = await getAsync(
      `SELECT COUNT(*) AS count FROM vessel_registry WHERE isActive = 1`
    )
    const pricingCount = await getAsync(
      `SELECT COUNT(*) AS count FROM pricing_settings WHERE isActive = 1`
    )

    return res.json({
      ok: true,
      totals: {
        bookings: Number(bookingCount?.count || 0),
        testimonials: Number(testimonialCount?.count || 0),
        activeVessels: Number(vesselCount?.count || 0),
        activePricingRows: Number(pricingCount?.count || 0),
      },
      notes: [
        "Testimonials require approval before public display.",
        "Review requests can be sent automatically and manually.",
        "Deposit setup and manual-capture hold flow are enabled in the backend.",
        "Vessel registration numbers are now database-driven, so new boats do not require recoding.",
      ],
    })
  } catch (err) {
    console.error("SYSTEM SUMMARY ERROR:", err)
    return res.status(500).json({ error: "Could not load system summary." })
  }
})

// -----------------------------
// PDF RENTAL PACKET ADD-ON
// -----------------------------
async function generateRentalPacketPDF(booking, amounts) {
  const vesselInfo = await getVesselRegistrationInfo(booking.rentalLabel)
  const lakeInfo = await getLakeEmergencyInfo(booking.towLocation)

  const packetsDir = path.join(__dirname, "generated-packets")
  if (!fs.existsSync(packetsDir)) {
    fs.mkdirSync(packetsDir, { recursive: true })
  }

  const fileName = `rental-packet-${booking.id}.pdf`
  const filePath = path.join(packetsDir, fileName)

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 40,
  })

  const stream = fs.createWriteStream(filePath)
  doc.pipe(stream)

  const primaryLogoPath = path.join(
    __dirname,
    "a_digital_vector_graphic_logo_for_a_company_named.png"
  )
  const secondaryLogoPath = path.join(
    __dirname,
    "a_high_resolution_digital_design_showcases_cleared.png"
  )

  const logoPath = fs.existsSync(primaryLogoPath)
    ? primaryLogoPath
    : fs.existsSync(secondaryLogoPath)
      ? secondaryLogoPath
      : null

  if (logoPath) {
    try {
      doc.image(logoPath, 40, 24, {
        fit: [190, 95],
        align: "left",
      })
      doc.moveDown(3.2)
    } catch (err) {
      console.error("PDF LOGO LOAD ERROR:", err)
      doc.moveDown(1)
    }
  } else {
    doc.moveDown(1)
  }

  doc
    .fontSize(20)
    .fillColor("#0f2233")
    .text("Cleared to Cruise Rental Packet", 40, 125, {
      align: "center",
    })

  doc.moveDown(1.2)

  doc
    .strokeColor("#d9e5ef")
    .lineWidth(1)
    .moveTo(40, doc.y)
    .lineTo(572, doc.y)
    .stroke()

  doc.moveDown(1)

  doc.fontSize(12).fillColor("#102030")

  const writeLine = (label, value) => {
    doc.font("Helvetica-Bold").text(`${label}: `, {
      continued: true,
    })
    doc.font("Helvetica").text(String(value || "Not provided"))
  }

  writeLine("Booking ID", booking.id)
  writeLine("Rental", booking.rentalLabel || "Boat Rental")
  writeLine("Date", booking.date || "Not provided")
  writeLine("Time", booking.rentalTime || "Not provided")
  writeLine("Tow Location", booking.towLocation || "None")
  writeLine("Customer Name", booking.waiverPrintedName || "Not provided")
  writeLine("Customer Email", booking.customerEmail || "Not provided")

  doc.moveDown(1)

  doc
    .fontSize(14)
    .fillColor("#0f2233")
    .font("Helvetica-Bold")
    .text("Payment and Deposit Summary")

  doc.moveDown(0.4)
  doc.fontSize(12).fillColor("#102030")

  writeLine("Rental Total Paid", `$${dollarsFromCents(amounts.totalAmount)}`)
  writeLine("Base Rental Amount", `$${dollarsFromCents(amounts.finalRentalAmount)}`)
  writeLine("Tow Fee", `$${dollarsFromCents(amounts.towFeeAmount)}`)
  writeLine("Deposit Status", statusLabel(booking.depositStatus || "not_requested"))
  writeLine(
    "Deposit Authorized",
    booking.depositAmountAuthorized
      ? `$${dollarsFromCents(booking.depositAmountAuthorized)}`
      : "Not authorized"
  )
  writeLine(
    "Deposit Captured",
    booking.depositAmountCaptured
      ? `$${dollarsFromCents(booking.depositAmountCaptured)}`
      : "$0.00"
  )
  writeLine(
    "Deposit Released",
    booking.depositAmountReleased
      ? `$${dollarsFromCents(booking.depositAmountReleased)}`
      : "$0.00"
  )

  doc.moveDown(1)

  doc
    .fontSize(14)
    .fillColor("#0f2233")
    .font("Helvetica-Bold")
    .text("Vessel and Lake Information")

  doc.moveDown(0.4)
  doc.fontSize(12).fillColor("#102030")

  writeLine(
    "Vessel Registration",
    vesselInfo?.vesselRegistrationNumber || "To be provided at time of rental"
  )
  writeLine(
    "Lake Emergency Contact",
    `${lakeInfo?.lakeLabel || "Your selected lake"}: ${
      lakeInfo?.emergencyContact ||
      "Use the official lake emergency and ranger contacts for your booked location."
    }`
  )

  doc.moveDown(1)

  doc
    .fontSize(14)
    .fillColor("#0f2233")
    .font("Helvetica-Bold")
    .text("Proof of Rental")

  doc.moveDown(0.4)
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("#102030")
    .text(
      "This packet confirms that the renter named above has an active Cleared to Cruise rental associated with the booking ID shown above."
    )

  doc.moveDown(1)

  doc
    .fontSize(14)
    .fillColor("#0f2233")
    .font("Helvetica-Bold")
    .text("Important Terms")

  doc.moveDown(0.4)
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("#102030")
    .text("Fuel is charged separately unless otherwise stated.")
    .text(
      "Security deposit terms remain subject to damage, loss, late return, cleaning, or other contract violations."
    )

  doc.moveDown(1)

  doc
    .roundedRect(40, doc.y, 532, 72, 10)
    .fillAndStroke("#fff5f5", "#f1b9b9")

  doc
    .fillColor("#b42318")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("IMPORTANT FOR YOUR RENTAL DAY:", 52, doc.y - 64)

  doc
    .fillColor("#102030")
    .font("Helvetica")
    .fontSize(11.5)
    .text(
      "Please bring a copy of this rental confirmation with you. You may present it on your phone or as a printed copy. This serves as your proof of rental if requested by lake staff, rangers, or authorities.",
      52,
      doc.y + 6,
      {
        width: 508,
        align: "left",
      }
    )

  doc.moveDown(5)

  doc
    .fontSize(10)
    .fillColor("#5e7080")
    .text("Cleared to Cruise", 40, 738, { align: "center", width: 532 })

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}

// -----------------------------
// REPLACEMENT: SEND RENTAL PACKET EMAIL WITH PDF ATTACHMENT
// -----------------------------
async function sendRentalPacketEmail(booking) {
  if (!booking?.customerEmail) return

  const normalizedBooking = {
    ...booking,
    rentalLabel: normalizeRentalLabel(booking.rentalLabel),
  }

  const amounts = await calculateBookingAmounts(normalizedBooking)
  const text = await buildRentalPacketText(normalizedBooking, amounts)
  const html = await buildRentalPacketHtml(normalizedBooking, amounts)
  const pdfPath = await generateRentalPacketPDF(normalizedBooking, amounts)

  return sendEmail({
    to: normalizedBooking.customerEmail,
    subject: `Rental packet for booking #${normalizedBooking.id}`,
    text,
    html,
    attachments: [
      {
        filename: `Cleared-to-Cruise-Rental-Packet-${normalizedBooking.id}.pdf`,
        path: pdfPath,
      },
    ],
  })
}