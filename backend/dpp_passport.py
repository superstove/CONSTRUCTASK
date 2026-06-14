"""
Verifiable Digital Product Passport — Issuance + Trust Registry
==============================================================

Builds on dpp_crypto.py to produce a full, self-verifying passport in the shape
of a W3C Verifiable Credential (VC): the passport data plus a `proof` block
holding the manufacturer's Ed25519 signature.

The hard problem (correctly raised): a signature only proves "whoever holds this
key signed it" — NOT that they are a real, accredited manufacturer. So we add a
TRUST REGISTRY: a list of public keys that a recognised authority has accredited.
Verification then checks TWO things:
    1. Signature valid?      -> not tampered
    2. Issuer in registry?   -> from an accredited maker

In production the registry is run by an EU/GS1-recognised authority (eIDAS trust
services). Here it is a demo stand-in for that authority — clearly labelled.

This module is DB-free and runnable on its own:
    python dpp_passport.py
"""

from __future__ import annotations

from datetime import date

from dpp_crypto import generate_keypair, sign_passport, verify_passport


# ─────────────────────────────────────────────────────────────────────────────
# TRUST REGISTRY  (demo stand-in for the EU / GS1 accreditation authority)
# In the real system this is an external, government-recognised registry.
# ─────────────────────────────────────────────────────────────────────────────

class TrustRegistry:
    """Holds the public keys of manufacturers an authority has accredited."""

    def __init__(self) -> None:
        self._accredited: dict[str, dict] = {}

    def accredit(self, issuer_id: str, name: str, public_hex: str) -> None:
        """Authority registers a manufacturer's public key as trusted."""
        self._accredited[issuer_id] = {
            "name": name,
            "public_key": public_hex,
            "accredited_at": str(date.today()),
        }

    def is_trusted(self, issuer_id: str, public_hex: str) -> bool:
        """True only if this issuer is registered AND the key matches."""
        record = self._accredited.get(issuer_id)
        return bool(record and record["public_key"] == public_hex)

    def name_for(self, issuer_id: str) -> str | None:
        record = self._accredited.get(issuer_id)
        return record["name"] if record else None


# ─────────────────────────────────────────────────────────────────────────────
# ISSUANCE
# ─────────────────────────────────────────────────────────────────────────────

def issue_passport(product: dict, issuer_id: str, issuer_name: str, private_hex: str, public_hex: str) -> dict:
    """Wrap product data into a signed, verifiable passport credential."""
    credential = {
        **product,
        "issuer_id": issuer_id,
        "issuer_name": issuer_name,
        "issued_at": str(date.today()),
    }
    signature = sign_passport(credential, private_hex)
    return {
        "credential": credential,
        "proof": {
            "type": "Ed25519Signature2020",
            "issuer_public_key": public_hex,
            "signature": signature,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# VERIFICATION  (the public, no-login check anyone can run)
# ─────────────────────────────────────────────────────────────────────────────

def verify_credential(vc: dict, registry: TrustRegistry) -> dict:
    """Return a plain-language verdict: tamper check + accredited-issuer check."""
    credential = vc.get("credential", {})
    proof = vc.get("proof", {})
    public_hex = proof.get("issuer_public_key", "")
    signature = proof.get("signature", "")
    issuer_id = credential.get("issuer_id", "")

    signature_ok = verify_passport(credential, signature, public_hex)
    issuer_trusted = registry.is_trusted(issuer_id, public_hex)

    if not signature_ok:
        verdict, reason = "TAMPERED", "Signature invalid — data was changed after signing."
    elif not issuer_trusted:
        verdict, reason = "UNTRUSTED_ISSUER", "Signature valid, but issuer is not in the accredited registry."
    else:
        verdict, reason = "AUTHENTIC", f"Signed by accredited issuer '{registry.name_for(issuer_id)}', not tampered."

    return {
        "verdict": verdict,
        "reason": reason,
        "signature_ok": signature_ok,
        "issuer_trusted": issuer_trusted,
        "issuer_name": registry.name_for(issuer_id) or credential.get("issuer_name"),
    }


if __name__ == "__main__":
    print("=== Trust Registry: an authority accredits a manufacturer ===")
    registry = TrustRegistry()
    priv, pub = generate_keypair()
    registry.accredit("anton-steel", "Anton Steel Works", pub)
    print("   Accredited: Anton Steel Works\n")

    product = {
        "passport_id": "DPP-NH66-REBAR-0001",
        "product": "SlopeShield Pro 600 Rebar",
        "batch": "B-2026-0417",
        "material_composition": {"recycled_steel_pct": 88, "carbon_pct": 0.22},
        "carbon_footprint_kgco2e": 18.4,
        "certificates": ["ASTM A615", "CE EN 10080"],
    }

    print("=== Manufacturer issues a signed passport ===")
    vc = issue_passport(product, "anton-steel", "Anton Steel Works", priv, pub)
    print(f"   passport_id: {vc['credential']['passport_id']}")
    print(f"   signature:   {vc['proof']['signature'][:24]}...\n")

    print("=== Public verify (the check anyone can run, no login) ===")
    print("A) Genuine passport:")
    print(f"   -> {verify_credential(vc, registry)['verdict']}  ({verify_credential(vc, registry)['reason']})\n")

    print("B) Tampered passport (recycled 88 -> 99):")
    tampered = {"credential": {**vc["credential"], "material_composition": {"recycled_steel_pct": 99, "carbon_pct": 0.22}}, "proof": vc["proof"]}
    print(f"   -> {verify_credential(tampered, registry)['verdict']}  ({verify_credential(tampered, registry)['reason']})\n")

    print("C) Real signature, but issuer NOT accredited (a maker not in the registry):")
    rogue_priv, rogue_pub = generate_keypair()
    rogue_vc = issue_passport(product, "ghost-mills", "Ghost Mills Ltd", rogue_priv, rogue_pub)
    print(f"   -> {verify_credential(rogue_vc, registry)['verdict']}  ({verify_credential(rogue_vc, registry)['reason']})")
