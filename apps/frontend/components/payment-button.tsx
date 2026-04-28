"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

type PaymentButtonProps = {
  onSuccess?: () => void;
};

const AMOUNTS = [100, 500, 1000, 2500, 5000];

export function PaymentButton({ onSuccess }: PaymentButtonProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePayment() {
    setLoading(true);
    setError("");

    try {
      const apiUrl = getApiUrl();
      console.log("Creating payment order at:", `${apiUrl}/api/payments/create-order`);
      
      // Create order
      const orderRes = await fetch(`${apiUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount }),
        credentials: "include"
      });

      if (!orderRes.ok) {
        throw new Error("Failed to create payment order");
      }

      const orderData = await orderRes.json();

      // Load Razorpay checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Winner Takes All",
        description: "Tournament Entry",
        order_id: orderData.razorpayOrderId,
        handler: async function (response: any) {
          // Verify payment
          try {
            const apiUrl = getApiUrl();
            const verifyRes = await fetch(`${apiUrl}/api/payments/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
              credentials: "include"
            });

            if (verifyRes.ok) {
              setShowModal(false);
              router.refresh();
              onSuccess?.();
            } else {
              setError("Payment verification failed");
            }
          } catch {
            setError("Payment verification failed");
          }
        },
        prefill: {
          name: "Test User",
          email: "test@example.com",
          contact: "9999999999"
        },
        notes: {
          source: "tournament_test"
        },
        theme: {
          color: "#6366f1"
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: "UPI / QR",
                instruments: [
                  {
                    method: "upi",
                  },
                ],
              },
            },
            sequence: ["block.upi"],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const rzp = new (window as any).Razorpay(options);
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
          zIndex: 2500,
          display: "flex",
          justifyContent: "center",
          padding: "1.5rem"
        }}>
          <div className="payment-modal-v2 scale-in" onClick={e => e.stopPropagation()} style={{ 
            position: "relative", 
            overflow: "hidden", 
            width: "100%",
            maxWidth: "500px",
            padding: "2.5rem",
            background: "var(--bg-topbar)",
            border: "1px solid var(--glass-border-color-hover)",
            borderRadius: "32px",
            boxShadow: "var(--shadow-lg), var(--shadow-glow)"
          }}>
            {/* Subtle Gradient Glow */}
            <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "300px", height: "300px", background: "var(--accent)", filter: "blur(120px)", opacity: 0.1, zIndex: 0 }}></div>
            
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-primary)" }}>Refill Credits</h3>
                  <p className="muted" style={{ fontSize: "0.85rem" }}>Select an amount to top up your wallet</p>
                </div>
                <button 
                  onClick={() => setShowModal(false)}
                  style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </div>
              
              <div className="amount-selector" style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "1rem", 
                marginBottom: "2.5rem"
              }}>
                {AMOUNTS.map(amt => (
                  <div
                    key={amt}
                    style={{ 
                      padding: "1.5rem 1rem", 
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem",
                      borderRadius: "20px",
                      position: "relative",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      background: selectedAmount === amt ? "rgba(187, 134, 252, 0.15)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${selectedAmount === amt ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"}`,
                      boxShadow: selectedAmount === amt ? "0 8px 24px rgba(187, 134, 252, 0.2)" : "none"
                    }}
                    onClick={() => setSelectedAmount(amt)}
                  >
                    {amt === 1000 && (
                      <span style={{ 
                        position: "absolute", 
                        top: "-10px", 
                        right: "10px", 
                        background: "var(--gradient-gold)", 
                        color: "#000", 
                        fontSize: "0.6rem", 
                        fontWeight: 900, 
                        padding: "2px 8px", 
                        borderRadius: "10px",
                        boxShadow: "0 4px 10px rgba(255, 183, 0, 0.3)"
                      }}>
                        BEST VALUE
                      </span>
                    )}
                    <span style={{ fontSize: "1.5rem" }}>
                      {amt < 500 ? "🥉" : amt < 2500 ? "🥈" : "🥇"}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--text-primary)" }}>₹{amt}</span>
                    <span style={{ fontSize: "0.65rem", opacity: 0.6, fontWeight: 700, letterSpacing: "1px" }}>CREDITS</span>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ 
                  color: "#ff4d4d", 
                  fontSize: "0.9rem", 
                  marginBottom: "1.5rem", 
                  background: "rgba(255, 77, 77, 0.08)",
                  padding: "1rem",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 77, 77, 0.2)",
                  textAlign: "center",
                  fontWeight: 600
                }}>
                  {error}
                </div>
              )}

              <div style={{ 
                marginTop: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem"
              }}>
                <button 
                  className="button" 
                  style={{ 
                    width: "100%", 
                    padding: "1.25rem", 
                    fontSize: "1.1rem",
                    borderRadius: "18px",
                    fontWeight: 800,
                    boxShadow: "0 10px 30px rgba(187, 134, 252, 0.3)"
                  }} 
                  onClick={handlePayment} 
                  disabled={loading}
                >
                  {loading ? "Processing..." : `Confirm & Pay ₹${selectedAmount}`}
                </button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: 0.6 }}>
                  <span style={{ fontSize: "0.8rem" }}>🔒</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Secure 256-bit SSL encrypted payment</span>
                </div>
              </div>
              
              <div style={{ marginTop: "2.5rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", opacity: 0.4 }}>
                 <img src="https://razorpay.com/assets/razorpay-glyph.svg" width="20" alt="Razorpay" />
                 <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1px" }}>POWERED BY RAZORPAY</span>
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
