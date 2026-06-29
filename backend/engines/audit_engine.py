"""
Immutable Audit Trail Engine — SHA256 Hash Chain

Every business action generates an audit record with cryptographic integrity.
The hash chain ensures that no record can be tampered with without detection.

Hash Logic (unified across the app, verified by /api/audit/verify-chain):
    SHA256(previous_hash + "-" + action + "-" + details)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from models import AuditTrail, User
from utils import sha256_hash


@dataclass
class BrokenLink:
    record_id: int
    expected_previous_hash: str | None
    actual_previous_hash: str | None
    action: str
    timestamp: datetime


@dataclass
class ChainVerification:
    is_valid: bool
    total_records: int
    verified_records: int
    broken_links: list[BrokenLink]
    summary: str


@dataclass
class AuditRecord:
    """Result of creating an audit record."""
    id: int
    action: str
    entity_type: str
    entity_id: int
    timestamp: datetime
    hash: str
    previous_hash: str | None


def _compute_hash(previous_hash: str | None, action: str, details: str) -> str:
    """Compute SHA256 hash for an audit record (same formula as utils.record_audit_trail)."""
    return sha256_hash(f"{previous_hash or 'GENESIS'}-{action}-{details}")


def get_latest_hash(db: Session, project_id: int) -> str | None:
    """Get the most recent hash in the audit chain for a project."""
    latest = (
        db.query(AuditTrail)
        .filter(AuditTrail.project_id == project_id)
        .order_by(AuditTrail.timestamp.desc())
        .first()
    )
    return latest.hash if latest else None


def create_audit_record(
    db: Session,
    *,
    project_id: int,
    user_id: int | None,
    entity_type: str,
    entity_id: int,
    action: str,
    old_value: str | None = None,
    new_value: str | None = None,
    details: str | None = None,
    result: str | None = None,
) -> AuditRecord:
    """
    Create an immutable audit trail record with SHA256 hash chain.

    Args:
        db: Database session
        project_id: The project this action belongs to
        user_id: The user who performed the action (None for system actions)
        entity_type: 'material', 'certificate', 'approval', 'passport', 'scan', 'project', 'ai_query'
        entity_id: The ID of the entity being acted upon
        action: Description of the action (e.g., 'material_created', 'certificate_expired')
        old_value: Previous state (JSON string, optional)
        new_value: New state (JSON string, optional)
        details: Human-readable detail string
        result: Action result ('success', 'failed', etc.)

    Returns:
        AuditRecord with the hash and ID
    """
    now = datetime.now()
    previous_hash = get_latest_hash(db, project_id) or "GENESIS"
    detail_text = details or f"{action} on {entity_type} #{entity_id}"
    record_hash = _compute_hash(previous_hash, action, detail_text)

    record = AuditTrail(
        action=action,
        performed_by_id=user_id or 0,
        timestamp=now,
        details=detail_text,
        material_id=entity_id if entity_type == "material" else None,
        project_id=project_id,
        result=result or "success",
        new_status=new_value,
        hash=record_hash,
        previous_hash=previous_hash,
    )
    db.add(record)
    db.flush()  # Get the ID without committing

    return AuditRecord(
        id=record.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        timestamp=now,
        hash=record_hash,
        previous_hash=previous_hash,
    )


def verify_chain_integrity(db: Session, project_id: int) -> ChainVerification:
    """
    Verify the integrity of the entire audit hash chain for a project.

    Returns a ChainVerification with the result and any broken links.
    """
    records = (
        db.query(AuditTrail)
        .filter(AuditTrail.project_id == project_id)
        .order_by(AuditTrail.timestamp.asc())
        .all()
    )

    if not records:
        return ChainVerification(
            is_valid=True,
            total_records=0,
            verified_records=0,
            broken_links=[],
            summary="No audit records found for this project.",
        )

    broken_links: list[BrokenLink] = []
    expected_previous = None

    for record in records:
        # Check previous_hash continuity ("GENESIS" marks the start of a chain)
        if record.previous_hash != expected_previous:
            if expected_previous is not None and record.previous_hash != "GENESIS":
                broken_links.append(BrokenLink(
                    record_id=record.id,
                    expected_previous_hash=expected_previous,
                    actual_previous_hash=record.previous_hash,
                    action=record.action,
                    timestamp=record.timestamp,
                ))

        # Verify the hash itself
        if record.hash:
            expected_hash = _compute_hash(
                record.previous_hash, record.action, record.details or "",
            )
            if record.hash != expected_hash:
                broken_links.append(BrokenLink(
                    record_id=record.id,
                    expected_previous_hash=f"hash_mismatch:{expected_hash[:16]}",
                    actual_previous_hash=f"actual:{record.hash[:16]}",
                    action=record.action,
                    timestamp=record.timestamp,
                ))

        expected_previous = record.hash

    return ChainVerification(
        is_valid=len(broken_links) == 0,
        total_records=len(records),
        verified_records=len(records) - len(broken_links),
        broken_links=broken_links,
        summary=(
            f"Audit chain verified: {len(records)} records, all valid."
            if not broken_links
            else f"Audit chain BROKEN: {len(broken_links)} invalid links found in {len(records)} records."
        ),
    )


# --- Tracked Event Helpers ---

def track_material_created(db: Session, project_id: int, user_id: int | None, material_id: int, material_name: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="material", entity_id=material_id, action="material_created", new_value="created", details=f"Material '{material_name}' registered")

def track_material_updated(db: Session, project_id: int, user_id: int | None, material_id: int, old_status: str, new_status: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="material", entity_id=material_id, action="material_updated", old_value=old_status, new_value=new_status, details=f"Material status changed: {old_status} → {new_status}")

def track_material_verified(db: Session, project_id: int, user_id: int | None, material_id: int, result: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="material", entity_id=material_id, action="material_verified", new_value=result, details=f"Material verification: {result}", result=result)

def track_certificate_uploaded(db: Session, project_id: int, user_id: int | None, cert_id: int, cert_name: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="certificate", entity_id=cert_id, action="certificate_uploaded", new_value="active", details=f"Certificate '{cert_name}' uploaded")

def track_certificate_expired(db: Session, project_id: int, cert_id: int, cert_name: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=None, entity_type="certificate", entity_id=cert_id, action="certificate_expired", new_value="expired", details=f"Certificate '{cert_name}' expired", result="system_auto")

def track_approval_created(db: Session, project_id: int, user_id: int | None, approval_id: int, approval_type: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="approval", entity_id=approval_id, action="approval_created", new_value="pending", details=f"Approval requested: {approval_type}")

def track_approval_updated(db: Session, project_id: int, user_id: int | None, approval_id: int, old_status: str, new_status: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="approval", entity_id=approval_id, action="approval_updated", old_value=old_status, new_value=new_status, details=f"Approval {old_status} → {new_status}")

def track_passport_created(db: Session, project_id: int, user_id: int | None, passport_id: int, passport_number: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="passport", entity_id=passport_id, action="passport_created", new_value="active", details=f"Product Passport '{passport_number}' created")

def track_qr_scanned(db: Session, project_id: int, user_id: int | None, scan_id: int, material_name: str, result: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="scan", entity_id=scan_id, action="qr_scanned", new_value=result, details=f"QR scan on '{material_name}': {result}", result=result)

def track_project_created(db: Session, project_id: int, user_id: int | None, project_name: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="project", entity_id=project_id, action="project_created", new_value="active", details=f"Project '{project_name}' created")

def track_ai_query(db: Session, project_id: int, user_id: int | None, query_id: int, question: str) -> AuditRecord:
    return create_audit_record(db, project_id=project_id, user_id=user_id, entity_type="ai_query", entity_id=query_id, action="ai_query_executed", details=f"AI query: {question[:100]}")
