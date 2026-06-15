from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, nullable=False)
    risk_score = Column(String, nullable=False)
    # Owner of this project. NULL = shared demo/seed data (visible to the demo account).
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    materials = relationship("Material", back_populates="project")
    approvals = relationship("Approval", back_populates="project")
    scans = relationship("QRScan", back_populates="project")
    deliveries = relationship("Delivery", back_populates="project")


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    supplier = Column(String, nullable=False)
    batch_number = Column(String, nullable=False)
    qr_code = Column(String, nullable=False, unique=True)
    status = Column(String, nullable=False)
    category = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    unit = Column(String, nullable=False)

    project = relationship("Project", back_populates="materials")
    approvals = relationship("Approval", back_populates="material")
    certificates = relationship("Certificate", back_populates="material")
    scans = relationship("QRScan", back_populates="material")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    approval_type = Column(String, nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False)
    requested_date = Column(Date, nullable=False)
    approved_date = Column(Date, nullable=True)
    overdue_days = Column(Integer, nullable=False, default=0)

    project = relationship("Project", back_populates="approvals")
    material = relationship("Material", back_populates="approvals")
    user = relationship("User")


class Certificate(Base):
    __tablename__ = "compliance_certificates"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    certificate_name = Column(String, nullable=False)
    issuing_body = Column(String, nullable=False)
    issue_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=False)
    status = Column(String, nullable=False)

    material = relationship("Material", back_populates="certificates")


class QRScan(Base):
    __tablename__ = "qr_scans"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    scanned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    scan_time = Column(DateTime, nullable=False)
    location = Column(String, nullable=False)
    scan_type = Column(String, nullable=False)
    result = Column(String, nullable=False)

    material = relationship("Material", back_populates="scans")
    project = relationship("Project", back_populates="scans")
    user = relationship("User")


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    supplier = Column(String, nullable=False)
    material_name = Column(String, nullable=False)
    expected_date = Column(Date, nullable=False)
    actual_date = Column(Date, nullable=True)
    status = Column(String, nullable=False)
    delay_days = Column(Integer, nullable=False, default=0)

    project = relationship("Project", back_populates="deliveries")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role = Column(String, nullable=False)
    hashed_password = Column(String, nullable=True)
    is_system = Column(Boolean, nullable=False, default=False, server_default="0")


class ProductPassport(Base):
    __tablename__ = "product_passports"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    passport_number = Column(String, nullable=False)
    passport_id = Column(String, nullable=True)
    # V3 fields
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    supplier = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    origin_country = Column(String, nullable=True)
    carbon_footprint = Column(Float, nullable=True)
    compliance_score = Column(Integer, nullable=False, default=85)
    sustainability_score = Column(Integer, nullable=True)
    carbon_score = Column(Float, nullable=False, default=1.2)
    status = Column(String, nullable=False, default="active")
    metadata_json = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=True)


class ScanLog(Base):
    __tablename__ = "scan_logs"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    scanned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scan_time = Column(DateTime, nullable=False)
    location = Column(String, nullable=False)
    result = Column(String, nullable=False)

    user = relationship("User")


class AuditTrail(Base):
    __tablename__ = "audit_trails"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    details = Column(String, nullable=True)
    material_id = Column(Integer, nullable=True)
    project_id = Column(Integer, nullable=True)
    result = Column(String, nullable=True)
    approval_id = Column(Integer, nullable=True)
    new_status = Column(String, nullable=True)
    hash = Column(String, nullable=True)
    previous_hash = Column(String, nullable=True)
    # V3 fields for entity tracking
    entity_type = Column(String, nullable=True)  # 'material', 'certificate', 'approval', etc.
    entity_id = Column(Integer, nullable=True)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)

    user = relationship("User")


class ComplianceRecord(Base):
    __tablename__ = "compliance_records"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    status = Column(String, nullable=False)
    verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    verification_date = Column(Date, nullable=False)

    user = relationship("User")


class TrustedIssuer(Base):
    """Accredited DPP issuers — the demo stand-in for an EU/GS1/eIDAS trust registry.
    A passport signature is only AUTHENTIC if its public key is registered here."""
    __tablename__ = "trusted_issuers"

    id = Column(Integer, primary_key=True, index=True)
    issuer_id = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    public_key = Column(String, nullable=False)
    accredited_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="active")


class AIQuery(Base):
    __tablename__ = "ai_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_query = Column(String, nullable=False)
    ai_response = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    # V3 observability fields
    project_id = Column(Integer, nullable=True)
    user_id = Column(Integer, nullable=True)
    intent = Column(String, nullable=True)
    latency_ms = Column(Float, nullable=True)
    tokens_used = Column(Integer, nullable=True)


# --- V3: Persistent AI Memory (Stage 11) ---

class ConversationSession(Base):
    __tablename__ = "conversation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    started_at = Column(DateTime, nullable=False)
    last_active = Column(DateTime, nullable=True)
    last_material = Column(String, nullable=True)
    last_supplier = Column(String, nullable=True)
    last_topic = Column(String, nullable=True)

    messages = relationship("ConversationMessage", back_populates="session")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("conversation_sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(String, nullable=False)
    intent = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=False)

    session = relationship("ConversationSession", back_populates="messages")
