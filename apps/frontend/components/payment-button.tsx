"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

type PaymentButtonProps = {
  onSuccess?: () => void;
};

const AMOUNTS = [100, 500, 1000, 2500, 5000];

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Make sure Razorpay's checkout is actually loaded.
 *
 * The script is requested in the page head with `async`, so it may not have
 * arrived by the time someone clicks — and if an ad blocker or a strict
 * network drops it, it never will. Waiting for it, and loading it again if it
 * is missing, turns "please wait a moment" into either a checkout or an
 * explanation.
 */
function loadRazorpay(timeoutMs = 12000): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser"));
  const w = window as any;
  if (w.Razorpay) return Promise.resolve(w.Razorpay);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const settle = () => {
      if (w.Razorpay) resolve(w.Razorpay);
      else reject(new Error("The payment window could not be loaded. Disable any ad or script blocker for this site and try again."));
    };

    const timer = setTimeout(settle, timeoutMs);
    script.addEventListener("load", () => {
      clearTimeout(timer);
      settle();
    });
    script.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("The payment window was blocked before it could load. Disable any ad or script blocker for this site and try again."));
    });

    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export function PaymentButton({ onSuccess }: PaymentButtonProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [gateway, setGateway] = useState<{ enabled: boolean; mode: string | null } | null>(null);
  const [profile, setProfile] = useState<{ name?: string; email?: string } | null>(null);

  // One key per attempt, so a retry of the same top-up reuses its order
  // instead of leaving a trail of abandoned ones.
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (showModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showModal]);

  // Ask the server whether it can take a payment at all, rather than finding
  // out at the moment of paying.
  useEffect(() => {
    if (!showModal) return;
    let cancelled = false;

    (async () => {
      const apiUrl = getApiUrl();
      try {
        const res = await fetch(`${apiUrl}/api/payments/config`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled) setGateway({ enabled: !!data?.enabled, mode: data?.mode ?? null });
      } catch {
        if (!cancelled) setGateway(null);
      }

      try {
        const res = await fetch(`${apiUrl}/api/user/profile`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.user) setProfile({ name: data.user.name, email: data.user.email });
      } catch {
        /* prefill is a convenience, not a requirement */
      }

      // Warm the checkout up while the amount is being chosen.
      loadRazorpay().catch(() => {
        /* reported when they actually pay */
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [showModal]);

  async function handlePayment() {
    setLoading(true);
    setError("");

    try {
      const apiUrl = getApiUrl();

      // The checkout window first: an order taken against a checkout that
      // cannot open leaves a pending payment nobody can complete.
      const Razorpay = await loadRazorpay();

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `topup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      const orderRes = await fetch(`${apiUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(selectedAmount), idempotencyKey: idempotencyKeyRef.current }),
        credentials: "include"
      });

      let orderData: any = {};
      try {
        orderData = await orderRes.json();
      } catch (e) {
        const text = await orderRes.text();
        throw new Error(`Server returned invalid JSON (${orderRes.status}). ${text.slice(0, 50)}...`);
      }

      if (orderRes.status === 401) {
        router.push("/login");
        return;
      }

      if (!orderRes.ok) {
        throw new Error(orderData.message || `Error ${orderRes.status}: Failed to create payment order`);
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "W.T.A",
        description: "Wallet Refill",
        order_id: orderData.razorpayOrderId,
        handler: async function (response: any) {
          try {
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
              // This top-up is done; a further one starts its own order.
              idempotencyKeyRef.current = null;
              setShowModal(false);
              onSuccess?.();
              // Force a hard refresh to update all server components (balance, history)
              window.location.reload();
            } else {
              const data = await verifyRes.json();
              setError(
                data.message ||
                  "The payment went through but could not be confirmed here. It will be credited automatically — refresh in a moment."
              );
            }
          } catch (err: any) {
            setError(
              "The payment went through but this page could not confirm it. It will be credited automatically — refresh in a moment."
            );
          }
        },
        prefill: {
          name: profile?.name || "",
          email: profile?.email || "",
          contact: ""
        },
        theme: {
          color: "#bb86fc"
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const rzp = new Razorpay(options);

      // Without this, a card that is declined closes the window silently.
      rzp.on("payment.failed", (response: any) => {
        const reason = response?.error?.description || "The payment could not be completed.";
        setError(`${reason} Nothing has been charged — you can try again.`);
        setLoading(false);
      });

      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  const gatewayDown = gateway !== null && !gateway.enabled;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="button btn-glow interactive-scale"
        style={{
          width: "100%",
          padding: "1.25rem",
          fontSize: "1.1rem",
          background: "var(--gradient-primary)",
          boxShadow: "0 10px 20px rgba(139, 92, 246, 0.3)"
        }}
      >
        <span style={{ fontSize: "1.2rem" }}>💳</span> Refill Credits
      </button>

      {showModal && createPortal(
        <div
          className="payment-overlay"
          onClick={() => setShowModal(false)}
          style={{
            zIndex: 100000,
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(3, 0, 20, 0.85)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
        >
          <div
            className="payment-modal-v2 scale-in"
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              overflow: "hidden",
              width: "100%",
              maxWidth: "700px",
              background: "var(--bg-topbar)",
              border: "1px solid var(--glass-border-color-hover)",
              borderRadius: "32px",
              boxShadow: "var(--shadow-lg), var(--shadow-glow)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "90vh"
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid var(--glass-bg-hover)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800 }}>Refill Your Wallet</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.5rem", cursor: "pointer" }}>&times;</button>
            </div>

            <div style={{ padding: "2rem", overflowY: "auto", flex: 1 }}>
              <div className="payment-grid-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "2rem" }}>
                {/* Column 1: Selection */}
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "1px" }}>Select Amount</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {AMOUNTS.map(amt => (
                      <div
                        key={amt}
                        onClick={() => setSelectedAmount(amt)}
                        className={`amount-option ${selectedAmount === amt ? 'selected' : ''}`}
                        style={{
                          padding: "1rem",
                          borderRadius: "12px",
                          border: "1px solid var(--glass-border-color)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s ease",
                          background: selectedAmount === amt ? "var(--accent)" : "rgba(255,255,255,0.03)"
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>₹{amt}</span>
                        {selectedAmount === amt && <span>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 2: Details */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "-0.5rem", textTransform: "uppercase", letterSpacing: "1px" }}>Order Details</div>

                  <div style={{ padding: "1.25rem", background: "rgba(0,0,0,0.2)", borderRadius: "16px", border: "1px solid var(--glass-border-color)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>ORDER TOTAL</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>₹{selectedAmount.toFixed(2)}</div>
                  </div>

                  <div style={{ padding: "1.25rem", background: "rgba(0,242,173,0.05)", borderRadius: "16px", border: "1px solid rgba(0,242,173,0.1)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>CREDITS TO BE ADDED</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green-light)" }}>+{selectedAmount}</div>
                  </div>
                </div>

                {/* Column 3: Summary & Action */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "1px" }}>Summary</div>
                    <div style={{ padding: "1.5rem", background: "var(--bg-inset)", borderRadius: "16px", border: "1px solid var(--glass-border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Base Amount</span>
                        <span>₹{selectedAmount}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.9rem" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Platform Fee</span>
                        <span style={{ color: "var(--green)" }}>FREE</span>
                      </div>
                      <div style={{ height: "1px", background: "var(--glass-bg-hover)", margin: "0.5rem 0 1rem" }}></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                        <span>Final Total</span>
                        <span style={{ color: "var(--accent-light)" }}>₹{selectedAmount}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "2rem" }}>
                    {/* A gateway with no keys cannot take a payment, so say
                        so here rather than at the moment of paying. */}
                    {gatewayDown && (
                      <div style={{
                        padding: "1rem",
                        background: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        borderRadius: "12px",
                        color: "var(--gold)",
                        fontSize: "0.85rem",
                        marginBottom: "1rem",
                        textAlign: "center"
                      }}>
                        Top-ups are unavailable: this site's payment gateway is not configured yet.
                      </div>
                    )}

                    {error && (
                      <div style={{
                        padding: "1rem",
                        background: "rgba(255, 77, 77, 0.1)",
                        border: "1px solid rgba(255, 77, 77, 0.2)",
                        borderRadius: "12px",
                        color: "#ff8080",
                        fontSize: "0.85rem",
                        marginBottom: "1rem",
                        textAlign: "center"
                      }}>
                        {error}
                      </div>
                    )}

                    <button
                      onClick={handlePayment}
                      disabled={loading || gatewayDown}
                      className="button"
                      style={{
                        width: "100%",
                        padding: "1.25rem",
                        fontSize: "1.1rem",
                        background: "var(--gradient-primary)",
                        boxShadow: "0 15px 30px rgba(187, 134, 252, 0.3)",
                        opacity: gatewayDown ? 0.5 : 1,
                        cursor: gatewayDown ? "not-allowed" : undefined
                      }}
                    >
                      {loading ? "Processing..." : `Pay ₹${selectedAmount}`}
                    </button>

                    <div style={{ textAlign: "center", marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", opacity: 0.5 }}>
                      <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>🔒 SECURE</div>
                      <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>⚡ RAZORPAY</div>
                      {gateway?.mode === "test" && (
                        <div style={{ fontSize: "0.7rem", color: "var(--gold)" }}>TEST MODE</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          .payment-grid-layout {
            grid-template-columns: 1fr !important;
            gap: 1.5rem !important;
          }
          .payment-modal-v2 {
            max-width: 95% !important;
            max-height: 95vh !important;
          }
        }
      `}</style>
    </>
  );
}
