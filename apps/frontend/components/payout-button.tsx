"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { backendFetch } from "@/lib/backend";
import { formatMoney } from "@/lib/format";

type Money = { amount: string; currency: string };

type PayoutButtonProps = {
  /** Everything except bonus credit — the most that can actually be cashed out. */
  withdrawable: Money;
  /** Given, not earned; spendable on entry fees but never payable as cash. */
  bonus: Money;
  feePercent: number;
  onRequested?: () => void;
};

const rupees = (m: Money | undefined) => Number(m?.amount ?? 0);

export function PayoutButton({ withdrawable, bonus, feePercent, onRequested }: PayoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ net: Money; fee: Money } | null>(null);

  const available = rupees(withdrawable);
  const bonusHeld = rupees(bonus);
  const entered = Number(amount);
  const valid = Number.isFinite(entered) && entered >= 100 && entered <= available;

  // Quoted before they confirm, not discovered afterwards. Mirrors the
  // round-up the API applies so the two can never disagree.
  const feeRupees = valid ? Math.ceil(entered * feePercent) / 100 : 0;
  const netRupees = valid ? entered - feeRupees : 0;

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const res = await backendFetch("/wallet/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: entered, destination: destination.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message || "The payout could not be requested.");
      setDone({ net: data.payout.net, fee: data.payout.fee });
      onRequested?.();
    } catch (err: any) {
      setError(err?.message || "The payout could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setDone(null);
    setError("");
    setAmount("");
    setDestination("");
  }

  const disabled = available < 100;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="button-secondary"
        title={disabled ? "You need at least ₹100 of withdrawable balance." : "Withdraw to UPI or bank"}
        style={{ width: "100%", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        Request Payout
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(3, 2, 10, 0.75)",
              backdropFilter: "blur(6px)",
              zIndex: 6000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="panel"
              style={{
                width: "100%",
                maxWidth: "440px",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "clamp(1.25rem, 5vw, 2rem)",
                borderRadius: "clamp(18px, 4vw, 26px)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                <h3 style={{ margin: 0, fontSize: "clamp(1.1rem, 4.5vw, 1.4rem)" }}>
                  {done ? "Payout requested" : "Withdraw Credits"}
                </h3>
                <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}>
                  ×
                </button>
              </div>

              {done ? (
                <div>
                  <p style={{ marginTop: 0 }}>
                    {formatMoney(done.net)} is on its way to <strong style={{ overflowWrap: "anywhere" }}>{destination}</strong>.
                  </p>
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    A {feePercent}% handling charge of {formatMoney(done.fee)} was deducted. The amount has already left your
                    balance and is awaiting approval — if it is declined, every rupee goes back.
                  </p>
                  <button className="button" onClick={close} style={{ width: "100%", marginTop: "1rem" }}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "14px", padding: "1rem", marginBottom: "1.25rem" }}>
                    <div className="muted" style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1px" }}>AVAILABLE TO WITHDRAW</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--green-light)" }}>{formatMoney(withdrawable)}</div>
                    {bonusHeld > 0 && (
                      <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
                        {formatMoney(bonus)} of your balance is game bonus. It can be played with, but it cannot be cashed out.
                      </div>
                    )}
                  </div>

                  <label style={{ display: "block", marginBottom: "1rem" }}>
                    <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "1px" }}>AMOUNT (₹)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={100}
                      max={available}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Minimum ₹100"
                      className="premium-input-v2"
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>

                  <label style={{ display: "block", marginBottom: "1rem" }}>
                    <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "1px" }}>UPI ID OR ACCOUNT</span>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="name@bank"
                      className="premium-input-v2"
                      style={{ width: "100%", marginTop: "0.35rem" }}
                    />
                  </label>

                  {/* Shown before they commit: a deduction nobody explained is
                      how disputes start. */}
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "14px", padding: "1rem", marginBottom: "1.25rem", fontSize: "0.88rem" }}>
                    <Row label="You withdraw" value={`₹${(valid ? entered : 0).toFixed(2)}`} />
                    <Row label={`Handling charge (${feePercent}%)`} value={`− ₹${feeRupees.toFixed(2)}`} muted />
                    <div style={{ height: 1, background: "var(--glass-bg-hover)", margin: "0.65rem 0" }} />
                    <Row label="You receive" value={`₹${netRupees.toFixed(2)}`} strong />
                  </div>

                  {amount !== "" && !valid && (
                    <p style={{ color: "#ff8080", fontSize: "0.82rem", marginTop: 0 }}>
                      {entered < 100
                        ? "The minimum withdrawal is ₹100."
                        : `That is more than the ${formatMoney(withdrawable)} available to withdraw.`}
                    </p>
                  )}

                  {error && (
                    <div style={{ padding: "0.9rem", background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: "12px", color: "#ff8080", fontSize: "0.85rem", marginBottom: "1rem" }}>
                      {error}
                    </div>
                  )}

                  <button
                    className="button"
                    onClick={submit}
                    disabled={busy || !valid || destination.trim().length < 3}
                    style={{
                      width: "100%",
                      padding: "1.1rem",
                      background: "var(--gradient-primary)",
                      opacity: busy || !valid || destination.trim().length < 3 ? 0.5 : 1,
                    }}
                  >
                    {busy ? "Requesting…" : `Withdraw ₹${netRupees.toFixed(2)}`}
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.4rem", fontWeight: strong ? 800 : 400 }}>
      <span style={{ color: muted ? "var(--text-muted)" : undefined }}>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
