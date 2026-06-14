import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy import inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

connect_args = {"check_same_thread": False} if DATABASE_URL and DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def ensure_demo_schema() -> None:
    """Add demo-critical columns when an older Supabase table already exists."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    dropped_any = False
    
    if "audit_trails" in tables:
        audit_columns = {column["name"] for column in inspector.get_columns("audit_trails")}
        expected_columns = {"project_id", "material_id", "result", "approval_id", "new_status", "performed_by_id", "hash", "previous_hash", "entity_type", "entity_id", "old_value", "new_value"}
        if not expected_columns.issubset(audit_columns):
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS audit_trails{cascade_clause}"))
            dropped_any = True

    if "qr_scans" in tables:
        scans_columns = inspector.get_columns("qr_scans")
        scanned_by_col = next((c for c in scans_columns if c["name"] == "scanned_by"), None)
        if scanned_by_col and not str(scanned_by_col["type"]).upper().startswith("INT"):
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS qr_scans{cascade_clause}"))
            dropped_any = True

    if "approvals" in tables:
        app_columns = inspector.get_columns("approvals")
        approver_col = next((c for c in app_columns if c["name"] == "approver_id"), None)
        if not approver_col or not str(approver_col["type"]).upper().startswith("INT"):
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS approvals{cascade_clause}"))
            dropped_any = True

    if "scan_logs" in tables:
        sl_columns = inspector.get_columns("scan_logs")
        scanned_by_col = next((c for c in sl_columns if c["name"] == "scanned_by_id"), None)
        if not scanned_by_col or not str(scanned_by_col["type"]).upper().startswith("INT"):
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS scan_logs{cascade_clause}"))
            dropped_any = True

    if "compliance_records" in tables:
        cr_columns = inspector.get_columns("compliance_records")
        verified_by_col = next((c for c in cr_columns if c["name"] == "verified_by_id"), None)
        if not verified_by_col or not str(verified_by_col["type"]).upper().startswith("INT"):
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS compliance_records{cascade_clause}"))
            dropped_any = True

    if "product_passports" in tables:
        passport_columns = {column["name"] for column in inspector.get_columns("product_passports")}
        if "project_id" not in passport_columns:
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS product_passports{cascade_clause}"))
            dropped_any = True

    if "ai_queries" in tables:
        aiq_columns = {column["name"] for column in inspector.get_columns("ai_queries")}
        if "intent" not in aiq_columns:
            cascade_clause = "" if engine.dialect.name == "sqlite" else " CASCADE"
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS ai_queries{cascade_clause}"))
            dropped_any = True

    if dropped_any:
        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

    statements: list[str] = []
    if "users" in tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "hashed_password" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN hashed_password VARCHAR")
        if "is_system" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE")

    if "materials" in tables:
        material_columns = {column["name"] for column in inspector.get_columns("materials")}
        if "category" not in material_columns:
            statements.append("ALTER TABLE materials ADD COLUMN IF NOT EXISTS category VARCHAR")



    if "compliance_certificates" in tables:
        cert_columns = {column["name"] for column in inspector.get_columns("compliance_certificates")}
        if "project_id" not in cert_columns:
            statements.append("ALTER TABLE compliance_certificates ADD COLUMN project_id INTEGER")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
