"""
DPP Issuer Keystore — persistent Ed25519 signing key
====================================================

Security fix + hardening: the issuer's private key must NOT change between
restarts (otherwise every previously-signed passport becomes unverifiable).

Resolution order:
  1. Env var DPP_ISSUER_PRIVATE_HEX  → production (set as a secret on Render)
  2. Local file dpp_issuer_key.json  → dev (auto-created once, git-ignored)

The private key never leaves the server. Only the public key + a short
fingerprint are ever exposed to clients.
"""

from __future__ import annotations

import hashlib
import json
import os

from dpp_crypto import generate_keypair, public_from_private

_KEY_FILE = os.path.join(os.path.dirname(__file__), "dpp_issuer_key.json")
_DEFAULT_ISSUER_ID = "anton-steel-works"
_DEFAULT_ISSUER_NAME = "Anton Steel Works"

_cache: dict | None = None


def get_issuer() -> dict:
    """Return {issuer_id, issuer_name, private_hex, public_hex}. Stable across restarts."""
    global _cache
    if _cache:
        return _cache

    issuer_id = os.getenv("DPP_ISSUER_ID", _DEFAULT_ISSUER_ID)
    issuer_name = os.getenv("DPP_ISSUER_NAME", _DEFAULT_ISSUER_NAME)

    # 1. Production: key supplied via environment secret.
    env_priv = os.getenv("DPP_ISSUER_PRIVATE_HEX")
    if env_priv:
        _cache = {
            "issuer_id": issuer_id,
            "issuer_name": issuer_name,
            "private_hex": env_priv,
            "public_hex": public_from_private(env_priv),
        }
        return _cache

    # 2. Dev: reuse the on-disk key, or create it once.
    if os.path.exists(_KEY_FILE):
        try:
            with open(_KEY_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if data.get("private_hex"):
                data.setdefault("issuer_id", issuer_id)
                data.setdefault("issuer_name", issuer_name)
                data["public_hex"] = public_from_private(data["private_hex"])
                _cache = data
                return _cache
        except Exception:
            pass

    priv, pub = generate_keypair()
    data = {"issuer_id": issuer_id, "issuer_name": issuer_name, "private_hex": priv, "public_hex": pub}
    try:
        with open(_KEY_FILE, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
    except Exception:
        pass  # in-memory fallback for read-only filesystems
    _cache = data
    return _cache


def key_fingerprint(public_hex: str) -> str:
    """Short, human-readable fingerprint of a public key (for display)."""
    digest = hashlib.sha256(bytes.fromhex(public_hex)).hexdigest()[:16].upper()
    return ":".join(digest[i:i + 4] for i in range(0, 16, 4))
