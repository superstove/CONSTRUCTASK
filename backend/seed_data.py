from datetime import date, datetime, timedelta

from database import Base, SessionLocal, engine
from models import Approval, Certificate, Delivery, Material, Project, QRScan


def seed_project(
    db,
    project: Project,
    material_specs: list[tuple[str, str, str, str, str, int, str]],
    approvals: list[tuple[str, str, str, str, date, date | None, int]],
    certificates: list[tuple[str, str, str, date, date, str]],
    deliveries: list[tuple[str, str, date, date | None, str, int]],
    scan_specs: list[tuple[str, str, str, str, str, int]],
) -> None:
    db.add(project)
    db.flush()

    materials = {}
    for name, supplier, batch, qr_code, status, quantity, unit in material_specs:
        material = Material(
            project_id=project.id,
            name=name,
            supplier=supplier,
            batch_number=batch,
            qr_code=qr_code,
            status=status,
            quantity=quantity,
            unit=unit,
        )
        db.add(material)
        db.flush()
        materials[name] = material

    for approval_type, material_name, approver, status, requested, approved, overdue in approvals:
        db.add(
            Approval(
                project_id=project.id,
                material_id=materials[material_name].id,
                approval_type=approval_type,
                approver=approver,
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
                certificate_name=cert_name,
                issuing_body=body,
                issue_date=issued,
                expiry_date=expires,
                status=status,
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
        db.add(
            QRScan(
                material_id=materials[material_name].id,
                project_id=project.id,
                scanned_by=scanned_by,
                scan_time=datetime.now() - timedelta(hours=hours_ago),
                location=location,
                scan_type=scan_type,
                result=result,
            )
        )


def seed_database() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        db.query(QRScan).delete()
        db.query(Delivery).delete()
        db.query(Certificate).delete()
        db.query(Approval).delete()
        db.query(Material).delete()
        db.query(Project).delete()
        db.commit()

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
        )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
    print("ConstructAsk sample data seeded.")
