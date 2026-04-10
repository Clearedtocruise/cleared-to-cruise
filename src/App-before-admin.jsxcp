import { useEffect, useMemo, useState } from "react"

const API = import.meta.env.VITE_API_URL || "http://localhost:5001"

const rentalOptions = [
  "Jet Ski (Single)",
  "Jet Ski (Double)",
  "Pontoon - 6 Hours",
  "Pontoon - 8 Hours",
  "Pontoon - 10 Hours",
  "Bass Boat - Full Day",
]

const towOptions = ["None", "Castaic", "Pyramid"]

export default function App() {
  const path = window.location.pathname
  const pathParts = path.split("/")
  const depositRequestBookingId =
    pathParts[1] === "deposit" ? pathParts[2] : null

  const [rental, setRental] = useState("Pontoon - 6 Hours")
  const [date, setDate] = useState("")
  const [rentalTime, setRentalTime] = useState("")
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

  useEffect(() => {
    async function loadSuccessBooking() {
      if (path !== "/success") return

      const params = new URLSearchParams(window.location.search)
      const bookingIdFromUrl = params.get("bookingId")

      if (!bookingIdFromUrl) return

      setSuccessLoading(true)

      try {
        const res = await fetch(`${API}/api/bookings/${bookingIdFromUrl}`)
        const data = await res.json()

        if (res.ok) {
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
      setStatusMessage("Please select a requested rental time.")
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

      const availabilityData = await availabilityRes.json()

      if (!availabilityRes.ok) {
        setAvailabilityMessage(
          availabilityData.error || "Could not check availability."
        )
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
      formData.append("waiverAccepted", "true")
      formData.append("customerEmail", email.trim())
      formData.append("photoId", file)

      const bookingRes = await fetch(`${API}/api/bookings/waiver`, {
        method: "POST",
        body: formData,
      })

      const bookingData = await bookingRes.json()

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
        `Request submitted. Booking ID: ${bookingData.bookingId}. Please review and sign the waiver. Your requested rental date and time will be sent for approval.`
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

      const data = await res.json()

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
      const data = await res.json()

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

      const data = await res.json()

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
                const data = await res.json()

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
              <div><strong>Payment Status:</strong> {successBooking.paymentStatus}</div>
              <div><strong>Status:</strong> {successBooking.status}</div>
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
          <p style={styles.successText}>
            Your checkout was cancelled. No payment was completed.
          </p>
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
        <h1 style={styles.title}>Cleared to Cruise</h1>
        <p style={styles.subtitle}>
          Boat rentals, waiver confirmation, approval workflow, and secure online checkout
        </p>
      </header>

      <section style={styles.topGrid}>
        <div style={styles.topCardLarge}>
          <img
            src="/images/castaic-lake.jpg"
            alt="Castaic Lake"
            style={styles.largeImage}
          />
          <div style={styles.imageOverlay}>
            <h2 style={styles.overlayTitle}>Castaic Lake</h2>
            <p style={styles.overlayText}>Tow option available</p>
          </div>
        </div>

        <div style={styles.topCardLarge}>
          <img
            src="/images/pyramid-lake.jpg"
            alt="Pyramid Lake"
            style={styles.largeImage}
          />
          <div style={styles.imageOverlay}>
            <h2 style={styles.overlayTitle}>Pyramid Lake</h2>
            <p style={styles.overlayText}>Tow option available</p>
          </div>
        </div>
      </section>

      <section style={styles.heroGrid}>
        <article style={styles.heroCard}>
          <img
            src="/images/jetski-collage-1.png"
            alt="Jet ski rental"
            style={styles.heroImage}
          />
          <div style={styles.heroContent}>
            <h3 style={styles.heroTitle}>Jet Ski Rentals</h3>
            <p style={styles.heroText}>
              Single or double jet ski options for fun lake days.
            </p>
          </div>
        </article>

        <article style={styles.heroCard}>
          <img
            src="/images/jetski-collage-2.png"
            alt="More jet ski action"
            style={styles.heroImage}
          />
          <div style={styles.heroContent}>
            <h3 style={styles.heroTitle}>More Jet Ski Fun</h3>
            <p style={styles.heroText}>
              Fast, flexible, and exciting rental options.
            </p>
          </div>
        </article>

        <article style={styles.heroCard}>
          <img
            src="/images/suntracker-pontoon.png"
            alt="Pontoon rental"
            style={styles.heroImage}
          />
          <div style={styles.heroContent}>
            <h3 style={styles.heroTitle}>Pontoon Rentals</h3>
            <p style={styles.heroText}>
              Comfortable group cruising with multiple time options.
            </p>
          </div>
        </article>

        <article style={styles.heroCard}>
          <img
            src="/images/bass-boat.webp"
            alt="Bass boat rental"
            style={styles.heroImage}
          />
          <div style={styles.heroContent}>
            <h3 style={styles.heroTitle}>Bass Boat Rentals</h3>
            <p style={styles.heroText}>
              Full-day fishing and performance boating.
            </p>
          </div>
        </article>
      </section>

      <section style={styles.mainCard}>
        <div style={styles.formHeaderRow}>
          <div>
            <h2 style={styles.sectionTitle}>Reserve Your Rental</h2>
            <p style={styles.sectionSubtext}>{selectedRentalDescription}</p>
          </div>
          <div style={styles.badge}>
            {bookingId ? `Booking #${bookingId}` : "New Booking"}
          </div>
        </div>

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Rental Type
            <select
              style={styles.input}
              value={rental}
              onChange={(e) => setRental(e.target.value)}
            >
              {rentalOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

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
            <input
              style={styles.input}
              type="time"
              value={rentalTime}
              onChange={(e) => setRentalTime(e.target.value)}
            />
          </label>

          <label style={styles.label}>
            Tow Location
            <select
              style={styles.input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {towOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
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
        </div>

        {bookingId && showWaiver ? (
          <section style={styles.waiverCard}>
            <h3 style={styles.waiverTitle}>
              Liability Waiver and Electronic Signature Agreement
            </h3>

            <div style={styles.waiverBox}>
              <p>
                I understand that participation in boating, jet ski use, towing,
                loading, launching, docking, swimming, and other water activities
                involves inherent risks, including but not limited to serious bodily
                injury, permanent disability, death, collisions, drowning, falling,
                equipment failure, property damage, and damage to other persons or
                property.
              </p>

              <p>
                I voluntarily choose to participate in this rental activity and I
                accept all risks associated with the use, transport, operation, and
                possession of the rental equipment during my rental period.
              </p>

              <p>
                I agree to operate the boat, jet ski, trailer, and all rental
                equipment in a safe and lawful manner. I accept full responsibility
                for my own safety, the safety of my passengers, and the conduct of
                anyone allowed by me to use or ride in the rental equipment.
              </p>

              <p>
                I agree to release, indemnify, and hold harmless Cleared to Cruise,
                its owners, agents, representatives, and affiliates from claims,
                demands, liabilities, losses, damages, expenses, or causes of action
                arising out of or related to my rental, possession, transportation,
                or use of the rental equipment, except where prohibited by law.
              </p>

              <p>
                I understand and agree that I am financially responsible for any loss
                or damage to the boat, jet ski, trailer, motor, propeller,
                accessories, safety equipment, or any other rental equipment during
                my rental period, regardless of whether caused by me, my passengers,
                or any person using the equipment with my permission.
              </p>

              <p>
                I also agree to be responsible for injury, damage, or loss caused to
                other persons, boats, docks, vehicles, structures, or other property
                arising from my rental or operation of the rental equipment.
              </p>

              <p>
                I confirm that the full legal name I typed on this booking form is my
                electronic signature for this liability waiver and rental agreement.
                I also confirm that the photo identification uploaded with this
                booking belongs to me and that the information I provided is true and
                correct.
              </p>

              <p>
                By checking the agreement box below and signing electronically, I
                acknowledge that I have read this waiver carefully, understand its
                contents, and agree to be legally bound by it.
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
                !waiverAccepted || !name.trim()
                  ? styles.buttonDisabled
                  : styles.secondaryButton
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
            <span style={styles.statusValue}>
              {bookingId || "Not created yet"}
            </span>
          </div>

          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Booking Status</span>
            <span style={styles.statusValue}>{bookingStatus}</span>
          </div>

          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Waiver Status</span>
            <span style={styles.statusValue}>{waiverStatus}</span>
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

        {availabilityMessage ? (
          <div style={styles.successBox}>{availabilityMessage}</div>
        ) : null}

        {statusMessage ? <div style={styles.infoBox}>{statusMessage}</div> : null}
      </section>
    </div>
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
  title: {
    margin: 0,
    color: "#ffffff",
    fontSize: "42px",
    fontWeight: 800,
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
  },
  heroImage: {
    width: "100%",
    height: "220px",
    objectFit: "cover",
    display: "block",
  },
  heroContent: {
    padding: "16px",
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
  mainCard: {
    maxWidth: "1200px",
    margin: "0 auto",
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
  infoBox: {
    marginTop: "14px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#f3f7fb",
    border: "1px solid #d9e5ef",
    color: "#1d3347",
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
}