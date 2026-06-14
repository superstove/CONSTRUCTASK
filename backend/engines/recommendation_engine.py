"""
ConstructAsk V3 — Recommendation Engine
=========================================

Generates a prioritized action plan telling users WHAT to fix and in what
order.  Each recommendation includes the expected readiness gain (via
simulation), severity classification, and a cumulative projection showing
the full improvement potential.

Example::

    >>> data = get_project_data(project_id=1)
    >>> plan = generate_recommendations(data)
    >>> print(plan.summary)
    '5 actions identified. If all completed: readiness improves from 72% to 94%.'
    >>> for r in plan.recommendations:
    ...     print(f"[P{r.priority}] {r.severity} {r.issue} → +{r.expected_gain}%")
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
class Recommendation:
    """A single prioritized action item.

    Attributes:
        priority: Ranking (1 = most impactful).
        severity: Classification — '🔴 BLOCKING', '🟡 URGENT', or '⚠️ WATCH'.
        issue: Short description of the problem.
        entity_type: Category — 'certificate', 'approval', 'delivery', 'material'.
        entity_name: Human-readable entity name.
        entity_id: Database primary key of the entity.
        related_material: Material affected, if applicable.
        impact: What this issue is blocking or degrading.
        action: Concrete recommended action to resolve.
        expected_gain: Readiness improvement in percentage points.
        readiness_after: Projected readiness after fixing this single issue.
    """

    priority: int
    severity: str
    issue: str
    entity_type: str
    entity_name: str
    entity_id: int
    related_material: str | None
    impact: str
    action: str
    expected_gain: int
    readiness_after: int


@dataclass
class RecommendationPlan:
    """Complete action plan with cumulative projections.

    Attributes:
        current_readiness: Readiness score at analysis time.
        recommendations: Ordered list (highest priority first).
        cumulative_readiness: Projected readiness if ALL actions are completed.
        total_issues: Total number of identified issues.
        blocking_count: Number of BLOCKING-severity issues.
        urgent_count: Number of URGENT-severity issues.
        watch_count: Number of WATCH-severity issues.
        summary: Human-readable plan summary.
    """

    current_readiness: int
    recommendations: list[Recommendation]
    cumulative_readiness: int
    total_issues: int
    blocking_count: int
    urgent_count: int
    watch_count: int
    summary: str


# ═══════════════════════════════════════════════════════════════════════════════
# FALLBACK HELPERS  (mirrors root_cause_engine approach)
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


def _fallback_simulate(
    data: dict,
    fix_type: str,
    fix_id: int,
    today: date | None = None,
) -> int:
    """Estimate readiness gain per fix when readiness_engine is unavailable."""
    component_counts = {
        "certificate": len(data["certificates"]),
        "approval": len(data["approvals"]),
        "delivery": len(data["deliveries"]),
        "material": len(data["materials"]),
    }
    total_in_component = component_counts.get(fix_type, 1) or 1
    active_components = sum(
        1
        for key in ("materials", "certificates", "approvals", "deliveries")
        if data.get(key)
    )
    active_components = max(active_components, 1)
    return round(100 / total_in_component / active_components)


def _get_readiness(data: dict, today: date | None = None) -> int:
    """Return current readiness via engine or fallback."""
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
    """Simulate fixing an issue. Returns (new_readiness, gain)."""
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
# SEVERITY CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

_SEVERITY_BLOCKING = "🔴 BLOCKING"
_SEVERITY_URGENT = "🟡 URGENT"
_SEVERITY_WATCH = "⚠️ WATCH"

_SEVERITY_ORDER = {
    _SEVERITY_BLOCKING: 0,
    _SEVERITY_URGENT: 1,
    _SEVERITY_WATCH: 2,
}


# ═══════════════════════════════════════════════════════════════════════════════
# ISSUE COLLECTORS
# ═══════════════════════════════════════════════════════════════════════════════


def _collect_certificate_issues(
    data: dict, today: date
) -> list[dict]:
    """Collect expired and expiring-soon certificates as issues."""
    issues: list[dict] = []
    for cert in data["certificates"]:
        status = certificate_status(cert, today)
        if status not in ("expired", "expiring"):
            continue

        material_name = (
            cert.material.name
            if getattr(cert, "material", None)
            else "Unknown material"
        )
        expired_or_remaining = abs(days_until_expiry(cert, today))

        if status == "expired":
            severity = _SEVERITY_BLOCKING
            issue_text = f"Expired {cert.certificate_name}"
            impact_text = (
                f"Blocking material release for {material_name}"
            )
            action_text = (
                f"Contact {cert.issuing_body} for certificate renewal"
            )
        else:
            severity = _SEVERITY_WATCH
            issue_text = (
                f"{cert.certificate_name} expiring in "
                f"{expired_or_remaining} day(s)"
            )
            impact_text = (
                f"{material_name} will be blocked when certificate expires"
            )
            action_text = (
                f"Plan renewal of {cert.certificate_name} with "
                f"{cert.issuing_body} before expiry"
            )

        issues.append(
            {
                "severity": severity,
                "issue": issue_text,
                "entity_type": "certificate",
                "entity_name": cert.certificate_name,
                "entity_id": cert.id,
                "related_material": material_name,
                "impact": impact_text,
                "action": action_text,
            }
        )
    return issues


def _collect_approval_issues(
    data: dict, today: date
) -> list[dict]:
    """Collect overdue and long-pending approvals as issues."""
    issues: list[dict] = []
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

        if overdue > 10:
            severity = _SEVERITY_BLOCKING
        elif overdue > 3:
            severity = _SEVERITY_URGENT
        else:
            severity = _SEVERITY_WATCH

        issues.append(
            {
                "severity": severity,
                "issue": (
                    f"{approval.approval_type} overdue by {overdue} day(s)"
                ),
                "entity_type": "approval",
                "entity_name": approval.approval_type,
                "entity_id": approval.id,
                "related_material": material_name,
                "impact": (
                    f"{material_name} waiting for {approval.approval_type} — "
                    f"installation delayed"
                ),
                "action": (
                    f"Escalate {approval.approval_type} to {approver_name} "
                    f"for immediate sign-off"
                ),
            }
        )
    return issues


def _collect_delivery_issues(
    data: dict, today: date
) -> list[dict]:
    """Collect delayed deliveries as issues."""
    issues: list[dict] = []
    for dlv in data["deliveries"]:
        delay = delivery_delay_days(dlv, today)
        if delay <= 0:
            continue

        if delay > 7:
            severity = _SEVERITY_BLOCKING
        elif delay > 3:
            severity = _SEVERITY_URGENT
        else:
            severity = _SEVERITY_WATCH

        issues.append(
            {
                "severity": severity,
                "issue": (
                    f"{dlv.material_name} delivery delayed by {delay} day(s)"
                ),
                "entity_type": "delivery",
                "entity_name": dlv.material_name,
                "entity_id": dlv.id,
                "related_material": dlv.material_name,
                "impact": (
                    f"{dlv.material_name} not on site — "
                    f"work sequence disrupted"
                ),
                "action": (
                    f"Contact {dlv.supplier} for revised delivery date "
                    f"for {dlv.material_name}"
                ),
            }
        )
    return issues


def _collect_material_issues(
    data: dict, today: date
) -> list[dict]:
    """Collect failed-verification materials as issues."""
    issues: list[dict] = []
    for mat in data["materials"]:
        if mat.status != "failed":
            continue

        issues.append(
            {
                "severity": _SEVERITY_BLOCKING,
                "issue": f"{mat.name} failed verification",
                "entity_type": "material",
                "entity_name": mat.name,
                "entity_id": mat.id,
                "related_material": mat.name,
                "impact": (
                    f"{mat.name} cannot be used on site — "
                    f"needs replacement or re-test"
                ),
                "action": (
                    f"Re-test or replace {mat.name} "
                    f"(batch {mat.batch_number}) from {mat.supplier}"
                ),
            }
        )
    return issues


# ═══════════════════════════════════════════════════════════════════════════════
# WORST-CASE PROJECTION
# ═══════════════════════════════════════════════════════════════════════════════


def _forecast_worst_case(
    data: dict, days_ahead: int, today: date
) -> int:
    """Estimate worst-case readiness if nothing is done for `days_ahead` days.

    Counts certificates that will expire, approvals that will become critical,
    and deliveries that will become overdue, then subtracts proportional
    readiness per new issue.
    """
    future_date = today + timedelta(days=days_ahead)
    current = _get_readiness(data, today)

    new_expirations = 0
    for cert in data["certificates"]:
        status_now = certificate_status(cert, today)
        status_future = certificate_status(cert, future_date)
        if status_now != "expired" and status_future == "expired":
            new_expirations += 1

    new_critical_approvals = 0
    for approval in data["approvals"]:
        overdue_now = approval_overdue_days(approval, today)
        overdue_future = approval_overdue_days(approval, future_date)
        if overdue_now <= 10 < overdue_future:
            new_critical_approvals += 1

    new_delays = 0
    for dlv in data["deliveries"]:
        delay_now = delivery_delay_days(dlv, today)
        delay_future = delivery_delay_days(dlv, future_date)
        if delay_now == 0 and delay_future > 0:
            new_delays += 1

    # Each new issue degrades readiness proportionally
    total_items = max(
        len(data["materials"])
        + len(data["certificates"])
        + len(data["approvals"])
        + len(data["deliveries"]),
        1,
    )
    degradation_per_issue = round(100 / total_items)
    total_degradation = (
        (new_expirations + new_critical_approvals + new_delays)
        * degradation_per_issue
    )

    return max(0, current - total_degradation)


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════════


def generate_recommendations(
    data: dict,
    today: date | None = None,
) -> RecommendationPlan:
    """Generate a prioritized action plan from project data.

    Collects all issues (expired certs, overdue approvals, delayed deliveries,
    failed materials), simulates the readiness gain from fixing each one,
    and returns recommendations sorted by severity then expected gain.

    Also computes:
    - **cumulative_readiness**: the projected score if ALL actions are done.
    - **worst-case**: a 7-day inaction forecast.

    Args:
        data: Project data dict from ``get_project_data(project_id)``.
        today: Override for current date (for testing).

    Returns:
        A ``RecommendationPlan`` with ordered recommendations and summary.

    Example::

        >>> plan = generate_recommendations(data)
        >>> plan.recommendations[0].action
        'Contact Bureau of Indian Standards for certificate renewal'
    """
    today = today or date.today()
    current_readiness = _get_readiness(data, today)

    # ── 1. Collect all issues ──────────────────────────────────────────────
    raw_issues: list[dict] = []
    raw_issues.extend(_collect_certificate_issues(data, today))
    raw_issues.extend(_collect_approval_issues(data, today))
    raw_issues.extend(_collect_delivery_issues(data, today))
    raw_issues.extend(_collect_material_issues(data, today))

    # ── 2. Compute expected gain for each ──────────────────────────────────
    for issue in raw_issues:
        projected, gain = _simulate_fix(
            data, issue["entity_type"], issue["entity_id"], today
        )
        issue["expected_gain"] = gain
        issue["readiness_after"] = projected

    # ── 3. Sort: severity (blocking > urgent > watch), then gain desc ──────
    raw_issues.sort(
        key=lambda i: (
            _SEVERITY_ORDER.get(i["severity"], 99),
            -i["expected_gain"],
        )
    )

    # ── 4. Build Recommendation objects with priority ──────────────────────
    recommendations: list[Recommendation] = []
    for idx, issue in enumerate(raw_issues, start=1):
        recommendations.append(
            Recommendation(
                priority=idx,
                severity=issue["severity"],
                issue=issue["issue"],
                entity_type=issue["entity_type"],
                entity_name=issue["entity_name"],
                entity_id=issue["entity_id"],
                related_material=issue["related_material"],
                impact=issue["impact"],
                action=issue["action"],
                expected_gain=issue["expected_gain"],
                readiness_after=issue["readiness_after"],
            )
        )

    # ── 5. Compute cumulative projection ───────────────────────────────────
    cumulative = min(
        100,
        current_readiness + sum(r.expected_gain for r in recommendations),
    )

    # ── 6. Severity counts ─────────────────────────────────────────────────
    blocking_count = sum(
        1 for r in recommendations if r.severity == _SEVERITY_BLOCKING
    )
    urgent_count = sum(
        1 for r in recommendations if r.severity == _SEVERITY_URGENT
    )
    watch_count = sum(
        1 for r in recommendations if r.severity == _SEVERITY_WATCH
    )

    # ── 7. Worst-case forecast ─────────────────────────────────────────────
    worst_case = _forecast_worst_case(data, days_ahead=7, today=today)

    # ── 8. Build summary ──────────────────────────────────────────────────
    total_issues = len(recommendations)
    if total_issues == 0:
        summary = (
            f"No issues found. Current readiness is {current_readiness}%. "
            f"Project is on track."
        )
    else:
        action_word = "action" if total_issues == 1 else "actions"
        summary = (
            f"{total_issues} {action_word} identified. "
            f"If all completed: readiness improves from "
            f"{current_readiness}% to {cumulative}%. "
            f"If nothing done: readiness drops to {worst_case}% in 7 days."
        )

    return RecommendationPlan(
        current_readiness=current_readiness,
        recommendations=recommendations,
        cumulative_readiness=cumulative,
        total_issues=total_issues,
        blocking_count=blocking_count,
        urgent_count=urgent_count,
        watch_count=watch_count,
        summary=summary,
    )
