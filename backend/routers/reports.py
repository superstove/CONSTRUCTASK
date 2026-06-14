"""
Executive Intelligence Report — PDF download endpoint.

  GET  /api/projects/{project_id}/report.pdf  (auth)  -> binary PDF
"""

from __future__ import annotations

import os
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from ai_engine import get_project_data
from auth import get_current_user
from database import get_db
from engines.audit_engine import verify_chain_integrity
from engines.forecast_engine import forecast_timeline
from engines.project_health_engine import compute_project_health
from engines.readiness_engine import compute_readiness_score
from engines.recommendation_engine import generate_recommendations
from engines.risk_engine import compute_risk_assessment
from intelligence import (
    approval_overdue_days,
    certificate_status,
    delivery_delay_days,
)
from models import AuditTrail, ProductPassport, User
from reports.executive_pdf import build_executive_report


router = APIRouter()


def _tone(score: float, thresholds=(70, 85)) -> str:
    """Map a 0–100 score to a card tone (bad / warn / good)."""
    bad, good = thresholds
    if score >= good:
        return "good"
    if score >= bad:
        return "warn"
    return "bad"


def _risk_tone(level: str) -> str:
    return {"high": "bad", "medium": "warn", "low": "good"}.get((level or "").lower(), "warn")


@router.get("/{project_id}/report.pdf")
def get_executive_report(project_id: int, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Generate and return a multi-page executive PDF for one project."""
    try:
        data = get_project_data(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found")

    project = data["project"]
    materials = data["materials"]
    certificates = data["certificates"]
    approvals = data["approvals"]
    deliveries = data["deliveries"]

    # --- KPIs -----------------------------------------------------------------
    readiness = compute_readiness_score(data)
    risk = compute_risk_assessment(data)
    health = compute_project_health(data)
    # Composite score (same 40/35/25 blend the health engine uses internally).
    composite = round(readiness.score * 0.40 + health.compliance.score * 0.35 + (100 - risk.score) * 0.25)

    valid_certs = sum(1 for c in certificates if certificate_status(c) == "valid")
    total_certs = len(certificates) or 1
    compliance_pct = round((valid_certs / total_certs) * 100)

    on_time = sum(1 for d in deliveries if delivery_delay_days(d) == 0 and d.status != "blocked")
    supplier_pct = round((on_time / len(deliveries)) * 100) if deliveries else 100

    open_risks = risk.total_factors
    blockers = sum(1 for m in materials if m.status == "failed") + \
               sum(1 for c in certificates if certificate_status(c) == "expired")

    kpis = {
        "health_label": f"Grade {health.health_grade}",
        "health_score": composite,
        "health_tone": _tone(composite),
        "readiness": readiness.score,
        "readiness_status": readiness.risk_level,
        "readiness_tone": _tone(readiness.score),
        "compliance": compliance_pct,
        "valid_certs": valid_certs,
        "total_certs": len(certificates),
        "compliance_tone": _tone(compliance_pct),
        "supplier": supplier_pct,
        "supplier_tone": _tone(supplier_pct, thresholds=(60, 85)),
        "open_risks": open_risks,
        "blockers": blockers,
        "risks_tone": "bad" if blockers else ("warn" if open_risks else "good"),
    }

    # --- Executive summary text ----------------------------------------------
    if blockers:
        summary_text = (
            f"{project.name} is currently {readiness.risk_level.lower()} risk at "
            f"{readiness.score}% readiness, with {blockers} blocking issue(s) preventing release. "
            "Compliance and verification gaps must be cleared before material can be released to site."
        )
    elif open_risks:
        summary_text = (
            f"{project.name} is on a watch posture at {readiness.score}% readiness. "
            f"There are {open_risks} open risk factor(s) — none blocking release yet — that warrant action this week."
        )
    else:
        summary_text = (
            f"{project.name} is operating cleanly at {readiness.score}% readiness with no active blockers, "
            "expired certificates, or overdue approvals on record."
        )

    # --- Key risks (text + severity) -----------------------------------------
    risks: list[tuple[str, str]] = []
    for cert in certificates:
        cs = certificate_status(cert)
        if cs == "expired":
            risks.append((f"{cert.certificate_name} for {cert.material.name} is expired.", "critical"))
        elif cs == "expiring":
            risks.append((f"{cert.certificate_name} for {cert.material.name} is expiring soon.", "medium"))
    for ap in approvals:
        od = approval_overdue_days(ap)
        if ap.status == "pending" and od > 0:
            risks.append((f"{ap.approval_type} for {ap.material.name} is {od} day(s) overdue.", "high"))
    for d in deliveries:
        dd = delivery_delay_days(d)
        if dd > 0:
            risks.append((f"{d.supplier} delivery for {d.material_name} is {dd} day(s) late.", "high"))
    for m in materials:
        if m.status == "failed":
            risks.append((f"{m.name} (batch {m.batch_number}) failed verification.", "critical"))

    # --- Recommended actions + expected outcome ------------------------------
    plan = generate_recommendations(data)
    actions = [r.action for r in plan.recommendations[:6]]
    expected_outcome = None
    if plan.recommendations and plan.cumulative_readiness > plan.current_readiness:
        expected_outcome = (
            f"If all {plan.total_issues} action(s) are completed, readiness improves from "
            f"{plan.current_readiness}% to {plan.cumulative_readiness}%."
        )

    # --- Material rows for the table page ------------------------------------
    passports_by_mat = {p.material_id: p for p in data["passports"]}
    material_rows = []
    for m in materials:
        # Per-material risk: failed = high, pending = medium, verified = low
        if m.status == "failed":
            r_label = "High"
        elif m.status == "pending":
            r_label = "Medium"
        else:
            r_label = "Low"
        pp = passports_by_mat.get(m.id)
        material_rows.append({
            "name": m.name, "batch": m.batch_number, "supplier": m.supplier,
            "status": m.status, "risk": r_label,
            "passport": (pp.passport_id or pp.passport_number) if pp else None,
        })

    # --- Passport detail rows (pick the most decision-relevant first) -------
    def _passport_priority(m):
        return {"failed": 0, "pending": 1, "verified": 2}.get(m.status, 3)
    chosen = sorted(materials, key=_passport_priority)[:3]
    passport_rows = []
    for m in chosen:
        pp = passports_by_mat.get(m.id)
        passport_rows.append({
            "name": m.name,
            "code": m.batch_number,
            "passport_id": (pp.passport_id or pp.passport_number) if pp else f"PP-{project.id}-{m.id}",
            "supplier": m.supplier,
            "batch": m.batch_number,
            "origin": project.location,
            "compliance_score": pp.compliance_score if pp else None,
            "sustainability_score": pp.sustainability_score if pp else None,
            "carbon_footprint": pp.carbon_footprint if pp else None,
            "qr_payload": m.qr_code,
        })

    # --- Audit chain status + recent events ----------------------------------
    chain = verify_chain_integrity(db, project_id)
    trails = (
        db.query(AuditTrail)
        .options(joinedload(AuditTrail.user))
        .filter(AuditTrail.project_id == project_id)
        .order_by(AuditTrail.timestamp.desc())
        .limit(10)
        .all()
    )
    audit_events = [{
        "action": t.action,
        "when": t.timestamp.strftime("%Y-%m-%d %H:%M") if t.timestamp else "",
        "actor": (t.user.name if t.user else "System"),
        "details": t.details or "",
        "hash": t.hash or "",
    } for t in trails]

    # --- AI executive intelligence: root causes, forecast, priorities -------
    root_causes = []
    for r in plan.recommendations[:5]:
        root_causes.append(f"{r.issue} — {r.impact}")

    snapshots = forecast_timeline(data)
    def _snap(days: int):
        for s in snapshots:
            if getattr(s, "days_ahead", None) == days:
                return getattr(s, "projected_readiness", None)
        return None
    forecast = {
        "d7": _snap(7),  "d7_note":  "Readiness projection",
        "d14": _snap(14), "d14_note": "Schedule pressure builds",
        "d30": _snap(30), "d30_note": "Compliance exposure",
    }
    priorities = [(r.action, r.severity) for r in plan.recommendations[:5]]

    # --- Verification QR target (public verify endpoint) ---------------------
    base = os.getenv("PUBLIC_APP_URL") or "http://localhost:5173"
    verify_url = f"{base.rstrip('/')}/?project={project_id}&verify={quote(project.name)}"

    payload = {
        "project": project,
        "generated_at": datetime.now(),
        "verify_url": verify_url,
        "kpis": kpis,
        "summary_text": summary_text,
        "risks": risks,
        "actions": actions,
        "expected_outcome": expected_outcome,
        "material_rows": material_rows,
        "passport_rows": passport_rows,
        "chain_ok": chain.is_valid,
        "chain_total": chain.total_records,
        "chain_verified": chain.verified_records,
        "audit_events": audit_events,
        "root_causes": root_causes,
        "forecast": forecast,
        "priorities": priorities,
        "generated_by": current_user.name,
    }
    pdf_bytes = build_executive_report(payload)
    filename = f"ConstructAsk_Report_{project.name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
