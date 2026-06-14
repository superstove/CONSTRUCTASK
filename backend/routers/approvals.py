from datetime import date, datetime

from fastapi import APIRouter, Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, require_role
from database import get_db
from intelligence import approval_overdue_days
from models import Approval, AuditTrail, User
from schemas import ApprovalOut, ApprovalUpdate
from utils import record_audit_trail


router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[ApprovalOut])
def list_approvals(project_id: int = 1, db: Session = Depends(get_db)):
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material), joinedload(Approval.user))
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
            approver=approval.user.name if approval.user else str(approval.approver_id),
            status=approval.status,
            requested_date=approval.requested_date,
            approved_date=approval.approved_date,
            overdue_days=approval_overdue_days(approval),
            material_name=approval.material.name,
        )
        for approval in approvals
    ]


@router.put("/{approval_id}", response_model=ApprovalOut, dependencies=[Depends(require_role("Admin", "Project Manager", "QA Auditor"))])
def update_approval(approval_id: int, payload: ApprovalUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    approval = (
        db.query(Approval)
        .options(joinedload(Approval.material), joinedload(Approval.user))
        .filter(Approval.id == approval_id)
        .first()
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    status = payload.status.strip().lower()
    if status not in {"approved", "rejected", "pending"}:
        raise HTTPException(status_code=422, detail="status must be approved, rejected, or pending")

    approval.status = status
    approval.approved_date = date.today() if status in {"approved", "rejected"} else None
    if status in {"approved", "rejected"}:
        approval.overdue_days = 0

    record_audit_trail(
        db=db,
        action="APPROVAL_UPDATED",
        performed_by_name=current_user.name,
        details=f"Approval {approval.approval_type} for material {approval.material.name} changed to {status}",
        approval_id=approval.id,
        material_id=approval.material_id,
        project_id=approval.project_id,
        new_status=status,
    )
    db.commit()
    db.refresh(approval)
    return ApprovalOut(
        id=approval.id,
        project_id=approval.project_id,
        material_id=approval.material_id,
        approval_type=approval.approval_type,
        approver=approval.user.name if approval.user else str(approval.approver_id),
        status=approval.status,
        requested_date=approval.requested_date,
        approved_date=approval.approved_date,
        overdue_days=approval_overdue_days(approval),
        material_name=approval.material.name,
    )
