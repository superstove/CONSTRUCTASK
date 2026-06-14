"""
Verifiable Digital Product Passport — Cryptographic Core
========================================================

The trust upgrade over a database-lookup passport: each passport is signed with
the manufacturer's Ed25519 private key. Anyone can verify it with the public key
— no need to trust our server, and it works offline. If a single field is
changed after signing, verification fails (tamper-evident).

Key facts:
  - Ed25519 = modern, fast, secure digital-signature algorithm.
  - Keys are stored as raw 32-byte hex strings (private = secret, public = shared).
  - Passports are signed over a CANONICAL JSON form (sorted keys, no whitespace)
    so the same data always produces the same bytes on both sides.

This module has NO database or web dependencies on purpose — it is the pure,
testable foundation. Run it directly to see a sign/verify + tamper demo:
    python dpp_crypto.py
"""

from __future__ import annotations

import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature


def generate_keypair() -> tuple[str, str]:
    """Create a new manufacturer keypair. Returns (private_hex, public_hex)."""
    private_key = Ed25519PrivateKey.generate()
    private_hex = private_key.private_bytes_raw().hex()
    public_hex = private_key.public_key().public_bytes_raw().hex()
    return private_hex, public_hex


def public_from_private(private_hex: str) -> str:
    """Derive the public key (hex) from a private key (hex)."""
    private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_hex))
    return private_key.public_key().public_bytes_raw().hex()


def canonical_json(passport: dict) -> bytes:
    """Deterministic byte representation of a passport, so signing is stable."""
    return json.dumps(passport, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_passport(passport: dict, private_hex: str) -> str:
    """Sign a passport dict with the manufacturer's private key. Returns hex signature."""
    private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_hex))
    signature = private_key.sign(canonical_json(passport))
    return signature.hex()


def verify_passport(passport: dict, signature_hex: str, public_hex: str) -> bool:
    """True if the signature is valid for this exact passport + public key."""
    try:
        public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex))
        public_key.verify(bytes.fromhex(signature_hex), canonical_json(passport))
        return True
    except (InvalidSignature, ValueError):
        return False


if __name__ == "__main__":
    # --- Self-test / demo: prove it works without any database ---
    print("1) Generating a manufacturer keypair (Ed25519)...")
    priv, pub = generate_keypair()
    print(f"   private key (secret): {priv[:16]}...")
    print(f"   public key (shared):  {pub[:16]}...\n")

    passport = {
        "passport_id": "DPP-NH66-REBAR-0001",
        "product": "SlopeShield Pro 600 Rebar",
        "manufacturer": "Anton Steel Works",
        "batch": "B-2026-0417",
        "material_composition": {"recycled_steel_pct": 88, "carbon_pct": 0.22},
        "carbon_footprint_kgco2e": 18.4,
        "certificates": ["ASTM A615", "CE EN 10080"],
        "issued_at": "2026-06-11",
    }

    print("2) Signing the passport...")
    sig = sign_passport(passport, priv)
    print(f"   signature: {sig[:24]}...\n")

    print("3) Verifying the ORIGINAL passport (should be AUTHENTIC):")
    print(f"   -> {'[PASS] AUTHENTIC' if verify_passport(passport, sig, pub) else '[FAIL] INVALID'}\n")

    print("4) Tampering with one field (recycled 88 -> 99) and re-verifying:")
    tampered = dict(passport)
    tampered["material_composition"] = {"recycled_steel_pct": 99, "carbon_pct": 0.22}
    print(f"   -> {'[FAIL] still authentic?!' if verify_passport(tampered, sig, pub) else '[PASS] TAMPER DETECTED (correct!)'}\n")

    print("5) Verifying with a WRONG (attacker's) public key:")
    _, attacker_pub = generate_keypair()
    print(f"   -> {'[FAIL] accepted attacker?!' if verify_passport(passport, sig, attacker_pub) else '[PASS] UNTRUSTED ISSUER rejected (correct!)'}")
