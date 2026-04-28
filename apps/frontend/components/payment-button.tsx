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
        body: JSON.stringify({ amount: Number(selectedAmount) }),
        credentials: "include"
      });

      let orderData: any = {};
      try {
        orderData = await orderRes.json();
      } catch (e) {
        const text = await orderRes.text();
        throw new Error(`Server returned invalid JSON (${orderRes.status}). ${text.slice(0, 50)}...`);
      }

      if (!orderRes.ok) {
        throw new Error(orderData.message || `Error ${orderRes.status}: Failed to create payment order`);
      }

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

      if (!(window as any).Razorpay) {
        throw new Error("Payment gateway is still loading. Please wait a moment and try again.");
      }

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
          zIndex: 10000,
        }}>
          <div className="payment-modal-v2 scale-in" onClick={e => e.stopPropagation()} style={{ 
            position: "relative", 
            width: "100%",
            maxWidth: "480px",
            padding: "2rem",
            background: "var(--bg-topbar)",
            border: "1px solid var(--glass-border-color-hover)",
            borderRadius: "28px",
            boxShadow: "var(--shadow-lg), var(--shadow-glow)",
          }}>
            {/* Background Glow */}
            <div style={{ position: "absolute", top: "-100px", right: "-100px", width: "250px", height: "250px", background: "var(--accent)", filter: "blur(100px)", opacity: 0.1, zIndex: 0 }}></div>
            
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 900 }}>Refill Credits</h3>
                <button 
                  onClick={() => setShowModal(false)}
                  style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "var(--text-muted)", cursor: "pointer", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1.5rem" }}>Boost your balance to join high-stakes tournaments</p>
              
              <div className="amount-selector" style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1rem", 
                marginBottom: "1.5rem"
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
                      gap: "0.4rem",
                      borderRadius: "16px",
                      position: "relative",
                      transition: "all 0.2s ease",
                      background: selectedAmount === amt ? "rgba(187, 134, 252, 0.1)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${selectedAmount === amt ? "var(--accent)" : "rgba(255, 255, 255, 0.08)"}`,
                      transform: selectedAmount === amt ? "scale(1.05)" : "scale(1)"
                    }}
                    onClick={() => setSelectedAmount(amt)}
                  >
                    {amt === 1000 && (
                      <div style={{ 
                        position: "absolute", 
                        top: "-8px", 
                        background: "var(--gold)", 
                        color: "#000", 
                        fontSize: "0.5rem", 
                        fontWeight: 900, 
                        padding: "1px 6px", 
                        borderRadius: "6px",
                        boxShadow: "0 2px 8px rgba(255, 183, 0, 0.3)"
                      }}>
                        BEST VALUE
                      </div>
                    )}
                    <span style={{ fontSize: "1.25rem" }}>
                      {amt < 500 ? "🥉" : amt < 2500 ? "🥈" : "🥇"}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: "1rem" }}>₹{amt}</span>
                  </div>
                ))}
              </div>

              <div style={{ 
                background: "rgba(187, 134, 252, 0.05)", 
                padding: "1.25rem", 
                borderRadius: "16px",
                border: "1px dashed rgba(187, 134, 252, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem"
              }}>
                <div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent-light)", textTransform: "uppercase", letterSpacing: "1px" }}>Order Total</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 900 }}>₹{selectedAmount}.00</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Credits to be added</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--green-light)" }}>+{selectedAmount}</div>
                </div>
              </div>

              {error && (
                <div style={{ 
                  color: "#ff4d4d", 
                  fontSize: "0.85rem", 
                  marginBottom: "1.5rem", 
                  background: "rgba(255, 77, 77, 0.1)",
                  padding: "0.75rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 77, 77, 0.2)",
                  textAlign: "center"
                }}>
                  {error}
                </div>
              )}

              <button 
                className="button" 
                style={{ 
                  width: "100%", 
                  padding: "1.1rem", 
                  fontSize: "1rem",
                  borderRadius: "16px",
                  fontWeight: 900,
                  boxShadow: "0 8px 24px rgba(187, 134, 252, 0.3)",
                  marginBottom: "1rem"
                }} 
                onClick={handlePayment} 
                disabled={loading}
              >
                {loading ? "Processing..." : `Checkout Now`}
              </button>
              
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", opacity: 0.4 }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                   <span style={{ fontSize: "0.8rem" }}>🔒</span>
                   <span style={{ fontSize: "0.6rem", fontWeight: 700 }}>SECURE</span>
                 </div>
                 <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.2)" }}></div>
                 <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                   <img src="https://razorpay.com/assets/razorpay-glyph.svg" width="14" alt="Razorpay" />
                   <span style={{ fontSize: "0.6rem", fontWeight: 700 }}>RAZORPAY</span>
                 </div>
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
