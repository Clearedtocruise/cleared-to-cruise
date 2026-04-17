import React from "react"

export default function Testimonials({ testimonials = [], approveTestimonial }) {
  if (!testimonials.length) {
    return (
      <div style={{ marginTop: "40px", padding: "20px", background: "#f8f9fa", borderRadius: "12px" }}>
        <h2 style={{ marginTop: 0 }}>Testimonials</h2>
        <p style={{ marginBottom: 0 }}>No testimonials yet.</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: "40px", padding: "20px", background: "#f8f9fa", borderRadius: "12px" }}>
      <h2 style={{ marginTop: 0 }}>Testimonials</h2>

      {testimonials.map((t) => (
        <div
          key={t.id}
          style={{
            border: "1px solid #d9e2ec",
            padding: "16px",
            marginBottom: "14px",
            borderRadius: "10px",
            background: "#ffffff",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 700 }}>
            {t.customerName || t.name || "Customer"}
          </p>

          {t.rentalLabel ? (
            <p style={{ margin: "0 0 8px 0", color: "#5b6b79", fontSize: "14px" }}>
              Rental: {t.rentalLabel}
            </p>
          ) : null}

          <p style={{ margin: "0 0 10px 0", lineHeight: 1.5 }}>
            {t.testimonialText || t.text || ""}
          </p>

          {t.photoUrl ? (
            <img
              src={t.photoUrl}
              alt="Testimonial"
              style={{
                width: "120px",
                height: "auto",
                borderRadius: "8px",
                display: "block",
                marginBottom: "10px",
              }}
            />
          ) : null}

          {!t.isApproved && typeof approveTestimonial === "function" ? (
            <button
              type="button"
              onClick={() => approveTestimonial(t.id)}
              style={{
                marginTop: "8px",
                padding: "8px 12px",
                background: "#157347",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Approve
            </button>
          ) : null}

          {t.isApproved ? (
            <p style={{ margin: "10px 0 0 0", color: "#157347", fontWeight: 700 }}>
              Approved
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}