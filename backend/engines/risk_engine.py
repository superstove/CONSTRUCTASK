"""
Construct Ask V3 — Risk Engine

Identifies, categorises, and scores every risk factor across certificates,
approvals, deliveries, and materials for a project.

Example::

    data = get_project_data(project_id)
    assessment = compute_risk_assessment(data)
    print(assessment.level, assessment.score)
    # 'High' 68

    for f in compute_risk_factors(data):
        print(f.severity, f.description)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from intelligence import (
    certificate_status,
    days_until_expiry,
    approval_overdue_days,
    delivery_delay_days,
    delivery_status,
    computed_project_risk,
)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RiskFactor:
    """A single identified risk within the project.

    Attributes:
        category: One of 'certificate', 'approval', 'delivery', 'material'.
        severity: 'critical', 'high', 'medium', or 'low'.
        entity_name: Human-readable name of the affected entity.
        description: What the risk is.
        impact: What this risk affects.
        days_overdue: Days overdue/delayed (None when not applicable).
        related_material: Name of the related material, if any.
    """

    category: str
    severity: str
    entity_name: str
    description: str
    impact: str
    days_overdue: int | None = None
    related_material: str | None = None


@dataclass
class RiskAssessment:
    """Comprehensive risk assessment for a project.

    Attributes:
        level: Overall risk level from ``computed_project_risk()``.
        score: Numeric risk score 0–100 (100 = maximum risk).
        total_factors: Number of identified risk factors.
        critical_count: Factors with severity 'critical'.
        high_count: Factors with severity 'high'.
        medium_count: Factors with severity 'medium'.
        factors: The individual :class:`RiskFactor` instances.
        explanation: Human-readable summary.
    """

    level: str
    score: int
    total_factors: int
    critical_count: int
    high_count: int
    medium_count: int
    factors: list[RiskFactor] = field(default_factory=list)
    explanation: str = ""


# ---------------------------------------------------------------------------
# Severity helpers
# ---------------------------------------------------------------------------

_SEVERITY_WEIGHTS = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
}


def _delivery_severity(delay: int) -> str:
    """Map delivery delay days to a severity level."""
    if delay >= 14:
        return "critical"
    if delay >= 7:
        return "high"
    if delay >= 1:
        return "medium"
    return "low"


def _approval_severity(overdue: int) -> str:
    """Map approval overdue days to a severity level."""
    if overdue > 10:
        return "high"
    if overdue > 0:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_risk_factors(data: dict[str, Any], today: date | None = None) -> list[RiskFactor]:
    """Identify every individual risk factor in the project data.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        List of :class:`RiskFactor` instances sorted by severity
        (critical first).

    Example::

        factors = compute_risk_factors(data)
        critical = [f for f in factors if f.severity == 'critical']
    """
    factors: list[RiskFactor] = []

    # --- Certificate risks ---
    for cert in data.get("certificates", []):
        status = certificate_status(cert, today)
        remaining = days_until_expiry(cert, today)
        mat_name = cert.material.name if hasattr(cert, "material") and cert.material else None

        if status == "expired":
            factors.append(RiskFactor(
                category="certificate",
                severity="critical",
                entity_name=cert.certificate_name,
                description=(
                    f"Certificate '{cert.certificate_name}' expired "
                    f"{abs(remaining)} days ago."
                ),
                impact="Material cannot be used on-site without valid certification.",
                days_overdue=abs(remaining),
                related_material=mat_name,
            ))
        elif status == "expiring":
            factors.append(RiskFactor(
                category="certificate",
                severity="medium",
                entity_name=cert.certificate_name,
                description=(
                    f"Certificate '{cert.certificate_name}' expires "
                    f"in {remaining} days."
                ),
                impact="Upcoming expiry may block material usage if not renewed.",
                days_overdue=None,
                related_material=mat_name,
            ))

    # --- Approval risks ---
    for approval in data.get("approvals", []):
        overdue = approval_overdue_days(approval, today)
        if overdue > 0:
            mat_name = (
                approval.material.name
                if hasattr(approval, "material") and approval.material
                else f"material_id={approval.material_id}"
            )
            factors.append(RiskFactor(
                category="approval",
                severity=_approval_severity(overdue),
                entity_name=f"{approval.approval_type} for {mat_name}",
                description=(
                    f"Approval '{approval.approval_type}' for {mat_name} "
                    f"is {overdue} days overdue."
                ),
                impact="Pending approval blocks material from proceeding through the pipeline.",
                days_overdue=overdue,
                related_material=mat_name,
            ))

    # --- Delivery risks ---
    for dlv in data.get("deliveries", []):
        delay = delivery_delay_days(dlv, today)
        if delay > 0:
            factors.append(RiskFactor(
                category="delivery",
                severity=_delivery_severity(delay),
                entity_name=dlv.material_name,
                description=(
                    f"Delivery of '{dlv.material_name}' from {dlv.supplier} "
                    f"is {delay} days late."
                ),
                impact="Delayed delivery may stall project schedule and dependent work.",
                days_overdue=delay,
                related_material=dlv.material_name,
            ))

    # --- Material risks ---
    for mat in data.get("materials", []):
        if mat.status and mat.status.lower() == "failed":
            factors.append(RiskFactor(
                category="material",
                severity="critical",
                entity_name=mat.name,
                description=f"Material '{mat.name}' has failed verification.",
                impact="Failed material cannot be used and requires replacement or re-inspection.",
                days_overdue=None,
                related_material=mat.name,
            ))

    # Sort: critical → high → medium → low
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    factors.sort(key=lambda f: severity_order.get(f.severity, 99))

    return factors


def compute_risk_assessment(data: dict[str, Any], today: date | None = None) -> RiskAssessment:
    """Produce a comprehensive risk assessment for the project.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A :class:`RiskAssessment` with level, numeric score, factor counts,
        and the full factor list.

    Example::

        assessment = compute_risk_assessment(data)
        if assessment.level == 'High':
            alert(assessment.explanation)
    """
    factors = compute_risk_factors(data, today)

    level = computed_project_risk(
        data.get("materials", []),
        data.get("approvals", []),
        data.get("certificates", []),
        data.get("deliveries", []),
        today,
    )

    critical = sum(1 for f in factors if f.severity == "critical")
    high = sum(1 for f in factors if f.severity == "high")
    medium = sum(1 for f in factors if f.severity == "medium")

    # Risk score: sum of severity-weighted factor points, capped at 100
    raw_score = sum(_SEVERITY_WEIGHTS.get(f.severity, 0) for f in factors)
    score = min(100, raw_score)

    parts: list[str] = []
    if critical:
        parts.append(f"{critical} critical")
    if high:
        parts.append(f"{high} high")
    if medium:
        parts.append(f"{medium} medium")

    explanation = (
        f"Risk level: {level} (score {score}/100). "
        f"{len(factors)} risk factor(s) identified"
        + (f": {', '.join(parts)}" if parts else "")
        + "."
    )

    return RiskAssessment(
        level=level,
        score=score,
        total_factors=len(factors),
        critical_count=critical,
        high_count=high,
        medium_count=medium,
        factors=factors,
        explanation=explanation,
    )
