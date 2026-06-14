"""
Product Passport Router — Digital Product Passport CRUD

Implements the full DPP lifecycle API:
    POST /api/passports/     — Create passport
    GET  /api/passports/     — List by project_id
    GET  /api/passports/{id} — Single passport with full context
    PUT  /api/passports/{id} — Update passport
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, require_role
from database import get_db
from models import (
    Approval, Certificate, Material, ProductPassport, QRScan,
)
from engines.audit_engine import track_passport_created


router = APIRouter(dependencies=[Depends(get_current_user)])


# --- Schemas (inline to avoid circular imports) ---
from pydantic import BaseModel, ConfigDict


class PassportCreate(BaseModel):
    material_id: int
    project_id: int
    supplier: str | None = None
    manufacturer: str | None = None
    origin_country: str | None = None
    carbon_footprint: float | None = None
    compliance_score: int | None = None
    sustainability_score: int | None = None


class PassportUpdate(BaseModel):
    supplier: str | None = None
    manufacturer: str | None = None
    origin_country: str | None = None
    carbon_footprint: float | None = None
    compliance_score: int | None = None
    sustainability_score: int | None = None
    status: str | None = None


class PassportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    passport_number: str
    passport_id: str | None = None
    material_id: int
    compliance_score: int
    carbon_score: float
    status: str
    metadata_json: str | None = None


class PassportDetailOut(BaseModel):
    """Rich passport detail with related material, certificates, approvals, scans."""
    passport: PassportOut
    material: dict | None = None
    certificates: list[dict] = []
    approvals: list[dict] = []
    latest_scan: dict | None = None
    verification_status: str = "unknown"


# --- Endpoints ---

@router.get("/", response_model=list[PassportOut])
def list_passports(
    project_id: int = Query(..., description="Project ID to filter by"),
    db: Session = Depends(get_db),
):
    """List all product passports for a project."""
    # Get material IDs belonging to this project
    material_ids = [
        m.id for m in db.query(Material.id).filter(Material.project_id == project_id).all()
    ]
    if not material_ids:
        return []

    passports = (
        db.query(ProductPassport)
        .filter(ProductPassport.material_id.in_(material_ids))
        .all()
    )
    return passports


@router.get("/{passport_id}")
def get_passport_detail(passport_id: int, db: Session = Depends(get_db)):
    """Get a single passport with full material, certificate, approval, and scan context."""
    passport = db.query(ProductPassport).filter(ProductPassport.id == passport_id).first()
    if not passport:
        raise HTTPException(status_code=404, detail="Passport not found")

    material = db.query(Material).filter(Material.id == passport.material_id).first()
    certificates = db.query(Certificate).filter(Certificate.material_id == passport.material_id).all()
    approvals = (
        db.query(Approval)
        .filter(Approval.material_id == passport.material_id)
        .all()
    )
    latest_scan = (
        db.query(QRScan)
        .filter(QRScan.material_id == passport.material_id)
        .order_by(QRScan.scan_time.desc())
        .first()
    )

    # Determine verification status
    from intelligence import certificate_status
    from datetime import date
    today = date.today()

    has_expired = any(certificate_status(c, today) == "expired" for c in certificates)
    has_failed = material and material.status == "failed"
    all_approved = all(a.status and a.status.lower() == "approved" for a in approvals) if approvals else False

    if has_failed or has_expired:
        verification_status = "blocked"
    elif not all_approved or not certificates:
        verification_status = "hold"
    else:
        verification_status = "approved"

    return {
        "passport": {
            "id": passport.id,
            "passport_number": passport.passport_number,
            "passport_id": passport.passport_id,
            "material_id": passport.material_id,
            "compliance_score": passport.compliance_score,
            "carbon_score": passport.carbon_score,
            "status": passport.status,
        },
        "material": {
            "id": material.id,
            "name": material.name,
            "supplier": material.supplier,
            "batch_number": material.batch_number,
            "status": material.status,
            "category": material.category,
            "quantity": material.quantity,
            "unit": material.unit,
        } if material else None,
        "certificates": [
            {
                "id": c.id,
                "name": c.certificate_name,
                "issuing_body": c.issuing_body,
                "expiry_date": str(c.expiry_date),
                "status": certificate_status(c, today),
            }
            for c in certificates
        ],
        "approvals": [
            {
                "id": a.id,
                "type": a.approval_type,
                "status": a.status,
                "approver": a.user.name if hasattr(a, "user") and a.user else str(a.approver_id),
            }
            for a in approvals
        ],
        "latest_scan": {
            "id": latest_scan.id,
            "scan_time": str(latest_scan.scan_time),
            "location": latest_scan.location,
            "result": latest_scan.result,
            "scanned_by": latest_scan.user.name if hasattr(latest_scan, "user") and latest_scan.user else str(latest_scan.scanned_by),
        } if latest_scan else None,
        "verification_status": verification_status,
    }


@router.post("/", response_model=PassportOut, dependencies=[Depends(require_role("Admin", "Project Manager"))])
def create_passport(body: PassportCreate, db: Session = Depends(get_db)):
    """Create a new product passport for a material."""
    # Verify material exists
    material = db.query(Material).filter(Material.id == body.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Check for existing passport
    existing = db.query(ProductPassport).filter(
        ProductPassport.material_id == body.material_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Passport already exists for this material")

    import uuid
    passport = ProductPassport(
        material_id=body.material_id,
        passport_number=f"DPP-{body.project_id}-{body.material_id}-{uuid.uuid4().hex[:6].upper()}",
        compliance_score=body.compliance_score or 85,
        carbon_score=body.carbon_footprint or 1.2,
        status="active",
    )
    db.add(passport)
    db.flush()

    # Audit trail
    track_passport_created(
        db, project_id=body.project_id, user_id=None,
        passport_id=passport.id, passport_number=passport.passport_number,
    )
    db.commit()
    db.refresh(passport)

    return passport


@router.put("/{passport_id}", response_model=PassportOut, dependencies=[Depends(require_role("Admin", "Project Manager", "QA Auditor", "Evidence Operator"))])
def update_passport(passport_id: int, body: PassportUpdate, db: Session = Depends(get_db)):
    """Update a product passport."""
    passport = db.query(ProductPassport).filter(ProductPassport.id == passport_id).first()
    if not passport:
        raise HTTPException(status_code=404, detail="Passport not found")

    if body.compliance_score is not None:
        passport.compliance_score = body.compliance_score
    if body.carbon_footprint is not None:
        passport.carbon_score = body.carbon_footprint
    if body.status is not None:
        passport.status = body.status

    db.commit()
    db.refresh(passport)
    return passport
