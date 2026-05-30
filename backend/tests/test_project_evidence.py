import os
import tempfile
import unittest
from datetime import date, datetime, timedelta


class ProjectEvidenceEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ["DATABASE_URL"] = f"sqlite:///{cls.tmpdir.name}/test.db"
        # Force deterministic chat mode during tests
        cls._saved_openai_key = os.environ.pop("OPENAI_API_KEY", None)

        from fastapi.testclient import TestClient

        from database import Base, SessionLocal, engine
        from main import app
        from models import Approval, Certificate, Delivery, Material, Project, QRScan

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            today = date.today()
            project = Project(
                name="Test Highway",
                location="Kerala",
                start_date=today - timedelta(days=30),
                end_date=today + timedelta(days=300),
                status="Active",
                risk_score="Medium",
            )
            db.add(project)
            db.flush()
            material = Material(
                project_id=project.id,
                name="Geogrid Layer",
                supplier="GeoStruct Materials",
                batch_number="GEO-001",
                qr_code="QR-GEO-001",
                status="pending",
                quantity=120,
                unit="rolls",
            )
            db.add(material)
            db.flush()
            no_delivery_material = Material(
                project_id=project.id,
                name="Drainage Outlet Marker",
                supplier="MarkerWorks",
                batch_number="MARK-001",
                qr_code="QR-MARK-001",
                status="verified",
                quantity=24,
                unit="units",
            )
            db.add(no_delivery_material)
            db.flush()
            db.add_all(
                [
                    Certificate(
                        material_id=material.id,
                        certificate_name="BIS Certification",
                        issuing_body="BIS",
                        issue_date=today - timedelta(days=380),
                        expiry_date=today - timedelta(days=1),
                        status="expired",
                    ),
                    Approval(
                        project_id=project.id,
                        material_id=material.id,
                        approval_type="Site Engineer Approval",
                        approver="Senior Engineer",
                        status="pending",
                        requested_date=today - timedelta(days=10),
                        approved_date=None,
                        overdue_days=4,
                    ),
                    Delivery(
                        project_id=project.id,
                        supplier="GeoStruct Materials",
                        material_name="Geogrid Layer",
                        expected_date=today - timedelta(days=3),
                        actual_date=None,
                        status="delayed",
                        delay_days=3,
                    ),
                    QRScan(
                        material_id=material.id,
                        project_id=project.id,
                        scanned_by="Store Keeper",
                        scan_time=datetime.now(),
                        location="Project store",
                        scan_type="verify",
                        result="passed",
                    ),
                    QRScan(
                        material_id=material.id,
                        project_id=project.id,
                        scanned_by="QA Inspector",
                        scan_time=datetime.now() - timedelta(hours=2),
                        location="Remote yard",
                        scan_type="verify",
                        result="passed",
                    ),
                ]
            )
            db.commit()
            cls.project_id = project.id
        finally:
            db.close()

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        from database import engine

        engine.dispose()
        cls.tmpdir.cleanup()
        # Restore original API key if it existed
        if cls._saved_openai_key is not None:
            os.environ["OPENAI_API_KEY"] = cls._saved_openai_key

    def test_project_evidence_groups_open_issues_by_workflow_area(self):
        response = self.client.get(f"/api/projects/{self.project_id}/evidence")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["summary"]["open_items"], 3)
        self.assertEqual(data["summary"]["material_records"], 2)
        self.assertEqual(data["summary"]["top_priority"], "Certificates")
        self.assertEqual(data["certificates"][0]["material_name"], "Geogrid Layer")
        self.assertEqual(data["certificates"][0]["action"], "Check expiry and renew before release")
        self.assertEqual(data["deliveries"][0]["detail"], "Delayed by 3 days")
        self.assertEqual(data["approvals"][0]["detail"], "4 days overdue")

    def test_material_release_check_blocks_failed_or_expired_material(self):
        response = self.client.post(
            "/api/materials/verify",
            params={
                "project_id": self.project_id,
                "qr_code": "QR-GEO-001",
                "scanned_by": "Site Engineer",
                "location": "Zone B Slope Face",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["decision"], "Blocked from installation")
        self.assertEqual(data["material"], "Geogrid Layer")
        self.assertIn("BIS Certification is expired.", data["reasons"])
        # Verify endpoint no longer creates scan records to prevent scan log pollution
        self.assertIn("checks", data)
        self.assertTrue(any(c["label"] == "Certificate" and c["status"] == "Blocked" for c in data["checks"]))

    def test_material_release_check_blocks_unknown_qr_without_scan_record(self):
        response = self.client.post(
            "/api/materials/verify",
            params={
                "project_id": self.project_id,
                "qr_code": "QR-NOT-IN-PROJECT",
                "scanned_by": "Site Engineer",
                "location": "Zone B Slope Face",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["decision"], "Blocked")
        self.assertIsNone(data["material"])

    def test_daily_brief_question_returns_manager_action_summary(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "Generate manager daily brief for today"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Daily site brief", data["answer"])
        self.assertIn("BIS Certification", data["answer"])

    def test_project_readiness_returns_blocked_status_and_evidence_counts(self):
        response = self.client.get(f"/api/projects/{self.project_id}/readiness")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "Blocked")
        self.assertEqual(data["score"], 35)
        self.assertEqual(data["blockers"], 1)
        self.assertGreaterEqual(data["warnings"], 3)
        self.assertIn("expired certificate", " ".join(data["reasons"]).lower())

    def test_dashboard_supplier_risk_does_not_claim_missing_delivery_is_on_time(self):
        response = self.client.get(f"/api/projects/{self.project_id}/dashboard")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        marker_supplier = next(item for item in data["supplier_risks"] if item["supplier"] == "MarkerWorks")
        self.assertEqual(marker_supplier["risk"], "Medium")
        self.assertEqual(marker_supplier["reason"], "No delivery record linked")

    def test_action_queue_ranks_certificate_before_delivery_and_approval(self):
        response = self.client.get(f"/api/projects/{self.project_id}/actions")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(len(data), 3)
        self.assertEqual(data[0]["severity"], "Blocker")
        self.assertEqual(data[0]["category"], "Certificate")
        self.assertEqual(data[0]["material_name"], "Geogrid Layer")
        self.assertIn("Renew", data[0]["action"])
        self.assertTrue(any(item["category"] == "QR Scan" for item in data))

    def test_material_evidence_card_combines_release_inputs(self):
        response = self.client.get(f"/api/materials/evidence?project_id={self.project_id}")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        card = data[0]
        self.assertEqual(card["material_name"], "Geogrid Layer")
        self.assertEqual(card["release_status"], "Blocked")
        self.assertEqual(card["certificate_status"], "Expired")
        self.assertEqual(card["approval_status"], "Overdue")
        self.assertEqual(card["delivery_status"], "Delayed")
        self.assertEqual(card["last_scan_location"], "Project store")

    def test_scan_warnings_flag_repeated_qr_across_locations(self):
        response = self.client.get(f"/api/materials/scans/warnings?project_id={self.project_id}")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["qr_code"], "QR-GEO-001")
        self.assertEqual(data[0]["warning_type"], "Multiple locations")
        self.assertIn("Project store", data[0]["detail"])
        self.assertIn("Remote yard", data[0]["detail"])


if __name__ == "__main__":
    unittest.main()
