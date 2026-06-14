"""
ConstructAsk V3 — Supplier Engine

Groups materials and deliveries by supplier, computes per-supplier
reliability metrics, and assigns risk levels.

Example::

    data = get_project_data(project_id)
    analysis = analyze_suppliers(data)
    for p in analysis.profiles:
        print(p.name, p.reliability_percent, p.risk_level)
    # Acme Steel  62.5  High
    # GreenBuild  90.0  Low
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from intelligence import (
    certificate_status,
    delivery_delay_days,
)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SupplierProfile:
    """Performance profile for a single supplier.

    Attributes:
        name: Supplier name.
        reliability_percent: ``(on_time_deliveries / total_deliveries) × 100``.
            100.0 if the supplier has no deliveries.
        risk_level: 'High' (<70%), 'Medium' (<85%), or 'Low' (≥85%).
        total_deliveries: Total delivery records from this supplier.
        on_time_deliveries: Deliveries with zero delay days.
        delayed_deliveries: Deliveries with delay > 0.
        total_delay_days: Sum of delay days across all deliveries.
        materials_supplied: Count of materials sourced from this supplier.
        failed_materials: Count of materials with status 'failed'.
        expired_certificates: Count of expired certs on this supplier's materials.
        issues: Human-readable issue descriptions.
    """

    name: str
    reliability_percent: float
    risk_level: str
    total_deliveries: int
    on_time_deliveries: int
    delayed_deliveries: int
    total_delay_days: int
    materials_supplied: int
    failed_materials: int
    expired_certificates: int
    issues: list[str] = field(default_factory=list)


@dataclass
class SupplierAnalysis:
    """Aggregated supplier analysis for the project.

    Attributes:
        total_suppliers: Number of distinct suppliers found.
        high_risk_count: Suppliers with risk_level 'High'.
        profiles: List of :class:`SupplierProfile`, sorted worst-first.
        most_problematic: Name of the supplier with lowest reliability,
            or ``None`` if there are no suppliers.
        explanation: Human-readable summary.
    """

    total_suppliers: int
    high_risk_count: int
    profiles: list[SupplierProfile] = field(default_factory=list)
    most_problematic: str | None = None
    explanation: str = ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _risk_level_from_reliability(pct: float) -> str:
    """Map reliability percentage to risk level."""
    if pct < 70:
        return "High"
    if pct < 85:
        return "Medium"
    return "Low"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_suppliers(
    data: dict[str, Any],
    today: date | None = None,
) -> SupplierAnalysis:
    """Analyse every supplier referenced in the project data.

    Suppliers are identified from both ``materials[].supplier`` and
    ``deliveries[].supplier``.  Metrics are aggregated per unique supplier
    name (case-insensitive match via ``str.lower()`` normalisation, with the
    original casing preserved from the first occurrence).

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A :class:`SupplierAnalysis` with per-supplier profiles sorted
        worst-first by reliability.

    Example::

        analysis = analyze_suppliers(data)
        print(analysis.most_problematic)  # 'Acme Steel'
    """
    materials = data.get("materials", [])
    certificates = data.get("certificates", [])
    deliveries = data.get("deliveries", [])

    # Collect all unique supplier names (normalised)
    supplier_names: dict[str, str] = {}  # lower → original casing
    for m in materials:
        key = m.supplier.strip().lower()
        supplier_names.setdefault(key, m.supplier.strip())
    for d in deliveries:
        key = d.supplier.strip().lower()
        supplier_names.setdefault(key, d.supplier.strip())

    # Build material_id → supplier_key map
    mat_supplier: dict[int, str] = {}
    for m in materials:
        mat_supplier[m.id] = m.supplier.strip().lower()

    # Per-supplier accumulators
    supplier_materials: dict[str, list[Any]] = {k: [] for k in supplier_names}
    supplier_deliveries: dict[str, list[Any]] = {k: [] for k in supplier_names}

    for m in materials:
        key = m.supplier.strip().lower()
        supplier_materials[key].append(m)

    for d in deliveries:
        key = d.supplier.strip().lower()
        supplier_deliveries[key].append(d)

    # Map cert → supplier via material_id
    cert_by_supplier: dict[str, list[Any]] = {k: [] for k in supplier_names}
    for cert in certificates:
        skey = mat_supplier.get(cert.material_id)
        if skey and skey in cert_by_supplier:
            cert_by_supplier[skey].append(cert)

    profiles: list[SupplierProfile] = []

    for key, display_name in supplier_names.items():
        s_materials = supplier_materials[key]
        s_deliveries = supplier_deliveries[key]
        s_certs = cert_by_supplier[key]

        total_del = len(s_deliveries)
        on_time = sum(1 for d in s_deliveries if delivery_delay_days(d, today) == 0)
        delayed = total_del - on_time
        total_delay = sum(delivery_delay_days(d, today) for d in s_deliveries)

        failed_mats = sum(
            1 for m in s_materials
            if m.status and m.status.lower() == "failed"
        )

        expired_certs = sum(
            1 for c in s_certs if certificate_status(c, today) == "expired"
        )

        reliability = (on_time / total_del * 100) if total_del > 0 else 100.0
        risk = _risk_level_from_reliability(reliability)

        # Build issue descriptions
        issues: list[str] = []
        if delayed:
            issues.append(f"{delayed} delivery(ies) delayed totalling {total_delay} day(s).")
        if failed_mats:
            issues.append(f"{failed_mats} material(s) failed verification.")
        if expired_certs:
            issues.append(f"{expired_certs} expired certificate(s) on supplied materials.")

        profiles.append(SupplierProfile(
            name=display_name,
            reliability_percent=round(reliability, 2),
            risk_level=risk,
            total_deliveries=total_del,
            on_time_deliveries=on_time,
            delayed_deliveries=delayed,
            total_delay_days=total_delay,
            materials_supplied=len(s_materials),
            failed_materials=failed_mats,
            expired_certificates=expired_certs,
            issues=issues,
        ))

    # Sort worst-first (lowest reliability first)
    profiles.sort(key=lambda p: p.reliability_percent)

    high_risk_count = sum(1 for p in profiles if p.risk_level == "High")
    most_problematic = profiles[0].name if profiles else None

    # Explanation
    total = len(profiles)
    if total == 0:
        explanation = "No suppliers found in project data."
    else:
        avg_reliability = sum(p.reliability_percent for p in profiles) / total
        explanation = (
            f"{total} supplier(s) analysed. "
            f"Average reliability: {avg_reliability:.1f}%. "
            f"{high_risk_count} high-risk supplier(s). "
            + (f"Most problematic: {most_problematic}." if most_problematic else "")
        )

    return SupplierAnalysis(
        total_suppliers=total,
        high_risk_count=high_risk_count,
        profiles=profiles,
        most_problematic=most_problematic,
        explanation=explanation,
    )
