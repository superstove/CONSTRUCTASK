"""
Tests for JWT authentication and RBAC.

Covers: password hashing, token creation/decoding, token expiry,
role resolution, role aliases, and permission checks.
"""

import os
import tempfile
import unittest
from datetime import timedelta


class TestPasswordHashing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ.setdefault("DATABASE_URL", f"sqlite:///{cls.tmpdir.name}/test_auth.db")

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def test_hash_and_verify(self):
        from auth import hash_password, verify_password
        hashed = hash_password("secret123")
        self.assertTrue(verify_password("secret123", hashed))

    def test_wrong_password_fails(self):
        from auth import hash_password, verify_password
        hashed = hash_password("secret123")
        self.assertFalse(verify_password("wrong", hashed))

    def test_different_hashes_for_same_password(self):
        from auth import hash_password
        h1 = hash_password("same")
        h2 = hash_password("same")
        self.assertNotEqual(h1, h2)


class TestJWT(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ.setdefault("DATABASE_URL", f"sqlite:///{cls.tmpdir.name}/test_auth.db")

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def test_create_and_decode_token(self):
        from auth import create_access_token, decode_token
        token = create_access_token({"sub": "42", "role": "Admin"})
        payload = decode_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], "42")
        self.assertEqual(payload["role"], "Admin")

    def test_expired_token_returns_none(self):
        from auth import create_access_token, decode_token
        token = create_access_token({"sub": "1"}, expires_delta=timedelta(seconds=-1))
        payload = decode_token(token)
        self.assertIsNone(payload)

    def test_invalid_token_returns_none(self):
        from auth import decode_token
        self.assertIsNone(decode_token("not.a.valid.token"))

    def test_token_contains_expiry(self):
        from auth import create_access_token, decode_token
        token = create_access_token({"sub": "1"})
        payload = decode_token(token)
        self.assertIn("exp", payload)


class TestRBAC(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ.setdefault("DATABASE_URL", f"sqlite:///{cls.tmpdir.name}/test_auth.db")

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def test_canonical_roles(self):
        from auth import canonical_role
        self.assertEqual(canonical_role("Admin"), "Admin")
        self.assertEqual(canonical_role("admin"), "Admin")
        self.assertEqual(canonical_role("Project Manager"), "Project Manager")

    def test_role_aliases(self):
        from auth import canonical_role
        self.assertEqual(canonical_role("QA Inspector"), "QA Auditor")
        self.assertEqual(canonical_role("Site Inspector"), "Site Engineer")
        self.assertEqual(canonical_role("Store Keeper"), "Viewer")

    def test_unknown_role_defaults_to_viewer(self):
        from auth import canonical_role
        self.assertEqual(canonical_role("Random Title"), "Viewer")
        self.assertEqual(canonical_role(""), "Viewer")
        self.assertEqual(canonical_role(None), "Viewer")

    def test_admin_has_all_permissions(self):
        from auth import has_permission
        for perm in ["view_project", "edit_material", "approve", "verify", "manage_users", "admin"]:
            self.assertTrue(has_permission("Admin", perm), f"Admin should have {perm}")

    def test_viewer_only_views(self):
        from auth import has_permission
        self.assertTrue(has_permission("Viewer", "view_project"))
        self.assertFalse(has_permission("Viewer", "edit_material"))
        self.assertFalse(has_permission("Viewer", "approve"))
        self.assertFalse(has_permission("Viewer", "admin"))

    def test_site_engineer_permissions(self):
        from auth import has_permission
        self.assertTrue(has_permission("Site Engineer", "view_project"))
        self.assertTrue(has_permission("Site Engineer", "edit_material"))
        self.assertTrue(has_permission("Site Engineer", "verify"))
        self.assertFalse(has_permission("Site Engineer", "approve"))
        self.assertFalse(has_permission("Site Engineer", "admin"))

    def test_alias_permissions(self):
        from auth import has_permission
        self.assertTrue(has_permission("QA Inspector", "verify"))
        self.assertTrue(has_permission("QA Inspector", "approve"))
        self.assertFalse(has_permission("QA Inspector", "admin"))


if __name__ == "__main__":
    unittest.main()
