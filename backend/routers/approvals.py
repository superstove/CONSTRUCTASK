from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from database import get_db
from intelligence import approval_overdue_days
from models import Approval
from schemas import ApprovalOut


router = APIRouter()


@router.get("/", response_model=list[ApprovalOut])
def list_approvals(project_id: int = 1, db: Session = Depends(get_db)):
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material))
        .filter(Approval.project_id == project_id)
        .all()
    )
    approvals.sort(key=approval_overdue_days, reverse=True)
    return [
        ApprovalOut(
            id=approval.id,
            project_id=approval.project_id,
            material_id=approval.material_id,
            approval_type=approval.approval_type,
            approver=approval.approver,
            status=approval.status,
            requested_date=approval.requested_date,
            approved_date=approval.approved_date,
            overdue_days=approval_overdue_days(approval),
            material_name=approval.material.name,
        )
        for approval in approvals
    ]
