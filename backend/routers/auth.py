"""
Authentication Router — Stage 10

Endpoints:
    POST /api/auth/signup       — Register new user
    POST /api/auth/login        — Login and get JWT token
    POST /api/auth/google-sync  — Exchange a Supabase (Google) session for an app token
    GET  /api/auth/me           — Get current user profile
"""

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from models import User

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")


router = APIRouter()


# --- Schemas ---

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Viewer"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    role: str


class UserProfileOut(BaseModel):
    id: int
    name: str
    email: str
    role: str


# --- Endpoints ---

@router.post("/signup", response_model=TokenResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """Register a new user and return a JWT token."""
    # Check if email exists
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        name=body.name,
        email=body.email,
        role=body.role,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Login with email/password and return a JWT token."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


class GoogleSyncRequest(BaseModel):
    access_token: str


@router.post("/google-sync", response_model=TokenResponse)
def google_sync(body: GoogleSyncRequest, db: Session = Depends(get_db)):
    """Verify a Supabase (Google sign-in) session server-side, upsert the user,
    and return this app's own JWT so the existing RBAC keeps working."""
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on the server")

    # Ask Supabase who this token belongs to — server-side validation,
    # so a forged token can never get in.
    try:
        response = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {body.access_token}",
                "apikey": SUPABASE_PUBLISHABLE_KEY,
            },
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the authentication service")

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google session",
        )

    info = response.json()
    email = info.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account has no email")

    metadata = info.get("user_metadata") or {}
    name = metadata.get("full_name") or metadata.get("name") or email.split("@")[0].replace(".", " ").title()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # First Google sign-in: create the account with the safest role.
        user = User(name=name, email=email, role="Viewer", hashed_password=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.get("/me", response_model=UserProfileOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserProfileOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
    )
