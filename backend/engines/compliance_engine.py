"""
ConstructAsk V3 — Compliance Engine

Analyses certificate validity across a project, identifies compliance gaps
(materials without valid certificates), and computes an overall compliance
score.

Example::

    data = get_project_data(project_id)
    status = compute_compliance_status(data)
    print(status.score, status.valid, status.expired)
    # 75  6  2

    for gap in find_compliance_gaps(data):
        print(gap.severity, gap.material_name, gap.gap_type)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from intelligence import (
    certificate_status,
    days_until_expiry,
)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class CertificateDetail:
    """Detail record for a single certificate.

    Attributes:
        id: Certificate primary key.
        name: Certificate name.
        issuing_body: Organisation that issued the certificate.
        status: Computed status — 'valid', 'expiring', or 'expired'.
        days_remaining: Days until expiry (negative if already expired).
        material_name: Name of the material this certificate covers.
    """

    id: int
    name: str
    issuing_body: str
    status: str
    days_remaining: int
    material_name: str


@dataclass
class ComplianceGap:
    """A gap in compliance that requires attention.

    Attributes:
        severity: 'critical' (expired / no cert), 'warning' (expiring), 'info'.
        material_name: The material affected.
        material_id: Primary key of the affected material.
        gap_type: 'no_certificate', 'expired', or 'expiring'.
        description: Human-readable description.
        action_required: Recommended remediation action.
    """

    severity: str
    material_name: str
    material_id: int
    gap_type: str
    description: str
    action_required: str


@dataclass
class ComplianceStatus:
    """Overall compliance snapshot for a project.

    Attributes:
        score: 0–100 — percentage of materials that are fully compliant
            (have at least one valid, non-expiring certificate).
        total_certificates: Total certificates evaluated.
        valid: Number with status 'valid'.
        expiring: Number with status 'expiring'.
        expired: Number with status 'expired'.
        materials_without_certs: Materials that have zero certificates.
        certificates: Per-certificate detail records.
        gaps: Compliance gaps sorted by severity.
        explanation: Human-readable summary.
    """

    score: int
    total_certificates: int
    valid: int
    expiring: int
    expired: int
    materials_without_certs: int
    certificates: list[CertificateDetail] = field(default_factory=list)
    gaps: list[ComplianceGap] = field(default_factory=list)
    explanation: str = ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_certificate_details(
    certificates: list[Any],
    today: date | None,
) -> list[CertificateDetail]:
    """Build :class:`CertificateDetail` records for every certificate."""
    details: list[CertificateDetail] = []
    for cert in certificates:
        status = certificate_status(cert, today)
        remaining = days_until_expiry(cert, today)
        mat_name = (
            cert.material.name
            if hasattr(cert, "material") and cert.material
            else f"material_id={cert.material_id}"
        )
        details.append(CertificateDetail(
            id=cert.id,
            name=cert.certificate_name,
            issuing_body=cert.issuing_body,
            status=status,
            days_remaining=remaining,
            material_name=mat_name,
        ))
    return details


def _material_has_valid_cert(
    material_id: int,
    cert_map: dict[int, list[str]],
) -> bool:
    """Return True if the material has at least one 'valid' certificate."""
    statuses = cert_map.get(material_id, [])
    return "valid" in statuses


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def find_compliance_gaps(
    data: dict[str, Any],
    today: date | None = None,
) -> list[ComplianceGap]:
    """Identify all compliance gaps in the project.

    A gap is one of:

    * **no_certificate** — a material has zero certificates at all.
    * **expired** — all of a material's certificates are expired.
    * **expiring** — the material's best certificate is merely 'expiring'.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        List of :class:`ComplianceGap` sorted by severity
        (critical → warning → info).

    Example::

        gaps = find_compliance_gaps(data)
        for g in gaps:
            print(g.severity, g.gap_type, g.material_name)
    """
    materials = data.get("materials", [])
    certificates = data.get("certificates", [])

    # Build a map: material_id → list of computed statuses
    cert_status_map: dict[int, list[str]] = {}
    for cert in certificates:
        mid = cert.material_id
        cert_status_map.setdefault(mid, []).append(certificate_status(cert, today))

    gaps: list[ComplianceGap] = []

    for mat in materials:
        statuses = cert_status_map.get(mat.id, [])

        if not statuses:
            gaps.append(ComplianceGap(
                severity="critical",
                material_name=mat.name,
                material_id=mat.id,
                gap_type="no_certificate",
                description=f"Material '{mat.name}' has no compliance certificates.",
                action_required="Obtain and upload a valid compliance certificate for this material.",
            ))
        elif all(s == "expired" for s in statuses):
            gaps.append(ComplianceGap(
                severity="critical",
                material_name=mat.name,
                material_id=mat.id,
                gap_type="expired",
                description=(
                    f"All {len(statuses)} certificate(s) for '{mat.name}' "
                    f"have expired."
                ),
                action_required="Renew or replace the expired certificate(s) immediately.",
            ))
        elif "valid" not in statuses and "expiring" in statuses:
            # Best cert is only 'expiring', no fully valid cert remains
            gaps.append(ComplianceGap(
                severity="warning",
                material_name=mat.name,
                material_id=mat.id,
                gap_type="expiring",
                description=(
                    f"Material '{mat.name}' has no fully valid certificates; "
                    f"best available is expiring within 30 days."
                ),
                action_required="Renew the expiring certificate before it lapses.",
            ))
        elif "expiring" in statuses and "valid" in statuses:
            # Has valid cert, but also an expiring one — informational
            gaps.append(ComplianceGap(
                severity="info",
                material_name=mat.name,
                material_id=mat.id,
                gap_type="expiring",
                description=(
                    f"Material '{mat.name}' has a valid certificate but also "
                    f"has certificate(s) expiring within 30 days."
                ),
                action_required="Plan renewal for the expiring certificate(s).",
            ))

    # Sort by severity: critical → warning → info
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    gaps.sort(key=lambda g: severity_order.get(g.severity, 99))

    return gaps


def compute_compliance_status(
    data: dict[str, Any],
    today: date | None = None,
) -> ComplianceStatus:
    """Compute overall compliance status for a project.

    The compliance **score** is the percentage of materials that are fully
    compliant — i.e., each material has at least one certificate with
    status ``'valid'``.

    Args:
        data: Dict returned by ``get_project_data(project_id)``.
        today: Optional override for the current date.

    Returns:
        A :class:`ComplianceStatus` snapshot.

    Example::

        cs = compute_compliance_status(data)
        if cs.score < 80:
            print(f"Compliance below threshold: {cs.score}%")
    """
    materials = data.get("materials", [])
    certificates = data.get("certificates", [])

    details = _build_certificate_details(certificates, today)

    valid_count = sum(1 for d in details if d.status == "valid")
    expiring_count = sum(1 for d in details if d.status == "expiring")
    expired_count = sum(1 for d in details if d.status == "expired")

    # Build material → cert-status map for the compliance score
    cert_status_map: dict[int, list[str]] = {}
    for cert in certificates:
        mid = cert.material_id
        cert_status_map.setdefault(mid, []).append(certificate_status(cert, today))

    materials_without = sum(
        1 for m in materials if m.id not in cert_status_map
    )

    total_materials = len(materials)
    if total_materials == 0:
        score = 100
    else:
        compliant = sum(
            1 for m in materials
            if _material_has_valid_cert(m.id, cert_status_map)
        )
        score = round((compliant / total_materials) * 100)

    gaps = find_compliance_gaps(data, today)

    # Build explanation
    parts: list[str] = []
    parts.append(f"{valid_count} valid")
    if expiring_count:
        parts.append(f"{expiring_count} expiring")
    if expired_count:
        parts.append(f"{expired_count} expired")

    explanation = (
        f"Compliance score: {score}/100. "
        f"{len(certificates)} certificate(s): {', '.join(parts)}. "
        f"{materials_without} material(s) without any certificate. "
        f"{len(gaps)} compliance gap(s) identified."
    )

    return ComplianceStatus(
        score=score,
        total_certificates=len(certificates),
        valid=valid_count,
        expiring=expiring_count,
        expired=expired_count,
        materials_without_certs=materials_without,
        certificates=details,
        gaps=gaps,
        explanation=explanation,
    )
