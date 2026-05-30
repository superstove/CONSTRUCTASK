import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import approvals, chat, compliance, materials, projects


Base.metadata.create_all(bind=engine)

app = FastAPI(title="ConstructAsk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3000,http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(materials.router, prefix="/api/materials", tags=["materials"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.get("/")
def health():
    return {"status": "ConstructAsk API running"}
