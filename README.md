# ConstructAsk

ConstructAsk is an AI assistant that lets construction project teams ask plain English questions across material verification, approval workflows, compliance certificates, delivery records, and QR scan history.

This standalone demo connects a React interface to a FastAPI backend with local construction data, SQLAlchemy retrieval, computed project risk, an evidence assistant, and an OpenAI-ready answer engine. It is intentionally built with sample data only and does not clone or depend on any private product code.

## Structure

- `backend/` - FastAPI API, SQLAlchemy models, seed data, computed risk helpers, evidence endpoints, activity timeline, retrieval, and chat logic
- `frontend/` - React/Vite app with Dashboard, Evidence Assistant, Materials, Approvals, Compliance, and Add Project pages

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python seed_data.py
.\.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

Set `OPENAI_API_KEY` to use the live OpenAI API. Without a key, ConstructAsk uses a deterministic demo answer engine so the three showcase questions still work.

## Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Then open the Vite URL, usually `http://127.0.0.1:5173`. If that port is busy, Vite may use another port such as `http://127.0.0.1:5174`.

## Deployment

Backend deployment is prepared with `render.yaml`. The Render service runs the FastAPI backend from `backend/`, installs `requirements.txt`, reseeds the demo database, and starts Uvicorn.

Frontend deployment is prepared with `frontend/vercel.json`. Set this Vercel environment variable after the backend is live:

```text
VITE_API_URL=https://your-render-api-url.onrender.com
```

Then deploy `frontend/` as the Vercel project root.

## Must-Work Demo Questions

- Which materials on NH66 Highway Slope Protection are not yet verified?
- Which approvals are overdue and what is the risk?
- What should the project manager fix first today?
- Generate an executive brief for the NH66 Highway Slope Protection project.

## Product Notes

- AI is assistive only: it explains risk and recommends next actions, but humans still decide.
- Evidence Assistant responses show compact proof chips, data sources, and confidence.
- Dashboard risk is computed from current dates, certificate expiry, delivery delay, approvals, material status, and QR evidence.
- Dashboard includes workflow dependency, audit timeline, supplier risk, evidence drawer, and executive brief sections.
