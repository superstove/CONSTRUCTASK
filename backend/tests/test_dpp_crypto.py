"""
Tests for the Ed25519 Digital Product Passport cryptographic core.

Covers: key generation, signing, verification, tamper detection,
wrong-key rejection, and canonical JSON determinism.
"""

import json
import unittest

from dpp_crypto import (
    canonical_json,
    generate_keypair,
    public_from_private,
    sign_passport,
    verify_passport,
)


class TestKeyGeneration(unittest.TestCase):
    def test_generates_hex_keys(self):
        priv, pub = generate_keypair()
        self.assertEqual(len(bytes.fromhex(priv)), 32)
        self.assertEqual(len(bytes.fromhex(pub)), 32)

    def test_keypairs_are_unique(self):
        priv1, pub1 = generate_keypair()
        priv2, pub2 = generate_keypair()
        self.assertNotEqual(priv1, priv2)
        self.assertNotEqual(pub1, pub2)

    def test_public_from_private_matches(self):
        priv, pub = generate_keypair()
        derived = public_from_private(priv)
        self.assertEqual(pub, derived)


class TestCanonicalJson(unittest.TestCase):
    def test_sorted_keys(self):
        data = {"b": 2, "a": 1}
        result = canonical_json(data)
        self.assertEqual(result, b'{"a":1,"b":2}')

    def test_deterministic(self):
        data = {"product": "Rebar", "batch": "B-001", "qty": 100}
        self.assertEqual(canonical_json(data), canonical_json(data))

    def test_no_whitespace(self):
        data = {"key": "value"}
        result = canonical_json(data)
        self.assertNotIn(b" ", result)


class TestSignAndVerify(unittest.TestCase):
    def setUp(self):
        self.priv, self.pub = generate_keypair()
        self.passport = {
            "passport_id": "DPP-TEST-001",
            "product": "Test Rebar",
            "batch": "B-2026-001",
            "supplier": "Test Steel Works",
            "quantity": "100 tonnes",
            "certificates": ["ASTM A615", "CE EN 10080"],
        }

    def test_valid_signature(self):
        sig = sign_passport(self.passport, self.priv)
        self.assertTrue(verify_passport(self.passport, sig, self.pub))

    def test_tampered_field_fails(self):
        sig = sign_passport(self.passport, self.priv)
        tampered = dict(self.passport)
        tampered["quantity"] = "999 tonnes"
        self.assertFalse(verify_passport(tampered, sig, self.pub))

    def test_tampered_nested_field_fails(self):
        passport_with_nested = {**self.passport, "composition": {"steel": 88}}
        sig = sign_passport(passport_with_nested, self.priv)
        tampered = {**passport_with_nested, "composition": {"steel": 99}}
        self.assertFalse(verify_passport(tampered, sig, self.pub))

    def test_added_field_fails(self):
        sig = sign_passport(self.passport, self.priv)
        tampered = {**self.passport, "extra_field": "injected"}
        self.assertFalse(verify_passport(tampered, sig, self.pub))

    def test_removed_field_fails(self):
        sig = sign_passport(self.passport, self.priv)
        tampered = {k: v for k, v in self.passport.items() if k != "batch"}
        self.assertFalse(verify_passport(tampered, sig, self.pub))

    def test_wrong_key_fails(self):
        sig = sign_passport(self.passport, self.priv)
        _, attacker_pub = generate_keypair()
        self.assertFalse(verify_passport(self.passport, sig, attacker_pub))

    def test_corrupted_signature_fails(self):
        sig = sign_passport(self.passport, self.priv)
        corrupted = "00" * 64
        self.assertFalse(verify_passport(self.passport, corrupted, self.pub))

    def test_empty_signature_fails(self):
        self.assertFalse(verify_passport(self.passport, "", self.pub))

    def test_signature_is_hex_string(self):
        sig = sign_passport(self.passport, self.priv)
        self.assertEqual(len(bytes.fromhex(sig)), 64)


if __name__ == "__main__":
    unittest.main()
