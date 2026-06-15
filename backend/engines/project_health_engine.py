"""
Construct Ask V3 — Project Health Engine (Orchestrator)

Calls all individual engines and aggregates their results into a single
:class:`ProjectHealth` snapshot with a letter grade and summary.

Example::

    data = get_project_data(project_id)
    health = compute_project_health(data)
    print(health.health_grade, health.status_emoji)
    # 'B' '🟡'

    summary_text = generate_health_summary(data)
    print(summary_text)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from engines.readiness_engine import ReadinessResult, compute_readiness_score
from engines.risk_engine import RiskAssessment, compute_risk_assessment
from engines.compliance_engine import ComplianceStatus, compute_compliance_status
from engines.supplier_engine import SupplierAnalysis, analyze_suppliers


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ProjectHealth:
    """Unified health snapshot for a project.

    Attributes:
        project_name: Name of the project.
        project_id: Primary key of the project.
        readiness: Result from the readiness engine.
        risk: Result from the risk engine.
        compliance: Result from the compliance engine.
        suppliers: Result from the supplier engine.
        health_grade: Letter grade A/B/C/D/F.
        status_emoji: '🟢' (A/B), '🟡' (C), '🔴' (D/F).
        summary: One-line human-readable summary.
    """

    project_name: str
    project_id: int
    readiness: ReadinessResult
    risk: RiskAssessment
    compliance: ComplianceStatus
    suppliers: SupplierAnalysis
    health_grade: str
    status_emoji: str
    summary: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_health_grade(readiness_score: int, compliance_score: int, risk_score: int) -> str:
    """Derive a letter grade from the engine scores.

    The composite score blends readiness (40%), compliance (35%), and
    inverse-risk (25%).  Higher is better for all inputs except risk,
    which is inverted (100 – risk_score).

    Returns:
        One of 'A', 'B', 'C', 'D', 'F'.
    """
    composite = (
        readiness_score * 0.40
        + compliance_score * 0.35
        + (100 - risk_score) * 0.25
    )
    if composite >= 90:
        return "A"
    if composite >= 75:
        return "B"
    if composite >= 60:
        return "C"
    if composite >= 40:
        return "D"
    return "F"


def _emoji_for_grade(grade: str) -> str:
    """Map a letter grade to a status emoji."""
    if grade in ("A", "B"):
        return "🟢"
    if grade == "C":
        return "🟡"
    return "🔴"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_project_health(
    data: dict[str, Any],
    today: date | None = None,
) -> ProjectHealth:
    """Orchestrate all engines and return a unified health snapshot.

    Calls:
        * :func:`engines.readiness_engine.compute_readiness_score`
        * :func:`engines.risk_engine.compute_risk_assessment`
        * :func:`engines.compliance_engine.compute_compliance_status`
        * :func:`engines.supplier_engine.analyze_suppliers`

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A :class:`ProjectHealth` dataclass aggregating all results.

    Example::

        health = compute_project_health(data)
        print(health.health_grade)  # 'B'
    """
    project = data.get("project")
    project_name = project.name if project else "Unknown Project"
    project_id = project.id if project else 0

    readiness = compute_readiness_score(data, today)
    risk = compute_risk_assessment(data, today)
    compliance = compute_compliance_status(data, today)
    suppliers = analyze_suppliers(data, today)

    grade = _compute_health_grade(readiness.score, compliance.score, risk.score)
    emoji = _emoji_for_grade(grade)

    summary = (
        f"{emoji} Project '{project_name}' — Grade {grade}. "
        f"Readiness {readiness.score}/100 ({readiness.risk_level}), "
        f"Risk {risk.level} ({risk.total_factors} factor(s)), "
        f"Compliance {compliance.score}/100, "
        f"{suppliers.high_risk_count} high-risk supplier(s)."
    )

    return ProjectHealth(
        project_name=project_name,
        project_id=project_id,
        readiness=readiness,
        risk=risk,
        compliance=compliance,
        suppliers=suppliers,
        health_grade=grade,
        status_emoji=emoji,
        summary=summary,
    )


def generate_health_summary(
    data: dict[str, Any],
    today: date | None = None,
) -> str:
    """Generate a multi-line human-readable health summary.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A formatted string suitable for display or logging.

    Example::

        print(generate_health_summary(data))
    """
    health = compute_project_health(data, today)

    lines: list[str] = [
        f"{'=' * 60}",
        f"  PROJECT HEALTH REPORT: {health.project_name}",
        f"{'=' * 60}",
        f"",
        f"  Overall Grade:  {health.health_grade} {health.status_emoji}",
        f"",
        f"  ── Readiness ──────────────────────────────────────",
        f"  Score: {health.readiness.score}/100 ({health.readiness.risk_level} risk)",
    ]

    for comp in health.readiness.components:
        status = "✓" if comp.score == 100 else "✗"
        lines.append(
            f"    {status} {comp.name}: {comp.score:.0f}% "
            f"({comp.passing_items}/{comp.total_items})"
        )
        if comp.failing_items:
            for item in comp.failing_items[:5]:  # cap at 5 for readability
                lines.append(f"        ↳ {item}")
            if len(comp.failing_items) > 5:
                lines.append(f"        ↳ ... and {len(comp.failing_items) - 5} more")

    lines.extend([
        f"",
        f"  ── Risk ───────────────────────────────────────────",
        f"  Level: {health.risk.level} (score {health.risk.score}/100)",
        f"  Factors: {health.risk.total_factors} total — "
        f"{health.risk.critical_count} critical, "
        f"{health.risk.high_count} high, "
        f"{health.risk.medium_count} medium",
    ])

    for factor in health.risk.factors[:5]:
        lines.append(f"    [{factor.severity.upper()}] {factor.description}")
    if health.risk.total_factors > 5:
        lines.append(f"    ... and {health.risk.total_factors - 5} more")

    lines.extend([
        f"",
        f"  ── Compliance ─────────────────────────────────────",
        f"  Score: {health.compliance.score}/100",
        f"  Certificates: {health.compliance.valid} valid, "
        f"{health.compliance.expiring} expiring, "
        f"{health.compliance.expired} expired",
        f"  Materials without certificates: {health.compliance.materials_without_certs}",
        f"  Gaps: {len(health.compliance.gaps)}",
    ])

    for gap in health.compliance.gaps[:5]:
        lines.append(f"    [{gap.severity.upper()}] {gap.description}")
    if len(health.compliance.gaps) > 5:
        lines.append(f"    ... and {len(health.compliance.gaps) - 5} more")

    lines.extend([
        f"",
        f"  ── Suppliers ──────────────────────────────────────",
        f"  Total: {health.suppliers.total_suppliers}",
        f"  High-risk: {health.suppliers.high_risk_count}",
    ])

    for prof in health.suppliers.profiles[:5]:
        risk_icon = "🔴" if prof.risk_level == "High" else ("🟡" if prof.risk_level == "Medium" else "🟢")
        lines.append(
            f"    {risk_icon} {prof.name}: {prof.reliability_percent:.0f}% reliable "
            f"({prof.on_time_deliveries}/{prof.total_deliveries} on-time)"
        )

    lines.extend([
        f"",
        f"{'=' * 60}",
    ])

    return "\n".join(lines)
