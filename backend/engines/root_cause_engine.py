"""
ConstructAsk V3 — Root Cause Engine
=====================================

Builds cause-effect-impact chains explaining WHY project readiness is reduced.
Traces 5 chain types through the system and quantifies each chain's impact
on readiness using simulation.

Example::

    >>> data = get_project_data(project_id=1)
    >>> analysis = trace_root_causes(data)
    >>> print(analysis.summary)
    'Readiness is 72%. 3 root causes identified contributing to a 28% deficit.'
    >>> for chain in analysis.chains:
    ...     print(f"[P{chain.priority}] {chain.cause} → {chain.effect}")
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from intelligence import (
    certificate_status,
    days_until_expiry,
    approval_overdue_days,
    delivery_delay_days,
    delivery_status,
)

# ---------------------------------------------------------------------------
# Graceful import of readiness_engine (being built in parallel)
# ---------------------------------------------------------------------------
try:
    from engines.readiness_engine import (
        compute_readiness_score,
        simulate_readiness_if_fixed,
        ReadinessResult,
        SimulationResult,
    )
    _HAS_READINESS_ENGINE = True
except ImportError:
    _HAS_READINESS_ENGINE = False


# ═══════════════════════════════════════════════════════════════════════════════
# DATACLASSES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class CauseChain:
    """A single cause-effect-impact chain linking a root issue to readiness loss.

    Attributes:
        priority: Ranking (1 = highest impact).
        source_type: Category — 'certificate', 'approval', 'delivery',
                     'material', or 'passport'.
        source_name: Human-readable name of the problematic entity.
        cause: What went wrong, with temporal context.
        effect: Consequence on related entities.
        impact_description: Plain-English readiness impact.
        impact_percent: Numeric readiness reduction (percentage points).
        related_material: Material affected, if applicable.
        recommended_action: What to do to fix it.
        expected_improvement: Projected readiness gain if fixed.
    """

    priority: int
    source_type: str
    source_name: str
    cause: str
    effect: str
    impact_description: str
    impact_percent: int
    related_material: str | None
    recommended_action: str
    expected_improvement: str


@dataclass
class RootCauseAnalysis:
    """Full root-cause analysis result for a project.

    Attributes:
        current_readiness: Overall readiness score at analysis time.
        chains: Ordered list of cause-effect chains (highest impact first).
        total_impact: Sum of all impact_percent values.
        summary: Human-readable summary of the analysis.
    """

    current_readiness: int
    chains: list[CauseChain]
    total_impact: int
    summary: str


# ═══════════════════════════════════════════════════════════════════════════════
# FALLBACK HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _fallback_readiness(data: dict, today: date | None = None) -> int:
    """Compute a basic readiness score when readiness_engine is unavailable.

    Averages four component percentages: material verification, certificate
    validity, approval completion, and on-time delivery.
    """
    today = today or date.today()
    materials = data["materials"]
    certificates = data["certificates"]
    approvals = data["approvals"]
    deliveries = data["deliveries"]

    if not materials:
        return 0

    def _pct(num: int, den: int) -> int:
        return round(num * 100 / den) if den else 100

    verified = sum(1 for m in materials if m.status == "verified")
    valid_certs = sum(
        1 for c in certificates if certificate_status(c, today) == "valid"
    )
    approved = sum(1 for a in approvals if a.status.lower() == "approved")
    on_time = sum(1 for d in deliveries if delivery_delay_days(d, today) == 0)

    components: list[int] = [_pct(verified, len(materials))]
    if certificates:
        components.append(_pct(valid_certs, len(certificates)))
    if approvals:
        components.append(_pct(approved, len(approvals)))
    if deliveries:
        components.append(_pct(on_time, len(deliveries)))

    return round(sum(components) / len(components)) if components else 0


def _fallback_simulate(
    data: dict,
    fix_type: str,
    fix_id: int,
    today: date | None = None,
) -> int:
    """Estimate readiness improvement when readiness_engine is unavailable.

    Uses a proportional estimate: each item represents
    ``100 / total_items_in_component`` percentage points of that component,
    divided by the number of active components.
    """
    component_counts = {
        "certificate": len(data["certificates"]),
        "approval": len(data["approvals"]),
        "delivery": len(data["deliveries"]),
        "material": len(data["materials"]),
        "passport": len(data["materials"]),  # passports map 1:1 to materials
    }
    total_in_component = component_counts.get(fix_type, 1) or 1

    # Count how many components are active (non-empty)
    active_components = sum(
        1
        for key in ("materials", "certificates", "approvals", "deliveries")
        if data.get(key)
    )
    active_components = max(active_components, 1)

    return round(100 / total_in_component / active_components)


def _get_readiness(data: dict, today: date | None = None) -> int:
    """Return the current readiness score, using the engine or fallback."""
    if _HAS_READINESS_ENGINE:
        result = compute_readiness_score(data, today=today)
        return result.score
    return _fallback_readiness(data, today)


def _simulate_fix(
    data: dict,
    fix_type: str,
    fix_id: int,
    today: date | None = None,
) -> tuple[int, int]:
    """Simulate fixing an issue. Returns (new_readiness, gain).

    Uses the readiness engine when available, falls back to estimation.
    """
    current = _get_readiness(data, today)
    if _HAS_READINESS_ENGINE:
        sim = simulate_readiness_if_fixed(
            data, fix_type=fix_type, fix_id=fix_id, today=today
        )
        return sim.projected_score, max(0, sim.projected_score - current)

    gain = _fallback_simulate(data, fix_type, fix_id, today)
    projected = min(100, current + gain)
    return projected, gain


# ═══════════════════════════════════════════════════════════════════════════════
# CHAIN BUILDERS
# ═══════════════════════════════════════════════════════════════════════════════


def _build_certificate_chains(
    data: dict, current_readiness: int, today: date
) -> list[CauseChain]:
    """Chain type 1: Expired certificate → material blocked → readiness ↓."""
    chains: list[CauseChain] = []
    for cert in data["certificates"]:
        if certificate_status(cert, today) != "expired":
            continue

        expired_days = abs(days_until_expiry(cert, today))
        material_name = (
            cert.material.name if getattr(cert, "material", None) else "Unknown material"
        )
        projected, gain = _simulate_fix(data, "certificate", cert.id, today)

        chains.append(
            CauseChain(
                priority=0,  # will be assigned after sorting
                source_type="certificate",
                source_name=cert.certificate_name,
                cause=f"{cert.certificate_name} expired {expired_days} day(s) ago",
                effect=f"{material_name} blocked from release",
                impact_description=f"Readiness reduced by {gain}%",
                impact_percent=gain,
                related_material=material_name,
                recommended_action=(
                    f"Renew {cert.certificate_name} with {cert.issuing_body}"
                ),
                expected_improvement=(
                    f"Readiness improves from {current_readiness}% to {projected}%"
                ),
            )
        )
    return chains


def _build_approval_chains(
    data: dict, current_readiness: int, today: date
) -> list[CauseChain]:
    """Chain type 2: Overdue approval → material waiting → schedule risk."""
    chains: list[CauseChain] = []
    for approval in data["approvals"]:
        overdue = approval_overdue_days(approval, today)
        if overdue <= 0:
            continue

        material_name = (
            approval.material.name
            if getattr(approval, "material", None)
            else "Unknown material"
        )
        approver_name = (
            approval.user.name
            if getattr(approval, "user", None)
            else f"Approver #{approval.approver_id}"
        )
        projected, gain = _simulate_fix(data, "approval", approval.id, today)

        chains.append(
            CauseChain(
                priority=0,
                source_type="approval",
                source_name=approval.approval_type,
                cause=(
                    f"{approval.approval_type} overdue by {overdue} day(s) "
                    f"(assigned to {approver_name})"
                ),
                effect=(
                    f"{material_name} waiting for approval — "
                    f"installation delayed"
                ),
                impact_description=f"Readiness reduced by {gain}%",
                impact_percent=gain,
                related_material=material_name,
                recommended_action=(
                    f"Escalate {approval.approval_type} to {approver_name} "
                    f"for immediate action"
                ),
                expected_improvement=(
                    f"Readiness improves from {current_readiness}% to {projected}%"
                ),
            )
        )
    return chains


def _build_delivery_chains(
    data: dict, current_readiness: int, today: date
) -> list[CauseChain]:
    """Chain type 3: Delayed delivery → material not on site → timeline risk."""
    chains: list[CauseChain] = []
    for dlv in data["deliveries"]:
        delay = delivery_delay_days(dlv, today)
        if delay <= 0:
            continue

        projected, gain = _simulate_fix(data, "delivery", dlv.id, today)

        chains.append(
            CauseChain(
                priority=0,
                source_type="delivery",
                source_name=dlv.material_name,
                cause=(
                    f"{dlv.material_name} delivery from {dlv.supplier} "
                    f"delayed by {delay} day(s)"
                ),
                effect=(
                    f"{dlv.material_name} not on site — "
                    f"work sequence disrupted"
                ),
                impact_description=f"Readiness reduced by {gain}%",
                impact_percent=gain,
                related_material=dlv.material_name,
                recommended_action=(
                    f"Contact {dlv.supplier} for revised delivery date "
                    f"for {dlv.material_name}"
                ),
                expected_improvement=(
                    f"Readiness improves from {current_readiness}% to {projected}%"
                ),
            )
        )
    return chains


def _build_material_chains(
    data: dict, current_readiness: int, today: date
) -> list[CauseChain]:
    """Chain type 4: Failed verification → can't use → needs replacement."""
    chains: list[CauseChain] = []
    for mat in data["materials"]:
        if mat.status != "failed":
            continue

        projected, gain = _simulate_fix(data, "material", mat.id, today)

        chains.append(
            CauseChain(
                priority=0,
                source_type="material",
                source_name=mat.name,
                cause=f"{mat.name} (batch {mat.batch_number}) failed verification",
                effect=(
                    f"{mat.name} cannot be used on site — "
                    f"needs replacement or re-testing"
                ),
                impact_description=f"Readiness reduced by {gain}%",
                impact_percent=gain,
                related_material=mat.name,
                recommended_action=(
                    f"Re-test or replace {mat.name} "
                    f"(batch {mat.batch_number}) from {mat.supplier}"
                ),
                expected_improvement=(
                    f"Readiness improves from {current_readiness}% to {projected}%"
                ),
            )
        )
    return chains


def _build_passport_chains(
    data: dict, current_readiness: int, today: date
) -> list[CauseChain]:
    """Chain type 5: Missing passport → compliance gap → audit/regulatory risk."""
    chains: list[CauseChain] = []
    materials = data["materials"]
    passports = data.get("passports", [])

    # Build set of material IDs that have passports
    passport_material_ids = {p.material_id for p in passports}

    for mat in materials:
        if mat.id in passport_material_ids:
            continue

        projected, gain = _simulate_fix(data, "passport", mat.id, today)

        chains.append(
            CauseChain(
                priority=0,
                source_type="passport",
                source_name=f"{mat.name} Product Passport",
                cause=f"{mat.name} has no product passport registered",
                effect=(
                    f"Compliance gap for {mat.name} — "
                    f"audit risk and regulatory exposure"
                ),
                impact_description=f"Readiness reduced by {gain}%",
                impact_percent=gain,
                related_material=mat.name,
                recommended_action=(
                    f"Create product passport for {mat.name} "
                    f"(batch {mat.batch_number})"
                ),
                expected_improvement=(
                    f"Readiness improves from {current_readiness}% to {projected}%"
                ),
            )
        )
    return chains


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════════


def trace_root_causes(
    data: dict,
    today: date | None = None,
) -> RootCauseAnalysis:
    """Build a full root-cause analysis with cause-effect-impact chains.

    Traces five chain types across certificates, approvals, deliveries,
    materials, and passports.  Each chain is annotated with its readiness
    impact (computed via simulation) and sorted by impact descending.

    Args:
        data: Project data dict from ``get_project_data(project_id)``.
        today: Override for the current date (for testing).

    Returns:
        A ``RootCauseAnalysis`` with ordered chains and summary.

    Example::

        >>> analysis = trace_root_causes(data)
        >>> print(analysis.chains[0].cause)
        'ASTM Certificate expired 3 days ago'
    """
    today = today or date.today()
    current_readiness = _get_readiness(data, today)

    # Collect all chains ─────────────────────────────────────────────────────
    all_chains: list[CauseChain] = []
    all_chains.extend(_build_certificate_chains(data, current_readiness, today))
    all_chains.extend(_build_approval_chains(data, current_readiness, today))
    all_chains.extend(_build_delivery_chains(data, current_readiness, today))
    all_chains.extend(_build_material_chains(data, current_readiness, today))
    all_chains.extend(_build_passport_chains(data, current_readiness, today))

    # Sort by impact descending (highest impact = highest priority) ──────────
    all_chains.sort(key=lambda c: c.impact_percent, reverse=True)

    # Assign priority numbers after sorting ──────────────────────────────────
    for idx, chain in enumerate(all_chains, start=1):
        chain.priority = idx

    total_impact = sum(c.impact_percent for c in all_chains)

    # Build summary ──────────────────────────────────────────────────────────
    chain_count = len(all_chains)
    if chain_count == 0:
        summary = (
            f"Readiness is {current_readiness}%. "
            f"No root causes identified — project is on track."
        )
    else:
        deficit = max(0, 100 - current_readiness)
        cause_word = "cause" if chain_count == 1 else "causes"
        summary = (
            f"Readiness is {current_readiness}%. "
            f"{chain_count} root {cause_word} identified "
            f"contributing to a {deficit}% deficit."
        )

    return RootCauseAnalysis(
        current_readiness=current_readiness,
        chains=all_chains,
        total_impact=total_impact,
        summary=summary,
    )
