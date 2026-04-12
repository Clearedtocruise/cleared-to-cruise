import { useEffect, useMemo, useState } from "react"
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom"

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

function BookingLookupCard() {
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
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AdminPage() {
  const [bookings, setBookings] = useState([])
  const [blockedDates, setBlockedDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [blockDate, setBlockDate] = useState("")
  const [blockReason, setBlockReason] = useState("")
  const [blockRentalLabel, setBlockRentalLabel] = useState("All Rentals")

  async function loadAdminData() {
    setLoading(true)
    setError("")
    setMessage("")

    try {
      const [bookingsRes, blockedRes] = await Promise.all([
        fetch(`${API}/api/admin/bookings`),
        fetch(`${API}/api/admin/blocked-dates`),
      ])

      const bookingsData = await bookingsRes.json().catch(() => [])
      const blockedData = await blockedRes.json().catch(() => [])

      if (!bookingsRes.ok) {
        throw new Error(bookingsData?.error || "Could not load admin bookings.")
      }

      if (!blockedRes.ok) {
        throw new Error(blockedData?.error || "Could not load blocked dates.")
      }

      setBookings(Array.isArray(bookingsData) ? bookingsData : bookingsData.bookings || [])
      setBlockedDates(Array.isArray(blockedData) ? blockedData : blockedData.blockedDates || [])
    } catch (err) {
      console.error(err)
      setError(err.message || "Could not load admin page.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [])

  async function approveBooking(id) {
    setError("")
    setMessage("Approving booking...")

    try {
      const res = await fetch(`${API}/api/admin/approve/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not approve booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} approved.`)
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while approving booking.")
      setMessage("")
    }
  }

  async function denyBooking(id) {
    setError("")
    setMessage("Denying booking...")

    try {
      const res = await fetch(`${API}/api/admin/deny/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not deny booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} denied.`)
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while denying booking.")
      setMessage("")
    }
  }

  async function markConfirmed(id) {
    setError("")
    setMessage("Marking booking confirmed...")

    try {
      const res = await fetch(`${API}/api/admin/bookings/${id}/confirm`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not confirm booking.")
        setMessage("")
        return
      }

      setMessage(`Booking ${id} marked confirmed.`)
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while confirming booking.")
      setMessage("")
    }
  }

  async function sendDepositLink(id) {
    setError("")
    setMessage("Creating deposit link...")

    try {
      const res = await fetch(`${API}/api/admin/deposit-link/${id}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not create deposit link.")
        setMessage("")
        return
      }

      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer")
      }

      setMessage(`Deposit link created for booking ${id}.`)
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while creating deposit link.")
      setMessage("")
    }
  }

  async function createBlockedDate() {
    if (!blockDate) {
      setError("Please choose a date to block.")
      setMessage("")
      return
    }

    setError("")
    setMessage("Blocking date...")

    try {
      const res = await fetch(`${API}/api/admin/block-date`, {
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
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while blocking date.")
      setMessage("")
    }
  }

  async function removeBlockedDate(id) {
    setError("")
    setMessage("Removing blocked date...")

    try {
      const res = await fetch(`${API}/api/admin/block-date/${id}`, {
        method: "DELETE",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Could not remove blocked date.")
        setMessage("")
        return
      }

      setMessage("Blocked date removed.")
      loadAdminData()
    } catch (err) {
      console.error(err)
      setError("Server error while removing blocked date.")
      setMessage("")
    }
  }

  return (
    <div style={styles.adminPage}>
      <div style={styles.adminShell}>
        <div style={styles.adminTopBar}>
          <div>
            <h1 style={styles.adminTitle}>Cleared to Cruise Admin</h1>
            <p style={styles.adminSubtitle}>
              Approve or deny bookings, review waivers, and block dates for weather or maintenance.
            </p>
          </div>

          <div style={styles.adminTopButtons}>
            <button type="button" style={styles.secondaryButton} onClick={loadAdminData}>
              Refresh Admin
            </button>

            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => {
                window.location.href = "/"
              }}
            >
              Return to Site
            </button>
          </div>
        </div>

        {message ? <div style={styles.successBox}>{message}</div> : null}
        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <section style={styles.adminSection}>
          <div style={styles.adminSectionHeader}>
            <div>
              <h2 style={styles.adminSectionTitle}>Block a Date</h2>
              <p style={styles.adminSectionText}>
                Use this for maintenance, bad weather, or manual blackout dates.
              </p>
            </div>
          </div>

          <div style={styles.adminBlockGrid}>
            <label style={styles.label}>
              Date
              <input
                type="date"
                style={styles.input}
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
                <option>All Rentals</option>
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
                type="text"
                style={styles.input}
                placeholder="Maintenance, weather, unavailable, etc."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </label>

            <div style={styles.adminBlockAction}>
              <button type="button" style={styles.primaryButton} onClick={createBlockedDate}>
                Block Date
              </button>
            </div>
          </div>
        </section>

        <section style={styles.adminSection}>
          <div style={styles.adminSectionHeader}>
            <div>
              <h2 style={styles.adminSectionTitle}>Blocked Dates</h2>
              <p style={styles.adminSectionText}>Current manual blocks in the system.</p>
            </div>
          </div>

          {loading ? (
            <div style={styles.infoBox}>Loading blocked dates...</div>
          ) : blockedDates.length === 0 ? (
            <div style={styles.infoBox}>No blocked dates found.</div>
          ) : (
            <div style={styles.adminList}>
              {blockedDates.map((item) => (
                <div key={item.id} style={styles.adminListCard}>
                  <div style={styles.adminListMain}>
                    <div style={styles.adminListTitle}>{item.date}</div>
                    <div style={styles.adminListMeta}>{item.rentalLabel || "All Rentals"}</div>
                    <div style={styles.adminListReason}>{item.reason || "No reason entered"}</div>
                  </div>

                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={() => removeBlockedDate(item.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.adminSection}>
          <div style={styles.adminSectionHeader}>
            <div>
              <h2 style={styles.adminSectionTitle}>Bookings</h2>
              <p style={styles.adminSectionText}>
                Review requests, waiver status, payment status, and deposit actions.
              </p>
            </div>
          </div>

          {loading ? (
            <div style={styles.infoBox}>Loading bookings...</div>
          ) : bookings.length === 0 ? (
            <div style={styles.infoBox}>No bookings found.</div>
          ) : (
            <div style={styles.bookingTableWrap}>
              <table style={styles.bookingTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>Booking ID</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Rental</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Time</th>
                    <th style={styles.th}>Tow</th>
                    <th style={styles.th}>Waiver</th>
                    <th style={styles.th}>Payment</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} style={styles.tr}>
                      <td style={styles.td}>{booking.id}</td>
                      <td style={styles.td}>
                        <div style={styles.customerCell}>
                          <strong>{booking.waiverPrintedName || "No name"}</strong>
                          <span>{booking.customerEmail || "No email"}</span>
                        </div>
                      </td>
                      <td style={styles.td}>{booking.rentalLabel || "—"}</td>
                      <td style={styles.td}>{formatDate(booking.date)}</td>
                      <td style={styles.td}>{booking.rentalTime || "—"}</td>
                      <td style={styles.td}>{booking.towLocation || "None"}</td>
                      <td style={styles.td}>
                        <span style={statusPillStyle(booking.waiverStatus || "not_started")}>
                          {normalizeStatusLabel(booking.waiverStatus || "not_started")}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={statusPillStyle(booking.paymentStatus || "unpaid")}>
                          {normalizeStatusLabel(booking.paymentStatus || "unpaid")}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={statusPillStyle(booking.status || "new")}>
                          {normalizeStatusLabel(booking.status || "new")}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionsCell}>
                          <button
                            type="button"
                            style={styles.smallApproveButton}
                            onClick={() => approveBooking(booking.id)}
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            style={styles.smallDenyButton}
                            onClick={() => denyBooking(booking.id)}
                          >
                            Deny
                          </button>

                          <button
                            type="button"
                            style={styles.smallNeutralButton}
                            onClick={() => markConfirmed(booking.id)}
                          >
                            Confirm
                          </button>

                          <button
                            type="button"
                            style={styles.smallNeutralButton}
                            onClick={() => sendDepositLink(booking.id)}
                          >
                            Deposit Link
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

  async function reserveSpotAndContinue() {
    if (!date) {
      setAvailabilityMessage("Please choose a rental date.")
      setStatusMessage("")
      return
    }

    if (!rentalTime) {
      setStatusMessage("Please choose a requested rental time.")
      setAvailabilityMessage("")
      return
    }

    if (!email.trim()) {
      setStatusMessage("Please enter your email address.")
      setAvailabilityMessage("")
      return
    }

    if (!name.trim()) {
      setStatusMessage("Please enter your full legal name for the waiver.")
      setAvailabilityMessage("")
      return
    }

    if (!file) {
      setStatusMessage("Please upload a photo ID before continuing.")
      setAvailabilityMessage("")
      return
    }

    setLoading(true)
    setAvailabilityMessage("")
    setStatusMessage("")

    try {
      const availabilityRes = await fetch(
        `${API}/api/availability?rentalLabel=${encodeURIComponent(rental)}&date=${encodeURIComponent(date)}`
      )

      const availabilityData = await availabilityRes.json().catch(() => ({}))

      if (!availabilityRes.ok) {
        setAvailabilityMessage(availabilityData.error || "Could not check availability.")
        return
      }

      if (!availabilityData.available) {
        setAvailabilityMessage("That rental is not available for the selected date.")
        return
      }

      setAvailabilityMessage("Date is available. Saving your request...")

      const formData = new FormData()
      formData.append("rentalLabel", rental)
      formData.append("date", date)
      formData.append("rentalTime", rentalTime)
      formData.append("towLocation", location)
      formData.append("waiverPrintedName", name.trim())
      formData.append("waiverAccepted", "false")
      formData.append("customerEmail", email.trim())
      formData.append("photoId", file)

      const bookingRes = await fetch(`${API}/api/bookings/waiver`, {
        method: "POST",
        body: formData,
      })

      const bookingData = await bookingRes.json().catch(() => ({}))

      if (!bookingRes.ok) {
        setStatusMessage(bookingData.error || "Could not save booking request.")
        return
      }

      setBookingId(bookingData.bookingId)
      setBookingStatus("pending_approval")
      setWaiverStatus("not_started")
      setShowWaiver(true)
      setWaiverAccepted(false)
      setStatusMessage(
        `Request submitted. Booking ID: ${bookingData.bookingId}. Please review and sign the waiver.`
      )
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error while saving booking request.")
    } finally {
      setLoading(false)
    }
  }

  async function signWaiver() {
    if (!bookingId) {
      setStatusMessage("Please reserve the booking first.")
      return
    }

    if (!name.trim()) {
      setStatusMessage("Please enter your full legal name.")
      return
    }

    if (!waiverAccepted) {
      setStatusMessage("You must agree to the liability waiver before signing.")
      return
    }

    setStatusMessage("Signing waiver...")

    try {
      const res = await fetch(`${API}/api/waiver/signed/${bookingId}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Could not mark waiver as signed.")
        return
      }

      setWaiverStatus("signed")
      setShowWaiver(false)
      setStatusMessage(
        "Waiver signed successfully. Your request is pending approval. Once approved, payment can be completed."
      )
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error while signing waiver.")
    }
  }

  async function refreshBookingStatus() {
    if (!bookingId) {
      setStatusMessage("No booking found yet.")
      return
    }

    setStatusMessage("Checking booking approval status...")

    try {
      const res = await fetch(`${API}/api/bookings/${bookingId}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Could not check booking status.")
        return
      }

      setBookingStatus(data.status || "new")
      setWaiverStatus(data.waiverStatus || "not_started")

      if (data.status === "approved_unpaid") {
        setStatusMessage("Your rental request has been approved. You can now complete payment.")
      } else if (data.status === "pending_approval") {
        setStatusMessage("Your rental request is still pending approval.")
      } else if (data.status === "confirmed") {
        setStatusMessage("Your booking is already confirmed.")
      } else if (data.status === "denied") {
        setStatusMessage("Your requested rental was not approved.")
      } else {
        setStatusMessage(`Current booking status: ${data.status}`)
      }
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error while checking booking status.")
    }
  }

  async function payNow() {
    if (!bookingId) {
      setStatusMessage("No booking found yet.")
      return
    }

    if (waiverStatus !== "signed") {
      setStatusMessage("Waiver must be signed before payment.")
      return
    }

    if (bookingStatus !== "approved_unpaid") {
      setStatusMessage("Booking must be approved before payment.")
      return
    }

    setPaying(true)
    setStatusMessage("Creating secure checkout session...")

    try {
      const res = await fetch(`${API}/api/create-checkout/${bookingId}`, {
        method: "POST",
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setStatusMessage(data.error || "Could not create checkout session.")
        return
      }

      if (!data.url) {
        setStatusMessage("Checkout link was not returned.")
        return
      }

      window.location.href = data.url
    } catch (error) {
      console.error(error)
      setStatusMessage("Server error while creating checkout session.")
    } finally {
      setPaying(false)
    }
  }

  if (path === "/admin") {
    return <AdminPage />
  }

  if (depositRequestBookingId) {
    return (
      <div style={styles.successPage}>
        <div style={styles.successCard}>
          <h1 style={styles.successTitle}>Security Deposit Authorization</h1>
          <p style={styles.successText}>
            Please securely authorize your $500 security deposit hold using the button below.
          </p>
          <p style={styles.successText}>
            This is a hold for damage protection, not the rental charge itself.
          </p>
          <button
            style={styles.primaryButton}
            onClick={async () => {
              try {
                const res = await fetch(`${API}/api/deposit/${depositRequestBookingId}`, {
                  method: "POST",
                })
                const data = await res.json().catch(() => ({}))

                if (res.ok && data.url) {
                  window.location.href = data.url
                } else {
                  alert(data.error || "Could not open deposit authorization.")
                }
              } catch (error) {
                console.error(error)
                alert("Server error opening deposit authorization.")
              }
            }}
          >
            Authorize $500 Deposit
          </button>
        </div>
      </div>
    )
  }

  if (payRequestBookingId) {
    return (
      <div style={styles.successPage}>
        <div style={styles.successCard}>
          <h1 style={styles.successTitle}>Complete Your Payment</h1>
          <p style={styles.successText}>
            Your booking has been approved. Click below to open secure checkout.
          </p>

          <button
            style={styles.primaryButton}
            onClick={async () => {
              try {
                const res = await fetch(`${API}/api/create-checkout/${payRequestBookingId}`, {
                  method: "POST",
                })
                const data = await res.json().catch(() => ({}))

                if (res.ok && data.url) {
                  window.location.href = data.url
                } else {
                  alert(data.error || "Could not create checkout session.")
                }
              } catch (error) {
                console.error(error)
                alert("Server error while creating checkout.")
              }
            }}
          >
            Pay Rental Now
          </button>
        </div>
      </div>
    )
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
              <div>
                <strong>Booking ID:</strong> {successBooking.id}
              </div>
              <div>
                <strong>Rental:</strong> {successBooking.rentalLabel}
              </div>
              <div>
                <strong>Date:</strong> {successBooking.date}
              </div>
              <div>
                <strong>Time:</strong> {successBooking.rentalTime || "Not provided"}
              </div>
              <div>
                <strong>Tow Location:</strong> {successBooking.towLocation}
              </div>
              <div>
                <strong>Email:</strong> {successBooking.customerEmail || "Not provided"}
              </div>
              <div>
                <strong>Payment Status:</strong>{" "}
                {normalizeStatusLabel(successBooking.paymentStatus)}
              </div>
              <div>
                <strong>Status:</strong> {normalizeStatusLabel(successBooking.status)}
              </div>
            </div>
          ) : (
            <p style={styles.successText}>
              Your payment was processed. Booking details were not available on this page.
            </p>
          )}

          <button
            style={styles.primaryButton}
            onClick={() => {
              window.location.href = "/"
            }}
          >
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
          <button
            style={styles.primaryButton}
            onClick={() => {
              window.location.href = "/"
            }}
          >
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

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Rental Date
            <input
              style={styles.input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
              {file ? `Selected: ${file.name}` : "No file selected yet"}
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
            type="button"
            style={loading ? styles.buttonDisabled : styles.primaryButton}
            onClick={reserveSpotAndContinue}
            disabled={loading}
          >
            {loading ? "Checking..." : "Submit Request"}
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
            onClick={payNow}
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
              style={
                !waiverAccepted || !name.trim() ? styles.buttonDisabled : styles.secondaryButton
              }
              onClick={signWaiver}
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

      <BookingLookupCard />
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