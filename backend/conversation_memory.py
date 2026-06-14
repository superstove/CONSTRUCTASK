"""
Conversation memory for the Project Intelligence Assistant.

Tracks per-session context so the AI can handle follow-up questions like:
  User: "Which materials are blocked?"
  AI:   "SlopeShield Pro 600"
  User: "Who supplied it?"
  AI:   "Supplier Delta supplied SlopeShield Pro 600."

Sessions are keyed by (project_id,) — user_id is optional.
Old sessions auto-clean after 2 hours of inactivity.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock

SESSION_TTL_SECONDS = 2 * 60 * 60  # 2 hours


@dataclass
class ConversationContext:
    project_id: int
    user_id: int | None = None
    role: str | None = None

    # Last referenced entities — used for pronoun resolution
    last_material_name: str | None = None
    last_material_id: int | None = None
    last_supplier: str | None = None
    last_topic: str | None = None  # e.g. "materials", "deliveries", "risk"
    last_materials_list: list[str] = field(default_factory=list)

    # Rolling history (last 10 exchanges)
    history: list[dict] = field(default_factory=list)

    # Housekeeping
    last_active: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.last_active = time.time()

    def add_exchange(self, question: str, answer_snippet: str) -> None:
        self.history.append({
            "q": question[:300],
            "a": answer_snippet[:300],
            "t": time.time(),
        })
        # Keep only last 10 exchanges
        if len(self.history) > 10:
            self.history = self.history[-10:]
        self.touch()

    def set_material(self, name: str | None, material_id: int | None = None) -> None:
        if name:
            self.last_material_name = name
        if material_id:
            self.last_material_id = material_id
        self.touch()

    def set_supplier(self, supplier: str | None) -> None:
        if supplier:
            self.last_supplier = supplier
        self.touch()

    def set_topic(self, topic: str) -> None:
        self.last_topic = topic
        self.touch()

    def set_materials_list(self, names: list[str]) -> None:
        self.last_materials_list = names[:20]
        self.touch()


# ---------------------------------------------------------------------------
# Global session store
# ---------------------------------------------------------------------------

_sessions: dict[str, ConversationContext] = {}
_lock = Lock()


def _session_key(project_id: int, user_id: int | None = None) -> str:
    return f"{project_id}:{user_id or 0}"


def get_context(project_id: int, user_id: int | None = None, role: str | None = None) -> ConversationContext:
    """Get or create a conversation context for this session."""
    key = _session_key(project_id, user_id)
    with _lock:
        _cleanup_expired()
        if key not in _sessions:
            _sessions[key] = ConversationContext(
                project_id=project_id,
                user_id=user_id,
                role=role,
            )
        ctx = _sessions[key]
        ctx.touch()
        if role:
            ctx.role = role
        return ctx


def clear_context(project_id: int, user_id: int | None = None) -> None:
    """Explicitly clear a session (e.g. when user switches project)."""
    key = _session_key(project_id, user_id)
    with _lock:
        _sessions.pop(key, None)


def _cleanup_expired() -> None:
    """Remove sessions older than TTL. Called under lock."""
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v.last_active > SESSION_TTL_SECONDS]
    for k in expired:
        del _sessions[k]
