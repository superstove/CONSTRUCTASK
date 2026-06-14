"""
JWT Authentication & Role-Based Access Control — Stage 10

Implements:
- Password hashing (bcrypt via passlib)
- JWT token generation and validation
- get_current_user() dependency for FastAPI routes
- require_role() permission decorator
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User


# --- Configuration ---
# Production MUST set JWT_SECRET_KEY. In dev we fall back to a known key but warn loudly.
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        raise RuntimeError(
            "JWT_SECRET_KEY environment variable is required in production. "
            "Set a strong random secret before deploying."
        )
    import warnings
    SECRET_KEY = "constructask-dev-secret-not-for-production"
    warnings.warn("JWT_SECRET_KEY not set — using an insecure development key. Set it before deploying.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # 8 hours

# --- Password Hashing ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# --- JWT Token ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# --- Dependencies ---

async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Get the current user from JWT token. Returns None if no token or invalid."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = db.query(User).filter(User.id == int(user_id)).first()
    return user


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Get the current user from JWT token. Raises 401 if not authenticated."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def require_role(*allowed_roles: str):
    """
    FastAPI dependency that checks if the current user has one of the allowed roles.

    Usage:
        @router.post("/admin-only", dependencies=[Depends(require_role("Admin", "Project Manager"))])
        def admin_endpoint(): ...
    """
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ):
        user_role = canonical_role(current_user.role).lower()
        if user_role not in [r.lower() for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' does not have permission. Required: {', '.join(allowed_roles)}",
            )
        return current_user
    return role_checker


# --- Role Definitions ---
ROLES = {
    "Admin": ["view_project", "edit_material", "approve", "verify", "manage_users", "manage_project", "admin"],
    "Project Manager": ["view_project", "edit_material", "approve", "verify", "manage_project"],
    "QA Auditor": ["view_project", "verify", "approve"],
    "Site Engineer": ["view_project", "edit_material", "verify"],
    "Evidence Operator": ["view_project", "verify"],
    "Viewer": ["view_project"],
}

# Seeded/job-title roles mapped to the canonical RBAC roles above (keys lowercase).
ROLE_ALIASES = {
    "qa inspector": "QA Auditor",
    "quality manager": "QA Auditor",
    "testing engineer": "QA Auditor",
    "compliance engineer": "QA Auditor",
    "site inspector": "Site Engineer",
    "structural engineer": "Site Engineer",
    "project engineer": "Site Engineer",
    "site operator": "Evidence Operator",
    "store keeper": "Viewer",
    "consultant engineer": "Viewer",
    "procurement lead": "Viewer",
    "architect consultant": "Viewer",
}

def canonical_role(role: str | None) -> str:
    """Resolve any stored role name to its canonical RBAC role."""
    name = (role or "").strip()
    for known in ROLES:
        if known.lower() == name.lower():
            return known
    return ROLE_ALIASES.get(name.lower(), "Viewer")

def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLES.get(canonical_role(role), [])
