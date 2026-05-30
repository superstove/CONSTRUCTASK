from datetime import date

from models import Approval, Certificate, Delivery, Material


APPROVAL_SLA_DAYS = 6
EXPIRING_CERT_WINDOW_DAYS = 30


def plural(count: int, singular: str, plural_text: str | None = None) -> str:
    return f"{count} {singular if count == 1 else plural_text or singular + 's'}"


def certificate_status(certificate: Certificate, today: date | None = None) -> str:
    today = today or date.today()
    days_until_expiry = (certificate.expiry_date - today).days
    if days_until_expiry < 0:
        return "expired"
    if days_until_expiry <= EXPIRING_CERT_WINDOW_DAYS:
        return "expiring"
    return "valid"


def days_until_expiry(certificate: Certificate, today: date | None = None) -> int:
    today = today or date.today()
    return (certificate.expiry_date - today).days


def approval_overdue_days(approval: Approval, today: date | None = None) -> int:
    if approval.status.lower() != "pending":
        return 0
    today = today or date.today()
    computed_days = max(0, (today - approval.requested_date).days - APPROVAL_SLA_DAYS)
    return max(computed_days, approval.overdue_days or 0)


def delivery_delay_days(delivery: Delivery, today: date | None = None) -> int:
    today = today or date.today()
    comparison_date = delivery.actual_date or today
    computed_days = max(0, (comparison_date - delivery.expected_date).days)
    return max(computed_days, delivery.delay_days or 0)


def delivery_status(delivery: Delivery, today: date | None = None) -> str:
    if delivery.actual_date:
        return "delivered" if delivery_delay_days(delivery, today) == 0 else "delayed"
    if delivery_delay_days(delivery, today) > 0:
        return "delayed"
    return delivery.status


def computed_project_risk(
    materials: list[Material],
    approvals: list[Approval],
    certificates: list[Certificate],
    deliveries: list[Delivery],
    today: date | None = None,
) -> str:
    today = today or date.today()
    expired = [cert for cert in certificates if certificate_status(cert, today) == "expired"]
    overdue = [approval for approval in approvals if approval_overdue_days(approval, today) > 0]
    delayed = [delivery for delivery in deliveries if delivery_delay_days(delivery, today) > 0]
    failed = [material for material in materials if material.status == "failed"]

    if expired or failed or len(overdue) >= 2 or sum(delivery_delay_days(item, today) for item in delayed) >= 4:
        return "High"
    if overdue or delayed or any(certificate_status(cert, today) == "expiring" for cert in certificates):
        return "Medium"
    return "Low"
