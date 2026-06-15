<div align="center">
  <h1>🏗️ CONSTRUCTASK</h1>
  
  <h3>Construction Project Intelligence & Compliance Platform</h3>

  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-Bundler-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
</div>

<br/>

<div align="center">
  <img src="cover.png" alt="ConstructAsk Dashboard" width="100%" />
</div>

<br/>

ConstructAsk is an enterprise-grade compliance and supply-chain intelligence platform built for modern construction projects. It replaces manual paperwork and scattered emails with **Cryptographically Verifiable Digital Product Passports (DPP)**, providing a tamper-proof, real-time single source of truth for materials from the factory floor to final installation.

<div align="center">
  <br />
  <img src="demo.gif" alt="ConstructAsk Platform Demo" width="100%" />
  <br />
</div>

---

---

## ✨ Key Features

*   **🔒 Cryptographically Verifiable DPPs**: Every material gets a Digital Product Passport signed with Ed25519 keys. Physical QR codes link directly to these immutable records.
*   **🔗 Hash-Chained Audit Trails**: All state changes (manufacturing, certification, delivery, installation, auditing) are cryptographically chained. If one record is altered, the entire chain invalidates—ensuring total data integrity.
*   **📱 Field-Ready QR Scanning**: Site engineers can instantly verify materials on-site using the built-in scanner, checking compliance, expiration dates, and installation readiness.
*   **🤖 AI Evidence Assistant**: Integrated with Gemini/OpenAI to answer complex compliance queries, summarize supplier health, and predict project risks based on real-time data.
*   **📊 Project Intelligence Dashboard**: High-level views of supplier reliability, delayed deliveries, expiring certificates, and critical path blockers.
*   **📑 Automated Enterprise Reporting**: Generate comprehensive, styled PDF reports of compliance matrices and audit logs using ReportLab.

---

## 🛠️ Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Core Framework** | FastAPI, Python 3.11 | High-performance async REST API. |
| **Frontend** | React 19, TypeScript, Vite | Lightning-fast SPA with modern UI/UX. |
| **Styling & UI** | Tailwind CSS v4, Framer Motion | Premium micro-animations and responsive design. |
| **Database** | SQLite / PostgreSQL | State persistence and relational data mapping. |
| **Cryptography** | Ed25519, SHA-256 | DPP signatures and immutable hash-chained audit ledgers. |
| **Generative AI** | Google Gemini / OpenAI | Evidence compliance parsing and risk analysis. |
| **Reporting** | ReportLab | Enterprise PDF compliance matrix generation. |

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph Client [Client Tier]
        direction LR
        UI["🖥️ Web Dashboard React/Vite"]
        Scanner["📱 Field QR Scanner"]
    end

    subgraph AppServer [Application Tier - FastAPI]
        direction TB
        API["⚙️ REST API Endpoints"]
        Crypto["🔐 Ed25519 Signature Engine"]
        Ledger["⛓️ Hash-Chained Audit Ledger"]
        PDF["📑 PDF Report Generator"]
    end

    subgraph Data [Data and Intelligence Tier]
        direction LR
        DB[("🗄️ Relational DB SQLAlchemy")]
        AI["🧠 AI Engine LLM"]
    end

    %% Client Interactions
    UI <-->|"REST JSON"| API
    Scanner -->|"Verification Request"| API

    %% Internal API Routing
    API <-->|"Sign and Verify DPP"| Crypto
    API <-->|"Validate State Integrity"| Ledger
    API -->|"Export Compliance"| PDF

    %% Data Connections
    API <-->|"Read and Write Records"| DB
    API <-->|"Analyze Supplier Risk"| AI

    %% Styling
    style Client fill:transparent,stroke:#3b82f6,stroke-width:2px,stroke-dasharray: 5 5
    style AppServer fill:transparent,stroke:#10b981,stroke-width:2px,stroke-dasharray: 5 5
    style Data fill:transparent,stroke:#a855f7,stroke-width:2px,stroke-dasharray: 5 5
```

---

## 🚀 Getting Started (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/superstove/CONSTRUCTASK.git
cd constructask
```

### 2. Backend Setup
```bash
cd backend

# Create a virtual environment and activate it
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY if you want AI features

# Start the FastAPI server
uvicorn main:app --reload
```
The API will be available at `http://localhost:8000` (Docs at `http://localhost:8000/docs`).

### 3. Frontend Setup
Open a new terminal window:
```bash
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
The application will be available at `http://localhost:5173`.

---

## 🤝 Architecture Notes
This project was built with a strong focus on **data integrity** and **premium UI/UX**. The cryptographic chaining mechanism ensures that once a material is marked as "Failed QA" or "Installed", that record cannot be retroactively edited without breaking the verification hash, providing true accountability in construction supply chains.

---

*Engineered by Abhijith AK for Anton Solutions.*
