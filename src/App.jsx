import { useEffect, useMemo, useState } from "react"
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom"
import "./App.css"
import { useNavigate } from "react-router-dom"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

function RequestReceived() {
  return (
   <div style={{ textAlign: "center", padding: "60px 20px" }}>
  <h1 style={{
    color: "#ffffff",
    textShadow: "0 2px 6px rgba(0,0,0,0.8)"
  }}>
    Request Received
  </h1>

  <p style={{
    marginTop: "20px",
    fontSize: "18px",
    color: "#ffffff",
    textShadow: "0 2px 6px rgba(0,0,0,0.8)"
  }}>
    You're almost ready to hit the water.
  </p>

  <p style={{
    marginTop: "10px",
    color: "rgba(255,255,255,0.85)",
    textShadow: "0 2px 6px rgba(0,0,0,0.8)"
  }}>
    Your rental request is under review. You'll receive an email once approved with instructions to complete payment.
  </p>
</div>
  )
}
const API = "https://cleared-to-cruise-api.onrender.com"
const HEADER_LOGO = "/images/cleared-to-cruise-main-heading.png"

/* =========================
   🔥 NEW: SAFE BOOKING FETCH
   ========================= */
async function fetchBookingsSafe() {
  try {
    const res = await fetch(`${API}/api/bookings`)
    if (res.ok) return await res.json()
  } catch {}

  try {
    const token = localStorage.getItem("ctc_admin_token")
    const res = await fetch(`${API}/api/admin/bookings`, {
      headers: { Authorization: `Basic ${token}` },
    })
    if (res.ok) return await res.json()
  } catch {}

  return []
}

/* =========================
   🔥 NEW: JET SKI LOCK LOGIC
   ========================= */
function isJetSkiBlocked(bookings, rental, date) {
  if (!date) return false

  const sameDay = bookings.filter(
    (b) =>
      b.date === date &&
      (b.rentalLabel === "Jet Ski (Single)" ||
        b.rentalLabel === "Jet Ski (Double)") &&
      b.status !== "denied"
  )

  let used = 0

  for (const b of sameDay) {
    if (b.rentalLabel === "Jet Ski (Double)") used += 2
    else used += 1
  }

  if (rental === "Jet Ski (Double)") return used > 0
  if (rental === "Jet Ski (Single)") return used >= 2

  return false
}

/* =========================
   ORIGINAL CODE (UNCHANGED BELOW)
   ========================= */

const fallbackRentalOptions = [
  { value: "Jet Ski (Single)", label: "Jet Ski (Single) — $350 + fuel", price: 350, sortOrder: 1 },
  { value: "Jet Ski (Double)", label: "Jet Ski (Double) — $650 + fuel", price: 650, sortOrder: 2 },
  { value: "Pontoon - Half Day", label: "Pontoon - Half Day — $500 + fuel", price: 500, sortOrder: 3 },
  { value: "Pontoon - Full Day", label: "Pontoon - Full Day — $800 + fuel", price: 800, sortOrder: 4 },
  { value: "Bass Boat - Full Day", label: "Bass Boat - Full Day — $300 + fuel", price: 300, sortOrder: 5 },
]

const towOptions = [
  { value: "None", label: "None", price: 0 },
  { value: "Castaic", label: "Castaic — $75", price: 75 },
  { value: "Pyramid", label: "Pyramid — $150", price: 150 },
]

const timeOptions = [
  "06:00 AM",
  "06:30 AM",
  "07:00 AM",
  "07:30 AM",
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
];
const CASTAIC_INFO_URL = "https://parks.lacounty.gov/castaic-lake-state-recreation-area/";
const PYRAMID_INFO_URL = "https://water.ca.gov/What-We-Do/Recreation/Pyramid-Lake-Recreation";

const heroRentalGroups = [
  {
    key: "jetski-single",
    title: "Jet Ski Rentals",
    text: "Single jet ski rental option.",
    image: "/images/jetski-collage-1.png",
    alt: "Jet ski rental",
    options: ["Jet Ski (Single)"],
  },
  {
    key: "jetski-double",
    title: "More Jet Ski Fun",
    text: "Double jet ski rental option.",
    image: "/images/jetski-collage-2.png",
    alt: "More jet ski action",
    options: ["Jet Ski (Double)"],
  },
  {
    key: "pontoon",
    title: "Pontoon Rentals",
    text: "Comfortable group cruising with half-day and full-day options.",
    image: "/images/suntracker-pontoon.png",
    alt: "Pontoon rental",
    options: ["Pontoon - Half Day", "Pontoon - Full Day"],
  },
  {
    key: "bass-boat",
    title: "Bass Boat Rentals",
    text: "Full-day fishing and performance boating.",
    image: "/images/bass-boat.webp",
    alt: "Bass boat rental",
    options: ["Bass Boat - Full Day"],
  },
]

const cancellationPolicyText =
  "Cancellation Policy: Cancellations must be made at least 7 days before the rental date or the rental payment will be forfeited. In either case, the security deposit will be returned unless the boat or equipment was used and damaged."

const defaultPricingEditorState = {
  JetSkiSingle: 350,
  JetSkiDouble: 650,
  PontoonHalfDay: 500,
  PontoonFullDay: 800,
  BassBoatFullDay: 300,
}

/* =========================
   UTILITY FUNCTIONS (UNCHANGED)
   ========================= */

function formatDate(value) {
  if (!value) return "—"
  return value
}

function normalizeStatusLabel(value) {
  if (!value) return "—"
  return String(value).replaceAll("_", " ")
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function dollarsFromCents(value) {
  return (Number(value || 0) / 100).toFixed(2)
}

function centsFromDollars(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

function getTowPrice(towValue) {
  return towOptions.find((item) => item.value === towValue)?.price || 0
}

function getStoredAdminToken() {
  return localStorage.getItem("ctc_admin_token") || ""
}

function setStoredAdminToken(token) {
  if (token) {
    localStorage.setItem("ctc_admin_token", token)
  } else {
    localStorage.removeItem("ctc_admin_token")
  }
}

function sortRentalOptions(list) {
  return [...list].sort((a, b) => {
    const left = Number(a.sortOrder || 0)
    const right = Number(b.sortOrder || 0)
    return left - right
  })
}

function mergeServerPricingIntoFallback(serverPricing) {
  if (!Array.isArray(serverPricing) || serverPricing.length === 0) {
    return fallbackRentalOptions
  }

  const mapped = serverPricing
    .map((item, index) => {
      const value = String(item.rentalKey || item.value || "").trim()
      const baseLabel = String(item.rentalLabel || item.label || value).trim()
      const cents = Number(item.priceCents ?? 0)
      const price =
        Number.isFinite(cents) && cents > 0
          ? Math.round(cents / 100)
          : Number(item.price || item.priceDollars || 0)

      if (!value) return null

      return {
        value,
        label: `${baseLabel} — $${price} + fuel`,
        price,
        sortOrder: Number(item.sortOrder ?? index + 1),
      }
    })
    .filter(Boolean)

  if (mapped.length === 0) {
    return fallbackRentalOptions
  }

  const byValue = new Map(mapped.map((item) => [item.value, item]))
  const merged = fallbackRentalOptions.map((fallbackItem) => {
    return byValue.get(fallbackItem.value) || fallbackItem
  })

  for (const item of mapped) {
    if (!merged.some((existing) => existing.value === item.value)) {
      merged.push(item)
    }
  }

  return sortRentalOptions(merged)
}

function getRentalPrice(rentalValue, rentalOptions) {
  return rentalOptions.find((item) => item.value === rentalValue)?.price || 0
}

function getRentalLabel(rentalValue, rentalOptions) {
  return rentalOptions.find((item) => item.value === rentalValue)?.label || rentalValue
}

function getPricingEditorStateFromOptions(rentalOptions) {
  return {
    JetSkiSingle: getRentalPrice("Jet Ski (Single)", rentalOptions) || 350,
    JetSkiDouble: getRentalPrice("Jet Ski (Double)", rentalOptions) || 650,
    PontoonHalfDay: getRentalPrice("Pontoon - Half Day", rentalOptions) || 500,
    PontoonFullDay: getRentalPrice("Pontoon - Full Day", rentalOptions) || 800,
    BassBoatFullDay: getRentalPrice("Bass Boat - Full Day", rentalOptions) || 300,
  }
}

function buildAdminPricingPayload(pricingEditor) {
  return [
    {
      rentalKey: "Jet Ski (Single)",
      rentalLabel: "Jet Ski (Single)",
      priceCents: centsFromDollars(pricingEditor.JetSkiSingle),
      sortOrder: 1,
    },
    {
      rentalKey: "Jet Ski (Double)",
      rentalLabel: "Jet Ski (Double)",
      priceCents: centsFromDollars(pricingEditor.JetSkiDouble),
      sortOrder: 2,
    },
    {
      rentalKey: "Pontoon - Half Day",
      rentalLabel: "Pontoon - Half Day",
      priceCents: centsFromDollars(pricingEditor.PontoonHalfDay),
      sortOrder: 3,
    },
    {
      rentalKey: "Pontoon - Full Day",
      rentalLabel: "Pontoon - Full Day",
      priceCents: centsFromDollars(pricingEditor.PontoonFullDay),
      sortOrder: 4,
    },
    {
      rentalKey: "Bass Boat - Full Day",
      rentalLabel: "Bass Boat - Full Day",
      priceCents: centsFromDollars(pricingEditor.BassBoatFullDay),
      sortOrder: 5,
    },
  ]
}

async function fetchPublicPricing() {
  try {
    const res = await fetch(`${API}/api/pricing`)
    const data = await res.json().catch(() => [])

    if (!res.ok) {
      return fallbackRentalOptions
    }

    return mergeServerPricingIntoFallback(data)
  } catch (error) {
    console.error("Pricing load failed:", error)
    return fallbackRentalOptions
  }
}

async function fetchPublicTestimonials() {
  try {
    const res = await fetch(`${API}/api/testimonials`)
    const data = await res.json()
    return data
  } catch (err) {
    console.error("Failed to load testimonials", err)
    return []
  }
}

async function adminFetch(path, options = {}) {
  const token = localStorage.getItem("ctc_admin_token") || ""

  const headers = {
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Basic ${token}`
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })

  return response
}

function statusPillStyle(status) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "capitalize",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  }

  switch (status) {
    case "confirmed":
      return {
        ...base,
        background: "#ecfdf3",
        color: "#157347",
        borderColor: "#b7e4c7",
      }
    case "approved_unpaid":
      return {
        ...base,
        background: "#eff6ff",
        color: "#1d4ed8",
        borderColor: "#bfdbfe",
      }
    case "pending_approval":
      return {
        ...base,
        background: "#fff7ed",
        color: "#c2410c",
        borderColor: "#fed7aa",
      }
    case "denied":
      return {
        ...base,
        background: "#fef2f2",
        color: "#b42318",
        borderColor: "#fecaca",
      }
    case "paid":
      return {
        ...base,
        background: "#ecfdf3",
        color: "#157347",
        borderColor: "#b7e4c7",
      }
    case "signed":
      return {
        ...base,
        background: "#f0f9ff",
        color: "#0369a1",
        borderColor: "#bae6fd",
      }
    case "requested":
    case "card_on_file":
    case "held":
    case "released":
      return {
        ...base,
        background: "#f5f3ff",
        color: "#6d28d9",
        borderColor: "#ddd6fe",
      }
    default:
      return {
        ...base,
        background: "#f3f4f6",
        color: "#374151",
        borderColor: "#e5e7eb",
      }
  }
}

function getMonthLabel(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function buildCalendarDays(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

  const startWeekday = start.getDay()
  const totalDays = end.getDate()
  const cells = []

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function TestimonialsSection({ testimonials = [], onSubmitted }) {
  const [testimonialName, setTestimonialName] = useState("")
  const [testimonialText, setTestimonialText] = useState("")
 const [testimonialPhotos, setTestimonialPhotos] = useState([])
  const [testimonialLoading, setTestimonialLoading] = useState(false)
  const [testimonialStatus, setTestimonialStatus] = useState("")
  const [testimonialRating, setTestimonialRating] = useState(5)

  const [activeTestimonialIndex, setActiveTestimonialIndex] = useState(0)

  function nextTestimonial() {
    if (!testimonials.length) return
    setActiveTestimonialIndex((prev) => (prev + 1) % testimonials.length)
  }

  function prevTestimonial() {
    if (!testimonials.length) return
    setActiveTestimonialIndex((prev) =>
      prev === 0 ? testimonials.length - 1 : prev - 1
    )
  }

async function submitTestimonial(e) {
  e.preventDefault()

  setTestimonialStatus("")

  if (!testimonialName.trim() || !testimonialText.trim()) {
    setTestimonialStatus("Please enter your name and testimonial")
    return
  }

  setTestimonialLoading(true)

  try {
    const formData = new FormData()
    formData.append("fullName", testimonialName)
    formData.append("message", testimonialText)
    formData.append("rating", testimonialRating)

    testimonialPhotos.forEach((file) => {
      formData.append("photos", file)
    })

    const res = await fetch(`${API}/api/testimonials`, {
      method: "POST",
      body: formData,
    })

    if (!res.ok) throw new Error("Failed to submit testimonial")

    setTestimonialStatus("Submitted for approval!")
    setTestimonialName("")
    setTestimonialText("")
    setTestimonialPhotos([])
    setTestimonialRating(5)
  } catch (err) {
    setTestimonialStatus(err.message || "Error submitting testimonial")
  } finally {
    setTestimonialLoading(false)
  }
}

  return (
    <section style={styles.mainCard}>
      <div style={styles.formHeaderRow}>
        <div>
          <h2 style={styles.sectionTitle}>Testimonials</h2>
          <p style={styles.sectionSubtext}>
            See what customers are saying and submit your own experience for approval.
          </p>
        </div>
      </div>

{Array.isArray(testimonials) && testimonials.length > 0 ? (
  <div style={styles.testimonialSliderWrap}>
    <button
      type="button"
      onClick={prevTestimonial}
style={{
  ...styles.testimonialArrow,
  position: "absolute",
  left: "-40px",
  top: "50%",
  transform: "translateY(-50%)"
}}
    >
      {"<"}
    </button>

<div style={styles.lookupCard}>
  <div>
    <strong>
      {testimonials[activeTestimonialIndex]?.fullName || "Customer"}
    </strong>
  </div>

  <div style={{ marginTop: "8px" }}>
    {testimonials[activeTestimonialIndex]?.message || ""}
  </div>

  {Array.isArray(testimonials[activeTestimonialIndex]?.photos) &&
    testimonials[activeTestimonialIndex].photos.length > 0 && (
      <div style={styles.testimonialPhotoWrap}>
        <img
          src={testimonials[activeTestimonialIndex].photos[0]}
          alt="Testimonial"
          style={styles.testimonialPhoto}
        />
      </div>
    )}
</div>
<button
  type="button"
  onClick={nextTestimonial}
  style={{
    ...styles.testimonialArrow,
    position: "absolute",
    right: "-18px",
    top: "50%",
    transform: "translateY(-50%)"
  }}
>
  {">"}
</button>
  </div>
) : null}

{!testimonials.length && (
  <div style={styles.infoBox}>No approved testimonials yet.</div>
)}

<form onSubmit={submitTestimonial} style={{ marginTop: "20px" }}>
  <div style={styles.formGrid}>
    
    <label style={styles.label}>
      Your Name
      <input
        style={styles.input}
        type="text"
        value={testimonialName}
        onChange={(e) => setTestimonialName(e.target.value)}
        placeholder="Your name"
      />
    </label>

    <label style={styles.labelFull}>
      Your Testimonial
      <textarea
        style={styles.textarea}
        value={testimonialText}
        onChange={(e) => setTestimonialText(e.target.value)}
        placeholder="Write your experience..."
      />
    </label>

  </div>
<div style={{ marginTop: "20px" }}>
  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>
    Upload Photos
  </label>

<input
  type="file"
  name="photos"
  multiple
  accept="image/*"
  onChange={(e) => setTestimonialPhotos(Array.from(e.target.files || []))}
  style={{ marginBottom: "12px" }}
/>
</div>
{testimonialPhotos.length > 0 && (
  <div style={styles.lookupMeta}>
    {testimonialPhotos.length} photo{testimonialPhotos.length === 1 ? "" : "s"} selected
  </div>
)}


<div style={{ marginTop: "25px" }}>
  <button type="submit" style={styles.primaryButton}>
    {testimonialLoading ? "Submitting..." : "Submit Testimonial"}
  </button>
</div>

{testimonialStatus && (
  <div style={styles.infoBox}>{testimonialStatus}</div>
)}
</form>
</section>
)
}
function BookingLookupCard({ onLoadBooking }) {
  const [lookupBookingId, setLookupBookingId] = useState("")
  const [lookupEmail, setLookupEmail] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState("")
  const [lookupMode, setLookupMode] = useState("")
  const [lookupBooking, setLookupBooking] = useState(null)
  const [lookupBookings, setLookupBookings] = useState([])

  async function lookupBookingStatus() {
    setLookupError("")
    setLookupMode("")
    setLookupBooking(null)
    setLookupBookings([])

    if (!lookupBookingId.trim() && !lookupEmail.trim()) {
      setLookupError("Enter a booking ID, an email address, or both.")
      return
    }

    setLookupLoading(true)

    try {
      const res = await fetch(`${API}/api/bookings/lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: lookupBookingId.trim(),
          email: lookupEmail.trim(),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setLookupError(data.error || "Could not find booking.")
        return
      }

      if (data.mode === "single" && data.booking) {
        setLookupMode("single")
        setLookupBooking(data.booking)
        return
      }

      if (data.mode === "list" && Array.isArray(data.bookings)) {
        setLookupMode("list")
        setLookupBookings(data.bookings)
        return
      }

      setLookupError("No booking information was returned.")
    } catch (error) {
      console.error(error)
      setLookupError("Server error while checking booking status.")
    } finally {
      setLookupLoading(false)
    }
  }

  return (
    <section style={styles.mainCard}>
      <div style={styles.formHeaderRow}>
        <div>
          <h2 style={styles.sectionTitle}>Check Existing Booking</h2>
          <p style={styles.sectionSubtext}>
            Customers can check status using booking ID, email, or both.
          </p>
        </div>
      </div>

      <div style={styles.formGrid}>
        <label style={styles.label}>
          Booking ID
          <input
            style={styles.input}
            type="text"
            placeholder="Example: 1001"
            value={lookupBookingId}
            onChange={(e) => setLookupBookingId(e.target.value)}
          />
        </label>

        <label style={styles.label}>
          Email Address
          <input
            style={styles.input}
            type="email"
            placeholder="customer@email.com"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
          />
        </label>
      </div>

      <div style={styles.buttonRow}>
        <button
          type="button"
          style={lookupLoading ? styles.buttonDisabled : styles.primaryButton}
          disabled={lookupLoading}
          onClick={lookupBookingStatus}
        >
          {lookupLoading ? "Checking..." : "Check Booking Status"}
        </button>
      </div>

      {lookupError ? <div style={styles.errorBox}>{lookupError}</div> : null}

      {lookupMode === "single" && lookupBooking ? (
        <div style={styles.lookupCard}>
          <div style={styles.lookupRow}>
            <strong>Booking ID:</strong> {lookupBooking.id}
          </div>
          <div style={styles.lookupRow}>
            <strong>Rental:</strong> {lookupBooking.rentalLabel || "—"}
          </div>
          <div style={styles.lookupRow}>
            <strong>Date:</strong> {formatDate(lookupBooking.date)}
          </div>
          <div style={styles.lookupRow}>
            <strong>Time:</strong> {lookupBooking.rentalTime || "—"}
          </div>
          <div style={styles.lookupRow}>
            <strong>Tow Location:</strong> {lookupBooking.towLocation || "None"}
          </div>
          <div style={styles.lookupRow}>
            <strong>Waiver:</strong>{" "}
            <span style={statusPillStyle(lookupBooking.waiverStatus || "not_started")}>
              {normalizeStatusLabel(lookupBooking.waiverStatus || "not_started")}
            </span>
          </div>
          <div style={styles.lookupRow}>
            <strong>Payment:</strong>{" "}
            <span style={statusPillStyle(lookupBooking.paymentStatus || "unpaid")}>
              {normalizeStatusLabel(lookupBooking.paymentStatus || "unpaid")}
            </span>
          </div>
          <div style={styles.lookupRow}>
            <strong>Status:</strong>{" "}
            <span style={statusPillStyle(lookupBooking.status || "new")}>
              {normalizeStatusLabel(lookupBooking.status || "new")}
            </span>
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => onLoadBooking(lookupBooking)}
            >
              Open This Booking
            </button>
          </div>
        </div>
      ) : null}

      {lookupMode === "list" && lookupBookings.length > 0 ? (
        <div style={styles.lookupList}>
          {lookupBookings.map((booking) => (
            <div key={booking.id} style={styles.lookupCard}>
              <div style={styles.lookupRow}>
                <strong>Booking ID:</strong> {booking.id}
              </div>
              <div style={styles.lookupRow}>
                <strong>Rental:</strong> {booking.rentalLabel || "—"}
              </div>
              <div style={styles.lookupRow}>
                <strong>Date:</strong> {formatDate(booking.date)}
              </div>
              <div style={styles.lookupRow}>
                <strong>Time:</strong> {booking.rentalTime || "—"}
              </div>
              <div style={styles.lookupRow}>
                <strong>Status:</strong>{" "}
                <span style={statusPillStyle(booking.status || "new")}>
                  {normalizeStatusLabel(booking.status || "new")}
                </span>
              </div>

              <div style={styles.lookupRow}>
                <strong>Payment:</strong>{" "}
                <span style={statusPillStyle(booking.paymentStatus || "unpaid")}>
                  {normalizeStatusLabel(booking.paymentStatus || "unpaid")}
                </span>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => onLoadBooking(booking)}
                >
                  Open This Booking
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AdminLoginCard({ onLoginSuccess }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleAdminLogin(e) {
    e.preventDefault()
    setError("")

    if (!username.trim() || !password.trim()) {
      setError("Enter your admin username and password.")
      return
    }

    setLoading(true)

    try {
      const encoded = btoa(`${username.trim()}:${password.trim()}`)
      localStorage.setItem("ctc_admin_token", encoded)

      const res = await fetch(`${API}/api/admin/bookings`, {
        headers: {
          Authorization: `Basic ${encoded}`,
        },
      })

      if (!res.ok) {
        localStorage.removeItem("ctc_admin_token")
        setError("Invalid admin credentials")
        return
      }

      onLoginSuccess()
    } catch (err) {
      console.error(err)
      localStorage.removeItem("ctc_admin_token")
      setError("Server error during admin login.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.adminLoginWrap}>
      <div style={styles.adminLoginCard}>
        <h2 style={styles.adminLoginTitle}>Admin Login</h2>
        <p style={styles.adminLoginText}>
          Enter your admin username and password to access the Cleared to Cruise admin panel.
        </p>

        <form onSubmit={handleAdminLogin} style={styles.adminLoginForm}>
          <label style={styles.label}>
            Username
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admin username"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
            />
          </label>

          <button
            type="submit"
            style={loading ? styles.buttonDisabled : styles.primaryButton}
            disabled={loading}
          >
            {loading ? "Logging In..." : "Log In"}
          </button>
        </form>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
      </div>
    </div>
  )
}

function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getStoredAdminToken()))

  const [bookings, setBookings] = useState([])
  const [blockedDates, setBlockedDates] = useState([])
  const [pricingOverrides, setPricingOverrides] = useState([])
  const [adminTestimonials, setAdminTestimonials] = useState([])
  const [rentalOptions, setRentalOptions] = useState(fallbackRentalOptions)

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [photos, setPhotos] = useState([])

  const [blockDate, setBlockDate] = useState("")
  const [blockReason, setBlockReason] = useState("")
  const [blockRentalLabel, setBlockRentalLabel] = useState("All Rentals")

  const [holidayDate, setHolidayDate] = useState("")
  const [holidayRentalLabel, setHolidayRentalLabel] = useState("Jet Ski (Single)")
  const [holidayPrice, setHolidayPrice] = useState("")
  const [holidayLabel, setHolidayLabel] = useState("Holiday Pricing")

  const [discountEmail, setDiscountEmail] = useState("")
  const [discountBookingId, setDiscountBookingId] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [discountLabel, setDiscountLabel] = useState("Friends & Family")
  const [discountType, setDiscountType] = useState("manual_discount")

  const [pricingEditor, setPricingEditor] = useState(defaultPricingEditorState)
  const [pricingPercentAdjustment, setPricingPercentAdjustment] = useState(0)

  const [editingBookingId, setEditingBookingId] = useState(null)
  const [editDate, setEditDate] = useState("")
  const [editTime, setEditTime] = useState("")
  const [editRentalLabel, setEditRentalLabel] = useState("Pontoon - Half Day")
  const [editTowLocation, setEditTowLocation] = useState("None")
  const [editCustomerEmail, setEditCustomerEmail] = useState("")
  const [editPrintedName, setEditPrintedName] = useState("")
  const [editStatus, setEditStatus] = useState("pending_approval")

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const blockedDateMap = useMemo(() => {
    const map = new Map()

    blockedDates.forEach((item) => {
      const key = item.date
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key).push(item)
    })

    return map
  }, [blockedDates])

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  const previewPricingEditor = useMemo(() => {
    const multiplier = 1 + pricingPercentAdjustment / 100

    return {
      JetSkiSingle: Math.max(0, Math.round(Number(pricingEditor.JetSkiSingle || 0) * multiplier)),
      JetSkiDouble: Math.max(0, Math.round(Number(pricingEditor.JetSkiDouble || 0) * multiplier)),
      PontoonHalfDay: Math.max(
        0,
        Math.round(Number(pricingEditor.PontoonHalfDay || 0) * multiplier)
      ),
      PontoonFullDay: Math.max(
        0,
        Math.round(Number(pricingEditor.PontoonFullDay || 0) * multiplier)
      ),
      BassBoatFullDay: Math.max(
        0,
        Math.round(Number(pricingEditor.BassBoatFullDay || 0) * multiplier)
      ),
    }
  }, [pricingEditor, pricingPercentAdjustment])

  function handleAdminLogout() {
    setStoredAdminToken("")
    setIsAuthenticated(false)
    setBookings([])
    setBlockedDates([])
    setPricingOverrides([])
    setAdminTestimonials([])
    setRentalOptions(fallbackRentalOptions)
    setPricingEditor(defaultPricingEditorState)
    setPricingPercentAdjustment(0)
    setMessage("")
    setError("")
    setLoading(false)
  }

  function openEditBooking(booking) {
    setEditingBookingId(booking.id)
    setEditDate(booking.date || "")
    setEditTime(booking.rentalTime || "07:00 AM")
    setEditRentalLabel(booking.rentalLabel || "Pontoon - Half Day")
    setEditTowLocation(booking.towLocation || "None")
    setEditCustomerEmail(booking.customerEmail || "")
    setEditPrintedName(booking.waiverPrintedName || "")
    setEditStatus(booking.status || "pending_approval")
    setMessage("")
    setError("")
  }

  function cancelEditBooking() {
    setEditingBookingId(null)
    setEditDate("")
    setEditTime("")
    setEditRentalLabel("Pontoon - Half Day")
    setEditTowLocation("None")
    setEditCustomerEmail("")
    setEditPrintedName("")
    setEditStatus("pending_approval")
  }

  function applyPricingPercentPreview() {
    setPricingEditor(previewPricingEditor)
    setPricingPercentAdjustment(0)
  }

  async function loadAdminData() {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    setMessage("")

    try {
      const [
        bookingsRes,
        blockedRes,
        pricingRes,
        publicPricingRes,
        testimonialsRes,
      ] = await Promise.all([
        adminFetch("/api/admin/bookings"),
        adminFetch("/api/admin/blocked-dates"),
        adminFetch("/api/admin/pricing-overrides"),
        adminFetch("/api/admin/pricing"),
        adminFetch("/api/admin/testimonials"),
      ])

      const bookingsData = await bookingsRes.json().catch(() => [])
      const blockedData = await blockedRes.json().catch(() => [])
      const pricingData = await pricingRes.json().catch(() => [])
      const publicPricingData = await publicPricingRes.json().catch(() => [])
      const testimonialsData = await testimonialsRes.json().catch(() => [])

      if (!bookingsRes.ok) {
        throw new Error(bookingsData?.error || "Could not load admin bookings.")
      }

      if (!blockedRes.ok) {
        throw new Error(blockedData?.error || "Could not load blocked dates.")
      }

      if (!pricingRes.ok) {
        throw new Error(pricingData?.error || "Could not load pricing overrides.")
      }

      if (!publicPricingRes.ok) {
        throw new Error(publicPricingData?.error || "Could not load pricing settings.")
      }

      if (!testimonialsRes.ok) {
        throw new Error(testimonialsData?.error || "Could not load testimonials.")
      }

      const mergedRentalOptions = mergeServerPricingIntoFallback(publicPricingData)

      setBookings(Array.isArray(bookingsData) ? bookingsData : [])
      setBlockedDates(Array.isArray(blockedData) ? blockedData : [])
      setPricingOverrides(Array.isArray(pricingData) ? pricingData : [])
      setAdminTestimonials(Array.isArray(testimonialsData) ? testimonialsData : [])
      setRentalOptions(mergedRentalOptions)
      setPricingEditor(getPricingEditorStateFromOptions(mergedRentalOptions))
    } catch (err) {
      console.error(err)

      if (err.message === "ADMIN_AUTH_REQUIRED") {
        setStoredAdminToken("")
        setIsAuthenticated(false)
        setError("Your admin session expired. Please log in again.")
      } else {
        setError(err.message || "Could not load admin page.")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [isAuthenticated])

  async function approveBooking(id) {
    setError("")
    setMessage("Approving booking...")

    try {
      const res = await adminFetch(`/api/admin/approve/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not approve booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} approved.`)
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while approving booking.")
      }
      setMessage("")
    }
  }

  async function denyBooking(id) {
    setError("")
    setMessage("Denying booking...")

    try {
      const res = await adminFetch(`/api/admin/deny/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not deny booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} denied.`)
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while denying booking.")
      }
      setMessage("")
    }
  }

  async function markConfirmed(id) {
    setError("")
    setMessage("Marking booking confirmed...")

    try {
      const res = await adminFetch(`/api/admin/bookings/${id}/confirm`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not confirm booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} marked confirmed.`)
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while confirming booking.")
      }
      setMessage("")
    }
  }

 async function sendPaymentRequest(id) {
  setError("")
  setMessage("Sending payment request...")

  try {
    const res = await adminFetch(`/api/admin/bookings/${id}/resend-payment-request`, {
      method: "POST",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || "Could not send payment request.")
      setMessage("")
      return
    }

    setMessage(`Payment request sent for booking ${id}.`)
    await loadAdminData()
  } catch (err) {
    console.error(err)
    if (err.message === "ADMIN_AUTH_REQUIRED") {
      handleAdminLogout()
      setError("Please log in again.")
    } else {
      setError("Server error while sending payment request.")
    }
    setMessage("")
  }
}

 async function sendDepositRequest(id) {
  setError("")
  setMessage("Sending deposit request...")

  try {
    const res = await adminFetch(`/api/admin/bookings/${id}/resend-deposit-request`, {
      method: "POST",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || "Could not send deposit request.")
      setMessage("")
      return
    }

    setMessage(`Deposit request sent for booking ${id}.`)
    await loadAdminData()
  } catch (err) {
    console.error(err)
    if (err.message === "ADMIN_AUTH_REQUIRED") {
      handleAdminLogout()
      setError("Please log in again.")
    } else {
      setError("Server error while sending deposit request.")
    }
    setMessage("")
  }
}

  async function chargeDamage(id) {
    setError("")
    setMessage("Charging damage fee...")

    const input = window.prompt("Enter damage charge amount in dollars, for example 150")
    if (input === null) {
      setMessage("")
      return
    }

    const amountNumber = Number(input)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter a valid damage amount.")
      setMessage("")
      return
    }

    try {
      const res = await adminFetch(`/api/admin/charge-damage/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: centsFromDollars(amountNumber),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not charge damage.")
        setMessage("")
        return
      }

      setMessage(`Damage charge processed for booking ${id}.`)
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while charging damage.")
      }
      setMessage("")
    }
  }

  async function updateBookingDetails(id) {
    setError("")
    setMessage("Updating booking...")

    if (!editDate) {
      setError("Select a date.")
      setMessage("")
      return
    }

    try {
      const res = await adminFetch(`/api/admin/bookings/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: editDate,
          rentalTime: editTime,
          rentalLabel: editRentalLabel,
          towLocation: editTowLocation,
          customerEmail: editCustomerEmail,
          waiverPrintedName: editPrintedName,
          status: editStatus,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not update booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} updated.`)
      cancelEditBooking()
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while updating booking.")
      }
      setMessage("")
    }
  }

  async function deleteBooking(id) {
    setError("Delete booking is not available in the current backend.")
    setMessage("")
  }

  async function createBlockDate() {
    setError("")
    setMessage("Blocking date...")

    if (!blockDate) {
      setError("Select a date to block.")
      setMessage("")
      return
    }

    try {
      const res = await adminFetch(`/api/admin/block-date`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: blockDate,
          rentalLabel: blockRentalLabel,
          reason: blockReason,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not block date.")
        setMessage("")
        return
      }

      setMessage("Date blocked.")
      setBlockDate("")
      setBlockReason("")
      setBlockRentalLabel("All Rentals")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while blocking date.")
      }
      setMessage("")
    }
  }

  async function removeBlockDate(id) {
    setError("")
    setMessage("Removing blocked date...")

    try {
      const res = await adminFetch(`/api/admin/blocked-dates/${id}`, {
        method: "DELETE",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not remove blocked date.")
        setMessage("")
        return
      }

      setMessage("Blocked date removed.")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while removing blocked date.")
      }
      setMessage("")
    }
  }

  async function createHolidayPricing() {
    setError("")
    setMessage("Creating holiday pricing...")

    if (!holidayDate || !holidayPrice) {
      setError("Enter date and price.")
      setMessage("")
      return
    }

    try {
      const res = await adminFetch(`/api/admin/pricing/holiday`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: holidayDate,
          rentalLabel: holidayRentalLabel,
          overrideAmount: Number(holidayPrice),
          overrideLabel: holidayLabel,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not create holiday pricing.")
        setMessage("")
        return
      }

      setMessage("Holiday pricing created.")
      setHolidayDate("")
      setHolidayPrice("")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while creating holiday pricing.")
      }
      setMessage("")
    }
  }

  async function createManualOverride() {
    setError("")
    setMessage("Saving manual override...")

    if (!discountAmount || (!discountEmail.trim() && !discountBookingId.trim())) {
      setError("Enter an amount and either email or booking ID.")
      setMessage("")
      return
    }

    try {
      const res = await adminFetch(`/api/admin/pricing/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: discountBookingId.trim(),
          customerEmail: normalizeEmail(discountEmail),
          overrideAmount: Number(discountAmount),
          overrideLabel: discountLabel,
          overrideType: discountType,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not save manual override.")
        setMessage("")
        return
      }

      setMessage("Manual pricing override saved.")
      setDiscountEmail("")
      setDiscountBookingId("")
      setDiscountAmount("")
      setDiscountLabel("Friends & Family")
      setDiscountType("manual_discount")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while saving manual override.")
      }
      setMessage("")
    }
  }

  async function deletePricingOverride(id) {
    setError("")
    setMessage("Removing pricing override...")

    try {
      const res = await adminFetch(`/api/admin/pricing/${id}`, {
        method: "DELETE",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not remove pricing override.")
        setMessage("")
        return
      }

      setMessage("Pricing override removed.")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while removing pricing override.")
      }
      setMessage("")
    }
  }

  async function savePricingSettings() {
    setError("")
    setMessage("Saving pricing settings...")

    try {
      const payload = buildAdminPricingPayload(pricingEditor)

      const res = await adminFetch(`/api/admin/pricing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pricing: payload }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not save pricing settings.")
        setMessage("")
        return
      }

      setMessage("Pricing settings updated.")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while saving pricing settings.")
      }
      setMessage("")
    }
  }

  async function approveTestimonial(id) {
    setError("")
    setMessage("Approving testimonial...")

    try {
      const res = await adminFetch(`/api/admin/testimonials/${id}/approve`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not approve testimonial.")
        setMessage("")
        return
      }

      setMessage("Testimonial approved.")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while approving testimonial.")
      }
      setMessage("")
    }
  }

  async function denyTestimonial(id) {
    setError("")
    setMessage("Removing testimonial...")

    try {
      const res = await adminFetch(`/api/admin/testimonials/${id}/deny`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not remove testimonial.")
        setMessage("")
        return
      }

      setMessage("Testimonial denied and removed.")
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while removing testimonial.")
      }
      setMessage("")
    }
  }

  if (!isAuthenticated) {
    return <AdminLoginCard onLoginSuccess={() => setIsAuthenticated(true)} />
  }

  if (loading) {
    return (
      <div style={styles.adminPage}>
        <div style={styles.adminHeader}>
          <h1 style={styles.adminTitle}>Cleared to Cruise Admin</h1>
        </div>
        <div style={styles.adminGrid}>
          <div style={styles.loadingBox}>Loading admin panel...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.adminPage}>
      <div style={styles.adminHeader}>
        <div>
          <h1 style={styles.adminTitle}>Cleared to Cruise Admin</h1>
          <p style={styles.sectionSubtext}>
            Manage bookings, blocked dates, pricing, deposits, and testimonials.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button type="button" style={styles.secondaryButton} onClick={loadAdminData}>
            Refresh
          </button>
          <button type="button" style={styles.dangerButton} onClick={handleAdminLogout}>
            Log Out
          </button>
        </div>
      </div>

      <div style={styles.adminGrid}>
        {message ? <div style={styles.successBox}>{message}</div> : null}
        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Bookings</h2>

          <div style={styles.adminStatsRow}>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Total Bookings</div>
              <div style={styles.adminStatValue}>{bookings.length}</div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Pending Approval</div>
              <div style={styles.adminStatValue}>
                {bookings.filter((item) => item.status === "pending_approval").length}
              </div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Approved Unpaid</div>
              <div style={styles.adminStatValue}>
                {bookings.filter((item) => item.status === "approved_unpaid").length}
              </div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Confirmed</div>
              <div style={styles.adminStatValue}>
                {bookings.filter((item) => item.status === "confirmed").length}
              </div>
            </div>
          </div>

          <div style={styles.adminTableWrap}>
            <table style={styles.adminTable}>
              <thead>
                <tr>
                  <th style={styles.adminTh}>ID</th>
                  <th style={styles.adminTh}>Customer</th>
                  <th style={styles.adminTh}>Rental</th>
                  <th style={styles.adminTh}>Date</th>
                  <th style={styles.adminTh}>Time</th>
                  <th style={styles.adminTh}>Tow</th>
                  <th style={styles.adminTh}>Waiver</th>
                  <th style={styles.adminTh}>Payment</th>
                  <th style={styles.adminTh}>Deposit</th>
                  <th style={styles.adminTh}>Status</th>
                  <th style={styles.adminTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const isEditing = editingBookingId === booking.id

                  return (
                    <tr key={booking.id}>
                      <td style={styles.adminTd}>{booking.id}</td>
                      <td style={styles.adminTd}>
                        <div>{booking.waiverPrintedName || "—"}</div>
                        <div style={styles.lookupMeta}>{booking.customerEmail || "—"}</div>
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <select
                            style={styles.adminSelect}
                            value={editRentalLabel}
                            onChange={(e) => setEditRentalLabel(e.target.value)}
                          >
                            {rentalOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          booking.rentalLabel || "—"
                        )}
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <input
                            style={styles.adminInput}
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        ) : (
                          booking.date || "—"
                        )}
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <select
                            style={styles.adminSelect}
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                          >
                            {timeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          booking.rentalTime || "—"
                        )}
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <select
                            style={styles.adminSelect}
                            value={editTowLocation}
                            onChange={(e) => setEditTowLocation(e.target.value)}
                          >
                            {towOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          booking.towLocation || "None"
                        )}
                      </td>

                      <td style={styles.adminTd}>
                        <span style={statusPillStyle(booking.waiverStatus || "not_started")}>
                          {normalizeStatusLabel(booking.waiverStatus || "not_started")}
                        </span>
                      </td>
                      <td style={styles.adminTd}>
                        <span style={statusPillStyle(booking.paymentStatus || "unpaid")}>
                          {normalizeStatusLabel(booking.paymentStatus || "unpaid")}
                        </span>
                      </td>
                      <td style={styles.adminTd}>
                        <span style={statusPillStyle(booking.depositStatus || "not_scheduled")}>
                          {normalizeStatusLabel(booking.depositStatus || "not_scheduled")}
                        </span>
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <select
                            style={styles.adminSelect}
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                          >
                            <option value="pending_approval">pending approval</option>
                            <option value="approved_unpaid">approved unpaid</option>
                            <option value="pending_payment">pending payment</option>
                            <option value="confirmed">confirmed</option>
                            <option value="denied">denied</option>
                          </select>
                        ) : (
                          <span style={statusPillStyle(booking.status || "pending_approval")}>
                            {normalizeStatusLabel(booking.status || "pending_approval")}
                          </span>
                        )}
                      </td>
                      <td style={styles.adminTd}>
                        {isEditing ? (
                          <div style={styles.adminButtonRow}>
                            <button
                              type="button"
                              style={styles.adminPrimaryButton}
                              onClick={() => updateBookingDetails(booking.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              style={styles.adminSmallButton}
                              onClick={cancelEditBooking}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={styles.adminButtonRow}>
                            <button
                              type="button"
                              style={styles.adminSmallButton}
                              onClick={() => openEditBooking(booking)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              style={styles.adminSuccessButton}
                              onClick={() => approveBooking(booking.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              style={styles.adminDangerButton}
                              onClick={() => denyBooking(booking.id)}
                            >
                              Deny
                            </button>
                            <button
                              type="button"
                              style={styles.adminPrimaryButton}
                              onClick={() => markConfirmed(booking.id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              style={styles.adminSmallButton}
                              onClick={() => sendPaymentRequest(booking.id)}
                            >
                              Send Pay
                            </button>
                            <button
                              type="button"
                              style={styles.adminSmallButton}
                              onClick={() => sendDepositRequest(booking.id)}
                            >
                              Deposit
                            </button>
                            <button
                              type="button"
                              style={styles.adminWarningButton}
                              onClick={() => chargeDamage(booking.id)}
                            >
                              Damage
                            </button>
                            <button
                              type="button"
                              style={styles.adminDangerButton}
                              onClick={() => deleteBooking(booking.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Calendar & Block Dates</h2>

          <div style={styles.calendarHeader}>
            <button
              type="button"
              style={styles.adminSmallButton}
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                )
              }
            >
              Prev
            </button>

            <div style={styles.calendarTitle}>{getMonthLabel(calendarMonth)}</div>

            <button
              type="button"
              style={styles.adminSmallButton}
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                )
              }
            >
              Next
            </button>
          </div>

          <div style={styles.calendarGrid}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} style={styles.calendarDayHeader}>
                {day}
              </div>
            ))}

            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} style={styles.calendarCellEmpty} />
              }

              const key = toDateInputValue(date)
              const dayBlocks = blockedDateMap.get(key) || []

              return (
                <div key={key} style={styles.calendarCell}>
                  <div style={styles.calendarCellHeader}>
                    <span>{date.getDate()}</span>
                  </div>

                  {dayBlocks.map((block) => (
                    <div key={block.id} style={styles.calendarBlock}>
                      <div>{block.rentalLabel || "All"}</div>
                      <div style={styles.calendarBlockReason}>
                        {block.reason || "Blocked"}
                      </div>
                      <button
                        type="button"
                        style={styles.calendarRemoveButton}
                        onClick={() => removeBlockDate(block.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Date
              <input
                style={styles.input}
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Rental
              <select
                style={styles.input}
                value={blockRentalLabel}
                onChange={(e) => setBlockRentalLabel(e.target.value)}
              >
                <option value="All Rentals">All Rentals</option>
                {rentalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.labelFull}>
              Reason
              <input
                style={styles.input}
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Maintenance, weather, etc."
              />
            </label>
          </div>

          <div style={styles.buttonRow}>
            <button type="button" style={styles.primaryButton} onClick={createBlockDate}>
              Block Date
            </button>
          </div>
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Pricing Manager</h2>

          <div style={styles.adminStatsRow}>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Jet Ski (Single)</div>
              <div style={styles.adminStatValue}>${previewPricingEditor.JetSkiSingle}</div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Jet Ski (Double)</div>
              <div style={styles.adminStatValue}>${previewPricingEditor.JetSkiDouble}</div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Pontoon Half Day</div>
              <div style={styles.adminStatValue}>${previewPricingEditor.PontoonHalfDay}</div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Pontoon Full Day</div>
              <div style={styles.adminStatValue}>${previewPricingEditor.PontoonFullDay}</div>
            </div>
            <div style={styles.adminStatCard}>
              <div style={styles.adminStatLabel}>Bass Boat Full Day</div>
              <div style={styles.adminStatValue}>${previewPricingEditor.BassBoatFullDay}</div>
            </div>
          </div>

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Jet Ski (Single)
              <input
                style={styles.input}
                type="number"
                value={pricingEditor.JetSkiSingle}
                onChange={(e) =>
                  setPricingEditor((prev) => ({
                    ...prev,
                    JetSkiSingle: Number(e.target.value || 0),
                  }))
                }
              />
            </label>

            <label style={styles.label}>
              Jet Ski (Double)
              <input
                style={styles.input}
                type="number"
                value={pricingEditor.JetSkiDouble}
                onChange={(e) =>
                  setPricingEditor((prev) => ({
                    ...prev,
                    JetSkiDouble: Number(e.target.value || 0),
                  }))
                }
              />
            </label>

            <label style={styles.label}>
              Pontoon Half Day
              <input
                style={styles.input}
                type="number"
                value={pricingEditor.PontoonHalfDay}
                onChange={(e) =>
                  setPricingEditor((prev) => ({
                    ...prev,
                    PontoonHalfDay: Number(e.target.value || 0),
                  }))
                }
              />
            </label>

            <label style={styles.label}>
              Pontoon Full Day
              <input
                style={styles.input}
                type="number"
                value={pricingEditor.PontoonFullDay}
                onChange={(e) =>
                  setPricingEditor((prev) => ({
                    ...prev,
                    PontoonFullDay: Number(e.target.value || 0),
                  }))
                }
              />
            </label>

            <label style={styles.label}>
              Bass Boat Full Day
              <input
                style={styles.input}
                type="number"
                value={pricingEditor.BassBoatFullDay}
                onChange={(e) =>
                  setPricingEditor((prev) => ({
                    ...prev,
                    BassBoatFullDay: Number(e.target.value || 0),
                  }))
                }
              />
            </label>

            <label style={styles.labelFull}>
              Global Percentage Adjustment Preview ({pricingPercentAdjustment}%)
              <input
                style={styles.slider}
                type="range"
                min="-30"
                max="30"
                step="1"
                value={pricingPercentAdjustment}
                onChange={(e) => setPricingPercentAdjustment(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={styles.buttonRow}>
            <button type="button" style={styles.secondaryButton} onClick={applyPricingPercentPreview}>
              Apply Preview to Fields
            </button>
            <button type="button" style={styles.primaryButton} onClick={savePricingSettings}>
              Save Pricing
            </button>
          </div>
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Holiday Pricing Override</h2>

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Holiday Date
              <input
                style={styles.input}
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Rental
              <select
                style={styles.input}
                value={holidayRentalLabel}
                onChange={(e) => setHolidayRentalLabel(e.target.value)}
              >
                {rentalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Holiday Price
              <input
                style={styles.input}
                type="number"
                value={holidayPrice}
                onChange={(e) => setHolidayPrice(e.target.value)}
                placeholder="Enter holiday price"
              />
            </label>

            <label style={styles.labelFull}>
              Override Label
              <input
                style={styles.input}
                type="text"
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                placeholder="Holiday Pricing"
              />
            </label>
          </div>

          <div style={styles.buttonRow}>
            <button type="button" style={styles.primaryButton} onClick={createHolidayPricing}>
              Save Holiday Pricing
            </button>
          </div>
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Manual Discount / Price Override</h2>

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Override Type
              <select
                style={styles.input}
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
              >
                <option value="manual_discount">Manual Discount</option>
                <option value="manual_price">Manual Price Override</option>
              </select>
            </label>

            <label style={styles.label}>
              Booking ID (optional)
              <input
                style={styles.input}
                type="text"
                value={discountBookingId}
                onChange={(e) => setDiscountBookingId(e.target.value)}
                placeholder="Specific booking ID"
              />
            </label>

            <label style={styles.label}>
              Customer Email (optional)
              <input
                style={styles.input}
                type="email"
                value={discountEmail}
                onChange={(e) => setDiscountEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </label>

            <label style={styles.label}>
              Amount
              <input
                style={styles.input}
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </label>

            <label style={styles.labelFull}>
              Label
              <input
                style={styles.input}
                type="text"
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
                placeholder="Friends & Family"
              />
            </label>
          </div>

          <div style={styles.buttonRow}>
            <button type="button" style={styles.primaryButton} onClick={createManualOverride}>
              Save Manual Override
            </button>
          </div>
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Active Pricing Overrides</h2>

          {pricingOverrides.length === 0 ? (
            <div style={styles.infoBox}>No active pricing overrides.</div>
          ) : (
            <div style={styles.adminTableWrap}>
              <table style={styles.adminTable}>
                <thead>
                  <tr>
                    <th style={styles.adminTh}>Type</th>
                    <th style={styles.adminTh}>Label</th>
                    <th style={styles.adminTh}>Rental</th>
                    <th style={styles.adminTh}>Date</th>
                    <th style={styles.adminTh}>Booking ID</th>
                    <th style={styles.adminTh}>Email</th>
                    <th style={styles.adminTh}>Amount</th>
                    <th style={styles.adminTh}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingOverrides.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.adminTd}>{item.overrideType || "—"}</td>
                      <td style={styles.adminTd}>{item.overrideLabel || "—"}</td>
                      <td style={styles.adminTd}>{item.rentalLabel || "—"}</td>
                      <td style={styles.adminTd}>{item.date || "—"}</td>
                      <td style={styles.adminTd}>{item.bookingId || "—"}</td>
                      <td style={styles.adminTd}>{item.customerEmail || "—"}</td>
                      <td style={styles.adminTd}>
                        ${dollarsFromCents(item.overrideAmount || 0)}
                      </td>
                      <td style={styles.adminTd}>
                        <div style={styles.adminButtonRow}>
                          <button
                            type="button"
                            style={styles.adminDangerButton}
                            onClick={() => deletePricingOverride(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={styles.adminCard}>
          <h2 style={styles.adminSectionTitle}>Testimonial Approval</h2>

          {adminTestimonials.length === 0 ? (
            <div style={styles.infoBox}>No testimonials submitted yet.</div>
          ) : (
            <div style={styles.adminTableWrap}>
              <table style={styles.adminTable}>
                <thead>
                  <tr>
                    <th style={styles.adminTh}>Name</th>
                    <th style={styles.adminTh}>Rental</th>
                    <th style={styles.adminTh}>Testimonial</th>
                    <th style={styles.adminTh}>Photo</th>
                    <th style={styles.adminTh}>Approved</th>
                    <th style={styles.adminTh}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminTestimonials.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.adminTd}>
                        <div>{item.fullName || "—"}</div>
                        <div style={styles.lookupMeta}>{item.customerEmail || "—"}</div>
                      </td>
                      <td style={styles.adminTd}>{item.rentalLabel || "—"}</td>
                      <td style={styles.adminTd}>{item.message || "—"}</td>
                     <td style={styles.adminTd}>
  {Array.isArray(item.photos) && item.photos.length > 0 ? (
    <img
      src={item.photos[0]}
      alt="Testimonial"
      style={styles.adminImagePreview}
    />
  ) : (
    "—"
  )}
</td>
<td style={styles.adminTd}>
  <span style={statusPillStyle(item.approved ? "confirmed" : "pending_approval")}>
    {item.approved ? "approved" : "pending"}
  </span>
</td>
                      <td style={styles.adminTd}>
                        <div style={styles.adminButtonRow}>
                          <button
                            type="button"
                            style={styles.adminSuccessButton}
                            onClick={() => approveTestimonial(item.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            style={styles.adminDangerButton}
                            onClick={() => denyTestimonial(item.id)}
                          >
                            Deny
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function RentalCard({ card, selectedRental, rentalOptions, onChange }) {
  const isSelected = card.options.includes(selectedRental)
  const isBestValue = card.options.includes("Pontoon - Full Day")

  return (
    <div
      style={{
        ...styles.heroCard,
        ...(isSelected ? styles.heroCardSelected : {}),
        ...(isBestValue ? styles.heroCardBestValue : {}),
      }}
    >
      <div style={styles.heroImageWrap}>
        <img src={card.image} alt={card.alt} style={styles.heroImage} />
        {isBestValue ? <div style={styles.heroBadge}>Most Popular</div> : null}
      </div>

      <div style={styles.heroContent}>
        <div>
          <h3 style={styles.heroTitle}>{card.title}</h3>
          <p style={styles.heroText}>{card.text}</p>

          {isBestValue ? (
            <div style={styles.bestValueText}>Best Value • Great for full lake days</div>
          ) : null}

          {card.options.includes("Pontoon - Half Day") ? (
            <div style={styles.heroUpgradeHint}>
              Upgrade to full day anytime for better value
            </div>
          ) : null}
        </div>

        <div style={styles.heroDropdownActionWrap}>
          <label style={styles.heroSelectLabel}>
            Choose Option
            <select
              style={styles.heroSelect}
              value={card.options.includes(selectedRental) ? selectedRental : card.options[0]}
              onChange={(e) => onChange(e.target.value)}
            >
              {card.options.map((optionValue) => (
                <option key={optionValue} value={optionValue}>
                  {getRentalLabel(optionValue, rentalOptions)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            style={isSelected ? styles.heroSelectedButton : styles.heroChooseButton}
            onClick={() => onChange(card.options[0])}
          >
            {isSelected ? "Selected" : "Choose This Rental"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DepositPage() {
  const { id } = useParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleDepositStart() {
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`${API}/api/deposit/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.url) {
        setError(data.error || "Could not start deposit authorization.")
        setLoading(false)
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setError("Server error while starting deposit authorization.")
      setLoading(false)
    }
  }

  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Authorize Security Deposit</h1>
        <p style={styles.successText}>
          This page lets you save a card for the refundable $500 security deposit hold.
        </p>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={loading ? styles.buttonDisabled : styles.primaryButton}
            disabled={loading}
            onClick={handleDepositStart}
          >
            {loading ? "Redirecting..." : "Authorize Deposit Card"}
          </button>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
      </div>
    </div>
  )
}

function PaymentPage() {
  const { id } = useParams()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function loadBooking() {
      try {
        const res = await fetch(`${API}/api/bookings/${id}`)
        const data = await res.json().catch(() => ({}))

        if (!active) return

        if (!res.ok) {
          setError(data.error || "Could not load booking.")
          setLoading(false)
          return
        }

        setBooking(data)
      } catch (err) {
        console.error(err)
        if (active) {
          setError("Server error while loading booking.")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadBooking()

    return () => {
      active = false
    }
  }, [id])

  async function handlePayNow() {
    setPaying(true)
    setError("")

    try {
      const res = await fetch(`${API}/api/create-checkout/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.url) {
        setError(data.error || "Could not create checkout session.")
        setPaying(false)
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setError("Server error while starting payment.")
      setPaying(false)
    }
  }

  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Complete Rental Payment</h1>

        {loading ? <div style={styles.loadingBox}>Loading booking...</div> : null}

        {!loading && booking ? (
          <>
            <div style={styles.successDetails}>
              <div>
                <strong>Booking ID:</strong> {booking.id}
              </div>
              <div>
                <strong>Rental:</strong> {booking.rentalLabel}
              </div>
              <div>
                <strong>Date:</strong> {booking.date || "—"}
              </div>
              <div>
                <strong>Time:</strong> {booking.rentalTime || "—"}
              </div>
              <div>
                <strong>Total:</strong> ${booking?.pricing?.totalAmountDollars || "0.00"}
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                style={paying ? styles.buttonDisabled : styles.primaryButton}
                disabled={paying}
                onClick={handlePayNow}
              >
                {paying ? "Redirecting..." : "Pay Rental Now"}
              </button>
            </div>
          </>
        ) : null}

        {error ? <div style={styles.errorBox}>{error}</div> : null}
      </div>
    </div>
  )
}
function SuccessPage() {
  const params = new URLSearchParams(window.location.search)
  const bookingId = params.get("bookingId")

  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Success</h1>
        <p style={styles.successText}>
          Your checkout completed successfully.
        </p>

        {bookingId ? (
          <div style={styles.successDetails}>
            <div>
              <strong>Booking ID:</strong> {bookingId}
            </div>
          </div>
        ) : null}

        <div style={styles.buttonRow}>
          <a href="/" style={styles.primaryButtonLink}>
            Return Home
          </a>
          {bookingId ? (
            <a href={`/pay/${bookingId}`} style={styles.secondaryButtonLink}>
              View Booking
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
function CancelPage() {
  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Checkout Canceled</h1>
        <p style={styles.successText}>
          Your checkout was canceled. You can return and try again when ready.
        </p>

        <div style={styles.buttonRow}>
          <a href="/" style={styles.primaryButtonLink}>
            Return Home
          </a>
        </div>
      </div>
    </div>
  )
}
function MainApp() {
  const [rentalOptions, setRentalOptions] = useState(fallbackRentalOptions)
  const [testimonials, setTestimonials] = useState([])
  const [activeTestimonialIndex, setActiveTestimonialIndex] = useState(0)
const [activePhotoIndexes, setActivePhotoIndexes] = useState({})
useEffect(() => {
  fetch(`${API}/api/testimonials`)
    .then(res => res.json())
    .then(data => {
      setTestimonials(data || [])
    })
    .catch(err => {
      console.error("Failed to load testimonials:", err)
    })
}, [])

function nextTestimonial() {
  setActiveTestimonialIndex((prev) =>
    prev === testimonials.length - 1 ? 0 : prev + 1
  )
}

function prevTestimonial() {
  setActiveTestimonialIndex((prev) =>
    prev === 0 ? testimonials.length - 1 : prev - 1
  )
}

function nextPhoto(testimonialIndex, photosLength) {
  setActivePhotoIndexes((prev) => {
    const current = prev[testimonialIndex] || 0
    return {
      ...prev,
      [testimonialIndex]: current === photosLength - 1 ? 0 : current + 1
    }
  })
}

function prevPhoto(testimonialIndex, photosLength) {
  setActivePhotoIndexes((prev) => {
    const current = prev[testimonialIndex] || 0
    return {
      ...prev,
      [testimonialIndex]: current === 0 ? photosLength - 1 : current - 1
    }
  })
}
async function loadTestimonials() {
  try {
    const res = await fetch(`${API}/api/testimonials`)
    const data = await res.json().catch(() => [])

    if (!res.ok) {
      console.error("Failed to load testimonials", data)
      setTestimonials([])
      return
    }

    setTestimonials(Array.isArray(data) ? data : [])
  } catch (err) {
    console.error("Failed to load testimonials", err)
    setTestimonials([])
  }
}
useEffect(() => {
  loadTestimonials()
}, [])

  const [rental, setRental] = useState("Jet Ski (Single)")
  const [date, setDate] = useState("")
  const [rentalTime, setRentalTime] = useState("08:00 AM")
  const [location, setLocation] = useState("None")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [file, setFile] = useState(null)

  const [bookingId, setBookingId] = useState(null)
  const [bookingStatus, setBookingStatus] = useState("pending_approval")
  const [waiverStatus, setWaiverStatus] = useState("not_started")
  const [depositStatus, setDepositStatus] = useState("not_scheduled")

  const [availabilityMessage, setAvailabilityMessage] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [showWaiver, setShowWaiver] = useState(false)
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const navigate = useNavigate()
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null)
const [unavailableDates, setUnavailableDates] = useState([])
const [isAvailable, setIsAvailable] = useState(true)

function formatMonthForApi(dateObj) {
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

async function loadUnavailableDates(nextRental = rental, monthDate = selectedCalendarDate || new Date()) {
  try {
    const month = formatMonthForApi(monthDate)

    const params = new URLSearchParams({
      rentalLabel: nextRental,
      month,
    })

    const res = await fetch(`${API}/api/calendar-unavailable?${params.toString()}`)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error(data.error || "Could not load unavailable dates.")
      setUnavailableDates([])
      return
    }

    const parsed = (data.unavailableDates || []).map((dateStr) => {
      const [year, monthNum, day] = dateStr.split("-").map(Number)
      return new Date(year, monthNum - 1, day)
    })

    setUnavailableDates(parsed)
  } catch (err) {
    console.error(err)
    setUnavailableDates([])
  }
}

useEffect(() => {
  loadUnavailableDates(rental, selectedCalendarDate || new Date())
}, [rental])
  useEffect(() => {
    fetchPublicPricing().then((options) => {
      setRentalOptions(options)
      if (!options.some((item) => item.value === rental)) {
        setRental(options[0]?.value || "Jet Ski (Single)")
      }
    })

    refreshTestimonials()
  }, [])

  async function refreshTestimonials() {
    const rows = await fetchPublicTestimonials()
    setTestimonials(rows)
  }

  const rentalPrice = getRentalPrice(rental, rentalOptions)
  const towPrice = getTowPrice(location)
  const totalAmount = rentalPrice + towPrice
  const pontoonUpgradeAmount = Math.max(
    0,
    getRentalPrice("Pontoon - Full Day", rentalOptions) -
      getRentalPrice("Pontoon - Half Day", rentalOptions)
  )

  const selectedRentalDescription = useMemo(() => {
    if (rental === "Jet Ski (Single)") {
      return "Single jet ski rental for an exciting day on the water."
    }
    if (rental === "Jet Ski (Double)") {
      return "Double jet ski option for more time and flexibility on the lake."
    }
    if (rental === "Pontoon - Half Day") {
      return "Half-day pontoon option for relaxing group cruising."
    }
    if (rental === "Pontoon - Full Day") {
      return "Full-day pontoon option with the best value for groups."
    }
    if (rental === "Bass Boat - Full Day") {
      return "Full-day bass boat rental for fishing and performance boating."
    }
    return "Select your preferred rental option."
  }, [rental])

 async function checkAvailability(nextDate = date, nextRental = rental) {
  if (!nextDate || !nextRental) {
    setAvailabilityMessage("")
    return
  }

  try {
    const params = new URLSearchParams({
      rentalLabel: nextRental,
      date: nextDate,
    })

    const res = await fetch(`${API}/api/availability?${params.toString()}`)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setAvailabilityMessage(data.error || "Could not check availability.")
      return
    }

    if (!data.available) {
      setAvailabilityMessage("This equipment is not available for that date.")
      setIsAvailable(false)
      return
    }

    setIsAvailable(true)
    setAvailabilityMessage("That rental appears available for the selected date.")

  } catch (err) {
    console.error(err)
    setAvailabilityMessage("Server error while checking availability.")
    setIsAvailable(false)
  }
}

  async function refreshBookingStatus(currentBookingId = bookingId) {
    if (!currentBookingId) return

    try {
      const res = await fetch(`${API}/api/bookings/${currentBookingId}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Could not refresh booking.")
        return
      }

      setBookingStatus(data.status || "pending_approval")
      setWaiverStatus(data.waiverStatus || "not_started")
      setDepositStatus(data.depositStatus || "not_scheduled")
      setStatusMessage(`Booking ${data.id} status refreshed.`)
    } catch (err) {
      console.error(err)
      setStatusMessage("Server error while refreshing booking.")
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setAvailabilityMessage("")
    setStatusMessage("")

    if (!date) {
      setAvailabilityMessage("Please choose a rental date.")
      return
    }

    if (!name.trim()) {
      setAvailabilityMessage("Please enter your full legal name.")
      return
    }

    if (!email.trim()) {
      setAvailabilityMessage("Please enter your email address.")
      return
    }

    if (!file) {
      setAvailabilityMessage("Please upload a photo ID.")
      return
    }

    setLoading(true)

    try {
      const bookings = await fetchBookingsSafe()

      if (isJetSkiBlocked(bookings, rental, date)) {
        setAvailabilityMessage("Jet skis are already fully booked for that date.")
        setLoading(false)
        return
      }

      const formData = new FormData()
      formData.append("rentalLabel", rental)
      formData.append("date", date)
      formData.append("rentalTime", rentalTime)
      formData.append("towLocation", location)
      formData.append("waiverPrintedName", name.trim())
      formData.append("customerEmail", email.trim())
      formData.append("photoId", file)

      const res = await fetch(`${API}/api/bookings/waiver`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setAvailabilityMessage(data.error || "Could not create booking.")
        return
      }

      setBookingId(data.bookingId)
      setBookingStatus("pending_approval")
      setWaiverStatus("not_started")
      setDepositStatus("not_scheduled")
      setStatusMessage(
  `Booking request submitted. Your booking ID is ${data.bookingId}.`
)
setShowWaiver(true)
    } catch (err) {  
      console.error(err)
      setAvailabilityMessage("Server error while creating booking.")
    } finally {
      setLoading(false)
    }
  }

 async function handleSignWaiver() {
  if (!bookingId) {
    setStatusMessage("Create a booking first.")
    return
  }

  try {
    setStatusMessage("")
    setLoading(true)

    const res = await fetch(`${API}/api/waiver/signed/${bookingId}`, {
      method: "POST",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setStatusMessage(data.error || "Could not sign waiver.")
      return
    }

    setWaiverStatus("signed")
    setShowWaiver(false)
    navigate("/request-received")
  } catch (err) {
    console.error(err)
    setStatusMessage("Server error while signing waiver.")
  } finally {
    setLoading(false)
  }
}

  async function handlePay() {
    if (!bookingId) {
      setStatusMessage("Create a booking first.")
      return
    }

    if (bookingStatus !== "approved_unpaid") {
      setStatusMessage("Your booking must be approved before payment.")
      return
    }

    if (waiverStatus !== "signed") {
      setStatusMessage("You must sign the waiver before payment.")
      return
    }

    setPaying(true)
    setStatusMessage("")

    try {
      const res = await fetch(`${API}/api/create-checkout/${bookingId}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.url) {
        setStatusMessage(data.error || "Could not start payment.")
        setPaying(false)
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setStatusMessage("Server error while starting payment.")
      setPaying(false)
    }
  }

  function resetBookingForm() {
    setRental("Jet Ski (Single)")
    setDate("")
    setRentalTime("08:00 AM")
    setLocation("None")
    setName("")
    setEmail("")
    setFile(null)
    setBookingId(null)
    setBookingStatus("pending_approval")
    setWaiverStatus("not_started")
    setDepositStatus("not_scheduled")
    setAvailabilityMessage("")
    setStatusMessage("")
    setShowWaiver(false)
    setWaiverAccepted(false)
  }

  function loadExistingBookingIntoForm(booking) {
    setBookingId(booking.id || null)
    setRental(booking.rentalLabel || "Jet Ski (Single)")
    setDate(booking.date || "")
    setRentalTime(booking.rentalTime || "08:00 AM")
    setLocation(booking.towLocation || "None")
    setName(booking.waiverPrintedName || "")
    setEmail(booking.customerEmail || "")
    setBookingStatus(booking.status || "pending_approval")
    setWaiverStatus(booking.waiverStatus || "not_started")
    setDepositStatus(booking.depositStatus || "not_scheduled")
    setAvailabilityMessage("")
    setStatusMessage(`Loaded booking ${booking.id}.`)
    setShowWaiver(false)
    setWaiverAccepted(false)
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerRow}>
         <div style={styles.heroHeader}>
  <img src={HEADER_LOGO} alt="Cleared to Cruise" style={styles.heroLogo} />
</div>
     
        </div>

        <p style={styles.subtitle}>
          Premium boat and jet ski rentals — simple booking, smooth check-in, unforgettable days on the water.
        </p>
      </header>

      <section style={styles.topGrid}>
        <div style={styles.topCardLarge}>
          <img src="/images/castaic-lake.jpg" alt="Castaic Lake" style={styles.largeImage} />
          <div style={styles.imageOverlay}>
            <h2 style={styles.overlayTitle}>Castaic Lake</h2>
            <p style={styles.overlayText}>Tow option available</p>
            <a
              href={CASTAIC_INFO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.overlayLinkButton}
            >
              Official Rules & Info
            </a>
          </div>
        </div>

        <div style={styles.topCardLarge}>
          <img src="/images/pyramid-lake.jpg" alt="Pyramid Lake" style={styles.largeImage} />
          <div style={styles.imageOverlay}>
            <h2 style={styles.overlayTitle}>Pyramid Lake</h2>
            <p style={styles.overlayText}>Tow option available</p>
            <a
              href={PYRAMID_INFO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.overlayLinkButton}
            >
              Official Rules & Info
            </a>
          </div>
        </div>
      </section>

      <section style={styles.heroGrid}>
        {heroRentalGroups.map((card) => (
          <RentalCard
            key={card.key}
            card={card}
            selectedRental={rental}
            rentalOptions={rentalOptions}
            onChange={(value) => {
              setRental(value)
              setAvailabilityMessage("")
              setStatusMessage("")
              checkAvailability(date, value)
            }}
          />
        ))}
      </section>

      <section style={styles.mainCard}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Reserve Your Rental</h2>
            <p style={styles.sectionSubtext}>{selectedRentalDescription}</p>
          </div>

          <div style={styles.formHeaderActions}>
            <div style={styles.badge}>{bookingId ? `Booking #${bookingId}` : "New Booking"}</div>
          </div>
        </div>

        <div style={styles.selectedRentalBar}>
          <span style={styles.selectedRentalLabel}>Selected Rental</span>
          <strong style={styles.selectedRentalValue}>
            {rental} — ${getRentalPrice(rental, rentalOptions)} + fuel
          </strong>
        </div>

        {rental === "Pontoon - Full Day" ? (
          <div style={styles.bestValueBanner}>
            Most Popular • Best Value for groups and longer days on the water
          </div>
        ) : null}

        {rental === "Pontoon - Half Day" && pontoonUpgradeAmount > 0 ? (
          <div style={styles.upgradeBanner}>
            Upgrade to Pontoon Full Day for just ${pontoonUpgradeAmount} more plus fuel.
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGrid}>
            <label style={styles.label}>
              Rental Date
<DatePicker
  selected={selectedCalendarDate}
  onChange={(dateObj) => {
    setSelectedCalendarDate(dateObj)

    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, "0")
    const day = String(dateObj.getDate()).padStart(2, "0")

    const formatted = `${year}-${month}-${day}`

    setDate(formatted)
    checkAvailability(formatted, rental)
  }}
  onMonthChange={(dateObj) => {
    loadUnavailableDates(rental, dateObj)
  }}
  excludeDates={unavailableDates}
  minDate={new Date()}
  placeholderText="Select a rental date"
  className="ctc-datepicker-input"
  dayClassName={(dateObj) => {
    const isBlocked = unavailableDates.some(
      (d) =>
        d.getFullYear() === dateObj.getFullYear() &&
        d.getMonth() === dateObj.getMonth() &&
        d.getDate() === dateObj.getDate()
    )
    return isBlocked ? "ctc-unavailable-day" : ""
  }}
/>
            </label>

            <label style={styles.label}>
              Requested Rental Time
              <select
                style={styles.input}
                value={rentalTime}
                onChange={(e) => setRentalTime(e.target.value)}
              >
                {timeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Tow Location
              <select
                style={styles.input}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {towOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Email Address
              <input
                style={styles.input}
                type="email"
                placeholder="customer@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Full Legal Name for Waiver Signature
              <input
                style={styles.input}
                type="text"
                placeholder="Your full legal name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label style={styles.labelFull}>
              Upload Photo ID
              <input
                style={styles.fileInput}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <span style={styles.fileName}>
                {file
                  ? `Selected: ${file.name}`
                  : bookingId
                    ? "Booking already has an ID on file"
                    : "No file selected yet"}
              </span>
            </label>
          </div>

          <div style={styles.priceSummary}>
            <div style={styles.priceRow}>
              <span>Rental</span>
              <strong>${rentalPrice}</strong>
            </div>

            <div style={styles.priceRow}>
              <span>Tow Fee</span>
              <strong>${towPrice}</strong>
            </div>

            <div style={styles.priceRowTotal}>
              <span>Total Amount Owed</span>
              <strong>${totalAmount} + fuel</strong>
            </div>
          </div>

          <div style={styles.buttonRow}>
            <button
              type="submit"
              style={loading ? styles.buttonDisabled : styles.primaryButton}
              disabled={loading}
            >
              {loading ? "Checking..." : bookingId ? "Continue This Booking" : "Submit Request"}
            </button>

            <button
              type="button"
              style={
                !bookingId || waiverStatus === "signed"
                  ? styles.buttonDisabled
                  : styles.secondaryButton
              }
              onClick={() => setShowWaiver(true)}
              disabled={!bookingId || waiverStatus === "signed"}
            >
              {waiverStatus === "signed" ? "Waiver Signed" : "Review Waiver"}
            </button>

            <button
              type="button"
              style={
                bookingStatus !== "approved_unpaid" || waiverStatus !== "signed" || paying
                  ? styles.buttonDisabled
                  : styles.primaryButton
              }
              onClick={handlePay}
              disabled={bookingStatus !== "approved_unpaid" || waiverStatus !== "signed" || paying}
            >
              {paying ? "Redirecting..." : "Pay Rental Now"}
            </button>

            <button
              type="button"
              style={!bookingId ? styles.buttonDisabled : styles.secondaryButton}
              onClick={refreshBookingStatus}
              disabled={!bookingId}
            >
              Refresh Approval Status
            </button>

            <button type="button" style={styles.secondaryButton} onClick={resetBookingForm}>
              Clear Form
            </button>
          </div>
        </form>

        {bookingId && showWaiver ? (
          <section style={styles.waiverCard}>
            <h3 style={styles.waiverTitle}>Liability Waiver and Electronic Signature Agreement</h3>

            <div style={styles.waiverBox}>
              <p>
                I understand that participation in boating, jet ski use, towing, loading,
                launching, docking, swimming, and other water activities involves inherent risks,
                including but not limited to serious bodily injury, permanent disability, death,
                collisions, drowning, falling, equipment failure, property damage, and damage to
                other persons or property.
              </p>

              <p>
                I voluntarily choose to participate in this rental activity and I accept all risks
                associated with the use, transport, operation, and possession of the rental
                equipment during my rental period.
              </p>

              <p>
                I agree to operate the boat, jet ski, trailer, and all rental equipment in a safe
                and lawful manner. I accept full responsibility for my own safety, the safety of my
                passengers, and the conduct of anyone allowed by me to use or ride in the rental
                equipment.
              </p>

              <p>
                I agree to release, indemnify, and hold harmless Cleared to Cruise, its owners,
                agents, representatives, and affiliates from claims, demands, liabilities, losses,
                damages, expenses, or causes of action arising out of or related to my rental,
                possession, transportation, or use of the rental equipment, except where prohibited
                by law.
              </p>

              <p>
                I understand and agree that I am financially responsible for any loss or damage to
                the boat, jet ski, trailer, motor, propeller, accessories, safety equipment, or
                any other rental equipment during my rental period, regardless of whether caused by
                me, my passengers, or any person using the equipment with my permission.
              </p>

              <p>
                I also agree to be responsible for injury, damage, or loss caused to other persons,
                boats, docks, vehicles, structures, or other property arising from my rental or
                operation of the rental equipment.
              </p>

              <p>
                I confirm that the full legal name I typed on this booking form is my electronic
                signature for this liability waiver and rental agreement. I also confirm that the
                photo identification uploaded with this booking belongs to me and that the
                information I provided is true and correct.
              </p>

              <p>
                By checking the agreement box below and signing electronically, I acknowledge that
                I have read this waiver carefully, understand its contents, and agree to be legally
                bound by it.
              </p>
            </div>

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={waiverAccepted}
                onChange={(e) => setWaiverAccepted(e.target.checked)}
              />
              <span>
                I have read and agree to this liability waiver and electronic signature agreement.
              </span>
            </label>

            <button
              type="button"
              style={!waiverAccepted || !name.trim() ? styles.buttonDisabled : styles.secondaryButton}
              onClick={handleSignWaiver}
              disabled={!waiverAccepted || !name.trim()}
            >
              I Agree and Sign Waiver
            </button>
          </section>
        ) : null}

        <div style={styles.statusGrid}>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Booking ID</span>
            <span style={styles.statusValue}>{bookingId || "Not created yet"}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Booking Status</span>
            <span style={styles.statusValue}>{normalizeStatusLabel(bookingStatus)}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Waiver Status</span>
            <span style={styles.statusValue}>{normalizeStatusLabel(waiverStatus)}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Deposit Status</span>
            <span style={styles.statusValue}>{normalizeStatusLabel(depositStatus)}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Rental</span>
            <span style={styles.statusValue}>{rental}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Date</span>
            <span style={styles.statusValue}>{date || "Not selected"}</span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Time</span>
            <span style={styles.statusValue}>{rentalTime || "Not selected"}</span>
          </div>
        </div>

        {availabilityMessage ? <div style={styles.successBox}>{availabilityMessage}</div> : null}
        {statusMessage ? <div style={styles.infoBox}>{statusMessage}</div> : null}
      </section>

<TestimonialsSection
  testimonials={testimonials}
  onSubmitted={refreshTestimonials}
/>

      <BookingLookupCard onLoadBooking={loadExistingBookingIntoForm} />



      <footer style={styles.policyFooter}>
        <small style={styles.policyText}>{cancellationPolicyText}</small>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/deposit/:id" element={<DepositPage />} />
        <Route path="/pay/:id" element={<PaymentPage />} />
        <Route path="/cancel" element={<CancelPage />} />
        <Route path="/request-received" element={<RequestReceived />} />
      </Routes>
    </BrowserRouter>
  )
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #07131f 0%, #0e2235 35%, #e8eef4 35%, #eef3f7 100%)",
    padding: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#102030",
  },
header: {
  width: "100%",
  margin: "0 auto",
  padding: "0",   // ← remove vertical padding
},
fileInput: {
  display: "block",
  marginTop: "10px",
  marginBottom: "32px",
},

testimonialActionRow: {
  marginTop: "40px",
},

headerRow: {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "0",
  flexWrap: "wrap",
},
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
    flexWrap: "wrap",
  },
heroHeader: {
  width: "100%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "0",
  marginTop: "-100px", 
  marginBottom: "-100px",  // slight lift, not aggressive
},
heroLogo: {
  width: "90%",
  maxWidth: "650px",   // ⭐ professional sweet spot
  height: "auto",
  display: "block",
  margin: "0 auto",
},
  subtitle: {
    marginTop: "0px",
    color: "rgba(255,255,255,0.82)",
    fontSize: "16px",
  },
  topGrid: {
    maxWidth: "1200px",
    margin: "0 auto 20px auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "18px",
  },
  topCardLarge: {
    position: "relative",
    minHeight: "270px",
    borderRadius: "22px",
    overflow: "hidden",
    boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
    background: "#0f1720",
  },
  largeImage: {
    width: "100%",
    height: "100%",
    minHeight: "270px",
    objectFit: "cover",
    display: "block",
  },
  imageOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: "24px",
    background: "linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0.08))",
  },
  overlayTitle: {
    margin: 0,
    color: "#ffffff",
    fontSize: "30px",
    fontWeight: 800,
  },
  overlayText: {
    margin: "8px 0 0 0",
    color: "rgba(255,255,255,0.92)",
    fontSize: "15px",
  },
  overlayLinkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    marginTop: "14px",
    padding: "10px 14px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "14px",
    border: "1px solid rgba(255,255,255,0.22)",
    backdropFilter: "blur(6px)",
  },
  heroGrid: {
    maxWidth: "1200px",
    margin: "0 auto 20px auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "18px",
  },
  heroCard: {
    background: "rgba(255,255,255,0.98)",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 10px 28px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
  },
  heroCardSelected: {
    border: "2px solid #0f2233",
    boxShadow: "0 16px 36px rgba(15, 34, 51, 0.18)",
    transform: "translateY(-2px)",
  },
  heroCardBestValue: {
    border: "2px solid #157347",
    boxShadow: "0 16px 36px rgba(21, 115, 71, 0.18)",
  },
  heroImageWrap: {
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "220px",
    objectFit: "cover",
    display: "block",
  },
  heroBadge: {
    position: "absolute",
    top: "12px",
    right: "12px",
    background: "#157347",
    color: "#ffffff",
    padding: "8px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(21, 115, 71, 0.25)",
  },
  heroContent: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    justifyContent: "space-between",
  },
  heroTitle: {
    margin: "0 0 8px 0",
    fontSize: "20px",
    fontWeight: 800,
    color: "#0f2233",
  },
  heroText: {
    margin: 0,
    color: "#5b6b79",
    lineHeight: 1.5,
    fontSize: "14px",
  },
  bestValueText: {
    marginTop: "10px",
    color: "#157347",
    fontWeight: 800,
    fontSize: "13px",
  },
  heroUpgradeHint: {
    marginTop: "10px",
    color: "#1d4ed8",
    fontWeight: 700,
    fontSize: "13px",
  },
  heroDropdownActionWrap: {
    display: "grid",
    gap: "10px",
  },
  heroSelectLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "13px",
    fontWeight: 800,
    color: "#203445",
  },
  heroSelect: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #d5dee7",
    background: "#fbfdff",
    fontSize: "14px",
    color: "#102030",
    outline: "none",
    boxSizing: "border-box",
  },
  heroChooseButton: {
    width: "100%",
    border: "1px solid #cfd9e3",
    background: "#ffffff",
    color: "#102030",
    padding: "12px 14px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  heroSelectedButton: {
    width: "100%",
    border: "none",
    background: "#0f2233",
    color: "#ffffff",
    padding: "12px 14px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15, 34, 51, 0.16)",
  },
  mainCard: {
    maxWidth: "1200px",
    margin: "0 auto 20px auto",
    background: "rgba(255,255,255,0.98)",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 16px 36px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
  },
  formHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  formHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 800,
    color: "#0f2233",
  },
  sectionSubtext: {
    margin: "8px 0 0 0",
    color: "#627382",
    fontSize: "15px",
  },
  badge: {
    background: "#0f2233",
    color: "#ffffff",
    padding: "10px 14px",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  bestValueBanner: {
    marginBottom: "18px",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "#ecfdf3",
    border: "1px solid #bde6cb",
    color: "#157347",
    fontWeight: 800,
  },
  upgradeBanner: {
    marginBottom: "18px",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "#eef4ff",
    border: "1px solid #c7d7fe",
    color: "#1d4ed8",
    fontWeight: 700,
  },
  selectedRentalBar: {
    marginBottom: "18px",
    background: "#f7fafc",
    border: "1px solid #e1e8ef",
    borderRadius: "16px",
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  selectedRentalLabel: {
    fontSize: "13px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#6b7d8b",
  },
  selectedRentalValue: {
    fontSize: "16px",
    color: "#0f2233",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#203445",
  },
  labelFull: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#203445",
    gridColumn: "1 / -1",
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: "12px",
    border: "1px solid #d5dee7",
    background: "#fbfdff",
    fontSize: "15px",
    color: "#102030",
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: "12px",
    border: "1px solid #d5dee7",
    background: "#fbfdff",
    fontSize: "15px",
    color: "#102030",
    outline: "none",
    boxSizing: "border-box",
    minHeight: "120px",
    resize: "vertical",
  },
  fileInput: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: "12px",
    border: "1px solid #d5dee7",
    background: "#fbfdff",
    fontSize: "15px",
    color: "#102030",
    boxSizing: "border-box",
  },
  fileName: {
    fontSize: "13px",
    color: "#627382",
  },
  priceSummary: {
    marginTop: "18px",
    background: "#f7fafc",
    border: "1px solid #e1e8ef",
    borderRadius: "16px",
    padding: "16px",
    display: "grid",
    gap: "10px",
  },
  priceRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "#203445",
    fontSize: "15px",
  },
  priceRowTotal: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "#0f2233",
    fontSize: "18px",
    fontWeight: 800,
    paddingTop: "10px",
    borderTop: "1px solid #d9e5ef",
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "22px",
  },
  primaryButton: {
    border: "none",
    background: "#0f2233",
    color: "#ffffff",
    padding: "13px 18px",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15, 34, 51, 0.16)",
  },
  secondaryButton: {
    border: "1px solid #cfd9e3",
    background: "#ffffff",
    color: "#102030",
    padding: "13px 18px",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerButton: {
    border: "none",
    background: "#b42318",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  buttonDisabled: {
    border: "none",
    background: "#b8c3cd",
    color: "#ffffff",
    padding: "13px 18px",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "not-allowed",
    opacity: 0.9,
  },
  waiverCard: {
    marginTop: "22px",
    padding: "20px",
    borderRadius: "18px",
    background: "#fff8e8",
    border: "1px solid #ead9a7",
  },
  waiverTitle: {
    marginTop: 0,
    marginBottom: "14px",
    fontSize: "22px",
    fontWeight: 800,
    color: "#2d2410",
  },
  waiverBox: {
    maxHeight: "320px",
    overflowY: "auto",
    background: "#fffdf7",
    border: "1px solid #e7dcc0",
    borderRadius: "12px",
    padding: "16px",
    lineHeight: 1.6,
    color: "#3b3426",
    marginBottom: "16px",
  },
  checkboxRow: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    marginBottom: "16px",
    fontWeight: 600,
    color: "#2d2410",
  },
  statusGrid: {
    marginTop: "22px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  },
  statusCard: {
    background: "#f7fafc",
    border: "1px solid #e1e8ef",
    borderRadius: "16px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  statusLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#6b7d8b",
    fontWeight: 800,
  },
  statusValue: {
    fontSize: "15px",
    color: "#102030",
    fontWeight: 700,
    wordBreak: "break-word",
  },
  successBox: {
    marginTop: "18px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#ecfdf3",
    border: "1px solid #bde6cb",
    color: "#157347",
    fontWeight: 700,
  },
  errorBox: {
    marginTop: "14px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b42318",
    fontWeight: 700,
  },
  infoBox: {
    marginTop: "14px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#f3f7fb",
    border: "1px solid #d9e5ef",
    color: "#1d3347",
    fontWeight: 700,
  },
  loadingBox: {
    marginTop: "14px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#eef4fb",
    border: "1px solid #d6e2f0",
    color: "#28465f",
    fontWeight: 700,
  },
  successPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eef3f7",
    padding: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  successCard: {
    maxWidth: "640px",
    width: "100%",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "30px",
    boxShadow: "0 16px 36px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
  },
  successTitle: {
    marginTop: 0,
    fontSize: "32px",
    color: "#157347",
  },
  successText: {
    color: "#425466",
    fontSize: "16px",
    lineHeight: 1.6,
  },
  successDetails: {
    margin: "18px 0 24px 0",
    padding: "16px",
    borderRadius: "14px",
    background: "#f7fafc",
    border: "1px solid #e1e8ef",
    display: "grid",
    gap: "10px",
  },
  lookupList: {
    display: "grid",
    gap: "14px",
    marginTop: "18px",
  },
  lookupCard: {
    marginTop: "18px",
    background: "#f7fafc",
    border: "1px solid #e1e8ef",
    borderRadius: "16px",
    padding: "16px",
    display: "grid",
    gap: "10px",
    maxWidth: "900px",
    marginLeft: "auto",
    marginRight: "auto",
  },
  lookupRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    color: "#102030",
    fontSize: "14px",
  },
  lookupMeta: {
    fontSize: "12px",
    color: "#6b7d8b",
    marginTop: "4px",
  },
  testimonialImage: {
    display: "block",
    width: "100%",
    maxHeight: "520px",
    height: "220px",
    objectFit: "contain",
    margin: "0 auto",
    borderRadius: "10px",
    background: "#f3f4f6",
  },
  policyFooter: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "6px 24px 30px 24px",
    textAlign: "center",
  },
  policyText: {
    fontSize: "13px",
    color: "#5e7080",
    lineHeight: 1.5,
  },
  adminPage: {
    minHeight: "100vh",
    background: "#eef3f7",
    padding: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#102030",
  },
  adminHeader: {
    maxWidth: "1200px",
    margin: "0 auto 20px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  adminTitle: {
    margin: 0,
    fontSize: "36px",
    fontWeight: 800,
    color: "#0f2233",
  },
  adminGrid: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gap: "18px",
  },
  adminCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 12px 30px rgba(14, 34, 53, 0.1)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
    display: "grid",
    gap: "14px",
  },
  adminSectionTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 800,
    color: "#0f2233",
  },
  adminTableWrap: {
    width: "100%",
    overflowX: "auto",
  },
  adminTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
    minWidth: "1100px",
  },
  adminTh: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #e1e8ef",
    color: "#6b7d8b",
    fontWeight: 800,
  },
  adminTd: {
    padding: "10px",
    borderBottom: "1px solid #eef2f6",
    color: "#102030",
    verticalAlign: "top",
  },
  adminButtonRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  adminSmallButton: {
    border: "1px solid #cfd9e3",
    background: "#ffffff",
    color: "#102030",
    padding: "6px 8px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  adminPrimaryButton: {
    border: "none",
    background: "#0f2233",
    color: "#ffffff",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  adminDangerButton: {
    border: "none",
    background: "#b42318",
    color: "#ffffff",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  adminSuccessButton: {
    border: "none",
    background: "#157347",
    color: "#ffffff",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  adminWarningButton: {
    border: "none",
    background: "#d97706",
    color: "#ffffff",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  adminStatsRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  adminStatCard: {
    flex: "1 1 140px",
    background: "#f7fafc",
    borderRadius: "12px",
    padding: "12px",
    border: "1px solid #e1e8ef",
  },
  adminStatLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    color: "#6b7d8b",
    fontWeight: 800,
  },
  adminStatValue: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#0f2233",
    marginTop: "4px",
  },
  adminImagePreview: {
    width: "100%",
    maxWidth: "140px",
    maxHeight: "140px",
    objectFit: "cover",
    borderRadius: "10px",
    border: "1px solid #e1e8ef",
  },
  adminInput: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #d5dee7",
    fontSize: "14px",
    minWidth: "160px",
  },
  adminSelect: {
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #d5dee7",
    fontSize: "13px",
  },
  adminLoginWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eef3f7",
    padding: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  adminLoginCard: {
    width: "100%",
    maxWidth: "540px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "30px",
    boxShadow: "0 16px 36px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
  },
  adminLoginTitle: {
    marginTop: 0,
    marginBottom: "10px",
    fontSize: "30px",
    color: "#0f2233",
  },
  adminLoginText: {
    marginTop: 0,
    marginBottom: "20px",
    color: "#627382",
  },
  adminLoginForm: {
    display: "grid",
    gap: "14px",
  },
  calendarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  calendarTitle: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#0f2233",
  },
  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: "8px",
  },
  calendarDayHeader: {
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 800,
    color: "#6b7d8b",
    padding: "8px 0",
  },
  calendarCellEmpty: {
    minHeight: "90px",
    borderRadius: "12px",
    background: "#f8fafc",
  },
  calendarCell: {
    minHeight: "90px",
    borderRadius: "12px",
    border: "1px solid #e1e8ef",
    background: "#ffffff",
    padding: "8px",
    display: "grid",
    gap: "6px",
    alignContent: "start",
  },
  calendarCellHeader: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#0f2233",
  },
  calendarBlock: {
    position: "relative",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "8px",
    padding: "6px 22px 6px 8px",
    fontSize: "11px",
    color: "#9a3412",
  },
  calendarBlockReason: {
    color: "#7c2d12",
    marginTop: "2px",
  },
  calendarRemoveButton: {
    position: "absolute",
    top: "4px",
    right: "4px",
    width: "16px",
    height: "16px",
    borderRadius: "999px",
    border: "none",
    background: "#b42318",
    color: "#ffffff",
    fontSize: "11px",
    lineHeight: 1,
    cursor: "pointer",
  },
  slider: {
    width: "100%",
  },
  testimonialSliderWrap: {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
},

testimonialArrow: {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  border: "none",
  fontSize: "24px",
  padding: "8px 12px",
  cursor: "pointer",
  zIndex: 2,
},

testimonialPhotoWrap: {
  position: "relative",
  width: "100%",
  maxHeight: "520px",
  margin: "12px auto 0",
  overflow: "hidden",
  borderRadius: "10px",
},

testimonialPhoto: {
  width: "100%",
  height: "300px",
  objectFit: "cover",
},

testimonialPhotoArrow: {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  border: "none",
  fontSize: "18px",
  padding: "6px 10px",
  cursor: "pointer",
}
}