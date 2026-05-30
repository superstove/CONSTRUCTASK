from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
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

    materials = relationship("Material", back_populates="project")
    approvals = relationship("Approval", back_populates="project")
    scans = relationship("QRScan", back_populates="project")
    deliveries = relationship("Delivery", back_populates="project")


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    supplier = Column(String, nullable=False)
    batch_number = Column(String, nullable=False)
    qr_code = Column(String, nullable=False)
    status = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit = Column(String, nullable=False)

    project = relationship("Project", back_populates="materials")
    approvals = relationship("Approval", back_populates="material")
    certificates = relationship("Certificate", back_populates="material")
    scans = relationship("QRScan", back_populates="material")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    approval_type = Column(String, nullable=False)
    approver = Column(String, nullable=False)
    status = Column(String, nullable=False)
    requested_date = Column(Date, nullable=False)
    approved_date = Column(Date, nullable=True)
    overdue_days = Column(Integer, nullable=False, default=0)

    project = relationship("Project", back_populates="approvals")
    material = relationship("Material", back_populates="approvals")


class Certificate(Base):
    __tablename__ = "compliance_certificates"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
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
    scanned_by = Column(String, nullable=False)
    scan_time = Column(DateTime, nullable=False)
    location = Column(String, nullable=False)
    scan_type = Column(String, nullable=False)
    result = Column(String, nullable=False)

    material = relationship("Material", back_populates="scans")
    project = relationship("Project", back_populates="scans")


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    supplier = Column(String, nullable=False)
    material_name = Column(String, nullable=False)
    expected_date = Column(Date, nullable=False)
    actual_date = Column(Date, nullable=True)
    status = Column(String, nullable=False)
    delay_days = Column(Integer, nullable=False, default=0)

    project = relationship("Project", back_populates="deliveries")
