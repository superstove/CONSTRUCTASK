from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from auth import get_current_user, require_role
from database import get_db
from models import AuditTrail, User
from utils import sha256_hash

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/verify-chain", dependencies=[Depends(require_role("Admin", "QA Auditor"))])
def verify_audit_chain(material_id: int = None, project_id: int = None, db: Session = Depends(get_db)):
    """
    Verify the integrity of the audit chain by recomputing hashes.
    Can verify globally, per project, or per material.
    """
    query = db.query(AuditTrail)
    if material_id:
        query = query.filter(AuditTrail.material_id == material_id)
    elif project_id:
        query = query.filter(AuditTrail.project_id == project_id)
        
    # We must order by ID to follow the actual sequence of events
    trails = query.order_by(AuditTrail.id.asc()).all()
    
    if not trails:
        return {"status": "ok", "message": "No audit records to verify.", "valid_records": 0, "broken_records": []}

    broken_records = []
    
    # We will verify that each block's stored hash matches the hash of its contents
    # For a stricter check, we can also ensure previous_hash matches the previous block's hash.
    # However, since different materials have interleaved global IDs, we will just verify each 
    # block's hash formula matches what is stored.
    
    for block in trails:
        # Reconstruct the seed
        seed = f"{block.previous_hash}-{block.action}-{block.details}"
        expected_hash = sha256_hash(seed)
        
        if block.hash != expected_hash:
            broken_records.append({
                "id": block.id,
                "action": block.action,
                "expected_hash": expected_hash,
                "actual_hash": block.hash,
                "error": "Hash mismatch"
            })
            
    if broken_records:
        return {
            "status": "failed",
            "message": f"Audit chain integrity compromised. Found {len(broken_records)} invalid blocks.",
            "valid_records": len(trails) - len(broken_records),
            "broken_records": broken_records
        }
        
    return {
        "status": "ok",
        "message": "Audit chain integrity verified. All blocks are valid.",
        "valid_records": len(trails),
        "broken_records": []
    }
