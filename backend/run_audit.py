import os
import urllib.request
import sqlite3
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

# We will connect to the DB (Supabase or SQLite)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

print("--- 1. DATABASE AUDIT ---")
tables = [
    "users", "projects", "materials", "deliveries", "approvals", 
    "compliance_certificates", "product_passports", "audit_trails", 
    "scan_logs", "qr_scans", "ai_queries", "conversation_sessions", 
    "conversation_messages"
]
db_results = {}
with engine.connect() as conn:
    for table in tables:
        try:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            db_results[table] = result
            print(f"{table}: {result} rows")
        except Exception as e:
            db_results[table] = "Error/Not Found"
            print(f"{table}: {db_results[table]}")

print("\n--- 12. AUTHENTICATION AUDIT ---")
try:
    response = urllib.request.urlopen("http://localhost:8000/api/projects")
    print(f"/api/projects status code: {response.getcode()}")
except urllib.error.HTTPError as e:
    print(f"/api/projects status code: {e.code}")
except Exception as e:
    print("Could not connect to API. Is it running?")

print("\n--- END OF SCRIPT ---")
