from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ai_engine import ask_constructask, get_project_data
from auth import get_current_user
from database import get_db
from models import AIQuery, User
from schemas import ChatRequest, ChatResponse


router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models import ConversationSession, ConversationMessage

    result = ask_constructask(
        question=request.question,
        project_id=request.project_id,
        user_id=current_user.id,
        role=current_user.role,
    )
    
    # 1. Update AIQuery
    db.add(AIQuery(
        user_query=request.question,
        ai_response=result.answer,
        timestamp=datetime.now(),
        project_id=request.project_id,
        user_id=current_user.id,
        intent=result.mode,
    ))

    # 2. Update ConversationSession & ConversationMessage
    session = db.query(ConversationSession).filter(
        ConversationSession.project_id == request.project_id,
        ConversationSession.user_id == current_user.id
    ).first()

    if not session:
        session = ConversationSession(
            project_id=request.project_id,
            user_id=current_user.id,
            started_at=datetime.now(),
            last_active=datetime.now()
        )
        db.add(session)
        db.flush()

    session.last_active = datetime.now()

    db.add(ConversationMessage(
        session_id=session.id,
        role="user",
        content=request.question,
        intent=result.mode,
        timestamp=datetime.now(),
    ))

    db.add(ConversationMessage(
        session_id=session.id,
        role="assistant",
        content=result.answer,
        intent=result.mode,
        timestamp=datetime.now(),
    ))

    db.commit()
    return ChatResponse(
        answer=result.answer,
        question=request.question,
        project_id=request.project_id,
        data_used=result.data_used,
        mode=result.mode,
        reasoning_sources=result.reasoning_sources,
        confidence=result.confidence,
        follow_up_suggestions=result.follow_up_suggestions,
        chart=result.chart,
    )


@router.get("/context")
def assistant_context(project_id: int = 1):
    """Returns live project context for the AI assistant — materials, approvals, certificates, deliveries, users, audit trails."""
    data = get_project_data(project_id)
    project = data["project"]
    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "location": project.location,
            "status": project.status,
            "risk_score": project.risk_score,
        },
        "materials": [
            {
                "id": m.id, "name": m.name, "supplier": m.supplier, "batch_number": m.batch_number,
                "status": m.status, "quantity": m.quantity, "unit": m.unit, "category": m.category,
            }
            for m in data["materials"]
        ],
        "approvals": [
            {
                "id": a.id, "approval_type": a.approval_type, "status": a.status,
                "material": a.material.name if a.material else None,
                "approver": a.user.name if a.user else str(a.approver_id),
            }
            for a in data["approvals"]
        ],
        "certificates": [
            {
                "id": c.id, "certificate_name": c.certificate_name, "issuing_body": c.issuing_body,
                "expiry_date": str(c.expiry_date),
                "material": c.material.name if c.material else None,
            }
            for c in data["certificates"]
        ],
        "deliveries": [
            {
                "id": d.id, "material_name": d.material_name, "supplier": d.supplier,
                "status": d.status, "expected_date": str(d.expected_date),
                "actual_date": str(d.actual_date) if d.actual_date else None,
            }
            for d in data["deliveries"]
        ],
        "users": [
            {"id": u.id, "name": u.name, "email": u.email, "role": u.role}
            for u in data["users"]
        ],
        "audit_trails": [
            {
                "id": a.id, "action": a.action, "result": a.result,
                "details": a.details, "timestamp": str(a.timestamp),
            }
            for a in data["audit_trails"]
        ],
    }
