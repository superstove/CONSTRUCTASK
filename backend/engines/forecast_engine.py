"""
Construct Ask V3 — Forecast Engine
====================================

Projects the state of a project N days into the future.  Scans for
certificates about to expire, approvals that will become critical, and
deliveries at risk of overdue.  Produces single-horizon and multi-horizon
snapshots showing readiness degradation (or improvement) over time.

Example::

    >>> data = get_project_data(project_id=1)
    >>> result = forecast_project_state(data, days_ahead=7)
    >>> print(result.summary)
    'Project readiness will decline from 72% to 64% over 7 days if no action taken'
    >>> timeline = forecast_timeline(data)
    >>> for snap in timeline:
    ...     print(f"Day {snap.days_ahead}: {snap.projected_readiness}%")
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import date, timedelta

from intelligence import (
    certificate_status,
    days_until_expiry,
    approval_overdue_days,
    delivery_delay_days,
    delivery_status,
    computed_project_risk,
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
class ForecastEvent:
    """A single projected event at a future date.

    Attributes:
        day: How many days from now this event occurs.
        event_type: Category — 'certificate_expires', 'approval_critical',
                    or 'delivery_overdue'.
        entity_name: Human-readable name of the affected entity.
        description: What will happen.
        impact: Consequence on the project.
    """

    day: int
    event_type: str
    entity_name: str
    description: str
    impact: str


@dataclass
class ForecastSnapshot:
    """State projection at a specific future milestone.

    Attributes:
        days_ahead: Number of days into the future.
        projected_readiness: Estimated readiness score at that date.
        projected_risk_level: Risk classification (High / Medium / Low).
        new_issues: Events that will occur by this date.
        description: Human-readable summary of the snapshot.
    """

    days_ahead: int
    projected_readiness: int
    projected_risk_level: str
    new_issues: list[ForecastEvent]
    description: str


@dataclass
class ForecastResult:
    """Complete forecast result with snapshots and trend analysis.

    Attributes:
        current_readiness: Readiness score right now.
        current_risk: Current risk classification.
        snapshots: One or more future-state snapshots.
        worst_case_readiness: Readiness at the furthest horizon.
        trend: Overall direction — 'declining', 'stable', or 'improving'.
        summary: Human-readable forecast summary.
    """

    current_readiness: int
    current_risk: str
    snapshots: list[ForecastSnapshot]
    worst_case_readiness: int
    trend: str
    summary: str


# ═══════════════════════════════════════════════════════════════════════════════
# READINESS HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _fallback_readiness(data: dict, today: date | None = None) -> int:
    """Compute readiness when readiness_engine is unavailable."""
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


def _get_readiness(data: dict, today: date | None = None) -> int:
    """Return current readiness via engine or fallback."""
    if _HAS_READINESS_ENGINE:
        result = compute_readiness_score(data, today=today)
        return result.score
    return _fallback_readiness(data, today)


def _get_risk_level(data: dict, today: date | None = None) -> str:
    """Return the current computed risk level."""
    today = today or date.today()
    return computed_project_risk(
        data["materials"],
        data["approvals"],
        data["certificates"],
        data["deliveries"],
        today,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EVENT SCANNERS
# ═══════════════════════════════════════════════════════════════════════════════


def _scan_certificate_events(
    data: dict,
    today: date,
    horizon: date,
) -> list[ForecastEvent]:
    """Find certificates that are currently valid/expiring but will expire
    within the horizon window."""
    events: list[ForecastEvent] = []
    for cert in data["certificates"]:
        status_now = certificate_status(cert, today)
        if status_now == "expired":
            continue  # already expired — not a *new* event

        status_at_horizon = certificate_status(cert, horizon)
        if status_at_horizon == "expired":
            days_to_expire = max(0, days_until_expiry(cert, today))
            material_name = (
                cert.material.name
                if getattr(cert, "material", None)
                else "Unknown material"
            )
            events.append(
                ForecastEvent(
                    day=days_to_expire,
                    event_type="certificate_expires",
                    entity_name=cert.certificate_name,
                    description=(
                        f"{cert.certificate_name} will expire in "
                        f"{days_to_expire} day(s)"
                    ),
                    impact=f"Material release blocked for {material_name}",
                )
            )
    return events


def _scan_approval_events(
    data: dict,
    today: date,
    horizon: date,
    critical_threshold: int = 10,
) -> list[ForecastEvent]:
    """Find pending approvals that will cross the critical threshold."""
    events: list[ForecastEvent] = []
    for approval in data["approvals"]:
        if approval.status.lower() != "pending":
            continue

        overdue_now = approval_overdue_days(approval, today)
        overdue_at_horizon = approval_overdue_days(approval, horizon)

        if overdue_now <= critical_threshold < overdue_at_horizon:
            days_to_critical = max(
                1, critical_threshold - overdue_now
            )
            material_name = (
                approval.material.name
                if getattr(approval, "material", None)
                else "Unknown material"
            )
            events.append(
                ForecastEvent(
                    day=days_to_critical,
                    event_type="approval_critical",
                    entity_name=approval.approval_type,
                    description=(
                        f"{approval.approval_type} becomes critically overdue "
                        f"(>{critical_threshold} days) in {days_to_critical} day(s)"
                    ),
                    impact=(
                        f"{material_name} approval will be critically late — "
                        f"escalation required"
                    ),
                )
            )
    return events


def _scan_delivery_events(
    data: dict,
    today: date,
    horizon: date,
) -> list[ForecastEvent]:
    """Find pending deliveries whose expected_date falls before the horizon
    and will therefore become overdue."""
    events: list[ForecastEvent] = []
    for dlv in data["deliveries"]:
        # Already delayed or delivered — not a new future event
        if dlv.actual_date or delivery_delay_days(dlv, today) > 0:
            continue

        # If expected date is before the horizon and delivery is still pending
        if dlv.expected_date <= horizon and dlv.status.lower() in (
            "pending",
            "in_transit",
            "in transit",
            "dispatched",
        ):
            days_to_overdue = max(0, (dlv.expected_date - today).days)
            events.append(
                ForecastEvent(
                    day=days_to_overdue,
                    event_type="delivery_overdue",
                    entity_name=dlv.material_name,
                    description=(
                        f"{dlv.material_name} delivery from {dlv.supplier} "
                        f"at risk of delay (expected {dlv.expected_date})"
                    ),
                    impact=(
                        f"{dlv.material_name} may not arrive on time — "
                        f"work sequence at risk"
                    ),
                )
            )
    return events


# ═══════════════════════════════════════════════════════════════════════════════
# FUTURE READINESS PROJECTION
# ═══════════════════════════════════════════════════════════════════════════════


def _project_readiness_at(
    data: dict, today: date, future_date: date
) -> int:
    """Estimate readiness at a future date by recalculating with the future
    date as 'today'.

    This captures the natural degradation from certificates expiring, approvals
    becoming more overdue, and deliveries slipping further.  Material and
    delivery records are unchanged (conservative: assumes no new actions).
    """
    return _get_readiness(data, today=future_date)


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════════


def forecast_project_state(
    data: dict,
    days_ahead: int = 7,
    today: date | None = None,
) -> ForecastResult:
    """Project the state of the project N days into the future.

    Scans certificates, approvals, and deliveries for upcoming issues, then
    simulates readiness at the future date.

    Args:
        data: Project data dict from ``get_project_data(project_id)``.
        days_ahead: Number of days to look ahead (default: 7).
        today: Override for current date (for testing).

    Returns:
        A ``ForecastResult`` with a single snapshot at ``days_ahead``.

    Example::

        >>> result = forecast_project_state(data, days_ahead=14)
        >>> print(result.trend)
        'declining'
    """
    today = today or date.today()
    horizon = today + timedelta(days=days_ahead)

    current_readiness = _get_readiness(data, today)
    current_risk = _get_risk_level(data, today)

    # ── Scan for future events ─────────────────────────────────────────────
    events: list[ForecastEvent] = []
    events.extend(_scan_certificate_events(data, today, horizon))
    events.extend(_scan_approval_events(data, today, horizon))
    events.extend(_scan_delivery_events(data, today, horizon))
    events.sort(key=lambda e: e.day)

    # ── Project readiness at horizon ───────────────────────────────────────
    projected_readiness = _project_readiness_at(data, today, horizon)
    projected_risk = _get_risk_level(data, horizon)

    # ── Build snapshot ─────────────────────────────────────────────────────
    new_issue_count = len(events)
    issue_word = "issue" if new_issue_count == 1 else "issues"
    snapshot_desc = (
        f"In {days_ahead} days: readiness "
        f"{'drops' if projected_readiness < current_readiness else 'stays'} "
        f"at {projected_readiness}%"
    )
    if new_issue_count > 0:
        snapshot_desc += f", {new_issue_count} new {issue_word}"

    snapshot = ForecastSnapshot(
        days_ahead=days_ahead,
        projected_readiness=projected_readiness,
        projected_risk_level=projected_risk,
        new_issues=events,
        description=snapshot_desc,
    )

    # ── Determine trend ────────────────────────────────────────────────────
    diff = projected_readiness - current_readiness
    if diff < -2:
        trend = "declining"
    elif diff > 2:
        trend = "improving"
    else:
        trend = "stable"

    # ── Summary ────────────────────────────────────────────────────────────
    if trend == "declining":
        summary = (
            f"Project readiness will decline from {current_readiness}% "
            f"to {projected_readiness}% over {days_ahead} days "
            f"if no action taken"
        )
    elif trend == "improving":
        summary = (
            f"Project readiness is projected to improve from "
            f"{current_readiness}% to {projected_readiness}% "
            f"over {days_ahead} days"
        )
    else:
        summary = (
            f"Project readiness remains stable at {current_readiness}% "
            f"over the next {days_ahead} days"
        )

    return ForecastResult(
        current_readiness=current_readiness,
        current_risk=current_risk,
        snapshots=[snapshot],
        worst_case_readiness=projected_readiness,
        trend=trend,
        summary=summary,
    )


def forecast_timeline(
    data: dict,
    milestones: list[int] | None = None,
    today: date | None = None,
) -> list[ForecastSnapshot]:
    """Multi-horizon forecast across several milestones.

    For each milestone (default: [7, 14, 30] days), runs
    ``forecast_project_state`` and collects the resulting snapshot.

    Args:
        data: Project data dict from ``get_project_data(project_id)``.
        milestones: List of day offsets to forecast (default: [7, 14, 30]).
        today: Override for current date (for testing).

    Returns:
        A list of ``ForecastSnapshot`` objects, one per milestone, ordered
        by ``days_ahead`` ascending.

    Example::

        >>> timeline = forecast_timeline(data, milestones=[7, 14, 30])
        >>> for snap in timeline:
        ...     print(f"+{snap.days_ahead}d: {snap.projected_readiness}%")
        +7d: 68%
        +14d: 62%
        +30d: 55%
    """
    if milestones is None:
        milestones = [7, 14, 30]

    today = today or date.today()
    snapshots: list[ForecastSnapshot] = []

    for days_ahead in sorted(milestones):
        result = forecast_project_state(data, days_ahead=days_ahead, today=today)
        # Each result has exactly one snapshot; extract it
        if result.snapshots:
            snapshots.append(result.snapshots[0])

    return snapshots
