"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

export function TransferForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    
    setError(null);
    setSuccess(false);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    const payload = {
      recipientId: String(formData.get("recipientId")).trim(),
      amount: String(formData.get("amount")),
    };

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/wallet/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.message || "Transfer failed");
      } else {
        setSuccess(true);
        setError(null);
        formElement.reset();
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      console.error("Transfer error:", err);
      setError("An unexpected error occurred. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="input-group">
        <label>Recipient User ID</label>
        <input type="text" name="recipientId" placeholder="e.g. user_..." required />
      </div>
      <div className="input-group">
        <label>Amount to Send</label>
        <input type="number" name="amount" min="1" placeholder="Amount" required />
      </div>

      {error && (
        <div style={{ color: "var(--red-light)", fontSize: "0.85rem", padding: "0.5rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      {success && !error && (
        <div style={{ color: "var(--green)", fontSize: "0.85rem", padding: "0.5rem", background: "rgba(34, 197, 94, 0.1)", borderRadius: "var(--radius-sm)" }}>
          Transfer successful! 💸
        </div>
      )}


      <button type="submit" className="button" disabled={loading || isPending}>
        {loading || isPending ? "Processing..." : "Send Credits 💸"}
      </button>
    </form>
  );
}

