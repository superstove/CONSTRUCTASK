# ConstructAsk

ConstructAsk is an AI-powered **construction project intelligence platform**. It answers one question for site and compliance teams:

> **"Can this material be safely released on this project today?"**

It combines live project data (materials, certificates, approvals, deliveries, QR scans) with an **AI assistant**, a **tamper-evident SHA-256 audit trail**, and **cryptographically verifiable Digital Product Passports (DPP)**.

## Key features

- **Project Intelligence** — readiness score, risks, root causes, supplier health, and a forecast, all computed from live records.
- **AI Evidence Assistant** — ask in plain English ("what should we fix first?", "is the project on track?"); answers come from project data only, with a free **Gemini** fallback for open-ended phrasing (scope-locked + prompt-injection protected).
- **Verifiable DPP** — each material passport is signed with **Ed25519** and checked against a trust registry. Tamper-evident and verifiable offline — not a database lookup.
- **QR verification** — camera scan, image upload, or manual entry → release decision (Approved / Hold / Blocked).
- **Hash-chained audit trail** — every action linked by SHA-256; altering a past record breaks the chain.
- **Auth** — JWT + role-based access control, plus optional **"Sign in with Google"** via Supabase.

## Structure

- `backend/` — FastAPI, SQLAlchemy, AI engine + intent detection, engines (readiness/risk/compliance/forecast/audit), DPP crypto, routers, seed data.
- `frontend/` — React 19 + Vite + TypeScript + Tailwind; Command Center, Project Intelligence, Compliance Hub, Audit Trail, Product Passports, Scan Log, Evidence Assistant.

## Run locally

**Backend** (port 8000):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # then fill in values (see below)
.\.venv\Scripts\python seed_data.py
.\.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

**Frontend** (port 5173):
```powershell
cd frontend
npm install
copy .env.example .env        # set VITE_API_BASE_URL=http://127.0.0.1:8000
npm run dev
```

Open `http://localhost:5173`. Use **"Continue with Demo Account"** (`demo@constructask.dev` / `demo1234`) or **Sign in with Google**.

## Configuration

See `backend/.env.example` and `frontend/.env.example`. Notable:
- `DATABASE_URL` — SQLite (dev) or Supabase/Postgres (prod).
- `JWT_SECRET_KEY` — **required in production** (`ENVIRONMENT=production` enforces it).
- `GEMINI_API_KEY` — free AI fallback (https://aistudio.google.com/apikey). Optional; the assistant works without it.
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` — for Google sign-in.

## Deployment

- **Backend → Render** (`render.yaml`): installs `requirements.txt`, seeds the DB, runs Uvicorn. Set env vars (`DATABASE_URL`, `JWT_SECRET_KEY`, `GEMINI_API_KEY`, `SUPABASE_*`, `CORS_ORIGINS`, `ENVIRONMENT=production`).
- **Frontend → Vercel** (`frontend/vercel.json`): set `VITE_API_BASE_URL` to the Render URL plus the `VITE_SUPABASE_*` vars, then deploy `frontend/` as the project root.

## Demo questions

- Which materials on NH66 Highway Slope Protection are not yet verified?
- Which approvals are overdue and what is the risk?
- What should the project manager fix first today?
- How is the audit trail protected from tampering?

## Notes

- AI is **assistive only** — it explains risk and recommends actions; humans make the release decision.
- Built with sample data only; it does not depend on any private product code.
