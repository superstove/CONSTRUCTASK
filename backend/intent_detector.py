"""
Intent Detection Pipeline for the Project Intelligence Assistant.

Replaces simple keyword matching with structured intent classification.
Handles conversational follow-ups, entity extraction, and pronoun resolution.

Pipeline:
  User Question → Intent Detection → Entity Extraction → Context Resolution
"""

from __future__ import annotations

from enum import Enum, auto
from dataclasses import dataclass, field

from conversation_memory import ConversationContext


class Intent(Enum):
    # --- Core ERP intents ---
    MATERIAL_SUMMARY = auto()        # "show all materials", "material status"
    MATERIAL_SPECIFIC = auto()       # "tell me about Geogrid BX1200"
    DELIVERY_STATUS = auto()         # "delayed deliveries", "shipment status"
    APPROVAL_STATUS = auto()         # "pending approvals", "who must approve"
    CERTIFICATE_STATUS = auto()      # "expired certificates", "certificate check"

    # --- Extended ERP intents ---
    USER_TEAM = auto()               # "who are the team members", "show users"
    AUDIT_TRAIL = auto()             # "audit history", "what happened recently"
    PRODUCT_PASSPORT = auto()        # "show product passports", "sustainability"
    QR_SCAN = auto()                 # "scan history", "QR scans", "who scanned"
    RISK_ANALYSIS = auto()           # "project risks", "what's dangerous"
    ROOT_CAUSE = auto()              # "why is readiness low", "root cause"
    EXECUTIVE_SUMMARY = auto()       # "project health", "how is project doing"
    SUPPLIER_ANALYSIS = auto()       # "supplier problems", "which supplier"
    READINESS = auto()               # "is project ready", "readiness score"
    QUANTITY_COUNT = auto()           # "how many materials", "total count"

    # --- Conversational intents ---
    FOLLOW_UP = auto()               # "who supplied it?", "is it approved?"
    GREETING = auto()                # "hello", "hi", "good morning"
    HELP = auto()                    # "help", "what can you do", "guide"
    THANKS = auto()                  # "thank you", "thanks"

    # --- Special ---
    ERP_OVERVIEW = auto()            # "ERP view", "full overview", "operations"
    DAILY_BRIEF = auto()             # "daily brief", "morning report"
    FIX_FIRST = auto()              # "what to fix first", "priority action"
    FORECAST = auto()                # "what happens if we do nothing", "predict", "forecast"
    PASSPORT_ANALYSIS = auto()       # "passport deep dive", "DPP analysis"
    COMPLIANCE_ANALYSIS = auto()     # "compliance gaps", "compliance status"
    AUDIT_INTEGRITY = auto()         # "is the audit trail tamper-proof", "hash chain"
    CONCEPT_DPP = auto()             # "what is a digital product passport" (definition)
    UNSUPPORTED = auto()             # data not available (budget, equipment, etc.)
    UNKNOWN = auto()                 # couldn't determine intent


@dataclass
class DetectedIntent:
    intent: Intent
    confidence: float = 1.0

    # Extracted entities
    material_names: list[str] = field(default_factory=list)
    supplier_names: list[str] = field(default_factory=list)
    batch_numbers: list[str] = field(default_factory=list)
    user_names: list[str] = field(default_factory=list)

    # For follow-ups — what the user is asking about the previous topic
    follow_up_aspect: str | None = None  # "supplier", "approval", "certificate", etc.

    # Resolved from conversation context
    resolved_material: str | None = None
    resolved_supplier: str | None = None


# ---------------------------------------------------------------------------
# Intent detection rules
# ---------------------------------------------------------------------------

_GREETING_WORDS = {"hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy", "greetings", "hai", "haii", "hii", "helo", "hlo", "namaste", "vanakkam", "yo"}
_THANKS_WORDS = {"thank", "thanks", "thank you", "thx", "appreciated"}
_HELP_WORDS = {"help", "guide", "how to use", "what can you do", "what can i ask", "tutorial", "how does this work", "capabilities"}

_FOLLOW_UP_PRONOUNS = {"it", "that", "this", "they", "them", "those", "the same", "its", "their"}
_FOLLOW_UP_SUPPLIER_WORDS = {"who supplied", "supplier", "who provides", "who delivers", "vendor", "supplied by", "provided by", "who makes"}
_FOLLOW_UP_APPROVAL_WORDS = {"approved", "approval", "is it approved", "who approved", "approval status", "sign off", "signed off"}
_FOLLOW_UP_CERTIFICATE_WORDS = {"certificate", "cert", "certified", "compliance", "is it compliant", "has certificate"}
_FOLLOW_UP_DELIVERY_WORDS = {"delivered", "delivery", "when delivered", "delivery status", "shipped", "arrived"}
_FOLLOW_UP_SCAN_WORDS = {"scanned", "scan", "who scanned", "last scan", "qr"}

_UNSUPPORTED_TERMS = {
    "budget": "budget, cost, and finance records",
    "cost": "budget, cost, and finance records",
    "invoice": "invoice and payment records",
    "payment": "invoice and payment records",
    "finance": "financial records",
    "spent": "spending records",
    "labor cost": "labor cost records",
    "labour cost": "labour cost records",
    "equipment": "equipment and plant tracking records",
    "machine": "machinery records",
    "machinery": "machinery records",
    "vehicle": "vehicle fleet records",
    "plant": "plant and equipment records",
    "worker": "workforce records",
    "workforce": "workforce records",
    "labor": "labor and workforce records",
    "labour": "labour and workforce records",
    "employee": "employee records",
    "attendance": "attendance records",
    "subcontractor": "subcontractor records",
    "email": "email and communication records",
    "crm": "CRM records",
}


def _contains_any(text: str, terms: set[str] | dict[str, str]) -> bool:
    return any(term in text for term in terms)


def _find_unsupported_gaps(text: str) -> list[str]:
    gaps = []
    seen = set()
    for term, gap_desc in _UNSUPPORTED_TERMS.items():
        if term in text and gap_desc not in seen:
            gaps.append(gap_desc)
            seen.add(gap_desc)
    return gaps


# "this month", "that project" etc. are demonstrative + noun, NOT references to
# the previous conversation turn. Without this list, "expire this month" gets
# hijacked as a follow-up about the last material.
_PRONOUN_NOUN_EXCEPTIONS = {
    "month", "week", "year", "quarter", "morning", "afternoon", "today",
    "project", "site", "platform", "system", "app", "time", "moment", "stage",
}


def _has_referential_pronoun(words: list[str]) -> bool:
    for index, word in enumerate(words):
        if word not in _FOLLOW_UP_PRONOUNS:
            continue
        if word in {"this", "that", "these", "those"}:
            next_word = words[index + 1] if index + 1 < len(words) else ""
            if next_word.strip("?.,!") in _PRONOUN_NOUN_EXCEPTIONS:
                continue
        return True
    return False


def _is_follow_up(q: str, ctx: ConversationContext | None) -> tuple[bool, str | None]:
    """Check if this is a follow-up question referencing previous context.

    IMPORTANT: Only triggers as follow-up when:
    - The user uses a pronoun (it, that, this, they...) — e.g. "who supplied it?"
    - OR the question is extremely short (≤4 words) and has topic keywords — e.g. "supplier?"
    Standalone questions like "show scan history" should NOT be follow-ups.
    Long analytical questions (>8 words) are standalone even with a pronoun —
    "which approval is most overdue and why does it matter?" is not a follow-up.
    """
    if not ctx or (not ctx.last_material_name and not ctx.last_topic):
        return False, None

    words = [w.strip("?.,!") for w in q.split()]
    if len(words) > 8:
        return False, None
    has_pronoun = _has_referential_pronoun(words) or any(p in q for p in {"the same"})
    is_very_short = len(words) <= 4  # Only very short = follow-up candidate without pronoun

    # Must have pronoun for topic-keyword matching, OR be very short
    if has_pronoun:
        if _contains_any(q, _FOLLOW_UP_SUPPLIER_WORDS):
            return True, "supplier"
        if _contains_any(q, _FOLLOW_UP_APPROVAL_WORDS):
            return True, "approval"
        if _contains_any(q, _FOLLOW_UP_CERTIFICATE_WORDS):
            return True, "certificate"
        if _contains_any(q, _FOLLOW_UP_DELIVERY_WORDS):
            return True, "delivery"
        if _contains_any(q, _FOLLOW_UP_SCAN_WORDS):
            return True, "scan"
        # Generic pronoun follow-up
        if is_very_short:
            return True, "general"
    elif is_very_short:
        # Very short without pronoun — only match explicit follow-up phrases
        if _contains_any(q, {"who supplied", "who provides", "who delivers", "supplied by", "provided by"}):
            return True, "supplier"
        if _contains_any(q, {"is it approved", "who approved"}):
            return True, "approval"

    return False, None


def detect_intent(question: str, context: ConversationContext | None = None, material_names: list[str] | None = None) -> DetectedIntent:
    """
    Detect the user's intent from their question.

    Args:
        question: The user's question text
        context: Conversation context for follow-up resolution
        material_names: Known material names in the project (for entity extraction)
    """
    q = question.lower().strip()
    result = DetectedIntent(intent=Intent.UNKNOWN)

    # --- Check for greetings ---
    first_words = q.split()[:3]
    if any(w in _GREETING_WORDS for w in first_words) or q in _GREETING_WORDS:
        result.intent = Intent.GREETING
        return result

    # --- Check for thanks ---
    if any(w in q for w in _THANKS_WORDS):
        result.intent = Intent.THANKS
        return result

    # --- Check for help ---
    if any(w in q for w in _HELP_WORDS):
        result.intent = Intent.HELP
        return result

    # --- Check for follow-up questions ---
    is_followup, aspect = _is_follow_up(q, context)
    if is_followup:
        result.intent = Intent.FOLLOW_UP
        result.follow_up_aspect = aspect
        if context:
            result.resolved_material = context.last_material_name
            result.resolved_supplier = context.last_supplier
        return result

    # --- Definitional question about DPP (explain the concept, not the data) ---
    _DEFINING = ("what is", "what are", "what's", "explain", "define", "definition", "meaning of", "tell me what")
    if any(t in q for t in _DEFINING) and any(t in q for t in ("digital product passport", "product passport", "dpp", "passport")):
        result.intent = Intent.CONCEPT_DPP
        return result

    # --- Check for unsupported enterprise features ---
    # Skip if the question is really a project deliverable (summary/report/brief)
    # that merely *mentions* a word like "email" incidentally.
    _IN_SCOPE_DELIVERABLE = ("summary", "summarise", "summarize", "report", "brief", "overview", "snapshot", "recap", "status")
    gaps = _find_unsupported_gaps(q)
    if gaps and not any(t in q for t in _IN_SCOPE_DELIVERABLE):
        result.intent = Intent.UNSUPPORTED
        return result

    # --- Extract material entities ---
    if material_names:
        for name in material_names:
            name_lower = name.lower()
            if name_lower in q:
                result.material_names.append(name)
            else:
                # Try token matching (at least 2 significant tokens)
                tokens = [t for t in name_lower.replace("-", " ").split() if len(t) >= 4]
                if tokens and len(tokens) >= 2 and all(t in q for t in tokens[:2]):
                    result.material_names.append(name)

    # If we found specific materials, it's a specific material question
    if result.material_names:
        result.intent = Intent.MATERIAL_SPECIFIC
        return result

    # --- Counting / percentage questions (checked early so "how many materials
    # are verified" computes a number instead of dumping the material report) ---
    if any(t in q for t in ("how many", "how much", "what percent", "percentage", "percent", "%",
                              "count of", "total quantity", "number of", "what fraction", "ratio of")):
        result.intent = Intent.QUANTITY_COUNT
        return result

    # --- Audit integrity / tamper-proofing (checked before generic audit trail) ---
    if any(t in q for t in ("tamper", "tampering", "hash", "integrity", "immutable", "blockchain")) or \
       ("audit" in q and any(t in q for t in ("protect", "protected", "secure", "trust", "verify", "verified"))):
        result.intent = Intent.AUDIT_INTEGRITY
        return result

    # --- Daily brief / Morning report ---
    if "daily brief" in q or "morning report" in q or "morning brief" in q or "daily report" in q:
        result.intent = Intent.DAILY_BRIEF
        return result

    # --- Fix first / Priority action ---
    if "fix first" in q or "priority" in q or ("project manager" in q and "today" in q) or "what to do first" in q or "first action" in q or "most urgent" in q:
        result.intent = Intent.FIX_FIRST
        return result

    # --- Forecast / Prediction (V3) ---
    if any(t in q for t in ("forecast", "predict", "prediction", "what happens if", "do nothing",
                              "outlook", "what will happen", "if we wait", "next week", "coming days",
                              "project future", "will readiness", "what happens next",
                              "if nothing changes", "7 days", "14 days", "30 days",
                              "on track", "on schedule", "behind schedule", "deadline", "finish on time",
                              "meet the deadline", "completion date", "timeline", "delayed overall")):
        result.intent = Intent.FORECAST
        return result

    # --- Executive summary ---
    if any(t in q for t in ("executive brief", "executive summary", "management summary", "how is the project", "project doing", "project health", "overall health", "overall status", "project overview", "big picture")):
        result.intent = Intent.EXECUTIVE_SUMMARY
        return result

    # --- Root cause analysis ---
    if any(t in q for t in ("why is readiness", "root cause", "why is risk", "why is the project", "what went wrong", "explain why", "reason for")):
        result.intent = Intent.ROOT_CAUSE
        return result

    # --- Risk analysis (but NOT if it's about suppliers — those go to supplier analysis) ---
    risk_words = ("risk", "danger", "problem", "issue", "concern", "risks", "problems", "issues", "what's wrong", "threats")
    supplier_words_in_q = any(s in q for s in ("supplier", "vendor", "suppliers", "vendors"))
    if any(t in q for t in risk_words) and not supplier_words_in_q:
        result.intent = Intent.RISK_ANALYSIS
        return result

    # --- Material summary ---
    material_terms = {"material", "materials", "batch", "batches", "inventory"}
    summary_terms = {"all", "whole", "summary", "list", "status", "show", "tell", "explain", "ready", "hold", "blocked", "verified", "pending", "failed"}
    if any(t in q for t in material_terms) and any(t in q for t in summary_terms):
        result.intent = Intent.MATERIAL_SUMMARY
        return result

    # --- Unverified / not verified ---
    if "not yet verified" in q or "not verified" in q or "unverified" in q:
        result.intent = Intent.MATERIAL_SUMMARY
        return result

    # --- Delivery ---
    if any(t in q for t in ("delivery", "deliveries", "procurement", "supply chain", "shipment", "late", "delayed", "dispatch", "shipping", "arriving", "arrives")):
        result.intent = Intent.DELIVERY_STATUS
        return result

    # --- Compliance Analysis (V3 — deep dive, check before generic certificate) ---
    if any(t in q for t in ("compliance gap", "compliance gaps", "compliance analysis", "compliance status",
                              "compliance report", "full compliance", "non-compliant", "materials without cert")):
        result.intent = Intent.COMPLIANCE_ANALYSIS
        return result

    # --- Certificate ---
    if any(t in q for t in ("certificate", "certificates", "cert", "certs", "compliance", "expired", "expiring", "expire", "expires", "expiry", "validity", "iso", "bis", "astm", "ce marking")):
        result.intent = Intent.CERTIFICATE_STATUS
        return result

    # --- Approval ---
    if any(t in q for t in ("approval", "approvals", "approve", "sign off", "signoff", "sign-off", "pending gate", "who must approve", "who approved")):
        result.intent = Intent.APPROVAL_STATUS
        return result

    # --- Users / Team ---
    if any(t in q for t in ("user", "users", "team", "members", "who is", "who are", "staff", "people", "engineer", "engineers", "manager", "operator", "inspector", "team member")):
        result.intent = Intent.USER_TEAM
        return result

    # --- QR Scans (check BEFORE audit trail — both share "history", "log") ---
    if any(t in q for t in ("qr", "scan", "scans", "scanned", "scan log", "scan history", "who scanned")):
        result.intent = Intent.QR_SCAN
        return result

    # --- Supplier analysis (check BEFORE risk — both share "problem") ---
    if any(t in q for t in ("supplier", "suppliers", "vendor", "vendors", "who supplies", "supplier performance", "supplier risk", "supplier problem", "supplier problems")):
        result.intent = Intent.SUPPLIER_ANALYSIS
        return result

    # --- Audit trail ---
    if any(t in q for t in ("audit", "trail", "what happened", "recent activity", "log", "changes", "events", "timeline", "activity", "audit history", "audit trail")):
        result.intent = Intent.AUDIT_TRAIL
        return result

    # --- Passport Analysis (V3 — deep dive, check before generic passport) ---
    if any(t in q for t in ("passport analysis", "passport detail", "dpp analysis", "dpp deep",
                              "passport lifecycle", "passport status", "passport compliance")):
        result.intent = Intent.PASSPORT_ANALYSIS
        return result

    # --- Product passport ---
    if any(t in q for t in ("passport", "passports", "product passport", "sustainability", "carbon", "carbon footprint", "environmental", "green")):
        result.intent = Intent.PRODUCT_PASSPORT
        return result

    # --- Readiness ---
    if any(t in q for t in ("ready", "readiness", "can we start", "safe to use", "release", "is it ready", "go ahead", "proceed")):
        result.intent = Intent.READINESS
        return result

    # --- Quantity / Count ---
    if any(t in q for t in ("how many", "how much", "count", "total", "number of", "quantity")):
        result.intent = Intent.QUANTITY_COUNT
        return result

    # --- ERP Overview ---
    if any(t in q for t in ("erp", "operations", "whole project", "overall project", "full picture", "everything", "all data", "complete view", "show everything")):
        result.intent = Intent.ERP_OVERVIEW
        return result

    # --- Project health as fallback for generic project questions ---
    project_terms = {"project", "site", "work", "going", "progress", "condition"}
    status_terms = {"how", "what", "status", "going", "progress", "ok", "good"}
    if any(t in q for t in project_terms) and any(t in q for t in status_terms):
        result.intent = Intent.EXECUTIVE_SUMMARY
        return result

    return result
