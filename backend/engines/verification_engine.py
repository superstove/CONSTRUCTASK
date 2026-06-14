"""
Material Verification Engine

Implements a real verification workflow:
    Material → Certificate Check → Approval Check → Compliance Check → Verification Result

On success: updates material status, creates passport if missing, creates audit record,
creates scan record, creates compliance record.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy.orm import Session

from intelligence import certificate_status, approval_overdue_days, delivery_delay_days
from models import (
    Approval, Certificate, ComplianceRecord, Delivery, Material,
    ProductPassport, QRScan, AuditTrail,
)


@dataclass
class VerificationCheck:
    """Result of a single verification check."""
    name: str           # 'material_status', 'certificate', 'approval', 'delivery', 'scan_history'
    status: str         # 'pass', 'hold', 'block'
    severity: str       # 'ok', 'warning', 'critical'
    details: str        # human-readable explanation
    entity_name: str | None = None
    entity_id: int | None = None


@dataclass
class VerificationResult:
    """Complete result of a material verification."""
    verification_status: str    # 'approved', 'hold', 'blocked'
    risk_level: str             # 'Low', 'Medium', 'High'
    material_id: int
    material_name: str
    passport_id: int | None     # created or existing passport
    audit_id: int | None        # audit trail record created
    checks: list[VerificationCheck]
    blocking_reasons: list[str]
    hold_reasons: list[str]
    summary: str


def _check_material_status(material: Material) -> VerificationCheck:
    """Check 1: Material's current status."""
    status = (material.status or "").lower()
    if status == "failed":
        return VerificationCheck(
            name="material_status", status="block", severity="critical",
            details=f"Material '{material.name}' has FAILED status — cannot be released.",
            entity_name=material.name, entity_id=material.id,
        )
    if status == "pending":
        return VerificationCheck(
            name="material_status", status="hold", severity="warning",
            details=f"Material '{material.name}' is still PENDING verification.",
            entity_name=material.name, entity_id=material.id,
        )
    return VerificationCheck(
        name="material_status", status="pass", severity="ok",
        details=f"Material '{material.name}' status is '{material.status}' — OK.",
        entity_name=material.name, entity_id=material.id,
    )


def _check_certificates(
    material: Material, certificates: list[Certificate], today: date | None = None,
) -> VerificationCheck:
    """Check 2: Certificate validity for this material."""
    today = today or date.today()
    mat_certs = [c for c in certificates if c.material_id == material.id]

    if not mat_certs:
        return VerificationCheck(
            name="certificate", status="hold", severity="warning",
            details=f"No certificates found for '{material.name}' — compliance gap.",
            entity_name=material.name, entity_id=material.id,
        )

    expired = [c for c in mat_certs if certificate_status(c, today) == "expired"]
    expiring = [c for c in mat_certs if certificate_status(c, today) == "expiring"]

    if expired:
        names = ", ".join(c.certificate_name for c in expired)
        return VerificationCheck(
            name="certificate", status="block", severity="critical",
            details=f"EXPIRED certificate(s): {names}. Material cannot be released.",
            entity_name=names, entity_id=expired[0].id,
        )
    if expiring:
        names = ", ".join(c.certificate_name for c in expiring)
        return VerificationCheck(
            name="certificate", status="hold", severity="warning",
            details=f"Certificate(s) expiring soon: {names}. Renewal recommended.",
            entity_name=names, entity_id=expiring[0].id,
        )
    return VerificationCheck(
        name="certificate", status="pass", severity="ok",
        details=f"All {len(mat_certs)} certificate(s) are valid.",
    )


def _check_approvals(
    material: Material, approvals: list[Approval], today: date | None = None,
) -> VerificationCheck:
    """Check 3: Approval status for this material."""
    today = today or date.today()
    mat_approvals = [a for a in approvals if a.material_id == material.id]

    if not mat_approvals:
        return VerificationCheck(
            name="approval", status="hold", severity="warning",
            details=f"No approval gates found for '{material.name}'.",
            entity_name=material.name,
        )

    pending = [a for a in mat_approvals if (a.status or "").lower() == "pending"]
    overdue = [a for a in pending if approval_overdue_days(a, today) > 0]

    if overdue:
        worst = max(overdue, key=lambda a: approval_overdue_days(a, today))
        days = approval_overdue_days(worst, today)
        return VerificationCheck(
            name="approval", status="hold", severity="warning",
            details=f"Approval '{worst.approval_type}' overdue by {days} days.",
            entity_name=worst.approval_type, entity_id=worst.id,
        )
    if pending:
        return VerificationCheck(
            name="approval", status="hold", severity="warning",
            details=f"{len(pending)} approval(s) still pending.",
        )

    return VerificationCheck(
        name="approval", status="pass", severity="ok",
        details=f"All {len(mat_approvals)} approval(s) completed.",
    )


def _check_deliveries(
    material: Material, deliveries: list[Delivery], today: date | None = None,
) -> VerificationCheck:
    """Check 4: Delivery status for this material."""
    today = today or date.today()
    mat_name_lower = material.name.lower()
    mat_deliveries = [
        d for d in deliveries
        if d.material_name and d.material_name.lower() == mat_name_lower
    ]

    if not mat_deliveries:
        return VerificationCheck(
            name="delivery", status="hold", severity="warning",
            details=f"No delivery record found for '{material.name}'.",
            entity_name=material.name,
        )

    delayed = [d for d in mat_deliveries if delivery_delay_days(d, today) > 0]
    pending = [d for d in mat_deliveries if not d.actual_date and delivery_delay_days(d, today) == 0]

    if delayed:
        worst = max(delayed, key=lambda d: delivery_delay_days(d, today))
        days = delivery_delay_days(worst, today)
        return VerificationCheck(
            name="delivery", status="hold", severity="warning",
            details=f"Delivery from '{worst.supplier}' delayed by {days} days.",
            entity_name=worst.supplier, entity_id=worst.id,
        )
    if pending:
        return VerificationCheck(
            name="delivery", status="hold", severity="warning",
            details=f"Delivery pending — expected {pending[0].expected_date}.",
            entity_name=material.name,
        )

    return VerificationCheck(
        name="delivery", status="pass", severity="ok",
        details="Material delivered and on-time.",
    )


def _check_scan_history(material: Material, scans: list[QRScan]) -> VerificationCheck:
    """Check 5: QR scan history for this material."""
    mat_scans = [s for s in scans if s.material_id == material.id]

    if not mat_scans:
        return VerificationCheck(
            name="scan_history", status="hold", severity="warning",
            details=f"No QR scan records for '{material.name}'.",
            entity_name=material.name,
        )

    failed = [s for s in mat_scans if (s.result or "").lower() in ("failed", "blocked")]
    if failed:
        latest_fail = max(failed, key=lambda s: s.scan_time)
        return VerificationCheck(
            name="scan_history", status="block", severity="critical",
            details=f"QR scan failed/blocked on {latest_fail.scan_time.strftime('%Y-%m-%d')}.",
            entity_name=material.name, entity_id=latest_fail.id,
        )

    return VerificationCheck(
        name="scan_history", status="pass", severity="ok",
        details=f"{len(mat_scans)} QR scan(s) — all passed.",
    )


def verify_material(
    db: Session,
    material_id: int,
    project_id: int,
    user_id: int | None = None,
    today: date | None = None,
) -> VerificationResult:
    """
    Execute the full 5-check material verification pipeline.

    On success:
    - Updates material status to 'verified'
    - Creates ProductPassport if missing
    - Creates AuditTrail record
    - Creates ComplianceRecord

    Returns VerificationResult with all check details.
    """
    today = today or date.today()

    # Fetch the material
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        return VerificationResult(
            verification_status="error",
            risk_level="Unknown",
            material_id=material_id,
            material_name="Unknown",
            passport_id=None,
            audit_id=None,
            checks=[],
            blocking_reasons=["Material not found"],
            hold_reasons=[],
            summary=f"Material #{material_id} not found in database.",
        )

    # Fetch related data
    certificates = db.query(Certificate).filter(Certificate.material_id == material_id).all()
    approvals = db.query(Approval).filter(Approval.material_id == material_id).all()
    deliveries = db.query(Delivery).filter(Delivery.project_id == project_id).all()
    scans = db.query(QRScan).filter(QRScan.material_id == material_id).all()

    # Run all 5 checks
    checks = [
        _check_material_status(material),
        _check_certificates(material, certificates, today),
        _check_approvals(material, approvals, today),
        _check_deliveries(material, deliveries, today),
        _check_scan_history(material, scans),
    ]

    blocking = [c for c in checks if c.status == "block"]
    holds = [c for c in checks if c.status == "hold"]
    passed = [c for c in checks if c.status == "pass"]

    blocking_reasons = [c.details for c in blocking]
    hold_reasons = [c.details for c in holds]

    # Determine overall result
    if blocking:
        status = "blocked"
        risk = "High"
        summary = f"❌ BLOCKED — {len(blocking)} critical issue(s): {blocking_reasons[0]}"
    elif holds:
        status = "hold"
        risk = "Medium"
        summary = f"⚠️ ON HOLD — {len(holds)} issue(s) need resolution before release."
    else:
        status = "approved"
        risk = "Low"
        summary = f"✅ APPROVED — All {len(checks)} checks passed. Material ready for release."

    # --- Side Effects (only on approval or hold with no blocks) ---
    passport_id = None
    audit_id = None

    if status == "approved":
        # Update material status
        material.status = "verified"

        # Create passport if missing
        existing_passport = db.query(ProductPassport).filter(
            ProductPassport.material_id == material_id
        ).first()

        if not existing_passport:
            import uuid
            passport = ProductPassport(
                material_id=material_id,
                passport_number=f"DPP-{project_id}-{material_id}-{uuid.uuid4().hex[:6].upper()}",
                compliance_score=int(len(passed) / len(checks) * 100),
                carbon_score=1.2,
                status="active",
            )
            db.add(passport)
            db.flush()
            passport_id = passport.id
        else:
            passport_id = existing_passport.id

        # Create compliance record
        compliance = ComplianceRecord(
            material_id=material_id,
            status="verified",
            verified_by_id=user_id or 0,
            verification_date=today,
        )
        db.add(compliance)

    # Create audit record (always, regardless of result)
    from utils import sha256_hash
    prev_audit = (
        db.query(AuditTrail)
        .filter(AuditTrail.project_id == project_id)
        .order_by(AuditTrail.timestamp.desc())
        .first()
    )
    prev_hash = prev_audit.hash if prev_audit else "GENESIS"
    now = datetime.now()
    detail_text = f"Verification of '{material.name}': {status}. {len(passed)}/{len(checks)} checks passed."
    record_hash = sha256_hash(f"{prev_hash}-material_verified-{detail_text}")

    audit = AuditTrail(
        action="material_verified",
        performed_by_id=user_id or 0,
        timestamp=now,
        details=detail_text,
        material_id=material_id,
        project_id=project_id,
        result=status,
        new_status=status,
        hash=record_hash,
        previous_hash=prev_hash,
    )
    db.add(audit)
    db.flush()
    audit_id = audit.id

    db.commit()

    return VerificationResult(
        verification_status=status,
        risk_level=risk,
        material_id=material_id,
        material_name=material.name,
        passport_id=passport_id,
        audit_id=audit_id,
        checks=checks,
        blocking_reasons=blocking_reasons,
        hold_reasons=hold_reasons,
        summary=summary,
    )
