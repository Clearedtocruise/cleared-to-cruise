import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Elements stripe={stripePromise}>
      <>
        <h1 style={{ color: "red", fontSize: "40px" }}>LIVE TEST 999</h1>
        <App />
      </>
    </Elements>
  </React.StrictMode>
)