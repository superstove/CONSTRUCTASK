"""
Tests for the DPP verification API endpoints.

Covers: /api/dpp/verify-material, /api/dpp/verify, /api/dpp/registry,
input validation via Pydantic models, and the public QR endpoint.
"""

import os
import tempfile
import unittest
from datetime import date, timedelta


class TestDppApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._db_path = os.path.join(tempfile.gettempdir(), "test_dpp_api.db")
        if os.path.exists(cls._db_path):
            os.remove(cls._db_path)
        os.environ["DATABASE_URL"] = f"sqlite:///{cls._db_path}"

        import importlib
        import database
        importlib.reload(database)

        from fastapi.testclient import TestClient
        from database import Base, SessionLocal, engine
        from main import app
        from models import Certificate, Material, Project, User
        from auth import hash_password, create_access_token

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        today = date.today()
        project = Project(
            name="DPP Test Project", location="Test Site",
            start_date=today, end_date=today + timedelta(days=90),
            status="Active", risk_score="Low",
        )
        db.add(project)
        db.flush()

        user = User(
            name="Admin User", email="admin@test.com", role="Admin",
            hashed_password=hash_password("test123"),
        )
        db.add(user)
        db.flush()

        material = Material(
            project_id=project.id, name="Test Rebar", supplier="Test Steel",
            batch_number="B-001", qr_code="QR-TEST-001", status="pending",
            quantity=100, unit="tonnes",
        )
        db.add(material)
        db.flush()

        cert = Certificate(
            material_id=material.id, project_id=project.id,
            certificate_name="ASTM A615", issuing_body="ASTM",
            issue_date=today - timedelta(days=30), expiry_date=today + timedelta(days=335),
            status="valid",
        )
        db.add(cert)
        db.commit()

        cls.project_id = project.id
        cls.material_id = material.id
        cls.user_id = user.id
        cls.token = create_access_token({"sub": str(user.id), "role": "Admin"})
        db.close()

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        from database import engine
        engine.dispose()

    def test_verify_material_success(self):
        resp = self.client.post("/api/dpp/verify-material", json={"material_id": self.material_id})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["verdict"], ["AUTHENTIC", "TAMPERED", "UNTRUSTED_ISSUER"])
        self.assertIn("signature_ok", data)
        self.assertIn("signed_fields", data)
        self.assertEqual(data["algorithm"], "Ed25519")

    def test_verify_material_not_found(self):
        resp = self.client.post("/api/dpp/verify-material", json={"material_id": 99999})
        self.assertEqual(resp.status_code, 404)

    def test_verify_material_missing_field(self):
        resp = self.client.post("/api/dpp/verify-material", json={})
        self.assertEqual(resp.status_code, 422)

    def test_verify_material_invalid_type(self):
        resp = self.client.post("/api/dpp/verify-material", json={"material_id": "not_a_number"})
        self.assertEqual(resp.status_code, 422)

    def test_verify_credential_missing_fields(self):
        resp = self.client.post("/api/dpp/verify", json={"credential": {}})
        self.assertEqual(resp.status_code, 422)

    def test_registry_returns_issuers(self):
        self.client.post("/api/dpp/verify-material", json={"material_id": self.material_id})
        resp = self.client.get("/api/dpp/registry")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        self.assertIn("issuer_id", data[0])
        self.assertIn("key_fingerprint", data[0])

    def test_qr_png_returns_image(self):
        resp = self.client.get(f"/api/dpp/qr/{self.material_id}.png")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["content-type"], "image/png")

    def test_qr_png_not_found(self):
        resp = self.client.get("/api/dpp/qr/99999.png")
        self.assertEqual(resp.status_code, 404)

    def test_issue_requires_auth(self):
        resp = self.client.post("/api/dpp/issue", json={"material_id": self.material_id})
        self.assertEqual(resp.status_code, 401)

    def test_issue_with_auth(self):
        resp = self.client.post(
            "/api/dpp/issue",
            json={"material_id": self.material_id},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "issued")
        self.assertIn("key_fingerprint", data)

    def test_full_verify_flow(self):
        resp1 = self.client.post("/api/dpp/verify-material", json={"material_id": self.material_id})
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(resp1.json()["verdict"], "AUTHENTIC")

        resp2 = self.client.post(
            "/api/dpp/issue",
            json={"material_id": self.material_id},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(resp2.status_code, 200)

        resp3 = self.client.post("/api/dpp/verify-material", json={"material_id": self.material_id})
        self.assertEqual(resp3.status_code, 200)
        self.assertEqual(resp3.json()["verdict"], "AUTHENTIC")


if __name__ == "__main__":
    unittest.main()
