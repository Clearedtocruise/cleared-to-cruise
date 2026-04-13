import { useEffect, useMemo, useState } from "react"
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom"
import "./App.css"

const API = "https://cleared-to-cruise-api.onrender.com"

const rentalOptions = [
  { value: "Jet Ski (Single)", label: "Jet Ski (Single) — $400 + fuel", price: 400 },
  { value: "Jet Ski (Double)", label: "Jet Ski (Double) — $750 + fuel", price: 750 },
  { value: "Pontoon - 6 Hours", label: "Pontoon - 6 Hours — $600 + fuel", price: 600 },
  { value: "Pontoon - 8 Hours", label: "Pontoon - 8 Hours — $750 + fuel", price: 750 },
  { value: "Pontoon - 10 Hours", label: "Pontoon - 10 Hours — $900 + fuel", price: 900 },
  { value: "Bass Boat - Full Day", label: "Bass Boat - Full Day — $400 + fuel", price: 400 },
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
]

const CASTAIC_INFO_URL = "https://parks.lacounty.gov/castaic-lake-state-recreation-area/"
const PYRAMID_INFO_URL = "https://water.ca.gov/What-We-Do/Recreation/Pyramid-Lake-Recreation"

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
    text: "Comfortable group cruising with multiple time options.",
    image: "/images/suntracker-pontoon.png",
    alt: "Pontoon rental",
    options: ["Pontoon - 6 Hours", "Pontoon - 8 Hours", "Pontoon - 10 Hours"],
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

function formatDate(value) {
  if (!value) return "—"
  return value
}

function normalizeStatusLabel(value) {
  if (!value) return "—"
  return String(value).replaceAll("_", " ")
}

function getRentalPrice(rentalValue) {
  return rentalOptions.find((item) => item.value === rentalValue)?.price || 0
}

function getTowPrice(towValue) {
  return towOptions.find((item) => item.value === towValue)?.price || 0
}

function getRentalLabel(rentalValue) {
  return rentalOptions.find((item) => item.value === rentalValue)?.label || rentalValue
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
  })

  if (response.status === 401 || response.status === 403) {
    throw new Error("ADMIN_AUTH_REQUIRED")
  }

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

async function handleAdminLogin(e) {
  e.preventDefault()
  setError("")

  if (!username.trim() || !password.trim()) {
    setError("Enter your admin username and password.")
    return
  }

  setLoading(true)

  try {
    // ✅ SAVE PASSWORD AS TOKEN
   const encoded = btoa(`${username.trim()}:${password.trim()}`)
localStorage.setItem("ctc_admin_token", encoded)

    // ✅ TEST AUTH RIGHT AWAY
    const res = await fetch(`${API}/api/admin/bookings`, {
      headers: {
        Authorization:
          "Basic " + btoa(`${username.trim()}:${password.trim()}`),
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
    setError("Server error during admin login.")
  } finally {
    setLoading(false)
  }
}

function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getStoredAdminToken()))

  const [bookings, setBookings] = useState([])
  const [blockedDates, setBlockedDates] = useState([])
  const [pricingOverrides, setPricingOverrides] = useState([])

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

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

  const [editingBookingId, setEditingBookingId] = useState(null)
  const [editDate, setEditDate] = useState("")
  const [editTime, setEditTime] = useState("")
  const [editRentalLabel, setEditRentalLabel] = useState("Pontoon - 6 Hours")
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

  function handleAdminLogout() {
    setStoredAdminToken("")
    setIsAuthenticated(false)
    setBookings([])
    setBlockedDates([])
    setPricingOverrides([])
    setMessage("")
    setError("")
    setLoading(false)
  }

  function openEditBooking(booking) {
    setEditingBookingId(booking.id)
    setEditDate(booking.date || "")
    setEditTime(booking.rentalTime || "07:00 AM")
    setEditRentalLabel(booking.rentalLabel || "Pontoon - 6 Hours")
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
    setEditRentalLabel("Pontoon - 6 Hours")
    setEditTowLocation("None")
    setEditCustomerEmail("")
    setEditPrintedName("")
    setEditStatus("pending_approval")
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
      const [bookingsRes, blockedRes, pricingRes] = await Promise.all([
        adminFetch("/api/admin/bookings"),
        adminFetch("/api/admin/blocked-dates"),
        adminFetch("/api/admin/pricing-overrides"),
      ])

      const bookingsData = await bookingsRes.json().catch(() => [])
      const blockedData = await blockedRes.json().catch(() => [])
      const pricingData = await pricingRes.json().catch(() => [])

      if (!bookingsRes.ok) {
        throw new Error(bookingsData?.error || "Could not load admin bookings.")
      }

      if (!blockedRes.ok) {
        throw new Error(blockedData?.error || "Could not load blocked dates.")
      }

      if (!pricingRes.ok) {
        throw new Error(pricingData?.error || "Could not load pricing overrides.")
      }

      setBookings(Array.isArray(bookingsData) ? bookingsData : [])
      setBlockedDates(Array.isArray(blockedData) ? blockedData : [])
      setPricingOverrides(Array.isArray(pricingData) ? pricingData : [])
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

  async function sendDepositLink(id) {
    setError("")
    setMessage("Creating deposit link...")

    try {
      const res = await adminFetch(`/api/admin/deposit-link/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not create deposit link.")
        setMessage("")
        return
      }

      setMessage(`Deposit link created for booking ${id}.`)
      await loadAdminData()
    } catch (err) {
      console.error(err)
      if (err.message === "ADMIN_AUTH_REQUIRED") {
        handleAdminLogout()
        setError("Please log in again.")
      } else {
        setError("Server error while creating deposit link.")
      }
      setMessage("")
    }
  }

  if (!isAuthenticated) {
    return <AdminLoginCard onLoginSuccess={() => setIsAuthenticated(true)} />
  }

  return (
    <div style={styles.adminPage}>
      <div style={styles.adminHeader}>
        <h1 style={styles.adminTitle}>Cleared to Cruise Admin</h1>

        <div style={styles.buttonRow}>
          <button type="button" style={styles.secondaryButton} onClick={loadAdminData}>
            Refresh
          </button>

          <button type="button" style={styles.dangerButton} onClick={handleAdminLogout}>
            Log Out
          </button>
        </div>
      </div>

      {message ? <div style={styles.successBox}>{message}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}
      {loading ? <div style={styles.loadingBox}>Loading admin data...</div> : null}

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Bookings</h2>
            <p style={styles.sectionSubtext}>
              Approve, deny, confirm, edit, and manage customer bookings.
            </p>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHead}>ID</th>
                <th style={styles.tableHead}>Rental</th>
                <th style={styles.tableHead}>Date</th>
                <th style={styles.tableHead}>Time</th>
                <th style={styles.tableHead}>Customer</th>
                <th style={styles.tableHead}>Status</th>
                <th style={styles.tableHead}>Payment</th>
                <th style={styles.tableHead}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td style={styles.tableCell}>{booking.id}</td>
                  <td style={styles.tableCell}>{booking.rentalLabel || "—"}</td>
                  <td style={styles.tableCell}>{formatDate(booking.date)}</td>
                  <td style={styles.tableCell}>{booking.rentalTime || "—"}</td>
                  <td style={styles.tableCell}>
                    <div>{booking.waiverPrintedName || "—"}</div>
                    <div style={styles.lookupMeta}>{booking.customerEmail || "—"}</div>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={statusPillStyle(booking.status || "new")}>
                      {normalizeStatusLabel(booking.status || "new")}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <span style={statusPillStyle(booking.paymentStatus || "unpaid")}>
                      {normalizeStatusLabel(booking.paymentStatus || "unpaid")}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionWrap}>
                      <button
                        type="button"
                        style={styles.smallButton}
                        onClick={() => approveBooking(booking.id)}
                      >
                        Approve
                      </button>

                      <button
                        type="button"
                        style={styles.smallButton}
                        onClick={() => denyBooking(booking.id)}
                      >
                        Deny
                      </button>

                      <button
                        type="button"
                        style={styles.smallButton}
                        onClick={() => markConfirmed(booking.id)}
                      >
                        Confirm
                      </button>

                      <button
                        type="button"
                        style={styles.smallButton}
                        onClick={() => sendDepositLink(booking.id)}
                      >
                        Deposit
                      </button>

                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => openEditBooking(booking)}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingBookingId ? (
        <section style={styles.adminSection}>
          <div style={styles.formHeaderRow}>
            <div>
              <h2 style={styles.sectionTitle}>Edit Booking #{editingBookingId}</h2>
              <p style={styles.sectionSubtext}>
                Change date, time, rental, tow location, customer info, or status.
              </p>
            </div>
          </div>

          <div style={styles.formGrid}>
            <label style={styles.label}>
              Date
              <input
                style={styles.input}
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Time
              <select
                style={styles.input}
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
              >
                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Rental
              <select
                style={styles.input}
                value={editRentalLabel}
                onChange={(e) => setEditRentalLabel(e.target.value)}
              >
                {rentalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Tow Location
              <select
                style={styles.input}
                value={editTowLocation}
                onChange={(e) => setEditTowLocation(e.target.value)}
              >
                {towOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Customer Email
              <input
                style={styles.input}
                type="email"
                value={editCustomerEmail}
                onChange={(e) => setEditCustomerEmail(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Full Name
              <input
                style={styles.input}
                type="text"
                value={editPrintedName}
                onChange={(e) => setEditPrintedName(e.target.value)}
              />
            </label>

            <label style={styles.label}>
              Status
              <select
                style={styles.input}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="pending_approval">Pending Approval</option>
                <option value="approved_unpaid">Approved Unpaid</option>
                <option value="confirmed">Confirmed</option>
                <option value="denied">Denied</option>
              </select>
            </label>
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={async () => {
                try {
                  const res = await adminFetch(`/api/admin/bookings/${editingBookingId}`, {
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
                    setError(data.error || "Failed to update booking.")
                    return
                  }

                  setMessage("Booking updated.")
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
                }
              }}
            >
              Save Changes
            </button>

            <button type="button" style={styles.secondaryButton} onClick={cancelEditBooking}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Holiday Pricing</h2>
            <p style={styles.sectionSubtext}>
              Set a special holiday price for a specific rental on a specific date.
            </p>
          </div>
        </div>

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
            Rental Type
            <select
              style={styles.input}
              value={holidayRentalLabel}
              onChange={(e) => setHolidayRentalLabel(e.target.value)}
            >
              {rentalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Holiday Price
            <input
              style={styles.input}
              type="number"
              placeholder="950"
              value={holidayPrice}
              onChange={(e) => setHolidayPrice(e.target.value)}
            />
          </label>

          <label style={styles.label}>
            Label
            <input
              style={styles.input}
              type="text"
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
            />
          </label>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={async () => {
              setError("")
              setMessage("Saving holiday pricing...")

              try {
                const res = await adminFetch("/api/admin/pricing/holiday", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    date: holidayDate,
                    rentalLabel: holidayRentalLabel,
                    overrideAmount: holidayPrice,
                    overrideLabel: holidayLabel,
                  }),
                })

                const data = await res.json().catch(() => ({}))

                if (!res.ok) {
                  setError(data.error || "Could not save holiday pricing.")
                  setMessage("")
                  return
                }

                setMessage("Holiday pricing saved.")
                setHolidayDate("")
                setHolidayPrice("")
                setHolidayLabel("Holiday Pricing")
                await loadAdminData()
              } catch (err) {
                console.error(err)
                if (err.message === "ADMIN_AUTH_REQUIRED") {
                  handleAdminLogout()
                  setError("Please log in again.")
                } else {
                  setError("Server error while saving holiday pricing.")
                }
                setMessage("")
              }
            }}
          >
            Save Holiday Price
          </button>
        </div>
      </section>

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Manual Pricing / Friends & Family</h2>
            <p style={styles.sectionSubtext}>
              Add a discount or manual price override by booking ID or customer email.
            </p>
          </div>
        </div>

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Booking ID
            <input
              style={styles.input}
              type="text"
              placeholder="1001"
              value={discountBookingId}
              onChange={(e) => setDiscountBookingId(e.target.value)}
            />
          </label>

          <label style={styles.label}>
            Customer Email
            <input
              style={styles.input}
              type="email"
              placeholder="customer@email.com"
              value={discountEmail}
              onChange={(e) => setDiscountEmail(e.target.value)}
            />
          </label>

          <label style={styles.label}>
            Type
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
            Amount
            <input
              style={styles.input}
              type="number"
              placeholder="100"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </label>

          <label style={styles.label}>
            Label
            <input
              style={styles.input}
              type="text"
              value={discountLabel}
              onChange={(e) => setDiscountLabel(e.target.value)}
            />
          </label>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={async () => {
              setError("")
              setMessage("Saving manual pricing override...")

              try {
                const res = await adminFetch("/api/admin/pricing/manual", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    bookingId: discountBookingId.trim(),
                    customerEmail: discountEmail.trim(),
                    overrideAmount: discountAmount,
                    overrideType: discountType,
                    overrideLabel: discountLabel,
                  }),
                })

                const data = await res.json().catch(() => ({}))

                if (!res.ok) {
                  setError(data.error || "Could not save manual pricing override.")
                  setMessage("")
                  return
                }

                setMessage("Manual pricing override saved.")
                setDiscountBookingId("")
                setDiscountEmail("")
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
                  setError("Server error while saving manual pricing override.")
                }
                setMessage("")
              }
            }}
          >
            Save Manual Pricing
          </button>
        </div>
      </section>

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Blocked Dates Calendar</h2>
            <p style={styles.sectionSubtext}>
              View blocked dates visually and tap a day to prefill the block form.
            </p>
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                )
              }
            >
              Previous
            </button>

            <div style={styles.calendarMonthLabel}>{getMonthLabel(calendarMonth)}</div>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() =>
                setCalendarMonth(
                  new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                )
              }
            >
              Next
            </button>
          </div>
        </div>

        <div style={styles.calendarGrid}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} style={styles.calendarHeaderCell}>
              {day}
            </div>
          ))}

          {calendarDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} style={styles.calendarEmptyCell} />
            }

            const key = toDateInputValue(day)
            const dayBlocks = blockedDateMap.get(key) || []
            const isBlocked = dayBlocks.length > 0

            return (
              <button
                key={key}
                type="button"
                style={{
                  ...styles.calendarDayCell,
                  ...(isBlocked ? styles.calendarDayBlocked : {}),
                }}
                onClick={() => {
                  setBlockDate(key)
                  if (dayBlocks[0]?.rentalLabel) {
                    setBlockRentalLabel(dayBlocks[0].rentalLabel)
                  }
                  if (dayBlocks[0]?.reason) {
                    setBlockReason(dayBlocks[0].reason)
                  }
                }}
              >
                <span style={styles.calendarDayNumber}>{day.getDate()}</span>

                {isBlocked ? (
                  <span style={styles.calendarBlockedText}>
                    {dayBlocks[0]?.rentalLabel || "Blocked"}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Block a Date</h2>
            <p style={styles.sectionSubtext}>
              Block dates for maintenance, weather, manual blackout dates, or holidays.
            </p>
          </div>
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
            Rental Type
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

          <label style={styles.label}>
            Reason
            <input
              style={styles.input}
              type="text"
              placeholder="Maintenance, weather, unavailable"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </label>
        </div>

        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={async () => {
              if (!blockDate) {
                setError("Please choose a date to block.")
                setMessage("")
                return
              }

              setError("")
              setMessage("Blocking date...")

              try {
                const res = await adminFetch("/api/admin/block-date", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    date: blockDate,
                    reason: blockReason.trim(),
                    rentalLabel: blockRentalLabel === "All Rentals" ? null : blockRentalLabel,
                  }),
                })

                const data = await res.json().catch(() => ({}))

                if (!res.ok) {
                  setError(data.error || "Could not block date.")
                  setMessage("")
                  return
                }

                setMessage("Date blocked successfully.")
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
            }}
          >
            Block Date
          </button>
        </div>
      </section>

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Active Pricing Overrides</h2>
            <p style={styles.sectionSubtext}>
              Review and remove active holiday pricing, discounts, or manual price overrides.
            </p>
          </div>
        </div>

        {pricingOverrides.length === 0 ? (
          <div style={styles.infoBox}>No active pricing overrides found.</div>
        ) : (
          <div style={styles.lookupList}>
            {pricingOverrides.map((item) => (
              <div key={item.id} style={styles.lookupCard}>
                <div style={styles.lookupRow}>
                  <strong>ID:</strong> {item.id}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Type:</strong> {normalizeStatusLabel(item.overrideType)}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Label:</strong> {item.overrideLabel || "—"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Rental:</strong> {item.rentalLabel || "—"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Date:</strong> {item.date || "—"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Booking ID:</strong> {item.bookingId || "—"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Email:</strong> {item.customerEmail || "—"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Amount:</strong>{" "}
                  ${typeof item.overrideAmount === "number"
                    ? (item.overrideAmount / 100).toFixed(2)
                    : "0.00"}
                </div>

                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={async () => {
                      setError("")
                      setMessage("Removing pricing override...")

                      try {
                        const res = await adminFetch(`/api/admin/pricing/${item.id}`, {
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
                    }}
                  >
                    Remove Override
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.adminSection}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Blocked Dates</h2>
            <p style={styles.sectionSubtext}>
              Review and remove blocked dates already in the system.
            </p>
          </div>
        </div>

        {blockedDates.length === 0 ? (
          <div style={styles.infoBox}>No blocked dates found.</div>
        ) : (
          <div style={styles.lookupList}>
            {blockedDates.map((item) => (
              <div key={item.id} style={styles.lookupCard}>
                <div style={styles.lookupRow}>
                  <strong>Date:</strong> {item.date}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Rental:</strong> {item.rentalLabel || "All Rentals"}
                </div>
                <div style={styles.lookupRow}>
                  <strong>Reason:</strong> {item.reason || "—"}
                </div>

                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={async () => {
                      setError("")
                      setMessage("Removing blocked date...")

                      try {
                        const res = await adminFetch(`/api/admin/block-date/${item.id}`, {
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
                    }}
                  >
                    Remove Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function RentalCard({ card, selectedRental, onChange }) {
  const isSelectedGroup = card.options.includes(selectedRental)
  const currentValue = isSelectedGroup ? selectedRental : card.options[0]

  return (
    <article
      style={{
        ...styles.heroCard,
        ...(isSelectedGroup ? styles.heroCardSelected : {}),
      }}
    >
      <img src={card.image} alt={card.alt} style={styles.heroImage} />
      <div style={styles.heroContent}>
        <div>
          <h3 style={styles.heroTitle}>{card.title}</h3>
          <p style={styles.heroText}>{card.text}</p>
        </div>

        <div style={styles.heroSelectWrap}>
          {card.options.length === 1 ? (
            <button
              type="button"
              style={isSelectedGroup ? styles.heroSelectedButton : styles.heroChooseButton}
              onClick={() => onChange(card.options[0])}
            >
              {isSelectedGroup
                ? `Selected: ${getRentalLabel(card.options[0])}`
                : `Choose ${getRentalLabel(card.options[0])}`}
            </button>
          ) : (
            <div style={styles.heroDropdownActionWrap}>
              <label style={styles.heroSelectLabel}>
                Choose Option
                <select
                  style={styles.heroSelect}
                  value={currentValue}
                  onChange={(e) => onChange(e.target.value)}
                >
                  {card.options.map((value) => (
                    <option key={value} value={value}>
                      {getRentalLabel(value)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                style={isSelectedGroup ? styles.heroSelectedButton : styles.heroChooseButton}
                onClick={() => onChange(currentValue)}
              >
                {isSelectedGroup ? "Selected" : "Use This Option"}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function DepositPage() {
  const { id } = useParams()
  const [message, setMessage] = useState("Redirecting to secure deposit authorization...")

  useEffect(() => {
    let isMounted = true

    async function startDeposit() {
      try {
        const res = await fetch(`${API}/api/deposit/${id}`, {
          method: "POST",
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (isMounted) {
            setMessage(data.error || "Could not create deposit authorization.")
          }
          return
        }

        if (data.url) {
          window.location.href = data.url
          return
        }

        if (isMounted) {
          setMessage("Deposit authorization link was not returned.")
        }
      } catch (error) {
        console.error(error)
        if (isMounted) {
          setMessage("Server error creating deposit authorization.")
        }
      }
    }

    startDeposit()

    return () => {
      isMounted = false
    }
  }, [id])

  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Security Deposit Authorization</h1>
        <p style={styles.successText}>{message}</p>
      </div>
    </div>
  )
}

function PaymentPage() {
  const { id } = useParams()
  const [message, setMessage] = useState("Redirecting to secure payment checkout...")

  useEffect(() => {
    let isMounted = true

    async function startPayment() {
      try {
        const res = await fetch(`${API}/api/create-checkout/${id}`, {
          method: "POST",
        })

        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (isMounted) {
            setMessage(data.error || "Could not create payment checkout.")
          }
          return
        }

        if (data.url) {
          window.location.href = data.url
          return
        }

        if (isMounted) {
          setMessage("Payment checkout link was not returned.")
        }
      } catch (error) {
        console.error(error)
        if (isMounted) {
          setMessage("Server error creating payment checkout.")
        }
      }
    }

    startPayment()

    return () => {
      isMounted = false
    }
  }, [id])

  return (
    <div style={styles.successPage}>
      <div style={styles.successCard}>
        <h1 style={styles.successTitle}>Complete Your Payment</h1>
        <p style={styles.successText}>{message}</p>
      </div>
    </div>
  )
}

function MainApp() {
  const path = window.location.pathname
  const pathParts = path.split("/")
  const depositRequestBookingId = pathParts[1] === "deposit" ? pathParts[2] : null
  const payRequestBookingId = pathParts[1] === "pay" ? pathParts[2] : null

  const [rental, setRental] = useState("Pontoon - 6 Hours")
  const [date, setDate] = useState("")
  const [rentalTime, setRentalTime] = useState("07:00 AM")
  const [location, setLocation] = useState("None")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [file, setFile] = useState(null)

  const [bookingId, setBookingId] = useState(null)
  const [bookingStatus, setBookingStatus] = useState("new")
  const [waiverStatus, setWaiverStatus] = useState("not_started")
  const [availabilityMessage, setAvailabilityMessage] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)

  const [showWaiver, setShowWaiver] = useState(false)
  const [waiverAccepted, setWaiverAccepted] = useState(false)

  const [successBooking, setSuccessBooking] = useState(null)
  const [successLoading, setSuccessLoading] = useState(false)

  const rentalPrice = useMemo(() => getRentalPrice(rental), [rental])
  const towPrice = useMemo(() => getTowPrice(location), [location])
  const totalAmount = useMemo(() => rentalPrice + towPrice, [rentalPrice, towPrice])

  function resetBookingForm() {
    setBookingId(null)
    setBookingStatus("new")
    setWaiverStatus("not_started")
    setAvailabilityMessage("")
    setStatusMessage("")
    setRental("Pontoon - 6 Hours")
    setDate("")
    setRentalTime("07:00 AM")
    setLocation("None")
    setEmail("")
    setName("")
    setFile(null)
    setShowWaiver(false)
    setWaiverAccepted(false)
  }

  function loadExistingBookingIntoForm(booking) {
    setBookingId(booking.id || null)
    setBookingStatus(booking.status || "new")
    setWaiverStatus(booking.waiverStatus || "not_started")
    setRental(booking.rentalLabel || "Pontoon - 6 Hours")
    setDate(booking.date || "")
    setRentalTime(booking.rentalTime || "07:00 AM")
    setLocation(booking.towLocation || "None")
    setName(booking.waiverPrintedName || "")
    setEmail(booking.customerEmail || "")
    setAvailabilityMessage("")

    if ((booking.waiverStatus || "not_started") !== "signed" && booking.status === "approved_unpaid") {
      setStatusMessage("This booking is approved. Please sign the waiver below, then you can pay.")
    } else if ((booking.waiverStatus || "not_started") !== "signed") {
      setStatusMessage("Booking loaded. Please sign the waiver below to continue.")
    } else if (booking.status === "approved_unpaid") {
      setStatusMessage("Booking loaded. Your waiver is signed and payment is ready.")
    } else {
      setStatusMessage("Booking loaded. You can continue below.")
    }

    if ((booking.waiverStatus || "not_started") !== "signed") {
      setShowWaiver(true)
      setWaiverAccepted(false)
    } else {
      setShowWaiver(false)
      setWaiverAccepted(true)
    }
  }

  async function checkAvailability(selectedDate = date, selectedRental = rental) {
    if (!selectedDate) {
      setAvailabilityMessage("")
      return
    }

    try {
      const res = await fetch(
        `${API}/api/availability?rentalLabel=${encodeURIComponent(selectedRental)}&date=${selectedDate}`
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setAvailabilityMessage(data.error || "Could not check availability.")
        return
      }

      setAvailabilityMessage(data.available ? "✅ Available" : "❌ Not available")
    } catch (err) {
      console.error(err)
      setAvailabilityMessage("Error checking availability.")
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!date) {
      setAvailabilityMessage("Please choose a date.")
      return
    }

    if (!name.trim()) {
      setStatusMessage("Please enter your full legal name.")
      return
    }

    if (!email.trim()) {
      setStatusMessage("Please enter your email address.")
      return
    }

    if (!file && !bookingId) {
      setStatusMessage("Please upload your photo ID.")
      return
    }

    setLoading(true)
    setStatusMessage("Submitting booking request...")

    try {
      if (bookingId) {
        setStatusMessage("Booking loaded. Continue with waiver or payment below.")
        setLoading(false)
        return
      }

      const formData = new FormData()
      formData.append("rentalLabel", rental)
      formData.append("date", date)
      formData.append("rentalTime", rentalTime)
      formData.append("towLocation", location)
      formData.append("waiverPrintedName", name.trim())
      formData.append("waiverAccepted", waiverAccepted ? "true" : "false")
      formData.append("customerEmail", email.trim())
      if (file) {
        formData.append("photoId", file)
      }

      const res = await fetch(`${API}/api/bookings/waiver`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Booking failed.")
        setLoading(false)
        return
      }

      setBookingId(data.bookingId)
      setBookingStatus("pending_approval")
      setWaiverStatus(waiverAccepted ? "signed" : "not_started")
      setShowWaiver(!waiverAccepted)

      setStatusMessage(
        `Booking submitted. Booking ID: ${data.bookingId}. Awaiting admin approval.`
      )
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error submitting booking.")
    }

    setLoading(false)
  }

  async function handleSignWaiver() {
    if (!bookingId) {
      setStatusMessage("No booking found to sign waiver.")
      return
    }

    if (!waiverAccepted) {
      setStatusMessage("You must agree to the waiver before signing.")
      return
    }

    try {
      const res = await fetch(`${API}/api/waiver/signed/${bookingId}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Failed to sign waiver.")
        return
      }

      setWaiverStatus("signed")
      setShowWaiver(false)
      setWaiverAccepted(true)

      if (bookingStatus === "approved_unpaid") {
        setStatusMessage("Waiver signed. Your booking is approved and ready for payment.")
      } else {
        setStatusMessage("Waiver signed successfully.")
      }
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error signing waiver.")
    }
  }

  async function handlePay() {
    if (!bookingId) {
      setStatusMessage("No booking found.")
      return
    }

    setPaying(true)
    setStatusMessage("Redirecting to payment...")

    try {
      const res = await fetch(`${API}/api/create-checkout/${bookingId}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Payment failed.")
        setPaying(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      setStatusMessage("Payment link not returned.")
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error during payment.")
    }

    setPaying(false)
  }

  async function refreshBookingStatus() {
    if (!bookingId) {
      setStatusMessage("Enter or load a booking first.")
      return
    }

    try {
      const res = await fetch(`${API}/api/bookings/${bookingId}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Could not refresh booking status.")
        return
      }

      setBookingStatus(data.status || "new")
      setWaiverStatus(data.waiverStatus || "not_started")

      if (data.status === "approved_unpaid" && (data.waiverStatus || "not_started") !== "signed") {
        setShowWaiver(true)
        setStatusMessage("Approved. Please sign the waiver to continue.")
      } else if (data.status === "approved_unpaid") {
        setStatusMessage("Approved. You can now pay.")
      } else if (data.status === "confirmed") {
        setStatusMessage("Booking confirmed.")
      } else if (data.status === "denied") {
        setStatusMessage("Booking was denied.")
      } else {
        setStatusMessage(`Booking status: ${normalizeStatusLabel(data.status || "new")}`)
      }
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error while refreshing booking.")
    }
  }

  useEffect(() => {
    async function loadSuccessBooking() {
      if (path !== "/success") return

      const params = new URLSearchParams(window.location.search)
      const bookingIdFromUrl = params.get("bookingId")

      if (!bookingIdFromUrl) return

      setSuccessLoading(true)

      try {
        const res = await fetch(`${API}/api/bookings/${bookingIdFromUrl}`)
        const data = await res.json().catch(() => null)

        if (res.ok && data) {
          setSuccessBooking(data)
          setBookingStatus(data.status || "new")
          setWaiverStatus(data.waiverStatus || "not_started")
        }
      } catch (error) {
        console.error("Could not load success booking:", error)
      } finally {
        setSuccessLoading(false)
      }
    }

    loadSuccessBooking()
  }, [path])

  const selectedRentalDescription = useMemo(() => {
    switch (rental) {
      case "Jet Ski (Single)":
        return "Single jet ski rental day."
      case "Jet Ski (Double)":
        return "Two jet skis for the day."
      case "Pontoon - 6 Hours":
        return "6-hour pontoon rental."
      case "Pontoon - 8 Hours":
        return "8-hour pontoon rental."
      case "Pontoon - 10 Hours":
        return "10-hour pontoon rental."
      case "Bass Boat - Full Day":
        return "Full-day bass boat rental."
      default:
        return ""
    }
  }, [rental])

  if (path === "/admin") {
    return <AdminPage />
  }

  if (depositRequestBookingId) {
    return <DepositPage />
  }

  if (payRequestBookingId) {
    return <PaymentPage />
  }

  if (path === "/success") {
    return (
      <div style={styles.successPage}>
        <div style={styles.successCard}>
          <h1 style={styles.successTitle}>✅ Payment Successful</h1>
          <p style={styles.successText}>
            Your payment was successful and your booking details are shown below.
          </p>

          {successLoading ? (
            <p style={styles.successText}>Loading booking details...</p>
          ) : successBooking ? (
            <div style={styles.successDetails}>
              <div><strong>Booking ID:</strong> {successBooking.id}</div>
              <div><strong>Rental:</strong> {successBooking.rentalLabel}</div>
              <div><strong>Date:</strong> {successBooking.date}</div>
              <div><strong>Time:</strong> {successBooking.rentalTime || "Not provided"}</div>
              <div><strong>Tow Location:</strong> {successBooking.towLocation}</div>
              <div><strong>Email:</strong> {successBooking.customerEmail || "Not provided"}</div>
              <div><strong>Payment Status:</strong> {normalizeStatusLabel(successBooking.paymentStatus)}</div>
              <div><strong>Status:</strong> {normalizeStatusLabel(successBooking.status)}</div>
            </div>
          ) : (
            <p style={styles.successText}>
              Your payment was processed. Booking details were not available on this page.
            </p>
          )}

          <button style={styles.primaryButton} onClick={() => (window.location.href = "/")}>
            Return Home
          </button>
        </div>
      </div>
    )
  }

  if (path === "/cancel") {
    return (
      <div style={styles.successPage}>
        <div style={styles.successCard}>
          <h1 style={styles.cancelTitle}>❌ Payment Cancelled</h1>
          <p style={styles.successText}>Your checkout was cancelled. No payment was completed.</p>
          <button style={styles.primaryButton} onClick={() => (window.location.href = "/")}>
            Return Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Cleared to Cruise</h1>
            <p style={styles.subtitle}>
              Boat rentals, waiver confirmation, approval workflow, and secure online checkout
            </p>
          </div>
        </div>
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
          <strong style={styles.selectedRentalValue}>{getRentalLabel(rental)}</strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGrid}>
            <label style={styles.label}>
              Rental Date
              <input
                style={styles.input}
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  checkAvailability(e.target.value, rental)
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

      <BookingLookupCard onLoadBooking={loadExistingBookingIntoForm} />

      <footer style={styles.policyFooter}>
        <small style={styles.policyText}>{cancellationPolicyText}</small>
      </footer>
    </div>
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
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/deposit/:id" element={<DepositPage />} />
        <Route path="/pay/:id" element={<PaymentPage />} />
        <Route path="/success" element={<MainApp />} />
        <Route path="/cancel" element={<MainApp />} />
        <Route path="/admin" element={<MainApp />} />
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
    maxWidth: "1200px",
    margin: "0 auto 22px auto",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    color: "#ffffff",
    fontSize: "42px",
    fontWeight: 800,
    letterSpacing: "-0.5px",
  },

  subtitle: {
    marginTop: "8px",
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

  heroImage: {
    width: "100%",
    height: "220px",
    objectFit: "cover",
    display: "block",
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

  heroSelectWrap: {
    marginTop: "auto",
    paddingTop: "4px",
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

  heroDropdownActionWrap: {
    display: "grid",
    gap: "10px",
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

  smallButton: {
    border: "1px solid #d5dee7",
    background: "#ffffff",
    color: "#102030",
    padding: "8px 10px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 700,
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

  cancelTitle: {
    marginTop: 0,
    fontSize: "32px",
    color: "#b42318",
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
  },

  lookupRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    color: "#102030",
    fontSize: "14px",
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

  adminSection: {
    maxWidth: "1200px",
    margin: "0 auto 20px auto",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 16px 36px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
  },

  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "760px",
  },

  actionWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

  adminLoginWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#eef3f7",
  },

  adminLoginCard: {
    width: "100%",
    maxWidth: "520px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "30px",
    boxShadow: "0 16px 36px rgba(14, 34, 53, 0.12)",
    border: "1px solid rgba(15, 23, 32, 0.06)",
  },

  adminLoginTitle: {
    marginTop: 0,
    marginBottom: "8px",
    fontSize: "30px",
    color: "#0f2233",
  },

  adminLoginText: {
    marginTop: 0,
    marginBottom: "20px",
    color: "#627382",
    fontSize: "15px",
    lineHeight: 1.5,
  },

  adminLoginForm: {
    display: "grid",
    gap: "16px",
  },
}