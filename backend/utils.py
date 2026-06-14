import hashlib

def sha256_hash(seed: str) -> str:
    """Cryptographic SHA256 hash implementation."""
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def record_audit_trail(
    db, action: str, performed_by_name: str, details: str,
    material_id: int | None = None, project_id: int | None = None,
    result: str | None = None, approval_id: int | None = None, new_status: str | None = None
):
    from models import AuditTrail, User
    from datetime import datetime

    # Map or create user dynamically
    user = db.query(User).filter(User.name == performed_by_name).first()
    if not user:
        user = User(
            name=performed_by_name,
            email=f"{performed_by_name.lower().replace(' ', '.')}@antonsolutions.com",
            role="System" if performed_by_name == "System" else "Operator",
            is_system=True,
        )
        db.add(user)
        db.flush()

    # Get previous block hash (GENESIS if first)
    prev_block = db.query(AuditTrail).filter(
        (AuditTrail.material_id == material_id) if material_id else True
    ).order_by(AuditTrail.id.desc()).first()
    
    previous_hash = prev_block.hash if prev_block and prev_block.hash else "GENESIS"
    
    seed = f"{previous_hash}-{action}-{details}"
    new_hash = sha256_hash(seed)
    
    audit = AuditTrail(
        action=action,
        performed_by_id=user.id,
        timestamp=datetime.now(),
        details=details,
        material_id=material_id,
        project_id=project_id,
        result=result,
        approval_id=approval_id,
        new_status=new_status,
        hash=new_hash,
        previous_hash=previous_hash,
    )
    db.add(audit)

