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
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button className="razorpay-button btn-glow interactive-scale" style={{ 
          background: "var(--accent)", 
          color: "white", 
          padding: "1rem 2.5rem", 
          borderRadius: "12px", 
          border: "none", 
          fontWeight: 700, 
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          boxShadow: "0 10px 20px rgba(139, 92, 246, 0.3)",
          transition: "all 0.3s ease"
        }} onClick={() => setShowModal(true)}>
          <span style={{ fontSize: "1.2rem" }}>💳</span> Add Credits
        </button>
      </div>

      {showModal && (
        <div className="payment-overlay" onClick={() => setShowModal(false)} style={{ 
          backdropFilter: "blur(12px)", 
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="payment-modal-v2 scale-in" onClick={e => e.stopPropagation()} style={{ 
            position: "relative", 
            overflow: "hidden", 
            width: "100%",
            maxWidth: "440px",
            padding: "2rem"
          }}>
            {/* Subtle Gradient Glow */}
            <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "200px", height: "200px", background: "var(--accent)", filter: "blur(80px)", opacity: 0.15, zIndex: 0 }}></div>
            
            <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Top Up Credits</h3>
                <button 
                  onClick={() => setShowModal(false)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.5rem" }}
                >
                  ×
                </button>
              </div>
              
              <div className="amount-selector" style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem", 
                marginBottom: "2rem"
              }}>
                {AMOUNTS.map(amt => (
                  <div
                    key={amt}
                    style={{ 
                      padding: "1rem 0.5rem", 
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.25rem"
                    }}
                    className={`value-chip ${selectedAmount === amt ? "selected" : ""}`}
                    onClick={() => setSelectedAmount(amt)}
                  >
                    {amt === 1000 && <span className="best-value-tag" style={{ fontSize: "0.5rem", top: "-6px", right: "-6px" }}>POPULAR</span>}
                    <span style={{ fontSize: "1.1rem" }}>
                      {amt < 500 ? "🥉" : amt < 2500 ? "🥈" : "🥇"}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>₹{amt}</span>
                    <span style={{ fontSize: "0.55rem", opacity: 0.5, fontWeight: 600 }}>CREDITS</span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ 
                  color: "#ef4444", 
                  fontSize: "0.8rem", 
                  marginBottom: "1.5rem", 
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(239, 68, 68, 0.2)"
                }}>
                  {error}
                </div>
              )}

              <div style={{ 
                marginTop: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem"
              }}>
                <button 
                  className="button btn-glow" 
                  style={{ 
                    width: "100%", 
                    padding: "1.1rem", 
                    fontSize: "1rem",
                    borderRadius: "14px",
                    textTransform: "uppercase",
                    letterSpacing: "1px"
                  }} 
                  onClick={handlePayment} 
                  disabled={loading}
                >
                  {loading ? "Initializing..." : `CONFIRM & PAY ₹${selectedAmount}`}
                </button>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Instant activation upon successful payment.
                </p>
              </div>
              
              <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: 0.5 }}>
                 <img src="https://razorpay.com/assets/razorpay-glyph.svg" width="16" alt="Secure" />
                 <span style={{ fontSize: "0.65rem", fontWeight: 600 }}>SECURED BY RAZORPAY</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Razorpay checkout.js script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />
    </>
  );
}
