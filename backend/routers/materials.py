import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, require_role
from database import get_db
from intelligence import approval_overdue_days, certificate_status, delivery_delay_days, delivery_status
from models import Approval, AuditTrail, Certificate, Delivery, Material, ProductPassport, Project, QRScan, User
from schemas import MaterialCreate, MaterialEvidenceOut, MaterialOut, MaterialStageUpdate, ProductPassportOut, QRScanOut, ScanWarningOut
from utils import record_audit_trail
from routers.projects import require_project_access


router = APIRouter(dependencies=[Depends(get_current_user), Depends(require_project_access)])


@router.get("/", response_model=list[MaterialOut])
def list_materials(project_id: int = 1, status: str | None = Query(default=None), db: Session = Depends(get_db)):
    query = db.query(Material).filter(Material.project_id == project_id)
    if status and status != "all":
        query = query.filter(Material.status == status)
    return query.order_by(Material.id).all()


@router.post("/", response_model=MaterialOut, dependencies=[Depends(require_role("Admin", "Project Manager", "Site Engineer"))])
def create_material(material: MaterialCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == material.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    batch_number = material.batch_id.strip()[:100]
    if not batch_number:
        raise HTTPException(status_code=422, detail="batch_id is required")

    new_material = Material(
        project_id=material.project_id,
        name=material.name.strip()[:200],
        supplier=material.supplier.strip()[:200],
        batch_number=batch_number,
        qr_code=f"QR-{batch_number}",
        status=material.status.strip().lower()[:50] or "pending",
        category=material.category.strip()[:100] if material.category else None,
        quantity=material.quantity,
        unit=(material.unit or material.category or "unit").strip()[:50],
    )
    db.add(new_material)
    db.flush()

    passport_id = f"PP-{new_material.project_id}-{new_material.id}"
    
    # Dynamically derive realistic baseline metrics based on material type
    category_lower = (new_material.category or "").lower() + " " + new_material.name.lower()
    carbon_by_category = {
        "reinforcement": 1.8, "grid": 1.8, "barrier": 1.8,
        "drainage": 1.1, "drain": 1.1,
        "anchoring": 2.4, "anchor": 2.4, "bolt": 2.4, "bar": 2.4,
        "geotextile": 0.9, "textile": 0.9, "mat": 0.9,
        "concrete": 3.2, "additive": 3.2,
    }
    
    matched_carbon = 1.2
    for kw, val in carbon_by_category.items():
        if kw in category_lower:
            matched_carbon = val
            break
            
    base_compliance = 78 if new_material.status == "pending" else 85

    db.add(
        ProductPassport(
            material_id=new_material.id,
            passport_number=passport_id,
            passport_id=passport_id,
            compliance_score=base_compliance,
            carbon_score=matched_carbon,
            sustainability_score=max(50, base_compliance - 10),
            carbon_footprint=matched_carbon,
            status="active",
            metadata_json=json.dumps({"category": new_material.category, "source": "material-create"}),
        )
    )
    record_audit_trail(
        db=db,
        action="Manufactured",
        performed_by_name=current_user.name,
        details=f"Batch {new_material.batch_number} registered with {new_material.quantity} {new_material.unit}.",
        material_id=new_material.id,
        project_id=new_material.project_id
    )
    db.commit()
    db.refresh(new_material)
    return new_material


@router.put("/{material_id}/stage", response_model=MaterialOut, dependencies=[Depends(require_role("Admin", "Project Manager", "QA Auditor", "Site Engineer"))])
def update_material_stage(material_id: int, payload: MaterialStageUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    new_stage = payload.new_stage.strip().lower()
    valid_stages = {"pending", "verified", "failed", "manufactured", "certified", "delivered", "approved", "installed", "audited"}
    if new_stage not in valid_stages:
        raise HTTPException(status_code=422, detail=f"Invalid stage. Must be one of: {', '.join(sorted(valid_stages))}")

    material.status = new_stage
    record_audit_trail(
        db=db,
        action="STAGE_UPDATED",
        performed_by_name=current_user.name,
        details=f"Material {material.name} stage changed to {new_stage}",
        material_id=material.id,
        project_id=material.project_id
    )
    db.commit()
    db.refresh(material)
    return material


@router.get("/passports", response_model=list[ProductPassportOut])
def list_passports(project_id: int = 1, db: Session = Depends(get_db)):
    passports = (
        db.query(ProductPassport)
        .join(Material)
        .filter(Material.project_id == project_id)
        .all()
    )
    return passports


def _scan_out(scan: QRScan) -> QRScanOut:
    return QRScanOut(
        id=scan.id,
        material_id=scan.material_id,
        project_id=scan.project_id,
        scanned_by=scan.user.name if scan.user else str(scan.scanned_by),
        scan_time=scan.scan_time,
        location=scan.location,
        scan_type=scan.scan_type,
        result=scan.result,
        material_name=scan.material.name,
    )


@router.post("/verify", dependencies=[Depends(require_role("Admin", "Project Manager", "QA Auditor", "Site Engineer", "Evidence Operator"))])
def verify_material(
    qr_code: str,
    location: str,
    scanned_by: str = None,
    project_id: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --- Input validation ---
    qr_code = qr_code.strip()[:100]
    scanned_by = scanned_by.strip()[:100]
    location = location.strip()[:200]

    if not qr_code:
        raise HTTPException(status_code=422, detail="qr_code is required")
    if not location:
        raise HTTPException(status_code=422, detail="location is required")

    scanned_by = current_user.name

    material = (
        db.query(Material)
        .filter(Material.qr_code == qr_code, Material.project_id == project_id)
        .first()
    )

    if not material:
        return {
            "decision": "Blocked",
            "material": None,
            "batch_number": None,
            "supplier": None,
            "reasons": ["QR code not found in this project."],
        }

    certificates = db.query(Certificate).filter(Certificate.material_id == material.id).all()
    approvals = (
        db.query(Approval)
        .filter(Approval.material_id == material.id)
        .all()
    )
    deliveries = (
        db.query(Delivery)
        .filter(Delivery.project_id == project_id, Delivery.material_name == material.name)
        .all()
    )
    scans = db.query(QRScan).filter(QRScan.material_id == material.id).order_by(QRScan.scan_time.desc()).all()
    expired_certs = [cert for cert in certificates if certificate_status(cert) == "expired"]
    expiring_certs = [cert for cert in certificates if certificate_status(cert) == "expiring"]
    pending_approvals = [approval for approval in approvals if approval.status == "pending"]
    overdue_approvals = [approval for approval in pending_approvals if approval_overdue_days(approval) > 0]
    delayed_deliveries = [delivery for delivery in deliveries if delivery_delay_days(delivery) > 0]
    pending_deliveries = [
        delivery for delivery in deliveries
        if not delivery.actual_date and delivery_delay_days(delivery) == 0 and delivery.status == "pending"
    ]
    # Filter out release_check scans when evaluating QR history to avoid self-referencing noise
    field_scans = [scan for scan in scans if scan.scan_type != "release_check"]
    passed_site_scans = [scan for scan in field_scans if scan.result in {"passed", "approved_for_site_use"}]
    failed_scans = [scan for scan in field_scans if "failed" in scan.result or "blocked" in scan.result]

    reasons: list[str] = []
    checks: list[dict[str, str]] = []
    decision = "Approved for site use"

    def hold(reason: str) -> None:
        nonlocal decision
        if decision == "Approved for site use":
            decision = "Hold for review"
        reasons.append(reason)

    def block(reason: str) -> None:
        nonlocal decision
        decision = "Blocked from installation"
        reasons.append(reason)

    if material.status == "failed":
        block("Material batch has failed verification review.")
        checks.append({"label": "Material status", "status": "Blocked", "detail": "Batch is marked failed."})
    elif material.status == "pending":
        hold("Material is still pending verification.")
        checks.append({"label": "Material status", "status": "Hold", "detail": "Batch is not verified yet."})
    else:
        checks.append({"label": "Material status", "status": "Pass", "detail": "Batch is verified."})

    if expired_certs:
        block(f"{expired_certs[0].certificate_name} is expired.")
        checks.append({"label": "Certificate", "status": "Blocked", "detail": f"{expired_certs[0].certificate_name} expired."})
    elif expiring_certs:
        hold(f"{expiring_certs[0].certificate_name} is expiring soon.")
        checks.append({"label": "Certificate", "status": "Hold", "detail": f"{expiring_certs[0].certificate_name} is near expiry."})
    elif certificates:
        checks.append({"label": "Certificate", "status": "Pass", "detail": "Certificate evidence is valid."})
    else:
        hold("No certificate evidence is linked to this material.")
        checks.append({"label": "Certificate", "status": "Hold", "detail": "Certificate evidence is missing."})

    if overdue_approvals:
        hold(f"{overdue_approvals[0].approval_type} is {approval_overdue_days(overdue_approvals[0])} days overdue.")
        checks.append({"label": "Approval", "status": "Hold", "detail": f"{overdue_approvals[0].approval_type} is overdue."})
    elif pending_approvals:
        hold(f"{pending_approvals[0].approval_type} is still pending.")
        checks.append({"label": "Approval", "status": "Hold", "detail": f"{pending_approvals[0].approval_type} is pending."})
    elif approvals:
        checks.append({"label": "Approval", "status": "Pass", "detail": "Required approval is cleared."})
    else:
        checks.append({"label": "Approval", "status": "Not required", "detail": "No approval gate is linked to this material."})

    if delayed_deliveries:
        hold(f"{delayed_deliveries[0].material_name} delivery is delayed by {delivery_delay_days(delayed_deliveries[0])} days.")
        checks.append({"label": "Delivery", "status": "Hold", "detail": "Delivery is delayed."})
    elif pending_deliveries:
        hold(f"{pending_deliveries[0].material_name} delivery is still pending.")
        checks.append({"label": "Delivery", "status": "Hold", "detail": "Delivery has not reached site yet."})
    elif deliveries:
        checks.append({"label": "Delivery", "status": "Pass", "detail": "Delivery evidence is clear."})
    elif passed_site_scans:
        checks.append({"label": "Delivery", "status": "Pass", "detail": "Site scan confirms material presence."})
    else:
        hold("No delivery or site-receipt scan is linked to this material.")
        checks.append({"label": "Delivery", "status": "Hold", "detail": "Delivery evidence is missing."})

    if failed_scans:
        block("Previous QR scan history contains a failed or blocked result.")
        checks.append({"label": "QR history", "status": "Blocked", "detail": "Failed scan result found in history."})
    elif field_scans:
        checks.append({"label": "QR history", "status": "Pass", "detail": "QR scan history is available."})
    else:
        checks.append({"label": "QR history", "status": "New", "detail": "No previous scans before this release check."})

    if not reasons:
        reasons.append("Material is verified, certificates are valid, approvals are clear, and site evidence is acceptable.")

    result_map = {
        "Approved for site use": "approved_for_site_use",
        "Hold for review": "hold_for_review",
        "Blocked from installation": "blocked_from_installation",
    }
    
    db.add(
        QRScan(
            material_id=material.id,
            project_id=project_id,
            scanned_by=current_user.id,
            scan_time=datetime.now(),
            location=location,
            scan_type="release_check",
            result=result_map.get(decision, "blocked"),
        )
    )
    record_audit_trail(
        db=db,
        action="MATERIAL_VERIFIED",
        performed_by_name=scanned_by,
        details=f"Material {material.name} (QR: {qr_code}) scanned at {location}. Decision: {decision}. Result: {result_map.get(decision, 'blocked')}",
        material_id=material.id,
        project_id=project_id,
        result=result_map.get(decision, "blocked")
    )
    db.commit()

    return {
        "decision": decision,
        "material": material.name,
        "batch_number": material.batch_number,
        "supplier": material.supplier,
        "qr_code": material.qr_code,
        "reasons": reasons,
        "checks": checks,
    }


@router.get("/scans/all", response_model=list[QRScanOut])
def all_scans(project_id: int = 1, db: Session = Depends(get_db)):
    scans = (
        db.query(QRScan)
        .options(joinedload(QRScan.material), joinedload(QRScan.user))
        .filter(QRScan.project_id == project_id)
        .order_by(QRScan.scan_time.desc())
        .all()
    )
    return [_scan_out(scan) for scan in scans]


def _material_release_status(
    material: Material,
    certificates: list[Certificate],
    approvals: list[Approval],
) -> str:
    expired = [cert for cert in certificates if certificate_status(cert) == "expired"]
    overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
    expiring = [cert for cert in certificates if certificate_status(cert) == "expiring"]

    if material.status == "failed" or expired:
        return "Blocked"
    if material.status == "pending" or overdue or expiring:
        return "Hold"
    return "Ready"


def _certificate_summary(certificates: list[Certificate]) -> str:
    statuses = {certificate_status(cert) for cert in certificates}
    if "expired" in statuses:
        return "Expired"
    if "expiring" in statuses:
        return "Expiring"
    if certificates:
        return "Valid"
    return "Missing"


def _approval_summary(approvals: list[Approval]) -> str:
    overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
    pending = [approval for approval in approvals if approval.status == "pending"]
    if overdue:
        return "Overdue"
    if pending:
        return "Pending"
    if approvals:
        return "Approved"
    return "Not required"


def _delivery_summary(deliveries: list[Delivery]) -> str:
    delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery) > 0]
    pending = [delivery for delivery in deliveries if delivery_status(delivery) == "pending"]
    if delayed:
        return "Delayed"
    if pending:
        return "Pending"
    if deliveries:
        return "Delivered"
    return "No delivery record"


@router.get("/evidence", response_model=list[MaterialEvidenceOut])
def material_evidence(project_id: int = 1, db: Session = Depends(get_db)):
    materials = (
        db.query(Material)
        .options(
            joinedload(Material.certificates),
            joinedload(Material.approvals),
            joinedload(Material.scans),
        )
        .filter(Material.project_id == project_id)
        .order_by(Material.id)
        .all()
    )
    deliveries = db.query(Delivery).filter(Delivery.project_id == project_id).all()

    cards = []
    for material in materials:
        material_deliveries = [delivery for delivery in deliveries if delivery.material_name == material.name]
        scans = sorted(
            [scan for scan in material.scans if scan.project_id == project_id],
            key=lambda scan: scan.scan_time,
            reverse=True,
        )
        last_scan = scans[0] if scans else None
        cards.append(
            MaterialEvidenceOut(
                material_id=material.id,
                material_name=material.name,
                supplier=material.supplier,
                batch_number=material.batch_number,
                qr_code=material.qr_code,
                release_status=_material_release_status(material, material.certificates, material.approvals),
                certificate_status=_certificate_summary(material.certificates),
                approval_status=_approval_summary(material.approvals),
                delivery_status=_delivery_summary(material_deliveries),
                last_scan_result=last_scan.result if last_scan else None,
                last_scan_location=last_scan.location if last_scan else None,
                last_scan_time=last_scan.scan_time if last_scan else None,
            )
        )
    return cards


@router.get("/scans/warnings", response_model=list[ScanWarningOut])
def scan_warnings(project_id: int = 1, db: Session = Depends(get_db)):
    materials = (
        db.query(Material)
        .options(joinedload(Material.scans))
        .filter(Material.project_id == project_id)
        .order_by(Material.id)
        .all()
    )
    warnings = []
    for material in materials:
        # Filter out release_check scans to avoid noise from the verify endpoint
        scans = [scan for scan in material.scans if scan.project_id == project_id and scan.scan_type != "release_check"]
        locations = sorted({scan.location for scan in scans if scan.location})
        if len(locations) > 1:
            warnings.append(
                ScanWarningOut(
                    material_id=material.id,
                    material_name=material.name,
                    qr_code=material.qr_code,
                    warning_type="Multiple locations",
                    detail=f"{material.qr_code} was scanned at {', '.join(locations)}.",
                    severity="Warning",
                )
            )
        blocked_reuse = [scan for scan in scans if scan.result in {"blocked_from_installation", "blocked"}]
        if len(blocked_reuse) > 1:
            warnings.append(
                ScanWarningOut(
                    material_id=material.id,
                    material_name=material.name,
                    qr_code=material.qr_code,
                    warning_type="Repeated blocked scan",
                    detail=f"{material.qr_code} has {len(blocked_reuse)} blocked release attempts.",
                    severity="Blocker",
                )
            )
    return warnings


@router.get("/{material_id}/scans", response_model=list[QRScanOut])
def material_scans(material_id: int, db: Session = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    scans = (
        db.query(QRScan)
        .options(joinedload(QRScan.material), joinedload(QRScan.user))
        .filter(QRScan.material_id == material_id)
        .order_by(QRScan.scan_time.desc())
        .all()
    )
    return [_scan_out(scan) for scan in scans]
