/** Razorpay payment helpers — uses fetch (no SDK needed on Workers). */

import { hmacSha256, hmacSha256Bytes, timingSafeEqual } from "./crypto";

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
  if (!keySecret) return false;
  const expected = await hmacSha256(keySecret, `${orderId}|${paymentId}`);
  return timingSafeEqual(expected, signature);
}

/**
 * Fail closed: a webhook that credits wallets must never be accepted when the
 * secret is missing — an unset secret would otherwise let anyone forge
 * `payment.captured` events and mint balance.
 */
export async function verifyWebhookSignature(
  webhookSecret: string, body: ArrayBuffer, signature: string
): Promise<boolean> {
  if (!webhookSecret) return false;
  const expected = await hmacSha256Bytes(webhookSecret, body);
  return timingSafeEqual(expected, signature);
}
