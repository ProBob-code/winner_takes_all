/** Razorpay payment helpers — uses fetch (no SDK needed on Workers). */

import { hmacSha256, hmacSha256Bytes } from "./crypto";

export async function createRazorpayOrder(
  keyId: string, keySecret: string,
  amountPaise: number, currency = "INR", notes?: Record<string, string>
): Promise<any> {
  const body: any = { amount: amountPaise, currency, payment_capture: 1 };
  if (notes) body.notes = notes;

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${keyId}:${keySecret}`),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order creation failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function verifyPaymentSignature(
  keySecret: string, orderId: string, paymentId: string, signature: string
): Promise<boolean> {
  const expected = await hmacSha256(keySecret, `${orderId}|${paymentId}`);
  return timingSafeCompare(expected, signature);
}

export async function verifyWebhookSignature(
  webhookSecret: string, body: ArrayBuffer, signature: string
): Promise<boolean> {
  if (!webhookSecret) return true; // Skip in dev
  const expected = await hmacSha256Bytes(webhookSecret, body);
  return timingSafeCompare(expected, signature);
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
