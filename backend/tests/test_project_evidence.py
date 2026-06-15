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
        from models import Approval, Certificate, Delivery, Material, ProductPassport, Project, QRScan, User

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
            cls.user_store_keeper = User(name="Store Keeper", email="storekeeper@example.com", role="Store Keeper")
            cls.user_qa_inspector = User(name="QA Inspector", email="qainspector@example.com", role="QA Inspector")
            db.add_all([cls.user_store_keeper, cls.user_qa_inspector])
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
            cls.material_id = material.id
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
            approval = Approval(
                project_id=project.id,
                material_id=material.id,
                approval_type="Site Engineer Approval",
                approver_id=cls.user_qa_inspector.id,
                status="pending",
                requested_date=today - timedelta(days=10),
                approved_date=None,
                overdue_days=4,
            )
            db.add_all(
                [
                    Certificate(
                        material_id=material.id,
                        project_id=project.id,
                        certificate_name="BIS Certification",
                        issuing_body="BIS",
                        issue_date=today - timedelta(days=380),
                        expiry_date=today - timedelta(days=1),
                        status="expired",
                    ),
                    approval,
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
                        scanned_by=cls.user_store_keeper.id,
                        scan_time=datetime.now(),
                        location="Project store",
                        scan_type="verify",
                        result="passed",
                    ),
                    QRScan(
                        material_id=material.id,
                        project_id=project.id,
                        scanned_by=cls.user_qa_inspector.id,
                        scan_time=datetime.now() - timedelta(hours=2),
                        location="Remote yard",
                        scan_type="verify",
                        result="passed",
                    ),
                ]
            )
            db.flush()
            cls.approval_id = approval.id
            db.commit()
            cls.project_id = project.id
        finally:
            db.close()

        cls.client = TestClient(app)

        # Authenticate through the real signup/login flow so RBAC-protected
        # endpoints are exercised with a valid JWT.
        signup = cls.client.post(
            "/api/auth/signup",
            json={
                "name": "Test Admin",
                "email": "test.admin@example.com",
                "password": "test-password-123",
                "role": "Admin",
            },
        )
        assert signup.status_code == 200, signup.text
        cls.client.headers.update(
            {"Authorization": f"Bearer {signup.json()['access_token']}"}
        )

        # The signed-up admin owns the test project (matches real ownership scoping).
        from database import SessionLocal as _SessionLocal
        from models import Project as _Project
        _own_db = _SessionLocal()
        try:
            _proj = _own_db.query(_Project).filter(_Project.id == cls.project_id).first()
            _proj.owner_id = signup.json()["user_id"]
            _own_db.commit()
        finally:
            _own_db.close()

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
        self.assertIn("checks", data)
        self.assertTrue(any(c["label"] == "Certificate" and c["status"] == "Blocked" for c in data["checks"]))
        from database import SessionLocal
        from models import QRScan

        db = SessionLocal()
        try:
            release_scan = (
                db.query(QRScan)
                .filter(QRScan.material_id == self.material_id, QRScan.scan_type == "release_check")
                .order_by(QRScan.id.desc())
                .first()
            )
            self.assertIsNotNone(release_scan)
            self.assertEqual(release_scan.user.name, "Test Admin")
            self.assertEqual(release_scan.result, "blocked_from_installation")
        finally:
            db.close()

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
        self.assertIn("Daily Brief", data["answer"])
        self.assertIn("BIS Certification", data["answer"])

    def test_all_materials_question_returns_material_decisions(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "Tell me about all materials and which are ready hold or blocked"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Material Status", data["answer"])
        self.assertIn("Test Highway", data["answer"])
        self.assertIn("Geogrid Layer", data["answer"])
        self.assertIn("Drainage Outlet Marker", data["answer"])
        self.assertIn("Blocked", data["answer"])
        self.assertIn("Hold", data["answer"])
        self.assertIn("certificate expired", data["answer"])
        self.assertIn("materials", data["data_used"])
        self.assertIn("High", data["confidence"])

    def test_erp_question_returns_project_operations_answer(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "Give me the ERP operations view for this project"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Executive Summary", data["answer"])
        self.assertIn("Test Highway", data["answer"])
        self.assertIn("Materials", data["answer"])
        self.assertIn("Deliveries", data["answer"])
        self.assertIn("Root Causes", data["answer"])
        self.assertIn("GeoStruct Materials", data["answer"])

    def test_specific_material_question_works_without_exact_prompt(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "what is the status of Geogrid Layer material"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Material Details", data["answer"])
        self.assertIn("Test Highway", data["answer"])
        self.assertIn("Geogrid Layer", data["answer"])
        self.assertIn("Release Decision", data["answer"])
        self.assertIn("Blocked", data["answer"])
        self.assertIn("BIS Certification", data["answer"])

    def test_project_going_question_returns_health_answer(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "how is the project going now"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Test Highway", data["answer"])
        self.assertIn("Overall Health", data["answer"])
        self.assertIn("What To Do First", data["answer"])

    def test_delivery_question_returns_procurement_answer(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "what is the status of the steel delivery"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Delivery Status", data["answer"])
        self.assertIn("Test Highway", data["answer"])
        self.assertIn("GeoStruct Materials", data["answer"])
        self.assertIn("3 days late", data["answer"])

    def test_missing_finance_question_returns_honest_data_gap(self):
        response = self.client.post(
            "/api/chat/",
            json={"project_id": self.project_id, "question": "how much spent on labor for foundation phase"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("Honest Answer", data["answer"])
        self.assertIn("doesn't currently contain", data["answer"])
        self.assertIn("spending records", data["answer"])

    def test_project_readiness_returns_blocked_status_and_evidence_counts(self):
        response = self.client.get(f"/api/projects/{self.project_id}/readiness")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "Blocked")
        self.assertLess(data["score"], 50)
        self.assertEqual(data["blockers"], 1)
        self.assertGreaterEqual(data["warnings"], 3)
        self.assertIn("expired certificate", " ".join(data["reasons"]).lower())

    def test_dashboard_supplier_risk_does_not_claim_missing_delivery_is_on_time(self):
        response = self.client.get(f"/api/projects/{self.project_id}/dashboard")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_deliveries"], 1)
        self.assertEqual(data["ontime_deliveries"], 0)
        self.assertEqual(data["delayed_deliveries"], 1)
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
        self.assertGreaterEqual(len(data), 2)
        card = next(item for item in data if item["material_name"] == "Geogrid Layer")
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

    def test_material_creation_persists_material_and_product_passport(self):
        response = self.client.post(
            "/api/materials/",
            json={
                "project_id": self.project_id,
                "name": "Demo Created Material",
                "batch_id": "DEMO-BATCH-001",
                "supplier": "Demo Supplier",
                "category": "geotextile",
                "status": "pending",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "Demo Created Material")
        self.assertEqual(data["batch_number"], "DEMO-BATCH-001")
        self.assertEqual(data["project_id"], self.project_id)

        from database import SessionLocal
        from models import Material, ProductPassport

        db = SessionLocal()
        try:
            material = db.query(Material).filter(Material.id == data["id"]).first()
            self.assertIsNotNone(material)
            self.assertEqual(material.project_id, self.project_id)
            passport = db.query(ProductPassport).filter(ProductPassport.material_id == material.id).first()
            self.assertIsNotNone(passport)
            self.assertEqual(passport.passport_id, f"PP-{material.project_id}-{material.id}")
            self.assertEqual(passport.compliance_score, 78)
            self.assertEqual(passport.carbon_score, 0.9)
            self.assertEqual(passport.status, "active")
        finally:
            # Always clean up so later tests aren't polluted
            material = db.query(Material).filter(Material.id == data["id"]).first()
            passport = db.query(ProductPassport).filter(ProductPassport.material_id == data["id"]).first()
            if passport:
                db.delete(passport)
            if material:
                db.delete(material)
            db.commit()
            db.close()

    def test_approval_update_persists_status_and_date(self):
        response = self.client.put(
            f"/api/approvals/{self.approval_id}",
            json={"status": "approved"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "approved")
        self.assertIsNotNone(data["approved_date"])

        from database import SessionLocal
        from models import Approval

        db = SessionLocal()
        try:
            approval = db.query(Approval).filter(Approval.id == self.approval_id).first()
            approval.status = "pending"
            approval.approved_date = None
            approval.overdue_days = 4
            db.commit()
        finally:
            db.close()

    def test_material_stage_update_persists_stage_and_logs_audit_trail(self):
        response = self.client.put(
            f"/api/materials/{self.material_id}/stage",
            json={"new_stage": "installed"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "installed")

        from database import SessionLocal
        from models import Material, AuditTrail

        db = SessionLocal()
        try:
            material = db.query(Material).filter(Material.id == self.material_id).first()
            self.assertEqual(material.status, "installed")
            
            trail = db.query(AuditTrail).filter(AuditTrail.action == "STAGE_UPDATED").order_by(AuditTrail.id.desc()).first()
            self.assertIsNotNone(trail)
            self.assertEqual(trail.user.name, "Test Admin")
            self.assertIn("stage changed to installed", trail.details)
            
            # Reset material status
            material.status = "pending"
            db.delete(trail)
            db.commit()
        finally:
            db.close()

    def test_get_project_audit_trail_returns_list(self):
        # We perform a stage update first to generate a trail entry
        self.client.put(
            f"/api/materials/{self.material_id}/stage",
            json={"new_stage": "installed"},
        )
        from database import SessionLocal
        from models import AuditTrail, Project, User

        db = SessionLocal()
        try:
            other_project = Project(
                name="Other Project",
                location="Elsewhere",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=10),
                status="Active",
                risk_score="Low",
            )
            db.add(other_project)
            db.flush()
            user = db.query(User).filter(User.name == "Test Admin").first()
            db.add(
                AuditTrail(
                    action="OTHER_PROJECT_EVENT",
                    performed_by_id=user.id,
                    timestamp=datetime.now(),
                    details="This should not appear for Test Highway",
                    project_id=other_project.id,
                    result="recorded",
                    hash="other",
                    previous_hash="GENESIS",
                )
            )
            db.commit()
        finally:
            db.close()

        response = self.client.get(f"/api/projects/{self.project_id}/audit-trail")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]["action"], "STAGE_UPDATED")
        self.assertNotIn("OTHER_PROJECT_EVENT", [item["action"] for item in data])

        from models import Material
        db = SessionLocal()
        try:
            material = db.query(Material).filter(Material.id == self.material_id).first()
            material.status = "pending"
            db.query(AuditTrail).filter(AuditTrail.action.in_(["STAGE_UPDATED", "OTHER_PROJECT_EVENT"])).delete(synchronize_session=False)
            db.query(Project).filter(Project.name == "Other Project").delete()
            db.commit()
        finally:
            db.close()

    def test_chat_saves_to_ai_queries_table(self):
        from database import SessionLocal
        from models import AIQuery
        db = SessionLocal()
        try:
            initial_count = db.query(AIQuery).count()
            response = self.client.post(
                "/api/chat/",
                json={"project_id": self.project_id, "question": "Are there any expired certificates?"},
            )
            self.assertEqual(response.status_code, 200)
            
            new_count = db.query(AIQuery).count()
            self.assertEqual(new_count, initial_count + 1)
            
            latest_query = db.query(AIQuery).order_by(AIQuery.id.desc()).first()
            self.assertEqual(latest_query.user_query, "Are there any expired certificates?")
            self.assertIsNotNone(latest_query.ai_response)
            
            db.delete(latest_query)
            db.commit()
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
