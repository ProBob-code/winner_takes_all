"use client";

import { useState } from "react";

type PaymentButtonProps = {
  onSuccess?: () => void;
};

const AMOUNTS = [100, 500, 1000, 2500, 5000];

export function PaymentButton({ onSuccess }: PaymentButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePayment() {
    setLoading(true);
    setError("");

    try {
      // Create order
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount }),
      });

      if (!orderRes.ok) {
        throw new Error("Failed to create payment order");
      }

      const orderData = await orderRes.json();

      // Load Razorpay checkout
      const rzp = new (window as any).Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Winner Takes All",
        description: "Wallet Top-up",
        order_id: orderData.razorpayOrderId,
        handler: async function (response: any) {
          // Verify payment
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            if (verifyRes.ok) {
              setShowModal(false);
              onSuccess?.();
            } else {
              setError("Payment verification failed");
            }
          } catch {
            setError("Payment verification failed");
          }
        },
        prefill: {},
        theme: { color: "#6366f1" },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="razorpay-button" onClick={() => setShowModal(true)}>
        💳 Top Up Wallet
      </button>

      {showModal && (
        <div className="payment-overlay" onClick={() => setShowModal(false)}>
          <div className="payment-modal scale-in" onClick={e => e.stopPropagation()}>
            <h3>Add Money to Wallet</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: ".85rem", marginBottom: "1rem" }}>
              Select amount (INR)
            </p>
            <div className="amount-selector">
              {AMOUNTS.map(amt => (
                <button
                  key={amt}
                  className={`amount-option ${selectedAmount === amt ? "selected" : ""}`}
                  onClick={() => setSelectedAmount(amt)}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            {error && (
              <p style={{ color: "var(--red)", fontSize: ".85rem", marginBottom: ".75rem" }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", marginTop: "1.5rem" }}>
              <button className="button-secondary button-sm" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="button" onClick={handlePayment} disabled={loading}>
                {loading ? "Processing..." : `Pay ₹${selectedAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay checkout.js script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />
    </>
  );
}
