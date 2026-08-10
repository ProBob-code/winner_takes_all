import { describe, expect, it } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "../src/lib/razorpay";
import { hmacSha256, hmacSha256Bytes } from "../src/lib/crypto";

describe("verifyPaymentSignature", () => {
  it("accepts a correctly-signed order/payment pair", async () => {
    const secret = "test-secret";
    const orderId = "order_abc";
    const paymentId = "pay_xyz";
    const signature = await hmacSha256(secret, `${orderId}|${paymentId}`);
    await expect(verifyPaymentSignature(secret, orderId, paymentId, signature)).resolves.toBe(true);
  });

  it("rejects a forged signature", async () => {
    await expect(verifyPaymentSignature("secret", "order_abc", "pay_xyz", "not-the-real-signature")).resolves.toBe(
      false
    );
  });

  it("fails closed when no key secret is configured", async () => {
    // An empty secret must short-circuit before any HMAC computation runs —
    // it must never be treated as "any signature passes".
    await expect(verifyPaymentSignature("", "order_abc", "pay_xyz", "anything")).resolves.toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly-signed webhook body", async () => {
    const secret = "webhook-secret";
    const body = new TextEncoder().encode(JSON.stringify({ event: "payment.captured" })).buffer;
    const signature = await hmacSha256Bytes(secret, body);
    await expect(verifyWebhookSignature(secret, body, signature)).resolves.toBe(true);
  });

  it("rejects a forged webhook signature", async () => {
    const body = new TextEncoder().encode("{}").buffer;
    await expect(verifyWebhookSignature("real-secret", body, "forged")).resolves.toBe(false);
  });

  it("fails closed when the webhook secret is unset — the critical regression test", async () => {
    // This is the exact bug that let anyone forge payment.captured events and
    // mint wallet balance: an empty secret must never be treated as "skip
    // verification". It must always return false.
    const body = new TextEncoder().encode(JSON.stringify({ event: "payment.captured" })).buffer;
    await expect(verifyWebhookSignature("", body, "anything")).resolves.toBe(false);
    await expect(verifyWebhookSignature("", body, "")).resolves.toBe(false);
  });
});
