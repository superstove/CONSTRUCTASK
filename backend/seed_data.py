import os
from datetime import date, datetime, timedelta

from auth import hash_password
from database import Base, SessionLocal, engine, ensure_demo_schema
from models import Approval, AuditTrail, Certificate, ComplianceRecord, Delivery, Material, ProductPassport, Project, QRScan, User
from utils import record_audit_trail

# Shared password for all seeded demo accounts (override with DEMO_USER_PASSWORD).
DEMO_PASSWORD = os.getenv("DEMO_USER_PASSWORD", "demo1234")


def _material_category(name: str) -> str:
    lowered = name.lower()
    if "geogrid" in lowered or "grid" in lowered or "barrier" in lowered:
        return "reinforcement"
    if "drain" in lowered:
        return "drainage"
    if "anchor" in lowered or "bolt" in lowered or "bar" in lowered:
        return "anchoring"
    if "textile" in lowered or "mat" in lowered:
        return "geotextile"
    if "additive" in lowered or "concrete" in lowered:
        return "concrete"
    return "general"


def _passport_scores(status: str, category: str) -> tuple[int, float]:
    if status == "verified":
        base_score = 94
    elif status == "pending":
        base_score = 78
    elif status == "failed":
        base_score = 52
    else:
        base_score = 85

    carbon_by_category = {
        "reinforcement": 1.8,
        "drainage": 1.1,
        "anchoring": 2.4,
        "geotextile": 0.9,
        "concrete": 3.2,
        "general": 1.2,
    }
    return base_score, carbon_by_category.get(category, 1.2)

def seed_project(
    db,
    project: Project,
    material_specs: list[tuple[str, str, str, str, str, int, str]],
    approvals: list[tuple[str, str, str, str, date, date | None, int]],
    certificates: list[tuple[str, str, str, date, date, str]],
    deliveries: list[tuple[str, str, date, date | None, str, int]],
    scan_specs: list[tuple[str, str, str, str, str, int]],
    user_name_to_id: dict[str, int],
) -> None:
    db.add(project)
    db.flush()

    materials = {}
    for name, supplier, batch, qr_code, status, quantity, unit in material_specs:
        category = _material_category(name)
        material = Material(
            project_id=project.id,
            name=name,
            supplier=supplier,
            batch_number=batch,
            qr_code=qr_code,
            status=status,
            category=category,
            quantity=quantity,
            unit=unit,
        )
        db.add(material)
        db.flush()
        passport_number = f"PP-{project.id}-{material.id}"
        compliance_score, carbon_score = _passport_scores(status, category)
        db.add(
            ProductPassport(
                material_id=material.id,
                passport_number=passport_number,
                passport_id=passport_number,
                project_id=project.id,
                supplier=supplier,
                manufacturer=supplier,
                origin_country="India",
                carbon_footprint=carbon_score,
                compliance_score=compliance_score,
                sustainability_score=max(50, compliance_score - 10),
                carbon_score=carbon_score,
                status="active",
                metadata_json=f'{{"source":"seed_data","category":"{category}","batch":"{batch}"}}',
                created_at=datetime.now(),
            )
        )
        materials[name] = material
        record_audit_trail(
            db,
            action="MATERIAL_CREATED",
            performed_by_name="System",
            details=f"{name} batch {batch} registered from {supplier}.",
            material_id=material.id,
            project_id=project.id,
            result=status,
        )

    for approval_type, material_name, approver, status, requested, approved, overdue in approvals:
        db.add(
            Approval(
                project_id=project.id,
                material_id=materials[material_name].id,
                approval_type=approval_type,
                approver_id=user_name_to_id.get(approver, list(user_name_to_id.values())[0]),
                status=status,
                requested_date=requested,
                approved_date=approved,
                overdue_days=overdue,
            )
        )

    for cert_name, material_name, body, issued, expires, status in certificates:
        db.add(
            Certificate(
                material_id=materials[material_name].id,
                project_id=project.id,
                certificate_name=cert_name,
                issuing_body=body,
                issue_date=issued,
                expiry_date=expires,
                status=status,
            )
        )
        db.add(
            ComplianceRecord(
                material_id=materials[material_name].id,
                status=status,
                verified_by_id=user_name_to_id.get("Er. Asha Thomas", list(user_name_to_id.values())[0]),
                verification_date=issued,
            )
        )

    for supplier, material_name, expected, actual, status, delay_days in deliveries:
        db.add(
            Delivery(
                project_id=project.id,
                supplier=supplier,
                material_name=material_name,
                expected_date=expected,
                actual_date=actual,
                status=status,
                delay_days=delay_days,
            )
        )

    for material_name, scanned_by, location, scan_type, result, hours_ago in scan_specs:
        user_id = user_name_to_id.get(scanned_by)
        if not user_id:
            user = User(
                name=scanned_by,
                email=f"{scanned_by.lower().replace(' ', '.')}@constructask.dev",
                role="Site Operator",
                hashed_password=hash_password(DEMO_PASSWORD),
                is_system=True,
            )
            db.add(user)
            db.flush()
            user_name_to_id[scanned_by] = user.id
            user_id = user.id

        db.add(
            QRScan(
                material_id=materials[material_name].id,
                project_id=project.id,
                scanned_by=user_id,
                scan_time=datetime.now() - timedelta(hours=hours_ago),
                location=location,
                scan_type=scan_type,
                result=result,
            )
        )


def seed_database() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_demo_schema()
    db = SessionLocal()

    try:
        from models import AIQuery, ConversationMessage, ConversationSession

        db.query(ConversationMessage).delete()
        db.query(ConversationSession).delete()
        db.query(AIQuery).delete()
        db.query(AuditTrail).delete()
        db.query(ComplianceRecord).delete()
        db.query(QRScan).delete()
        db.query(Delivery).delete()
        db.query(Certificate).delete()
        db.query(Approval).delete()
        db.query(ProductPassport).delete()
        db.query(Material).delete()
        db.query(Project).delete()
        db.query(User).delete()
        db.commit()

        # Seed users first. All demo users share one demo password (see DEMO_PASSWORD).
        demo_hash = hash_password(DEMO_PASSWORD)

        # One visible demo account for testing (is_system=False by default).
        demo_account = User(name="Anton Demo", email="demo@constructask.dev", role="Project Manager", hashed_password=demo_hash)
        db.add(demo_account)
        db.flush()

        # Internal/system users — needed for project seed data (approvals, scans, compliance)
        # but hidden from the user switcher (is_system=True).
        demo_users = [
            User(name="Anand AK", email="anand.ak@constructask.dev", role="Evidence Operator", hashed_password=demo_hash, is_system=True),
            User(name="Er. Anoop Varghese", email="anoop.v@constructask.dev", role="Project Manager", hashed_password=demo_hash, is_system=True),
            User(name="Er. Asha Thomas", email="asha.t@constructask.dev", role="Compliance Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Er. Manu Joseph", email="manu.j@constructask.dev", role="Site Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Asha Thomas", email="asha.thomas@constructask.dev", role="Compliance Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Vishnu Raj", email="vishnu.raj@constructask.dev", role="Site Inspector", hashed_password=demo_hash, is_system=True),
            User(name="Rahul Menon", email="rahul.menon@constructask.dev", role="QA Inspector", hashed_password=demo_hash, is_system=True),
            User(name="John Mathew", email="john.mathew@constructask.dev", role="Store Keeper", hashed_password=demo_hash, is_system=True),
            User(name="Neha Rao", email="neha.rao@constructask.dev", role="Consultant Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Manu Joseph", email="manu.joseph@constructask.dev", role="Site Engineer", hashed_password=demo_hash, is_system=True),
            User(name="L. Nanditha", email="l.nanditha@constructask.dev", role="Structural Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Consultant QA", email="consultant.qa@constructask.dev", role="Consultant Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Project Engineer", email="project.engineer@constructask.dev", role="Project Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Procurement Lead", email="procurement.lead@constructask.dev", role="Procurement Lead", hashed_password=demo_hash, is_system=True),
            User(name="R. Prakash", email="r.prakash@constructask.dev", role="Consultant Engineer", hashed_password=demo_hash, is_system=True),
            User(name="S. Iyer", email="s.iyer@constructask.dev", role="Quality Manager", hashed_password=demo_hash, is_system=True),
            User(name="M. Shabeer", email="m.shabeer@constructask.dev", role="Testing Engineer", hashed_password=demo_hash, is_system=True),
            User(name="Ar. Meera Nair", email="meera.nair@constructask.dev", role="Architect Consultant", hashed_password=demo_hash, is_system=True),
        ]
        db.add_all(demo_users)
        db.flush()

        user_name_to_id = {u.name: u.id for u in demo_users}
        user_name_to_id[demo_account.name] = demo_account.id

        today = date.today()
        seed_project(
            db,
            Project(
                name="NH66 Highway Slope Protection",
                location="Kerala, India",
                start_date=today - timedelta(days=45),
                end_date=today + timedelta(days=300),
                status="Active",
                risk_score="High",
            ),
            [
                ("Rockfall Barrier Panel", "GeoStruct Materials", "NH66-RBP-11", "QR-NH66-RBP-11", "verified", 1800, "sqm"),
                ("Gabion Basket System", "Kerala Infra Metals", "NH66-GB-05", "QR-NH66-GB-05", "pending", 420, "units"),
                ("High-Tensile Anchor Rod", "SlopeSecure India", "NH66-AR-18", "QR-NH66-AR-18", "verified", 260, "units"),
                ("Geocomposite Drainage Mat", "Coastal GeoSupply", "NH66-GDM-09", "QR-NH66-GDM-09", "pending", 950, "sqm"),
                ("Cementitious Slope Protection Mat", "BuildChem Labs", "NH66-CSP-03", "QR-NH66-CSP-03", "failed", 520, "sqm"),
            ],
            [
                ("Slope Design Approval", "Gabion Basket System", "Er. Anoop Varghese", "pending", today - timedelta(days=9), None, 3),
                ("Drainage Layout Approval", "Geocomposite Drainage Mat", "L. Nanditha", "pending", today - timedelta(days=5), None, 1),
                ("Anchor Load Test Release", "High-Tensile Anchor Rod", "M. Shabeer", "approved", today - timedelta(days=14), today - timedelta(days=8), 0),
            ],
            [
                ("ETA Conformity Certificate", "Rockfall Barrier Panel", "TUV Rheinland India", today - timedelta(days=240), today + timedelta(days=18), "expiring"),
                ("Galvanizing Compliance Certificate", "Gabion Basket System", "Kerala Materials Lab", today - timedelta(days=120), today + timedelta(days=210), "valid"),
                ("IS 16014 Steel Certificate", "High-Tensile Anchor Rod", "Bureau of Indian Standards", today - timedelta(days=280), today + timedelta(days=88), "valid"),
                ("Hydraulic Flow Test Report", "Geocomposite Drainage Mat", "Coastal QA Lab", today - timedelta(days=90), today + timedelta(days=160), "valid"),
                ("Material Compatibility Report", "Cementitious Slope Protection Mat", "BuildChem QA Lab", today - timedelta(days=370), today - timedelta(days=9), "expired"),
            ],
            [
                ("GeoStruct Materials", "Rockfall Barrier Panel", today - timedelta(days=8), today - timedelta(days=8), "on_time", 0),
                ("Coastal GeoSupply", "Geocomposite Drainage Mat", today - timedelta(days=2), None, "delayed", 2),
                ("Kerala Infra Metals", "Gabion Basket System", today + timedelta(days=2), None, "pending", 0),
                ("SlopeSecure India", "High-Tensile Anchor Rod", today - timedelta(days=7), today - timedelta(days=7), "on_time", 0),
                ("BuildChem Labs", "Cementitious Slope Protection Mat", today - timedelta(days=5), None, "blocked", 0),
            ],
            [
                ("Rockfall Barrier Panel", "Asha Thomas", "Chainage 42+300 - Cut Slope", "confirm_use", "passed", 6),
                ("Gabion Basket System", "Vishnu Raj", "Chainage 42+520 - Toe Wall", "check_spec", "pending_approval", 5),
                ("Cementitious Slope Protection Mat", "Asha Thomas", "Batch Store - North Yard", "check_spec", "failed_lab_review", 4),
                ("High-Tensile Anchor Rod", "Rahul Menon", "Anchor Row 3", "confirm_use", "passed", 3),
                ("Geocomposite Drainage Mat", "Vishnu Raj", "Drainage Bench 2", "check_spec", "pending_drainage_layout", 2),
            ],
            user_name_to_id,
        )

        seed_project(
            db,
            Project(
                name="Metro Bridge Expansion",
                location="Bangalore, Karnataka",
                start_date=today - timedelta(days=96),
                end_date=today + timedelta(days=210),
                status="Active",
                risk_score="High",
            ),
            [
                ("Reinforcement Grid 30/30", "Supplier Delta", "BATCH-GEO-22", "QR-GEO-22", "verified", 1200, "sqm"),
                ("SlopeShield Pro 600", "GeoStruct Materials", "GRID-BATCH-07", "QR-SSP-07", "pending", 600, "sqm"),
                ("Steel Reinforcement Bar", "InfraBuild Systems", "STEEL-BATCH-14", "QR-SRB-14", "verified", 18, "tonnes"),
                ("Composite Reinforcement Grid 40/40", "Supplier Delta", "GRID-BATCH-31", "QR-CRG-31", "failed", 900, "sqm"),
                ("GeoGrid Foundation Mesh", "GeoStruct Materials", "FOUND-BATCH-09", "QR-GFM-09", "pending", 750, "sqm"),
            ],
            [
                ("Structural Approval", "SlopeShield Pro 600", "Ar. Meera Nair", "pending", today - timedelta(days=12), None, 5),
                ("Consultant Approval", "GeoGrid Foundation Mesh", "R. Prakash", "pending", today - timedelta(days=7), None, 2),
                ("Quality Release", "Reinforcement Grid 30/30", "S. Iyer", "approved", today - timedelta(days=16), today - timedelta(days=11), 0),
            ],
            [
                ("ISO 9001", "Reinforcement Grid 30/30", "TUV India", today - timedelta(days=359), today + timedelta(days=6), "expiring"),
                ("CE Marking", "Steel Reinforcement Bar", "EU Notified Body", today - timedelta(days=320), today + timedelta(days=45), "valid"),
                ("BIS Certification", "SlopeShield Pro 600", "Bureau of Indian Standards", today - timedelta(days=367), today - timedelta(days=2), "expired"),
                ("Factory QA Certificate", "Composite Reinforcement Grid 40/40", "Delta QA Lab", today - timedelta(days=210), today - timedelta(days=14), "expired"),
                ("Foundation Mesh Test Report", "GeoGrid Foundation Mesh", "GeoStruct Materials Lab", today - timedelta(days=80), today + timedelta(days=180), "valid"),
            ],
            [
                ("Supplier Delta", "Reinforcement Grid 30/30", today - timedelta(days=6), today - timedelta(days=6), "on_time", 0),
                ("GeoStruct Materials", "SlopeShield Pro 600", today - timedelta(days=3), None, "blocked", 0),
                ("Supplier Delta", "Composite Reinforcement Grid 40/40", today - timedelta(days=4), None, "delayed", 4),
                ("GeoStruct Materials", "GeoGrid Foundation Mesh", today + timedelta(days=1), None, "pending", 0),
                ("InfraBuild Systems", "Steel Reinforcement Bar", today - timedelta(days=2), today - timedelta(days=2), "on_time", 0),
            ],
            [
                ("Reinforcement Grid 30/30", "John Mathew", "Zone A - Retaining Wall", "confirm_use", "passed", 5),
                ("SlopeShield Pro 600", "Neha Rao", "Zone B - Slope Face", "check_spec", "pending_approval", 4),
                ("Composite Reinforcement Grid 40/40", "John Mathew", "Site Gate", "check_spec", "failed_batch_review", 3),
                ("Steel Reinforcement Bar", "Manu Joseph", "Pier 4", "confirm_use", "passed", 2),
                ("GeoGrid Foundation Mesh", "Neha Rao", "Zone C - Foundation", "check_spec", "pending_consultant", 1),
            ],
            user_name_to_id,
        )

        seed_project(
            db,
            Project(
                name="Metro Bridge Material Control Demo",
                location="Kochi Metro Extension Corridor",
                start_date=today - timedelta(days=21),
                end_date=today + timedelta(days=120),
                status="Active",
                risk_score="High",
            ),
            [
                ("Geogrid BX1200", "Delta GeoSystems", "GEO-PPMQR-22", "QR-GEO-PPMQR-22", "verified", 2800, "sqm"),
                ("Geogrid BX1200 Backup Lot", "Delta GeoSystems", "GEO-PPMQR-23", "QR-GEO-PPMQR-23", "pending", 2200, "sqm"),
                ("DrainCore Composite", "TerraGrid India", "DRN-PPMQR-04", "QR-DRN-PPMQR-04", "verified", 1400, "sqm"),
                ("AnchorBolt M20", "CoreBuild Materials", "ANC-PPMQR-16", "QR-ANC-PPMQR-16", "verified", 900, "units"),
                ("GeoTextile GT-200", "TerraGrid India", "GTX-PPMQR-31", "QR-GTX-PPMQR-31", "failed", 1800, "sqm"),
                ("Concrete Additive C-90", "CoreBuild Materials", "CAD-PPMQR-90", "QR-CAD-PPMQR-90", "pending", 320, "litres"),
            ],
            [
                ("Consultant Material Approval", "Geogrid BX1200", "Consultant QA", "pending", today - timedelta(days=8), None, 4),
                ("Drainage Product Approval", "DrainCore Composite", "Consultant QA", "approved", today - timedelta(days=10), today - timedelta(days=7), 0),
                ("Anchor Installation Approval", "AnchorBolt M20", "Project Engineer", "approved", today - timedelta(days=12), today - timedelta(days=6), 0),
                ("BOQ Mismatch Review", "GeoTextile GT-200", "R. Prakash", "pending", today - timedelta(days=5), None, 2),
            ],
            [
                ("ISO-221 Reinforcement Certificate", "Geogrid BX1200", "Delta GeoSystems QA", today - timedelta(days=180), today + timedelta(days=6), "expiring"),
                ("QA-778 Drainage Compliance", "DrainCore Composite", "TerraGrid QA Lab", today - timedelta(days=80), today + timedelta(days=84), "valid"),
                ("MTC-514 Anchor Steel Test", "AnchorBolt M20", "CoreBuild Metallurgy Lab", today - timedelta(days=60), today + timedelta(days=31), "valid"),
                ("GT-200 Filtration Test", "GeoTextile GT-200", "TerraGrid QA Lab", today - timedelta(days=390), today - timedelta(days=11), "expired"),
                ("C-90 Concrete Compatibility Certificate", "Concrete Additive C-90", "CoreBuild Materials Lab", today - timedelta(days=20), today + timedelta(days=40), "valid"),
            ],
            [
                ("Delta GeoSystems", "Geogrid BX1200", today - timedelta(days=2), today - timedelta(days=2), "on_time", 0),
                ("Delta GeoSystems", "Geogrid BX1200 Backup Lot", today - timedelta(days=4), None, "delayed", 4),
                ("TerraGrid India", "DrainCore Composite", today - timedelta(days=3), today - timedelta(days=3), "on_time", 0),
                ("CoreBuild Materials", "AnchorBolt M20", today - timedelta(days=1), today - timedelta(days=1), "on_time", 0),
                ("TerraGrid India", "GeoTextile GT-200", today - timedelta(days=2), None, "delayed", 2),
                ("CoreBuild Materials", "Concrete Additive C-90", today + timedelta(days=1), None, "pending", 0),
            ],
            [
                ("Geogrid BX1200", "Vishnu Raj", "Pier P4", "check_specification", "passed", 9),
                ("Geogrid BX1200", "Vishnu Raj", "Pier P4", "confirm_use", "confirmed_before_approval", 8),
                ("Geogrid BX1200", "Vishnu Raj", "Pier P4", "check_specification", "repeated_scan", 7),
                ("Geogrid BX1200", "Vishnu Raj", "Pier P4", "check_specification", "repeated_scan", 6),
                ("DrainCore Composite", "Neha Rao", "Pier P7", "check_specification", "passed", 5),
                ("GeoTextile GT-200", "John Mathew", "Storage Yard", "check_specification", "hold_boq_mismatch", 4),
                ("AnchorBolt M20", "Manu Joseph", "Warehouse A", "warehouse_receipt", "received", 3),
                ("Geogrid BX1200 Backup Lot", "Procurement Lead", "Gate 2", "delivery_check", "pending_delivery", 2),
            ],
            user_name_to_id,
        )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
    print("ConstructAsk sample data seeded.")
