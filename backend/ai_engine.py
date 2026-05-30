import os
from dataclasses import dataclass

from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy.orm import joinedload

from database import SessionLocal
from intelligence import approval_overdue_days, certificate_status, delivery_delay_days
from models import Approval, Certificate, Delivery, Material, Project, QRScan


load_dotenv()


@dataclass
class AnswerResult:
    answer: str
    data_used: list[str]
    mode: str
    reasoning_sources: list[str]
    confidence: str


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    return f"{count} {singular if count == 1 else plural or singular + 's'}"


def _material_line(material: Material) -> str:
    return (
        f"- {material.name} | Supplier: {material.supplier} | Batch: {material.batch_number} "
        f"| QR: {material.qr_code} | Status: {material.status} | Quantity: {material.quantity} {material.unit}"
    )


def build_project_context(project_id: int) -> str:
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return "PROJECT NOT FOUND"

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
        scans = (
            db.query(QRScan)
            .options(joinedload(QRScan.material))
            .filter(QRScan.project_id == project_id)
            .order_by(QRScan.scan_time.desc())
            .limit(5)
            .all()
        )

        return f"""
PROJECT: {project.name} | Location: {project.location} | Status: {project.status} | Risk: {project.risk_score}

MATERIALS ({len(materials)} total):
{chr(10).join(_material_line(material) for material in materials)}

APPROVALS:
{chr(10).join(f"- {approval.approval_type} for {approval.material.name} | Approver: {approval.approver} | Status: {approval.status} | Overdue: {approval_overdue_days(approval)} days" for approval in approvals)}

COMPLIANCE CERTIFICATES:
{chr(10).join(f"- {cert.certificate_name} for {cert.material.name} | Issuing body: {cert.issuing_body} | Expires: {cert.expiry_date} | Status: {certificate_status(cert)}" for cert in certificates)}

DELIVERIES:
{chr(10).join(f"- {delivery.supplier} | Material: {delivery.material_name} | Status: {delivery.status} | Delay: {delivery_delay_days(delivery)} days" for delivery in deliveries)}

RECENT QR SCANS:
{chr(10).join(f"- {scan.material.name} scanned by {scan.scanned_by} at {scan.location} | Type: {scan.scan_type} | Result: {scan.result}" for scan in scans)}
""".strip()
    finally:
        db.close()


def get_project_data(project_id: int) -> dict:
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError("Project not found")

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
        scans = (
            db.query(QRScan)
            .options(joinedload(QRScan.material))
            .filter(QRScan.project_id == project_id)
            .order_by(QRScan.scan_time.desc())
            .all()
        )
        return {
            "project": project,
            "materials": materials,
            "approvals": approvals,
            "certificates": certificates,
            "deliveries": deliveries,
            "scans": scans,
        }
    finally:
        db.close()


def deterministic_answer(question: str, project_id: int) -> AnswerResult:
    data = get_project_data(project_id)
    question_lower = question.lower()
    project = data["project"]
    materials = data["materials"]
    approvals = data["approvals"]
    certificates = data["certificates"]
    deliveries = data["deliveries"]

    if "not yet verified" in question_lower or "not verified" in question_lower or "unverified" in question_lower:
        pending = [material for material in materials if material.status == "pending"]
        failed = [material for material in materials if material.status == "failed"]
        lines = [f"The {project.name} materials that are not yet verified are:"]
        if pending:
            lines.extend(
                f"{index}. {material.name} from {material.supplier}, batch {material.batch_number}, is still pending verification. Keep it blocked from installation until QR/spec confirmation and approval are complete."
                for index, material in enumerate(pending, start=1)
            )
        else:
            lines.append("No materials are pending verification in the current seeded data.")
        if failed:
            failed_names = ", ".join(f"{material.name} ({material.batch_number})" for material in failed)
            lines.append(f"Also keep failed batch items blocked: {failed_names}.")
        return AnswerResult(
            "\n".join(lines),
            ["materials", "qr_scans"],
            "deterministic-demo",
            [f"{len(pending)} pending material records", f"{len(failed)} failed material records", "Recent QR scan results"],
            "High",
        )

    if "approval" in question_lower and ("overdue" in question_lower or "risk" in question_lower):
        overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
        lines = [f"The overdue approvals for {project.name} are:"]
        for index, approval in enumerate(overdue, start=1):
            lines.append(
                f"{index}. {approval.approval_type} for {approval.material.name}, batch {approval.material.batch_number}, is {_plural(approval_overdue_days(approval), 'day')} overdue with {approval.approver}. This can block release work and create rework risk if the team proceeds without sign-off."
            )
        if not overdue:
            lines.append("No overdue approvals are present in the current seeded data.")
        else:
            lines.append(f"Action: escalate {overdue[0].approval_type} first, assign one owner, and request same-day approval or a written blocker reason.")
        return AnswerResult(
            "\n".join(lines),
            ["approvals", "materials"],
            "deterministic-demo",
            [f"{len(overdue)} pending overdue approvals", "Material batch relationships", "Approver ownership records"],
            "High",
        )

    if "daily brief" in question_lower or "morning report" in question_lower:
        expired = [cert for cert in certificates if certificate_status(cert) == "expired"]
        expiring = [cert for cert in certificates if certificate_status(cert) == "expiring"]
        delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery) > 0]
        overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
        pending = [material for material in materials if material.status == "pending"]
        failed = [material for material in materials if material.status == "failed"]
        lines = [
            f"Daily site brief for {project.name}:",
            f"1. Release status: {len(failed)} failed batch, {len(pending)} pending batches, {len(expired)} expired certificates, and {len(overdue)} overdue approvals need attention before site use.",
        ]
        if expired:
            cert = expired[0]
            lines.append(f"2. Block today: {cert.material.name} cannot be released because {cert.certificate_name} is expired.")
        if delayed:
            delivery = delayed[0]
            lines.append(f"3. Recover supply: {delivery.material_name} from {delivery.supplier} is delayed by {delivery_delay_days(delivery)} days.")
        if overdue:
            approval = overdue[0]
            lines.append(f"4. Escalate approval: {approval.approval_type} for {approval.material.name} is {_plural(approval_overdue_days(approval), 'day')} overdue with {approval.approver}.")
        if expiring:
            cert = expiring[0]
            lines.append(f"5. Watch next: {cert.certificate_name} for {cert.material.name} expires on {cert.expiry_date}.")
        lines.append("Manager action: clear compliance blockers first, then delivery recovery, then approval closure.")
        return AnswerResult(
            "\n".join(lines),
            ["materials", "compliance_certificates", "approvals", "deliveries", "qr_scans"],
            "deterministic-demo",
            [f"{len(expired)} expired certificates", f"{len(delayed)} delayed deliveries", f"{len(overdue)} overdue approvals", "Site-use release evidence"],
            "High",
        )

    if "fix first" in question_lower or "project manager" in question_lower or "today" in question_lower:
        expired = [cert for cert in certificates if certificate_status(cert) == "expired"]
        delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery) > 0]
        overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
        lines = [f"First action plan for {project.name}:"]
        action_index = 1
        if expired:
            cert = expired[0]
            lines.append(
                f"{action_index}. Stop release of {cert.material.name} and renew or replace {cert.certificate_name}. It expired on {cert.expiry_date}, so installation should remain blocked until valid compliance evidence is available."
            )
            action_index += 1
        if delayed:
            delivery = delayed[0]
            lines.append(
                f"{action_index}. Recover the {delivery.supplier} delivery for {delivery.material_name}. It is delayed by {delivery_delay_days(delivery)} days, so the site sequence needs a revised delivery commitment or replacement supply plan."
            )
            action_index += 1
        if overdue:
            approval = overdue[0]
            lines.append(
                f"{action_index}. Escalate {approval.approval_type} for {approval.material.name}, batch {approval.material.batch_number}, to {approval.approver}. It is {_plural(approval_overdue_days(approval), 'day')} overdue and should have a same-day approval decision or written blocker reason."
            )
        if action_index == 1:
            lines.append("No expired certificates, delayed deliveries, or overdue approvals are present in the current seeded data.")
        else:
            lines.append("Priority order: compliance block first, delivery recovery second, approval closure third. This protects the site from installing blocked material while keeping the programme moving.")
        return AnswerResult(
            "\n".join(lines),
            ["compliance_certificates", "deliveries", "approvals", "materials"],
            "deterministic-demo",
            [f"{len(expired)} expired certificates", f"{len(delayed)} delayed deliveries", f"{len(overdue)} overdue approvals"],
            "High",
        )

    if "executive brief" in question_lower or "management summary" in question_lower:
        expired = [cert for cert in certificates if certificate_status(cert) == "expired"]
        delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery) > 0]
        overdue = [approval for approval in approvals if approval.status == "pending" and approval_overdue_days(approval) > 0]
        pending = [material for material in materials if material.status == "pending"]
        lines = [
            f"Executive brief for {project.name}:",
            f"1. Project risk: current seeded risk score is {project.risk_score}.",
        ]
        if expired:
            cert = expired[0]
            lines.append(f"2. Compliance risk: {cert.certificate_name} for {cert.material.name} is expired, so the material should remain blocked until renewal or replacement evidence is uploaded.")
        if delayed:
            delivery = delayed[0]
            lines.append(f"3. Schedule risk: {delivery.supplier} delivery for {delivery.material_name} is delayed by {delivery_delay_days(delivery)} days, creating sequencing pressure for the site team.")
        if overdue:
            approval = overdue[0]
            lines.append(f"4. Approval risk: {approval.approval_type} for {approval.material.name} is {_plural(approval_overdue_days(approval), 'day')} overdue with {approval.approver} and should be escalated today.")
        if pending:
            pending_names = ", ".join(material.name for material in pending)
            lines.append(f"5. Verification risk: {pending_names} still need material verification.")
        lines.append("Recommended management action: block non-compliant installation, recover delayed supply, then close overdue approvals before releasing field work.")
        lines.append("Risk confidence: High when compliance, delivery, approval, and material verification records point to the same priority.")
        return AnswerResult(
            "\n".join(lines),
            ["projects", "materials", "approvals", "compliance_certificates", "deliveries"],
            "deterministic-demo",
            [f"{len(expired)} expired certificates", f"{len(delayed)} delayed deliveries", f"{len(overdue)} overdue approvals", f"{len(pending)} pending material verifications"],
            "High",
        )

    context = build_project_context(project_id)
    fallback = (
        "Here is the current ConstructAsk project summary based on the available data:\n"
        f"{context}\n\n"
        "Ask about unverified materials, overdue approvals, expiring certificates, delayed deliveries, or what to fix first today for a more focused answer."
    )
    return AnswerResult(
        fallback,
        ["projects", "materials", "approvals", "compliance_certificates", "deliveries", "qr_scans"],
        "deterministic-demo",
        ["Project summary", "Material records", "Approvals", "Compliance", "Deliveries", "QR scans"],
        "Medium",
    )


def ask_constructask(question: str, project_id: int) -> AnswerResult:
    # --- Input sanitization ---
    question = question.strip()[:2000]
    if not question:
        return AnswerResult(
            "Please provide a question.",
            [],
            "error",
            [],
            "N/A",
        )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return deterministic_answer(question, project_id)

    context = build_project_context(project_id)
    system_prompt = """You are ConstructAsk, an AI assistant for construction project teams.
You have access to project data including materials, approvals, compliance certificates,
deliveries, and QR scan records.

Answer clearly and specifically using only the project data provided.
Always reference material names, batch numbers, supplier names, dates, and risk reasons.
If something is at risk, say so clearly and explain why.
Suggest practical actions the team should take.
Stay assistive: do not approve, reject, release, or automatically change workflow status.
Do not make up data that is not in the context."""

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Project Data:\n{context}\n\nQuestion: {question}"},
        ],
    )

    return AnswerResult(
        answer=response.choices[0].message.content or "",
        data_used=["projects", "materials", "approvals", "compliance_certificates", "deliveries", "qr_scans"],
        mode="openai",
        reasoning_sources=["Retrieved project context", "Material records", "Approvals", "Compliance certificates", "Deliveries", "QR scans"],
        confidence="High when the answer cites multiple matching records; Medium when data is incomplete.",
    )
