from dotenv import load_dotenv
load_dotenv()

import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine, ensure_demo_schema
from routers import approvals, audit, chat, compliance, materials, passports, projects, reports, users
from routers import auth as auth_router
from routers import dpp_verify
from routers import tds_extract
from middleware.logging_middleware import APILoggingMiddleware

# --- Logging setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# --- Database initialization ---
Base.metadata.create_all(bind=engine)
ensure_demo_schema()

# --- App ---
app = FastAPI(
    title="Construct Ask API",
    description="Construction Project Intelligence Platform — V3",
    version="3.0.0",
)

# --- Middleware ---
app.add_middleware(APILoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:3000,http://localhost:3000",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(reports.router, prefix="/api/projects", tags=["reports"])
app.include_router(materials.router, prefix="/api/materials", tags=["materials"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(passports.router, prefix="/api/passports", tags=["passports"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(dpp_verify.router, prefix="/api/dpp", tags=["verifiable-dpp"])
app.include_router(tds_extract.router, prefix="/api/tds", tags=["tds-converter"])


@app.get("/")
def health():
    return {
        "status": "Construct Ask API running",
        "version": "3.0.0",
        "platform": "Project Intelligence Platform",
    }
