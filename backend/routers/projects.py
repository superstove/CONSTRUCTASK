from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from auth import get_current_user, require_role
from database import get_db
from intelligence import (
    approval_overdue_days,
    certificate_status,
    computed_project_risk,
    days_until_expiry,
    delivery_delay_days,
    delivery_status,
    plural,
)
from models import Approval, AuditTrail, Certificate, Delivery, Material, ProductPassport, Project, QRScan, User

# The demo account sees the shared seed data (projects with no owner). Everyone
# else sees only the projects they own.
DEMO_EMAIL = "demo@constructask.dev"


def _get_owned_project(project_id: int, db: Session, current_user: User) -> Project:
    """Load a project only if the caller may see it; otherwise 404 (don't leak existence)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.email == DEMO_EMAIL:
        allowed = project.owner_id is None or project.owner_id == current_user.id
    else:
        allowed = project.owner_id == current_user.id
    if not allowed:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def require_project_access(
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Router dependency: if a ?project_id= is present, enforce that the caller owns it.
    Used by the materials/compliance/approvals routers so they can't be read cross-account."""
    if project_id is not None:
        _get_owned_project(project_id, db, current_user)
from schemas import (
    ActionQueueOut,
    DashboardOut,
    EvidenceRecordOut,
    EvidenceSummaryOut,
    ProjectReadinessOut,
    ProjectActivityOut,
    ProjectCreate,
    ProjectEvidenceOut,
    ProjectOut,
    ProjectTimelineOut,
    SupplierRiskOut,
)


router = APIRouter(dependencies=[Depends(get_current_user)])


def _plural(count: int, singular: str, plural_text: str | None = None) -> str:
    return plural(count, singular, plural_text)


def _project_out(
    project: Project,
    db: Session,
    materials: list[Material] | None = None,
    approvals: list[Approval] | None = None,
    certificates: list[Certificate] | None = None,
    deliveries: list[Delivery] | None = None,
) -> ProjectOut:
    materials = materials if materials is not None else db.query(Material).filter(Material.project_id == project.id).all()
    approvals = approvals if approvals is not None else db.query(Approval).filter(Approval.project_id == project.id).all()
    certificates = certificates
    if certificates is None:
        certificates = (
            db.query(Certificate)
            .join(Material)
            .filter(Material.project_id == project.id)
            .all()
        )
    deliveries = deliveries if deliveries is not None else db.query(Delivery).filter(Delivery.project_id == project.id).all()
    return ProjectOut(
        id=project.id,
        name=project.name,
        location=project.location,
        start_date=project.start_date,
        end_date=project.end_date,
        status=project.status,
        risk_score=computed_project_risk(materials, approvals, certificates, deliveries),
    )


def _activity_items(
    materials: list[Material],
    approvals: list[Approval],
    certificates: list[Certificate],
    deliveries: list[Delivery],
    today: date,
) -> list[ProjectActivityOut]:
    items: list[ProjectActivityOut] = []

    for certificate in certificates:
        status = certificate_status(certificate, today)
        if status in {"expired", "expiring"}:
            days = days_until_expiry(certificate, today)
            items.append(
                ProjectActivityOut(
                    id=f"certificate-{certificate.id}",
                    date=certificate.expiry_date,
                    title=f"{certificate.certificate_name} {status}",
                    description=f"{certificate.material.name} needs valid compliance evidence before release.",
                    category="Certificate",
                    status="Current" if status == "expired" else "Upcoming",
                    tone="danger" if status == "expired" else "warning",
                )
            )

    for delivery in deliveries:
        delay = delivery_delay_days(delivery, today)
        if delay > 0:
            items.append(
                ProjectActivityOut(
                    id=f"delivery-{delivery.id}",
                    date=delivery.expected_date,
                    title=f"{delivery.material_name} delivery delayed",
                    description=f"{delivery.supplier} is {plural(delay, 'day')} late against the expected delivery date.",
                    category="Delivery",
                    status="Current",
                    tone="warning",
                )
            )

    for approval in approvals:
        overdue = approval_overdue_days(approval, today)
        if overdue > 0:
            items.append(
                ProjectActivityOut(
                    id=f"approval-{approval.id}",
                    date=approval.requested_date,
                    title=f"{approval.approval_type} awaiting sign-off",
                    description=f"{approval.material.name} is blocked until {approval.user.name if getattr(approval, 'user', None) else str(approval.approver_id)} closes this approval.",
                    category="Approval",
                    status="Current",
                    tone="warning",
                )
            )

    for material in materials:
        if material.status in {"failed", "pending"}:
            items.append(
                ProjectActivityOut(
                    id=f"material-{material.id}",
                    date=today,
                    title=f"{material.name} verification {material.status}",
                    description=f"Batch {material.batch_number} remains visible in the material evidence trail.",
                    category="Material",
                    status="Current" if material.status == "failed" else "Upcoming",
                    tone="danger" if material.status == "failed" else "warning",
                )
            )

    tone_rank = {"danger": 0, "warning": 1, "ok": 2}
    return sorted(items, key=lambda item: (tone_rank.get(item.tone, 3), item.date))[:8]


def _project_inputs(project_id: int, db: Session):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    materials = db.query(Material).filter(Material.project_id == project_id).all()
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material))
        .filter(Approval.project_id == project_id)
        .all()
    )
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .all()
    )
    deliveries = db.query(Delivery).filter(Delivery.project_id == project_id).all()
    return project, materials, approvals, certificates, deliveries


def _scan_reuse_warning_count(project_id: int, db: Session) -> int:
    warning_count = 0
    materials = db.query(Material).filter(Material.project_id == project_id).all()
    for material in materials:
        scans = [scan for scan in material.scans if scan.project_id == project_id and scan.scan_type != "release_check"]
        locations = {
            scan.location
            for scan in scans
            if scan.location
        }
        if len(locations) > 1:
            warning_count += 1
        blocked_reuse = [scan for scan in scans if scan.result in {"blocked_from_installation", "blocked"}]
        if len(blocked_reuse) > 1:
            warning_count += 1
    return warning_count


def _build_action_queue(
    approvals: list[Approval],
    certificates: list[Certificate],
    deliveries: list[Delivery],
    materials: list[Material],
    today: date,
    extra_actions: list[dict] | None = None,
) -> list[ActionQueueOut]:
    raw_actions: list[dict] = []

    for certificate in certificates:
        status = certificate_status(certificate, today)
        if status == "expired":
            raw_actions.append(
                {
                    "id": f"certificate-{certificate.id}",
                    "weight": 0,
                    "severity": "Blocker",
                    "category": "Certificate",
                    "material_name": certificate.material.name,
                    "issue": f"{certificate.certificate_name} is expired.",
                    "action": "Renew or replace certificate evidence before site release.",
                    "owner": "Compliance Engineer",
                }
            )
        elif status == "expiring":
            raw_actions.append(
                {
                    "id": f"certificate-{certificate.id}",
                    "weight": 2,
                    "severity": "Warning",
                    "category": "Certificate",
                    "material_name": certificate.material.name,
                    "issue": f"{certificate.certificate_name} expires in {days_until_expiry(certificate, today)} days.",
                    "action": "Schedule renewal before the next installation window.",
                    "owner": "Compliance Engineer",
                }
            )

    for material in materials:
        if material.status == "failed":
            raw_actions.append(
                {
                    "id": f"material-{material.id}",
                    "weight": 1,
                    "severity": "Blocker",
                    "category": "Material",
                    "material_name": material.name,
                    "issue": f"Batch {material.batch_number} failed verification.",
                    "action": "Keep the batch blocked and request replacement evidence.",
                    "owner": "Site Engineer",
                }
            )
        elif material.status == "pending":
            raw_actions.append(
                {
                    "id": f"material-{material.id}",
                    "weight": 5,
                    "severity": "Warning",
                    "category": "Material",
                    "material_name": material.name,
                    "issue": f"Batch {material.batch_number} is pending verification.",
                    "action": "Complete QR/spec review before installation.",
                    "owner": "QA Inspector",
                }
            )

    for delivery in deliveries:
        delay = delivery_delay_days(delivery, today)
        if delay > 0:
            raw_actions.append(
                {
                    "id": f"delivery-{delivery.id}",
                    "weight": 3,
                    "severity": "Warning",
                    "category": "Delivery",
                    "material_name": delivery.material_name,
                    "issue": f"{delivery.supplier} delivery is {plural(delay, 'day')} late.",
                    "action": "Confirm recovery date or replacement supply.",
                    "owner": "Procurement Lead",
                }
            )

    for approval in approvals:
        overdue = approval_overdue_days(approval, today)
        if approval.status == "pending" and overdue > 0:
            approver_name = approval.user.name if getattr(approval, "user", None) else str(approval.approver_id)
            raw_actions.append(
                {
                    "id": f"approval-{approval.id}",
                    "weight": 4,
                    "severity": "Warning",
                    "category": "Approval",
                    "material_name": approval.material.name,
                    "issue": f"{approval.approval_type} is {plural(overdue, 'day')} overdue.",
                    "action": f"Escalate to {approver_name} for same-day decision.",
                    "owner": approver_name,
                }
            )

    raw_actions.extend(extra_actions or [])
    raw_actions.sort(key=lambda action: (action["weight"], action["material_name"]))
    return [
        ActionQueueOut(
            id=action["id"],
            rank=index,
            severity=action["severity"],
            category=action["category"],
            material_name=action["material_name"],
            issue=action["issue"],
            action=action["action"],
            owner=action["owner"],
        )
        for index, action in enumerate(raw_actions, start=1)
    ]


def _scan_warning_actions(project_id: int, db: Session) -> list[dict]:
    materials = (
        db.query(Material)
        .options(joinedload(Material.scans))
        .filter(Material.project_id == project_id)
        .order_by(Material.id)
        .all()
    )
    actions: list[dict] = []
    for material in materials:
        scans = [scan for scan in material.scans if scan.project_id == project_id and scan.scan_type != "release_check"]
        locations = sorted({scan.location for scan in scans if scan.location})
        if len(locations) > 1:
            actions.append(
                {
                    "id": f"scan-location-{material.id}",
                    "weight": 6,
                    "severity": "Warning",
                    "category": "QR Scan",
                    "material_name": material.name,
                    "issue": f"{material.qr_code} was scanned at multiple locations.",
                    "action": "Review scan trail and confirm the correct site location.",
                    "owner": "QA Inspector",
                }
            )
        blocked_reuse = [scan for scan in scans if scan.result in {"blocked_from_installation", "blocked"}]
        if len(blocked_reuse) > 1:
            actions.append(
                {
                    "id": f"scan-blocked-{material.id}",
                    "weight": 2,
                    "severity": "Blocker",
                    "category": "QR Scan",
                    "material_name": material.name,
                    "issue": f"{material.qr_code} has {len(blocked_reuse)} blocked release attempts.",
                    "action": "Stop release attempts and investigate repeated blocked scans.",
                    "owner": "QA Inspector",
                }
            )
    return actions


@router.get("/", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Project).options(
        selectinload(Project.materials).selectinload(Material.certificates),
        selectinload(Project.approvals),
        selectinload(Project.deliveries)
    )
    if current_user.email == DEMO_EMAIL:
        # Demo account: the shared seed data plus anything it created.
        query = query.filter(or_(Project.owner_id.is_(None), Project.owner_id == current_user.id))
    else:
        # Real (Google) users: only their own workspace.
        query = query.filter(Project.owner_id == current_user.id)
        
    projects_out = []
    for project in query.all():
        project_certs = [cert for material in project.materials for cert in material.certificates]
        projects_out.append(
            _project_out(
                project, db,
                materials=project.materials,
                approvals=project.approvals,
                certificates=project_certs,
                deliveries=project.deliveries,
            )
        )
    return projects_out


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = _get_owned_project(project_id, db, current_user)
    return _project_out(project, db)


@router.post("/", response_model=ProjectOut, dependencies=[Depends(require_role("Admin", "Project Manager"))])
def create_project(project: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_project = Project(
        name=project.name,
        location=project.location,
        start_date=project.start_date,
        end_date=project.end_date,
        status=project.status,
        risk_score=project.risk_score,
        owner_id=current_user.id,
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return _project_out(new_project, db)


@router.get("/{project_id}/dashboard", response_model=DashboardOut)
def get_dashboard(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = _get_owned_project(project_id, db, current_user)

    today = date.today()
    materials = db.query(Material).filter(Material.project_id == project_id).all()
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material))
        .filter(Approval.project_id == project_id)
        .all()
    )
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .order_by(Certificate.expiry_date)
        .all()
    )
    deliveries = db.query(Delivery).filter(Delivery.project_id == project_id).all()

    total_materials = len(materials)
    overdue_approvals = [approval for approval in approvals if approval_overdue_days(approval, today) > 0]
    pending_approvals = len([approval for approval in approvals if approval.status == "pending"])
    expired_certs = [cert for cert in certificates if certificate_status(cert, today) == "expired"]
    expiring_cert_list = [cert for cert in certificates if certificate_status(cert, today) == "expiring"]
    delayed_delivery_list = [delivery for delivery in deliveries if delivery_delay_days(delivery, today) > 0]
    delayed_deliveries = len(delayed_delivery_list)
    ontime_deliveries = len([delivery for delivery in deliveries if delivery_status(delivery, today) in {"on_time", "delivered"}])
    expiring_certs = len(expired_certs) + len(expiring_cert_list)
    computed_risk = computed_project_risk(materials, approvals, certificates, deliveries, today)
    pending_materials = [material for material in materials if material.status == "pending"]
    failed_materials = [material for material in materials if material.status == "failed"]
    activity_timeline = _activity_items(materials, approvals, certificates, deliveries, today)

    alerts = []
    alerts.extend(
        f"{cert.certificate_name} for {cert.material.name} is expired."
        for cert in expired_certs
    )
    alerts.extend(
        f"{cert.certificate_name} for {cert.material.name} expires in {days_until_expiry(cert, today)} days."
        for cert in expiring_cert_list
    )
    alerts.extend(
        f"{delivery.supplier} delivery for {delivery.material_name} is delayed by {delivery_delay_days(delivery, today)} days."
        for delivery in delayed_delivery_list
    )
    alerts.extend(
        f"{approval.approval_type} for {approval.material.name} is {_plural(approval_overdue_days(approval, today), 'day')} overdue."
        for approval in overdue_approvals
    )
    if not alerts:
        alerts.append(f"{project.name} has no expired certificates, delayed deliveries, or overdue approvals.")

    reasoning_sources = [
        f"{_plural(len(deliveries), 'delivery record')} with {_plural(len(delayed_delivery_list), 'delay')}",
        f"{_plural(len(expired_certs), 'expired certificate')} and {_plural(len(expiring_cert_list), 'expiring certificate')}",
        f"{_plural(len(overdue_approvals), 'overdue approval')}",
        f"{_plural(len(materials), 'material identity record')} with QR scan trail",
    ]

    workflow_dependencies = []
    if overdue_approvals:
        approval = overdue_approvals[0]
        workflow_dependencies.append(
            f"{approval.approval_type} pending -> {approval.material.name} release blocked -> Project risk is {computed_risk}"
        )
    if expired_certs:
        cert = expired_certs[0]
        workflow_dependencies.append(
            f"{cert.certificate_name} expired -> {cert.material.name} blocked -> Compliance risk escalates"
        )
    if delayed_delivery_list:
        delivery = delayed_delivery_list[0]
        workflow_dependencies.append(
            f"{delivery.supplier} delay -> {delivery.material_name} unavailable -> Site sequencing pressure increases"
        )
    if pending_materials:
        workflow_dependencies.append(
            f"{len(pending_materials)} pending material verifications -> Installation readiness remains conditional"
        )
    if not workflow_dependencies:
        workflow_dependencies.append("No active blockers found in the seeded workflow records.")

    health_timeline = []
    health_timeline.extend(
        f"Day {index}: {delivery.supplier} delivery for {delivery.material_name} is delayed by {delivery_delay_days(delivery, today)} days."
        for index, delivery in enumerate(delayed_delivery_list, start=1)
    )
    offset = len(health_timeline)
    health_timeline.extend(
        f"Day {offset + index}: {approval.approval_type} remains pending for {approval.material.name}."
        for index, approval in enumerate(overdue_approvals, start=1)
    )
    offset = len(health_timeline)
    health_timeline.extend(
        f"Day {offset + index}: {cert.certificate_name} is expired for {cert.material.name}."
        for index, cert in enumerate(expired_certs, start=1)
    )
    if not health_timeline:
        health_timeline.append("Day 1: Project records show normal delivery, compliance, and approval posture.")

    executive_brief = []
    if expired_certs:
        cert = expired_certs[0]
        executive_brief.append(f"Top compliance risk: {cert.certificate_name} for {cert.material.name} is expired.")
    if delayed_delivery_list:
        delivery = delayed_delivery_list[0]
        executive_brief.append(f"Schedule pressure: {delivery.supplier} delivery for {delivery.material_name} is delayed by {delivery_delay_days(delivery, today)} days.")
    if overdue_approvals:
        approval = overdue_approvals[0]
        executive_brief.append(f"Workflow blocker: {approval.approval_type} for {approval.material.name} is {_plural(approval_overdue_days(approval, today), 'day')} overdue.")
    if failed_materials:
        material = failed_materials[0]
        executive_brief.append(f"Verification risk: {material.name} failed batch review and should remain blocked.")
    # Tailor the closing line to the project's actual state — don't recommend
    # "resolve compliance" on a project that has no issues (or no materials yet).
    if expired_certs or delayed_delivery_list or overdue_approvals or failed_materials:
        executive_brief.append("Recommended action: resolve compliance first, then delivery recovery, then approval closure.")
    elif total_materials == 0:
        executive_brief.append("No materials recorded yet. Add materials and certificates to begin compliance tracking.")
    else:
        executive_brief.append("No active blockers — certificates, deliveries, and approvals are all in good standing.")
    supplier_names = sorted({delivery.supplier for delivery in deliveries} | {material.supplier for material in materials})
    supplier_risks = []
    for supplier in supplier_names:
        supplier_deliveries = [delivery for delivery in deliveries if delivery.supplier == supplier]
        delayed_count = len([delivery for delivery in supplier_deliveries if delivery_delay_days(delivery, today) > 0])
        total_delay_days = sum(delivery_delay_days(delivery, today) for delivery in supplier_deliveries)
        pending_count = len([delivery for delivery in supplier_deliveries if delivery.status == "pending"])
        ontime_count = len([delivery for delivery in supplier_deliveries if delivery_status(delivery, today) in {"on_time", "delivered"}])

        if not supplier_deliveries:
            risk = "Medium"
            reason = "No delivery record linked"
        elif delayed_count > 0 or total_delay_days >= 4:
            risk = "High"
            reason = f"{total_delay_days}-day delay on record"
        elif pending_count > 0:
            risk = "Medium"
            reason = "Pending delivery, no delay recorded yet"
        else:
            risk = "Low"
            reason = "On-time delivery record"

        supplier_risks.append(
            SupplierRiskOut(
                supplier=supplier,
                risk=risk,
                reason=reason,
                delayed_deliveries=delayed_count,
                total_delay_days=total_delay_days,
                total_deliveries=len(supplier_deliveries),
                ontime_deliveries=ontime_count,
            )
        )

    return DashboardOut(
        project=_project_out(project, db, materials, approvals, certificates, deliveries),
        total_materials=total_materials,
        pending_approvals=pending_approvals,
        expiring_certs=expiring_certs,
        total_deliveries=len(deliveries),
        ontime_deliveries=ontime_deliveries,
        delayed_deliveries=delayed_deliveries,
        alerts=alerts,
        reasoning_sources=reasoning_sources,
        workflow_dependencies=workflow_dependencies,
        health_timeline=health_timeline,
        activity_timeline=activity_timeline,
        executive_brief=executive_brief,
        risk_confidence=f"{computed_risk} - computed from current dates, compliance, delivery, approval, material, and QR scan indicators.",
        supplier_risks=supplier_risks,
    )


@router.get("/{project_id}/readiness", response_model=ProjectReadinessOut)
def get_project_readiness(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_project(project_id, db, current_user)
    _, materials, approvals, certificates, deliveries = _project_inputs(project_id, db)
    today = date.today()

    expired = [cert for cert in certificates if certificate_status(cert, today) == "expired"]
    expiring = [cert for cert in certificates if certificate_status(cert, today) == "expiring"]
    failed = [material for material in materials if material.status == "failed"]
    pending = [material for material in materials if material.status == "pending"]
    overdue = [
        approval
        for approval in approvals
        if approval.status == "pending" and approval_overdue_days(approval, today) > 0
    ]
    delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery, today) > 0]
    scan_warnings = _scan_reuse_warning_count(project_id, db)

    blockers = len(expired) + len(failed)
    warnings = len(expiring) + len(pending) + len(overdue) + len(delayed) + scan_warnings
    # Use the SAME weighted readiness engine the AI assistant uses, so the score is
    # consistent everywhere (Command Center, assistant, forecast). Previously this
    # endpoint used a harsher blockers×45 formula that disagreed with the AI.
    from engines.readiness_engine import compute_readiness_score
    score = compute_readiness_score({
        "materials": materials,
        "certificates": certificates,
        "approvals": approvals,
        "deliveries": deliveries,
    }, today).score

    # Empty project: nothing to assess yet — do NOT report a misleading "100% Ready".
    if not materials:
        return ProjectReadinessOut(
            status="No Materials Yet",
            score=0,
            blockers=0,
            warnings=0,
            reasons=["No materials have been added to this project yet. Add materials to begin readiness tracking."],
            next_action="Add the project's first material to start tracking readiness.",
        )

    if blockers > 0:
        status = "Blocked"
    elif warnings >= 3:
        status = "Hold"
    elif warnings > 0:
        status = "Watch"
    else:
        status = "Ready"

    reasons = []
    reasons.extend(f"{cert.certificate_name} expired certificate for {cert.material.name}." for cert in expired)
    reasons.extend(f"{material.name} failed material verification." for material in failed)
    reasons.extend(f"{approval.approval_type} is {plural(approval_overdue_days(approval, today), 'day')} overdue." for approval in overdue)
    reasons.extend(f"{delivery.material_name} delivery is delayed by {plural(delivery_delay_days(delivery, today), 'day')}." for delivery in delayed)
    reasons.extend(f"{material.name} is pending material verification." for material in pending)
    if scan_warnings:
        reasons.append(f"{plural(scan_warnings, 'QR reuse warning')} found in site scan history.")
    if not reasons:
        reasons.append("No active blockers found in current project evidence.")

    actions = _build_action_queue(
        approvals,
        certificates,
        deliveries,
        materials,
        today,
        _scan_warning_actions(project_id, db),
    )
    next_action = actions[0].action if actions else "Project is ready for release checks."

    return ProjectReadinessOut(
        status=status,
        score=score,
        blockers=blockers,
        warnings=warnings,
        reasons=reasons,
        next_action=next_action,
    )


@router.get("/{project_id}/actions", response_model=list[ActionQueueOut])
def get_project_actions(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_project(project_id, db, current_user)
    _, materials, approvals, certificates, deliveries = _project_inputs(project_id, db)
    return _build_action_queue(
        approvals,
        certificates,
        deliveries,
        materials,
        date.today(),
        _scan_warning_actions(project_id, db),
    )


@router.get("/{project_id}/bundle")
def get_project_bundle(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return the Command Center startup payload in one request.

    This keeps Vercel -> Render startup from fanning out into many authenticated
    round trips before the first dashboard can render.
    """
    project = _get_owned_project(project_id, db, current_user)
    dashboard = get_dashboard(project_id, db, current_user)
    readiness = get_project_readiness(project_id, db, current_user)
    actions = get_project_actions(project_id, db, current_user)

    materials = (
        db.query(Material)
        .filter(Material.project_id == project_id)
        .order_by(Material.id)
        .all()
    )
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .order_by(Certificate.expiry_date)
        .all()
    )
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material), joinedload(Approval.user))
        .filter(Approval.project_id == project_id)
        .all()
    )
    approvals.sort(key=approval_overdue_days, reverse=True)
    scans = (
        db.query(QRScan)
        .options(joinedload(QRScan.material), joinedload(QRScan.user))
        .filter(QRScan.project_id == project_id)
        .order_by(QRScan.scan_time.desc())
        .all()
    )
    passports = (
        db.query(ProductPassport)
        .join(Material)
        .filter(Material.project_id == project_id)
        .all()
    )
    project_material_ids = [material.id for material in materials]
    audit_trails = (
        db.query(AuditTrail)
        .options(joinedload(AuditTrail.user))
        .filter(or_(AuditTrail.project_id == project_id, AuditTrail.material_id.in_(project_material_ids)))
        .order_by(AuditTrail.timestamp.desc())
        .limit(200)
        .all()
    )

    return {
        "project": _project_out(project, db, materials=materials, approvals=approvals, certificates=certificates),
        "dashboard": dashboard,
        "readiness": readiness,
        "actions": actions,
        "materials": materials,
        "certificates": [
            {
                "id": cert.id,
                "material_id": cert.material_id,
                "certificate_name": cert.certificate_name,
                "issuing_body": cert.issuing_body,
                "issue_date": cert.issue_date,
                "expiry_date": cert.expiry_date,
                "status": certificate_status(cert),
                "material_name": cert.material.name,
                "days_until_expiry": days_until_expiry(cert),
            }
            for cert in certificates
        ],
        "approvals": [
            {
                "id": approval.id,
                "project_id": approval.project_id,
                "material_id": approval.material_id,
                "approval_type": approval.approval_type,
                "approver": approval.user.name if approval.user else str(approval.approver_id),
                "status": approval.status,
                "requested_date": approval.requested_date,
                "approved_date": approval.approved_date,
                "overdue_days": approval_overdue_days(approval),
                "material_name": approval.material.name,
            }
            for approval in approvals
        ],
        "scans": [
            {
                "id": scan.id,
                "material_id": scan.material_id,
                "project_id": scan.project_id,
                "scanned_by": scan.user.name if scan.user else str(scan.scanned_by),
                "scan_time": scan.scan_time,
                "location": scan.location,
                "scan_type": scan.scan_type,
                "result": scan.result,
                "material_name": scan.material.name,
            }
            for scan in scans
        ],
        "passports": passports,
        "audit_trail": [
            {
                "id": trail.id,
                "action": trail.action,
                "performed_by": trail.user.name if trail.user else str(trail.performed_by_id),
                "timestamp": trail.timestamp.isoformat() if trail.timestamp else None,
                "details": trail.details,
                "hash": trail.hash,
                "previous_hash": trail.previous_hash,
                "material_id": trail.material_id,
                "result": trail.result,
            }
            for trail in audit_trails
        ],
    }


@router.get("/{project_id}/evidence", response_model=ProjectEvidenceOut)
def get_project_evidence(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = _get_owned_project(project_id, db, current_user)

    material_count = db.query(Material).filter(Material.project_id == project_id).count()
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .order_by(Certificate.expiry_date)
        .all()
    )
    deliveries = (
        db.query(Delivery)
        .filter(Delivery.project_id == project_id)
        .all()
    )
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material))
        .filter(Approval.project_id == project_id, Approval.status == "pending")
        .all()
    )
    today = date.today()
    certificates = [cert for cert in certificates if certificate_status(cert, today) in {"expiring", "expired"}]
    deliveries = [delivery for delivery in deliveries if delivery_delay_days(delivery, today) > 0]
    approvals = [approval for approval in approvals if approval_overdue_days(approval, today) > 0]
    deliveries.sort(key=lambda delivery: delivery_delay_days(delivery, today), reverse=True)
    approvals.sort(key=lambda approval: approval_overdue_days(approval, today), reverse=True)

    certificate_records = [
        EvidenceRecordOut(
            id=certificate.id,
            category="certificates",
            title=certificate.certificate_name,
            material_name=certificate.material.name,
            status=certificate_status(certificate, today).title(),
            detail="Expired"
            if certificate_status(certificate, today) == "expired"
            else f"Expires in {days_until_expiry(certificate, today)} days",
            action="Check expiry and renew before release",
            tone="danger" if certificate_status(certificate, today) == "expired" else "warning",
        )
        for certificate in certificates
    ]

    delivery_records = [
        EvidenceRecordOut(
            id=delivery.id,
            category="deliveries",
            title=delivery.supplier,
            material_name=delivery.material_name,
            status=delivery_status(delivery, today).title(),
            detail=f"Delayed by {delivery_delay_days(delivery, today)} days",
            action="Confirm recovery date with supplier",
            tone="warning",
        )
        for delivery in deliveries
    ]

    approval_records = [
        EvidenceRecordOut(
            id=approval.id,
            category="approvals",
            title=approval.approval_type,
            material_name=approval.material.name,
            status=approval.status.title(),
            detail=f"{_plural(approval_overdue_days(approval, today), 'day')} overdue",
            action=f"Escalate to {approval.user.name if getattr(approval, 'user', None) else str(approval.approver_id)}",
            tone="warning",
        )
        for approval in approvals
    ]

    top_priority = "Clear"
    recommendation = "No active evidence blockers found for this project."
    if certificate_records:
        top_priority = "Certificates"
        recommendation = "Resolve certificate issues before releasing affected materials."
    elif delivery_records:
        top_priority = "Deliveries"
        recommendation = "Recover delayed supply before site sequencing slips."
    elif approval_records:
        top_priority = "Approvals"
        recommendation = "Close overdue approvals before execution."

    return ProjectEvidenceOut(
        project=_project_out(project, db),
        summary=EvidenceSummaryOut(
            open_items=len(certificate_records) + len(delivery_records) + len(approval_records),
            material_records=material_count,
            top_priority=top_priority,
            recommendation=recommendation,
        ),
        certificates=certificate_records,
        deliveries=delivery_records,
        approvals=approval_records,
    )


@router.get("/{project_id}/activity", response_model=ProjectTimelineOut)
def get_project_activity(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = _get_owned_project(project_id, db, current_user)

    today = date.today()
    materials = db.query(Material).filter(Material.project_id == project_id).all()
    approvals = (
        db.query(Approval)
        .options(joinedload(Approval.material))
        .filter(Approval.project_id == project_id)
        .all()
    )
    certificates = (
        db.query(Certificate)
        .options(joinedload(Certificate.material))
        .join(Material)
        .filter(Material.project_id == project_id)
        .all()
    )
    deliveries = db.query(Delivery).filter(Delivery.project_id == project_id).all()

    return ProjectTimelineOut(
        project=_project_out(project, db, materials, approvals, certificates, deliveries),
        items=_activity_items(materials, approvals, certificates, deliveries, today),
    )


@router.get("/{project_id}/audit-trail")
def get_project_audit_trail(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = _get_owned_project(project_id, db, current_user)

    project_material_ids = [material_id for (material_id,) in db.query(Material.id).filter(Material.project_id == project_id).all()]
    trails = (
        db.query(AuditTrail)
        .options(joinedload(AuditTrail.user))
        .filter(or_(AuditTrail.project_id == project_id, AuditTrail.material_id.in_(project_material_ids)))
        .order_by(AuditTrail.timestamp.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": trail.id,
            "action": trail.action,
            "performed_by": trail.user.name if trail.user else str(trail.performed_by_id),
            "timestamp": trail.timestamp.isoformat() if trail.timestamp else None,
            "details": trail.details,
            "hash": trail.hash,
            "previous_hash": trail.previous_hash,
            "material_id": trail.material_id,
            "result": trail.result,
        }
        for trail in trails
    ]
