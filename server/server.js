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
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}))

const PORT = Number(process.env.PORT || 5001)
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173"
const SITE_URL = process.env.SITE_URL || CLIENT_URL
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

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

async function sendEmail({ to, subject, text, html }) {
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
  })
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
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
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error("CORS not allowed"))
    },
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

            db.get(
              `SELECT * FROM bookings WHERE id = ?`,
              [bookingId],
              async (_lookupErr, booking) => {
                if (!booking) return

                const safeRental = escapeHtml(booking.rentalLabel || "Boat Rental")
                const safeDate = escapeHtml(booking.date || "Not provided")
                const safeTime = escapeHtml(booking.rentalTime || "Not provided")

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
Status: ${booking.status || "confirmed"}
                      `.trim(),
                      html: `
                        <h2>Payment received</h2>
                        <p><strong>Booking ID:</strong> ${booking.id}</p>
                        <p><strong>Rental:</strong> ${safeRental}</p>
                        <p><strong>Date:</strong> ${safeDate}</p>
                        <p><strong>Time:</strong> ${safeTime}</p>
                        <p><strong>Status:</strong> ${escapeHtml(booking.status || "confirmed")}</p>
                      `,
                    })
                  }

                  await sendEmail({
                    to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
                    subject: `Rental payment received for booking #${booking.id}`,
                    text: `
Rental payment received.

Booking ID: ${booking.id}
Name: ${booking.waiverPrintedName || "No name"}
Email: ${booking.customerEmail || "No email"}
Rental: ${booking.rentalLabel || "Boat Rental"}
Date: ${booking.date || "Not provided"}
Time: ${booking.rentalTime || "Not provided"}
                    `.trim(),
                    html: `
                      <h2>Rental payment received</h2>
                      <p><strong>Booking ID:</strong> ${booking.id}</p>
                      <p><strong>Name:</strong> ${escapeHtml(booking.waiverPrintedName || "No name")}</p>
                      <p><strong>Email:</strong> ${escapeHtml(booking.customerEmail || "No email")}</p>
                      <p><strong>Rental:</strong> ${safeRental}</p>
                      <p><strong>Date:</strong> ${safeDate}</p>
                      <p><strong>Time:</strong> ${safeTime}</p>
                    `,
                  })
                } catch (emailErr) {
                  console.error("WEBHOOK PAYMENT EMAIL ERROR:", emailErr)
                }
              }
            )
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
// DATABASE
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

// -----------------------------
// HELPERS
// -----------------------------
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
      return 90000
    case "Pontoon - 8 Hours":
      return 110000
    case "Pontoon - 10 Hours":
      return 130000
    case "Bass Boat - Full Day":
      return 90000
    default:
      return 0
  }
}

function towFeeForLocation(location) {
  if (location === "Castaic") return 7500
  if (location === "Pyramid") return 15000
  return 0
}

function totalPrice(booking) {
  return rentalBasePrice(booking.rentalLabel) + towFeeForLocation(booking.towLocation)
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function formatDepositRequestUrl(bookingId) {
  return `${SITE_URL.replace(/\/$/, "")}/deposit/${bookingId}`
}

function isWithinNextThreeDays(dateValue) {
  if (!dateValue) return false
  const now = new Date()
  const target = new Date(`${dateValue}T23:59:59`)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= 3
}

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

  // Start IDs around 1000
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
      [date, rentalLabel, rentalBoatType(rentalLabel)]
    )

    if ((blockedRow?.count || 0) > 0) {
      return res.json({ available: false })
    }

    const bookingRow = await getAsync(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE date = ?
        AND rentalLabel = ?
        AND status IN ('approved_unpaid', 'pending_payment', 'confirmed', 'pending_approval')
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
app.post("/api/bookings/waiver", upload.single("photoId"), (req, res) => {
  console.log("BOOKING REQUEST FILE:", req.file ? req.file.filename : "NO FILE")
  console.log("BOOKING REQUEST FILE:", req.file?.filename)

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

  db.get(
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
    [date, rentalLabel, boatType],
    (blockedErr, blockedRow) => {
      if (blockedErr) {
        console.error("CREATE BOOKING BLOCK CHECK ERROR:", blockedErr)
        return res.status(500).json({ error: "Could not verify blocked dates." })
      }

      if ((blockedRow?.count || 0) > 0) {
        return res.status(409).json({ error: "That rental is blocked for the selected date." })
      }

      db.get(
        `
        SELECT COUNT(*) AS count
        FROM bookings
        WHERE date = ?
          AND rentalLabel = ?
          AND status IN ('approved_unpaid', 'pending_payment', 'confirmed', 'pending_approval')
        `,
        [date, rentalLabel],
        (existingErr, existingRow) => {
          if (existingErr) {
            console.error("CREATE BOOKING DUPLICATE CHECK ERROR:", existingErr)
            return res.status(500).json({ error: "Could not verify existing bookings." })
          }

          if ((existingRow?.count || 0) > 0) {
            return res.status(409).json({ error: "That rental is already booked or pending for the selected date." })
          }

          db.run(
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
            ],
            function (err) {
              if (err) {
                console.error("CREATE BOOKING ERROR:", err)
                return res.status(500).json({ error: "Could not create booking." })
              }

              const bookingId = this.lastID
              const depositUrl = formatDepositRequestUrl(bookingId)

              Promise.allSettled([
                sendEmail({
                  to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
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

If your rental date is within 3 days, the deposit authorization link may be sent immediately.
Deposit link:
${depositUrl}
                      `.trim(),
                      html: `
                        <h2>Your booking request has been received</h2>
                        <p><strong>Booking ID:</strong> ${bookingId}</p>
                        <p><strong>Rental:</strong> ${escapeHtml(rentalLabel)}</p>
                        <p><strong>Date:</strong> ${escapeHtml(date)}</p>
                        <p><strong>Time:</strong> ${escapeHtml(rentalTime || "Not provided")}</p>
                        <p><strong>Tow Location:</strong> ${escapeHtml(towLocation || "None")}</p>
                        <p>You can check your status later using your booking ID and email.</p>
                        <p><strong>Booking ID:</strong> ${bookingId}</p>
                        <p><strong>Email:</strong> ${escapeHtml(normalizedCustomerEmail)}</p>
                        <p><strong>Deposit Link:</strong> <a href="${depositUrl}">${depositUrl}</a></p>
                      `,
                    })
                  : Promise.resolve(),
              ]).then((results) => {
                results.forEach((result, index) => {
                  if (result.status === "rejected") {
                    console.error(
                      index === 0 ? "ADMIN BOOKING EMAIL ERROR:" : "CUSTOMER BOOKING EMAIL ERROR:",
                      result.reason
                    )
                  }
                })
              })

              // If rental is within 3 days, immediately send deposit request link
              if (normalizedCustomerEmail && isWithinNextThreeDays(date)) {
                Promise.allSettled([
                  sendEmail({
                    to: normalizedCustomerEmail,
                    subject: `Security deposit authorization requested for booking #${bookingId}`,
                    text: `
Please authorize your $500 security deposit card for booking #${bookingId}.

Deposit link:
${depositUrl}
                    `.trim(),
                    html: `
                      <h2>Security deposit authorization requested</h2>
                      <p>Please authorize your $500 security deposit card for booking #${bookingId}.</p>
                      <p><a href="${depositUrl}">Authorize Deposit</a></p>
                    `,
                  }),
                  runAsync(
                    `UPDATE bookings SET depositLinkSentAt = datetime('now'), depositStatus = 'requested' WHERE id = ?`,
                    [bookingId]
                  ),
                ]).catch((depositErr) => {
                  console.error("IMMEDIATE DEPOSIT REQUEST ERROR:", depositErr)
                })
              }

              return res.json({ success: true, bookingId })
            }
          )
        }
      )
    }
  )
})

// -----------------------------
// BOOKING GET
// -----------------------------
app.get("/api/bookings/:id", (req, res) => {
  db.get(`SELECT * FROM bookings WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) {
      console.error("GET BOOKING ERROR:", err)
      return res.status(500).json({ error: "Could not load booking." })
    }

    if (!row) {
      return res.status(404).json({ error: "Booking not found." })
    }

    return res.json(row)
  })
})

// -----------------------------
// WAIVER SIGNED
// -----------------------------
app.post("/api/waiver/signed/:id", (req, res) => {
  db.run(
    `
    UPDATE bookings
    SET waiverStatus = 'signed',
        waiverAccepted = 1,
        waiverAcceptedAt = datetime('now')
    WHERE id = ?
    `,
    [req.params.id],
    function (err) {
      if (err) {
        console.error("WAIVER SIGN ERROR:", err)
        return res.status(500).json({ error: "Could not update waiver." })
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Booking not found." })
      }

      db.get(`SELECT * FROM bookings WHERE id = ?`, [req.params.id], async (_e, booking) => {
        if (!booking) return

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
            to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
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
      })

      return res.json({ success: true })
    }
  )
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
      return res.status(400).json({ error: "Booking must be approved before payment." })
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
            },
            unit_amount: totalPrice(booking),
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
      },
    })

    await runAsync(
      `UPDATE bookings SET stripeSessionId = ?, status = 'pending_payment' WHERE id = ?`,
      [session.id, booking.id]
    )

    return res.json({ url: session.url })
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
app.get("/api/admin/bookings", async (_req, res) => {
  try {
    const rows = await allAsync(`SELECT * FROM bookings ORDER BY id DESC`)
    return res.json(rows)
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR:", err)
    return res.status(500).json({ error: "Could not load bookings." })
  }
})

app.get("/api/admin/blocked-dates", async (_req, res) => {
  try {
    const rows = await allAsync(`SELECT * FROM blocked_dates ORDER BY date ASC, id DESC`)
    return res.json(rows)
  } catch (err) {
    console.error("BLOCKED DATES LOAD ERROR:", err)
    return res.status(500).json({ error: "Could not load blocked dates." })
  }
})

// -----------------------------
// ADMIN HELPERS
// -----------------------------
async function sendStatusEmails(booking, newStatus) {
  const readableStatus = String(newStatus || "").replaceAll("_", " ")

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
        `.trim(),
        html: `
          <h2>Booking status updated</h2>
          <p><strong>Booking ID:</strong> ${booking.id}</p>
          <p><strong>Rental:</strong> ${escapeHtml(booking.rentalLabel || "Boat Rental")}</p>
          <p><strong>Date:</strong> ${escapeHtml(booking.date || "Not provided")}</p>
          <p><strong>Status:</strong> ${escapeHtml(readableStatus)}</p>
        `,
      })
    }

    await sendEmail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
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

// -----------------------------
// ADMIN ACTIONS
// -----------------------------
async function approveBookingHandler(req, res) {
  const { id } = req.params

  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" })
    }

    await runAsync(`UPDATE bookings SET status = 'approved_unpaid' WHERE id = ?`, [id])

    const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
    await sendStatusEmails(updated, "approved_unpaid")

    return res.json({ success: true, message: "Booking approved" })
  } catch (err) {
    console.error("APPROVE ERROR:", err)
    return res.status(500).json({ error: "Failed to approve booking" })
  }
}

async function denyBookingHandler(req, res) {
  const { id } = req.params

  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" })
    }

    await runAsync(`UPDATE bookings SET status = 'denied' WHERE id = ?`, [id])

    const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
    await sendStatusEmails(updated, "denied")

    return res.json({ success: true, message: "Booking denied" })
  } catch (err) {
    console.error("DENY ERROR:", err)
    return res.status(500).json({ error: "Failed to deny booking" })
  }
}

async function confirmBookingHandler(req, res) {
  const { id } = req.params

  try {
    const booking = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" })
    }

    await runAsync(`UPDATE bookings SET status = 'confirmed' WHERE id = ?`, [id])

    const updated = await getAsync(`SELECT * FROM bookings WHERE id = ?`, [id])
    await sendStatusEmails(updated, "confirmed")

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
      to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
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

app.post("/api/admin/approve/:id", approveBookingHandler)
app.post("/api/admin/bookings/:id/approve", approveBookingHandler)

app.post("/api/admin/deny/:id", denyBookingHandler)
app.post("/api/admin/bookings/:id/deny", denyBookingHandler)

app.post("/api/admin/confirm/:id", confirmBookingHandler)
app.post("/api/admin/bookings/:id/confirm", confirmBookingHandler)

app.post("/api/admin/deposit-link/:id", depositLinkHandler)
app.post("/api/admin/bookings/:id/deposit-link", depositLinkHandler)
app.post("/api/admin/bookings/:id/send-deposit-link", depositLinkHandler)

// -----------------------------
// ADMIN BOOKING UPDATE
// -----------------------------
app.post("/api/admin/bookings/:id", async (req, res) => {
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
// ADMIN DEPOSIT ACTIONS
// -----------------------------
app.post("/api/admin/place-deposit/:id", async (req, res) => {
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

app.post("/api/admin/release-deposit/:id", async (req, res) => {
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

app.post("/api/admin/charge-damage/:id", async (req, res) => {
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
app.post("/api/admin/block-date", async (req, res) => {
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

app.delete("/api/admin/block-date/:id", async (req, res) => {
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

app.delete("/api/admin/blocked-dates/:id", async (req, res) => {
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
      to: process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
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

// Run every hour and once shortly after start
setInterval(processScheduledDepositRequests, 60 * 60 * 1000)
setTimeout(processScheduledDepositRequests, 10 * 1000)

// -----------------------------
// START
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})