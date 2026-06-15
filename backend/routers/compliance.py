from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from intelligence import certificate_status, days_until_expiry
from models import Certificate, Material
from schemas import CertificateOut
from routers.projects import require_project_access


router = APIRouter(dependencies=[Depends(get_current_user), Depends(require_project_access)])


@router.get("/", response_model=list[CertificateOut])
def list_certificates(project_id: int = 1, db: Session = Depends(get_db)):
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .order_by(Certificate.expiry_date)
        .all()
    )

    return [
        CertificateOut(
            id=cert.id,
            material_id=cert.material_id,
            certificate_name=cert.certificate_name,
            issuing_body=cert.issuing_body,
            issue_date=cert.issue_date,
            expiry_date=cert.expiry_date,
            status=certificate_status(cert),
            material_name=cert.material.name,
            days_until_expiry=days_until_expiry(cert),
        )
        for cert in certificates
    ]
