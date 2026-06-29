from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str
    location: str
    start_date: date
    end_date: date
    status: str = "Active"
    risk_score: str = "Medium"


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: str
    start_date: date
    end_date: date
    status: str
    risk_score: str


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    supplier: str
    batch_number: str
    qr_code: str
    status: str
    category: str | None = None
    quantity: int
    unit: str


class MaterialCreate(BaseModel):
    project_id: int
    name: str
    batch_id: str = Field(min_length=1, max_length=100)
    supplier: str
    category: str = "general"
    status: str = "pending"
    quantity: int = 1
    unit: str | None = None


class MaterialStageUpdate(BaseModel):
    new_stage: str



class ApprovalUpdate(BaseModel):
    status: str


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    material_id: int
    approval_type: str
    approver: str
    status: str
    requested_date: date
    approved_date: date | None
    overdue_days: int
    material_name: str


class CertificateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    material_id: int
    certificate_name: str
    issuing_body: str
    issue_date: date
    expiry_date: date
    status: str
    material_name: str
    days_until_expiry: int


class QRScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    material_id: int
    project_id: int
    scanned_by: str
    scan_time: datetime
    location: str
    scan_type: str
    result: str
    material_name: str


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    supplier: str
    material_name: str
    expected_date: date
    actual_date: date | None
    status: str
    delay_days: int


class ProjectReadinessOut(BaseModel):
    status: str
    score: int
    blockers: int
    warnings: int
    reasons: list[str]
    next_action: str


class ActionQueueOut(BaseModel):
    id: str
    rank: int
    severity: str
    category: str
    material_name: str
    issue: str
    action: str
    owner: str


class MaterialEvidenceOut(BaseModel):
    material_id: int
    material_name: str
    supplier: str
    batch_number: str
    qr_code: str
    release_status: str
    certificate_status: str
    approval_status: str
    delivery_status: str
    last_scan_result: str | None
    last_scan_location: str | None
    last_scan_time: datetime | None


class ScanWarningOut(BaseModel):
    material_id: int
    material_name: str
    qr_code: str
    warning_type: str
    detail: str
    severity: str


class SupplierRiskOut(BaseModel):
    supplier: str
    risk: str
    reason: str
    delayed_deliveries: int
    total_delay_days: int
    total_deliveries: int
    ontime_deliveries: int


class ProjectActivityOut(BaseModel):
    id: str
    date: date
    title: str
    description: str
    category: str
    status: str
    tone: str


class EvidenceSummaryOut(BaseModel):
    open_items: int
    material_records: int
    top_priority: str
    recommendation: str


class EvidenceRecordOut(BaseModel):
    id: int
    category: str
    title: str
    material_name: str
    status: str
    detail: str
    action: str
    tone: str


class ProjectEvidenceOut(BaseModel):
    project: ProjectOut
    summary: EvidenceSummaryOut
    certificates: list[EvidenceRecordOut]
    deliveries: list[EvidenceRecordOut]
    approvals: list[EvidenceRecordOut]


class ProjectTimelineOut(BaseModel):
    project: ProjectOut
    items: list[ProjectActivityOut]


class DashboardOut(BaseModel):
    project: ProjectOut
    total_materials: int
    pending_approvals: int
    expiring_certs: int
    total_deliveries: int
    ontime_deliveries: int
    delayed_deliveries: int
    alerts: list[str]
    reasoning_sources: list[str]
    workflow_dependencies: list[str]
    health_timeline: list[str]
    activity_timeline: list[ProjectActivityOut]
    executive_brief: list[str]
    risk_confidence: str
    supplier_risks: list[SupplierRiskOut]


class ChatRequest(BaseModel):
    question: str
    project_id: int = 1
    user_id: int | None = None
    role: str | None = None


class ChatResponse(BaseModel):
    answer: str
    question: str
    project_id: int
    data_used: list[str]
    mode: str
    reasoning_sources: list[str]
    confidence: str
    follow_up_suggestions: list[str] = []
    # Optional bar-chart payload: {"type": "bar", "title": str, "items": [{label, value, tone?, suffix?}]}
    chart: dict | None = None


class UserCreate(BaseModel):
    name: str
    email: str
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str


class ProductPassportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    material_id: int
    passport_number: str
    passport_id: str | None = None
    compliance_score: int
    carbon_score: float
    sustainability_score: int | None = None
    carbon_footprint: float | None = None
    status: str


class AssistantContextOut(BaseModel):
    project: ProjectOut
    materials: list[MaterialOut]
    approvals: list[ApprovalOut]
    certificates: list[CertificateOut]
    deliveries: list[DeliveryOut]
    users: list[UserOut]


# --- DPP Verification Request Models ---

class DPPVerifyMaterialRequest(BaseModel):
    material_id: int

class DPPIssueRequest(BaseModel):
    material_id: int

class DPPVerifyCredentialRequest(BaseModel):
    credential: dict
    proof: dict
