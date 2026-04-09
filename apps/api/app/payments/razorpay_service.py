"""Razorpay payment integration service."""

from __future__ import annotations

import hashlib
import hmac
import os

import razorpay


def _get_client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID", "rzp_test_SbIl8dU9Y1LtTd")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "X4lNLOj53i8NIgxt9YWHLusM")
    return razorpay.Client(auth=(key_id, key_secret))


def get_key_id() -> str:
    return os.getenv("RAZORPAY_KEY_ID", "rzp_test_SbIl8dU9Y1LtTd")


def create_order(amount_paise: int, currency: str = "INR", notes: dict | None = None) -> dict:
    """Create a Razorpay order.

    Args:
        amount_paise: Amount in paise (1 INR = 100 paise)
        currency: Currency code (default INR)
        notes: Optional metadata dict

    Returns:
        Razorpay order dict with 'id', 'amount', 'currency', etc.
    """
    client = _get_client()
    order_data = {
        "amount": amount_paise,
        "currency": currency,
        "payment_capture": 1,  # Auto-capture
    }
    if notes:
        order_data["notes"] = notes

    return client.order.create(data=order_data)


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """Verify the payment signature from Razorpay checkout.

    This proves the payment was genuinely completed through Razorpay.
    """
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "X4lNLOj53i8NIgxt9YWHLusM")
    message = f"{razorpay_order_id}|{razorpay_payment_id}"
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected_signature, razorpay_signature)


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature."""
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    if not webhook_secret:
        # If no webhook secret configured, skip verification in dev
        return True

    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def fetch_payment(payment_id: str) -> dict:
    """Fetch payment details from Razorpay."""
    client = _get_client()
    return client.payment.fetch(payment_id)
