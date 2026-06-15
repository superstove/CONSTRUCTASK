"""
Construct Ask V3 — Readiness Engine

Computes a weighted readiness score for a project based on four components:
materials verification, certificate validity, approval status, and delivery
timeliness. Also supports per-item breakdowns and "what-if" simulation.

Example::

    data = get_project_data(project_id)
    result = compute_readiness_score(data)
    print(result.score, result.risk_level)
    # 72 Medium

    breakdown = compute_readiness_breakdown(data)
    for c in breakdown.components:
        print(c.name, c.failing_items)

    sim = simulate_readiness_if_fixed(data, 'certificate', cert_id)
    print(f"Fixing that cert would improve score from {sim.current_score} to {sim.projected_score}")
"""

from __future__ import annotations

import copy
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
class ReadinessComponent:
    """A single scored component of the readiness calculation.

    Attributes:
        name: One of 'materials', 'certificates', 'approvals', 'deliveries'.
        score: Percentage score 0–100 for this component.
        weight: The weight used in the overall calculation (e.g. 0.30).
        weighted_score: ``score * weight``.
        total_items: Total number of items evaluated.
        passing_items: Number of items that passed.
        failing_items: Human-readable names of items dragging the score down.
        explanation: How this component score was derived.
    """

    name: str
    score: float
    weight: float
    weighted_score: float
    total_items: int
    passing_items: int
    failing_items: list[str] = field(default_factory=list)
    explanation: str = ""


@dataclass
class ReadinessResult:
    """Overall readiness result returned by :func:`compute_readiness_score`.

    Attributes:
        score: Rounded integer 0–100.
        risk_level: 'Low' (≥80), 'Medium' (≥50), or 'High' (<50).
        components: Per-component breakdowns.
        explanation: Human-readable summary of how the score was calculated.
    """

    score: int
    risk_level: str
    components: list[ReadinessComponent] = field(default_factory=list)
    explanation: str = ""


@dataclass
class ReadinessBreakdown:
    """Extended breakdown with per-item detail lists.

    Attributes:
        result: The overall :class:`ReadinessResult`.
        components: Identical to ``result.components`` for convenience.
        failing_materials: Names of materials not verified.
        expired_certificates: Names of expired or expiring certificates.
        overdue_approvals: Descriptions of overdue approvals.
        delayed_deliveries: Descriptions of delayed deliveries.
    """

    result: ReadinessResult
    components: list[ReadinessComponent] = field(default_factory=list)
    failing_materials: list[str] = field(default_factory=list)
    expired_certificates: list[str] = field(default_factory=list)
    overdue_approvals: list[str] = field(default_factory=list)
    delayed_deliveries: list[str] = field(default_factory=list)


@dataclass
class SimulationResult:
    """Result of a "what-if" readiness simulation.

    Attributes:
        current_score: Score before the fix.
        projected_score: Score after the simulated fix.
        improvement: ``projected_score - current_score``.
        description: Human-readable explanation of the simulation.
    """

    current_score: int
    projected_score: int
    improvement: int
    description: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _risk_level_from_score(score: int) -> str:
    """Map a readiness score to a risk level string."""
    if score >= 80:
        return "Low"
    if score >= 50:
        return "Medium"
    return "High"


def _compute_materials_component(
    materials: list[Any],
    weight: float,
) -> ReadinessComponent:
    """Score materials by percentage with status == 'verified'."""
    total = len(materials)
    if total == 0:
        return ReadinessComponent(
            name="materials",
            score=100.0,
            weight=weight,
            weighted_score=100.0 * weight,
            total_items=0,
            passing_items=0,
            failing_items=[],
            explanation="No materials to evaluate — component scores 100% by default.",
        )

    passing = [m for m in materials if m.status and m.status.lower() == "verified"]
    failing = [m for m in materials if not m.status or m.status.lower() != "verified"]
    score = (len(passing) / total) * 100

    return ReadinessComponent(
        name="materials",
        score=round(score, 2),
        weight=weight,
        weighted_score=round(score * weight, 2),
        total_items=total,
        passing_items=len(passing),
        failing_items=[m.name for m in failing],
        explanation=(
            f"{len(passing)}/{total} materials verified "
            f"({score:.1f}%). "
            f"Non-verified: {', '.join(m.name for m in failing) or 'none'}."
        ),
    )


def _compute_certificates_component(
    certificates: list[Any],
    weight: float,
    today: date | None = None,
) -> ReadinessComponent:
    """Score certificates by percentage that are 'valid'."""
    total = len(certificates)
    if total == 0:
        return ReadinessComponent(
            name="certificates",
            score=100.0,
            weight=weight,
            weighted_score=100.0 * weight,
            total_items=0,
            passing_items=0,
            failing_items=[],
            explanation="No certificates to evaluate — component scores 100% by default.",
        )

    passing = [c for c in certificates if certificate_status(c, today) == "valid"]
    failing = [c for c in certificates if certificate_status(c, today) != "valid"]
    score = (len(passing) / total) * 100

    return ReadinessComponent(
        name="certificates",
        score=round(score, 2),
        weight=weight,
        weighted_score=round(score * weight, 2),
        total_items=total,
        passing_items=len(passing),
        failing_items=[c.certificate_name for c in failing],
        explanation=(
            f"{len(passing)}/{total} certificates valid "
            f"({score:.1f}%). "
            f"Invalid: {', '.join(c.certificate_name for c in failing) or 'none'}."
        ),
    )


def _compute_approvals_component(
    approvals: list[Any],
    weight: float,
) -> ReadinessComponent:
    """Score approvals by percentage with status == 'approved'."""
    total = len(approvals)
    if total == 0:
        return ReadinessComponent(
            name="approvals",
            score=100.0,
            weight=weight,
            weighted_score=100.0 * weight,
            total_items=0,
            passing_items=0,
            failing_items=[],
            explanation="No approvals to evaluate — component scores 100% by default.",
        )

    passing = [a for a in approvals if a.status and a.status.lower() == "approved"]
    failing = [a for a in approvals if not a.status or a.status.lower() != "approved"]
    score = (len(passing) / total) * 100

    failing_names: list[str] = []
    for a in failing:
        mat_name = a.material.name if hasattr(a, "material") and a.material else f"material_id={a.material_id}"
        failing_names.append(f"{a.approval_type} for {mat_name}")

    return ReadinessComponent(
        name="approvals",
        score=round(score, 2),
        weight=weight,
        weighted_score=round(score * weight, 2),
        total_items=total,
        passing_items=len(passing),
        failing_items=failing_names,
        explanation=(
            f"{len(passing)}/{total} approvals approved "
            f"({score:.1f}%). "
            f"Not approved: {', '.join(failing_names) or 'none'}."
        ),
    )


def _compute_deliveries_component(
    deliveries: list[Any],
    weight: float,
    today: date | None = None,
) -> ReadinessComponent:
    """Score deliveries by percentage that are on-time (delay_days == 0)."""
    total = len(deliveries)
    if total == 0:
        return ReadinessComponent(
            name="deliveries",
            score=100.0,
            weight=weight,
            weighted_score=100.0 * weight,
            total_items=0,
            passing_items=0,
            failing_items=[],
            explanation="No deliveries to evaluate — component scores 100% by default.",
        )

    passing = [d for d in deliveries if delivery_delay_days(d, today) == 0]
    failing = [d for d in deliveries if delivery_delay_days(d, today) > 0]
    score = (len(passing) / total) * 100

    failing_names = [
        f"{d.material_name} ({delivery_delay_days(d, today)}d late)"
        for d in failing
    ]

    return ReadinessComponent(
        name="deliveries",
        score=round(score, 2),
        weight=weight,
        weighted_score=round(score * weight, 2),
        total_items=total,
        passing_items=len(passing),
        failing_items=failing_names,
        explanation=(
            f"{len(passing)}/{total} deliveries on-time "
            f"({score:.1f}%). "
            f"Delayed: {', '.join(failing_names) or 'none'}."
        ),
    )


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

_WEIGHTS = {
    "materials": 0.30,
    "certificates": 0.30,
    "approvals": 0.20,
    "deliveries": 0.20,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_readiness_score(data: dict[str, Any], today: date | None = None) -> ReadinessResult:
    """Compute weighted readiness score for a project.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date (for testing).

    Returns:
        A :class:`ReadinessResult` with the overall score, risk level,
        per-component breakdowns, and a human-readable explanation.

    Example::

        result = compute_readiness_score(data)
        print(result.score)  # 72
        print(result.risk_level)  # 'Medium'
    """
    materials = data.get("materials", [])
    certificates = data.get("certificates", [])
    approvals = data.get("approvals", [])
    deliveries = data.get("deliveries", [])

    components = [
        _compute_materials_component(materials, _WEIGHTS["materials"]),
        _compute_certificates_component(certificates, _WEIGHTS["certificates"], today),
        _compute_approvals_component(approvals, _WEIGHTS["approvals"]),
        _compute_deliveries_component(deliveries, _WEIGHTS["deliveries"], today),
    ]

    # Empty project (no materials/certs/approvals/deliveries): nothing to assess —
    # report 0, not a misleading 100%, so it's consistent with the readiness endpoint.
    if not any(c.total_items for c in components):
        return ReadinessResult(
            score=0,
            risk_level="Unknown",
            components=components,
            explanation="No materials, certificates, approvals, or deliveries recorded yet.",
        )

    total_score = sum(c.weighted_score for c in components)
    rounded_score = round(total_score)
    risk_level = _risk_level_from_score(rounded_score)

    parts = [f"{c.name}: {c.score:.0f}%×{c.weight}" for c in components]
    explanation = (
        f"Readiness score {rounded_score}/100 ({risk_level} risk). "
        f"Weighted components: {', '.join(parts)}."
    )

    return ReadinessResult(
        score=rounded_score,
        risk_level=risk_level,
        components=components,
        explanation=explanation,
    )


def compute_readiness_breakdown(data: dict[str, Any], today: date | None = None) -> ReadinessBreakdown:
    """Same as :func:`compute_readiness_score` but with per-item detail lists.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A :class:`ReadinessBreakdown` containing the full result plus lists
        of failing materials, expired certificates, overdue approvals, and
        delayed deliveries.

    Example::

        bd = compute_readiness_breakdown(data)
        for name in bd.failing_materials:
            print(f"  Material dragging score: {name}")
    """
    result = compute_readiness_score(data, today)

    materials = data.get("materials", [])
    certificates = data.get("certificates", [])
    approvals = data.get("approvals", [])
    deliveries = data.get("deliveries", [])

    failing_materials = [
        m.name for m in materials
        if not m.status or m.status.lower() != "verified"
    ]

    expired_certificates = [
        f"{c.certificate_name} ({certificate_status(c, today)})"
        for c in certificates
        if certificate_status(c, today) != "valid"
    ]

    overdue_approvals: list[str] = []
    for a in approvals:
        overdue = approval_overdue_days(a, today)
        if overdue > 0:
            mat_name = a.material.name if hasattr(a, "material") and a.material else f"material_id={a.material_id}"
            overdue_approvals.append(f"{a.approval_type} for {mat_name} ({overdue}d overdue)")

    delayed_deliveries = [
        f"{d.material_name} ({delivery_delay_days(d, today)}d late)"
        for d in deliveries
        if delivery_delay_days(d, today) > 0
    ]

    return ReadinessBreakdown(
        result=result,
        components=result.components,
        failing_materials=failing_materials,
        expired_certificates=expired_certificates,
        overdue_approvals=overdue_approvals,
        delayed_deliveries=delayed_deliveries,
    )


def simulate_readiness_if_fixed(
    data: dict[str, Any],
    fix_type: str,
    fix_id: int,
    today: date | None = None,
) -> SimulationResult:
    """Simulate the readiness score if a specific issue were resolved.

    Creates a shallow copy of the data, applies the fix, and recomputes
    the readiness score to show the projected improvement.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        fix_type: One of ``'certificate'``, ``'approval'``, ``'delivery'``,
            ``'material'``.
        fix_id: The ``id`` of the item to simulate fixing.
        today: Optional override for the current date.

    Returns:
        A :class:`SimulationResult` with current / projected scores and
        the improvement delta.

    Example::

        sim = simulate_readiness_if_fixed(data, 'certificate', 5)
        print(sim.improvement)  # 8
    """
    current = compute_readiness_score(data, today)

    # Deep-copy the relevant list so the original data is untouched
    simulated_data = dict(data)

    entity_name = f"id={fix_id}"

    if fix_type == "material":
        simulated_list = copy.copy(data.get("materials", []))
        for i, m in enumerate(simulated_list):
            if m.id == fix_id:
                entity_name = m.name
                clone = copy.copy(m)
                clone.status = "verified"
                simulated_list[i] = clone
                break
        simulated_data["materials"] = simulated_list

    elif fix_type == "certificate":
        simulated_list = copy.copy(data.get("certificates", []))
        for i, c in enumerate(simulated_list):
            if c.id == fix_id:
                entity_name = c.certificate_name
                clone = copy.copy(c)
                # Push expiry 365 days into the future to guarantee 'valid'
                effective_today = today or date.today()
                from datetime import timedelta
                clone.expiry_date = effective_today + timedelta(days=365)
                simulated_list[i] = clone
                break
        simulated_data["certificates"] = simulated_list

    elif fix_type == "approval":
        simulated_list = copy.copy(data.get("approvals", []))
        for i, a in enumerate(simulated_list):
            if a.id == fix_id:
                mat_name = a.material.name if hasattr(a, "material") and a.material else f"material_id={a.material_id}"
                entity_name = f"{a.approval_type} for {mat_name}"
                clone = copy.copy(a)
                clone.status = "approved"
                effective_today = today or date.today()
                clone.approved_date = effective_today
                clone.overdue_days = 0
                simulated_list[i] = clone
                break
        simulated_data["approvals"] = simulated_list

    elif fix_type == "delivery":
        simulated_list = copy.copy(data.get("deliveries", []))
        for i, d in enumerate(simulated_list):
            if d.id == fix_id:
                entity_name = d.material_name
                clone = copy.copy(d)
                clone.actual_date = clone.expected_date
                clone.delay_days = 0
                clone.status = "delivered"
                simulated_list[i] = clone
                break
        simulated_data["deliveries"] = simulated_list

    else:
        return SimulationResult(
            current_score=current.score,
            projected_score=current.score,
            improvement=0,
            description=f"Unknown fix_type '{fix_type}'. No simulation performed.",
        )

    projected = compute_readiness_score(simulated_data, today)
    improvement = projected.score - current.score

    return SimulationResult(
        current_score=current.score,
        projected_score=projected.score,
        improvement=improvement,
        description=(
            f"Fixing {fix_type} '{entity_name}' would change readiness "
            f"from {current.score} → {projected.score} (+{improvement} points)."
        ),
    )
