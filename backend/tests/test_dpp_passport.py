"""
Tests for the DPP passport issuance and trust registry verification.

Covers: trust registry accreditation, passport issuance, authentic/tampered/
untrusted verdicts, and the full verify_credential flow.
"""

import unittest

from dpp_crypto import generate_keypair
from dpp_passport import TrustRegistry, issue_passport, verify_credential


class TestTrustRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = TrustRegistry()
        self.priv, self.pub = generate_keypair()
        self.registry.accredit("test-steel", "Test Steel Works", self.pub)

    def test_accredited_issuer_is_trusted(self):
        self.assertTrue(self.registry.is_trusted("test-steel", self.pub))

    def test_wrong_key_not_trusted(self):
        _, other_pub = generate_keypair()
        self.assertFalse(self.registry.is_trusted("test-steel", other_pub))

    def test_unknown_issuer_not_trusted(self):
        self.assertFalse(self.registry.is_trusted("unknown-id", self.pub))

    def test_name_lookup(self):
        self.assertEqual(self.registry.name_for("test-steel"), "Test Steel Works")
        self.assertIsNone(self.registry.name_for("nonexistent"))


class TestPassportIssuance(unittest.TestCase):
    def setUp(self):
        self.registry = TrustRegistry()
        self.priv, self.pub = generate_keypair()
        self.registry.accredit("test-steel", "Test Steel Works", self.pub)
        self.product = {
            "passport_id": "DPP-TEST-001",
            "product": "Test Rebar",
            "batch": "B-001",
            "certificates": ["ASTM A615"],
        }

    def test_issued_passport_structure(self):
        vc = issue_passport(self.product, "test-steel", "Test Steel Works", self.priv, self.pub)
        self.assertIn("credential", vc)
        self.assertIn("proof", vc)
        self.assertEqual(vc["proof"]["type"], "Ed25519Signature2020")
        self.assertEqual(vc["proof"]["issuer_public_key"], self.pub)
        self.assertIn("signature", vc["proof"])
        self.assertEqual(vc["credential"]["issuer_id"], "test-steel")

    def test_authentic_verdict(self):
        vc = issue_passport(self.product, "test-steel", "Test Steel Works", self.priv, self.pub)
        result = verify_credential(vc, self.registry)
        self.assertEqual(result["verdict"], "AUTHENTIC")
        self.assertTrue(result["signature_ok"])
        self.assertTrue(result["issuer_trusted"])

    def test_tampered_verdict(self):
        vc = issue_passport(self.product, "test-steel", "Test Steel Works", self.priv, self.pub)
        vc["credential"]["batch"] = "TAMPERED-BATCH"
        result = verify_credential(vc, self.registry)
        self.assertEqual(result["verdict"], "TAMPERED")
        self.assertFalse(result["signature_ok"])

    def test_untrusted_issuer_verdict(self):
        rogue_priv, rogue_pub = generate_keypair()
        vc = issue_passport(self.product, "rogue-co", "Rogue Co", rogue_priv, rogue_pub)
        result = verify_credential(vc, self.registry)
        self.assertEqual(result["verdict"], "UNTRUSTED_ISSUER")
        self.assertTrue(result["signature_ok"])
        self.assertFalse(result["issuer_trusted"])


if __name__ == "__main__":
    unittest.main()
