"""
Tests for the SHA-256 hash-chain audit trail.

Covers: hash computation, chain creation, chain integrity verification,
tamper detection, and tracked event helpers.
"""

import os
import tempfile
import unittest
from datetime import date, timedelta


class TestAuditHashChain(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._db_path = os.path.join(tempfile.gettempdir(), "test_audit_chain.db")
        if os.path.exists(cls._db_path):
            os.remove(cls._db_path)
        os.environ["DATABASE_URL"] = f"sqlite:///{cls._db_path}"

        import importlib
        import database
        importlib.reload(database)

        from database import Base, SessionLocal, engine
        from models import Project, User

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        today = date.today()
        project = Project(
            name="Audit Test Project", location="Test Site",
            start_date=today, end_date=today + timedelta(days=90),
            status="Active", risk_score="Low",
        )
        db.add(project)
        db.flush()
        user = User(name="Test User", email="test@example.com", role="Admin")
        db.add(user)
        db.flush()
        cls.project_id = project.id
        cls.user_id = user.id
        db.commit()
        db.close()

    def _get_db(self):
        from database import SessionLocal
        return SessionLocal()

    def test_hash_computation_is_deterministic(self):
        from utils import sha256_hash
        h1 = sha256_hash("GENESIS-material_created-Test material registered")
        h2 = sha256_hash("GENESIS-material_created-Test material registered")
        self.assertEqual(h1, h2)

    def test_different_inputs_different_hashes(self):
        from utils import sha256_hash
        h1 = sha256_hash("GENESIS-action_a-details_a")
        h2 = sha256_hash("GENESIS-action_b-details_b")
        self.assertNotEqual(h1, h2)

    def test_create_and_verify_chain(self):
        from engines.audit_engine import (
            create_audit_record,
            verify_chain_integrity,
        )

        db = self._get_db()
        try:
            r1 = create_audit_record(
                db, project_id=self.project_id, user_id=self.user_id,
                entity_type="material", entity_id=1,
                action="material_created", details="First material registered",
            )
            self.assertEqual(r1.previous_hash, "GENESIS")

            r2 = create_audit_record(
                db, project_id=self.project_id, user_id=self.user_id,
                entity_type="material", entity_id=2,
                action="material_created", details="Second material registered",
            )
            self.assertEqual(r2.previous_hash, r1.hash)

            r3 = create_audit_record(
                db, project_id=self.project_id, user_id=self.user_id,
                entity_type="certificate", entity_id=1,
                action="certificate_uploaded", details="BIS Certificate uploaded",
            )
            self.assertEqual(r3.previous_hash, r2.hash)

            db.commit()

            result = verify_chain_integrity(db, self.project_id)
            self.assertTrue(result.is_valid)
            self.assertEqual(result.total_records, 3)
            self.assertEqual(len(result.broken_links), 0)
        finally:
            db.close()

    def test_tampered_record_detected(self):
        from engines.audit_engine import verify_chain_integrity
        from models import AuditTrail

        db = self._get_db()
        try:
            records = (
                db.query(AuditTrail)
                .filter(AuditTrail.project_id == self.project_id)
                .order_by(AuditTrail.timestamp.asc())
                .all()
            )
            if len(records) >= 2:
                original_details = records[1].details
                records[1].details = "TAMPERED DETAILS"
                db.flush()

                result = verify_chain_integrity(db, self.project_id)
                self.assertFalse(result.is_valid)
                self.assertGreater(len(result.broken_links), 0)

                records[1].details = original_details
                db.flush()
        finally:
            db.close()

    def test_tracked_helpers(self):
        from engines.audit_engine import (
            track_material_created,
            track_material_verified,
            track_approval_created,
        )

        db = self._get_db()
        try:
            r = track_material_created(db, self.project_id, self.user_id, 10, "Steel Rebar")
            self.assertEqual(r.action, "material_created")
            self.assertEqual(r.entity_type, "material")

            r2 = track_material_verified(db, self.project_id, self.user_id, 10, "passed")
            self.assertEqual(r2.action, "material_verified")
            self.assertEqual(r2.previous_hash, r.hash)

            r3 = track_approval_created(db, self.project_id, self.user_id, 5, "Site Engineer Approval")
            self.assertEqual(r3.action, "approval_created")
            self.assertEqual(r3.previous_hash, r2.hash)

            db.commit()
        finally:
            db.close()

    def test_empty_project_chain_is_valid(self):
        from engines.audit_engine import verify_chain_integrity

        db = self._get_db()
        try:
            result = verify_chain_integrity(db, 99999)
            self.assertTrue(result.is_valid)
            self.assertEqual(result.total_records, 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
