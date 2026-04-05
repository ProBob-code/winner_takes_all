from __future__ import annotations

import hashlib
import secrets


def hash_password(password: str, salt: str | None = None) -> str:
    chosen_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        chosen_salt.encode("utf-8"),
        100_000,
    ).hex()
    return f"{chosen_salt}:{digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split(":", 1)
    except ValueError:
        return False

    candidate = hash_password(password, salt).split(":", 1)[1]
    return secrets.compare_digest(candidate, expected)
