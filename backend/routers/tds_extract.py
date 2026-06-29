"""
TDS-to-JSON Extraction Router — Manual & Automatic DPP Conversion
=================================================================

Converts Technical Data Sheets into structured Digital Product Passport JSON.

Two workflows:
  1. Manual:  POST /api/tds/manual   — user submits extracted fields directly
  2. Auto:    POST /api/tds/extract   — upload PDF, system extracts text + AI maps fields
  3. Review:  POST /api/tds/approve   — approve reviewed DPP and save to database
  4. List:    GET  /api/tds/converted — list all converted DPP records

Workflow:
    TDS PDF → Text Extraction (PyMuPDF) → AI Field Extraction → JSON Schema Mapping
    → Unit Normalization → Validation → Human Review → Save DPP → Generate QR
"""

from __future__ import annotations

import io
import json
import os
import re
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Material, ProductPassport, User

router = APIRouter()


# ---------------------------------------------------------------------------
# Unit normalization
# ---------------------------------------------------------------------------

UNIT_MAP = {
    "kn/m": "kN/m", "kpa": "kPa", "mpa": "MPa", "mm": "mm", "m": "m",
    "cm": "cm", "kg": "kg", "g/m2": "g/m²", "g/m²": "g/m²",
    "g/cm3": "g/cm³", "g/cm³": "g/cm³",
    "kgco2e": "kgCO2e", "kgco2e/m2": "kgCO2e/m²",
    "°c": "°C", "deg c": "°C", "celsius": "°C",
    "%": "%", "percent": "%", "hours": "hours", "hrs": "hours",
    "minutes": "minutes", "min": "minutes", "months": "months",
    "years": "years", "µm": "µm", "micron": "µm",
    "nm": "Nm", "litres": "litres", "liters": "litres",
    "units": "units", "tonnes": "tonnes",
    "s-1": "s⁻¹", "m2/s": "m²/s", "ph": "pH",
}


def normalize_unit(raw: str) -> str:
    return UNIT_MAP.get(raw.lower().strip(), raw.strip())


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PyMuPDF (fitz) is not installed. Run: pip install PyMuPDF",
        )

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    doc.close()
    return "\n".join(text_parts)


# ---------------------------------------------------------------------------
# AI-based field extraction
# ---------------------------------------------------------------------------

def _build_extraction_prompt(text: str) -> str:
    return f"""You are a construction materials data extraction assistant.

Extract product information from the following Technical Data Sheet text and return ONLY valid JSON (no markdown, no explanation).

Use this exact JSON structure:
{{
  "product_name": "...",
  "manufacturer": "...",
  "category": "...",
  "description": "...",
  "technical_properties": {{
    "property_name": {{ "value": ..., "unit": "...", "test_method": "..." }}
  }},
  "working_properties": {{
    "property_name": {{ "value": ..., "unit": "..." }}
  }},
  "applications": ["..."],
  "suitable_for": ["..."],
  "standards_compliance": ["..."],
  "packaging": "...",
  "storage": "...",
  "shelf_life_months": 12
}}

Rules:
- Extract all numerical values with their units
- Normalize units (MPa, kN/m, kg/m2, etc.)
- Include test method references where mentioned (ISO, EN, ASTM, BIS)
- If a value is not found, omit the field
- Return ONLY the JSON object, nothing else

TDS Text:
{text[:8000]}"""


def ai_extract_fields(text: str) -> dict:
    if os.getenv("TDS_OPENAI_API_KEY"):
        return _extract_with_openai(text, os.getenv("TDS_OPENAI_API_KEY", ""))
    elif os.getenv("TDS_GEMINI_API_KEY"):
        return _extract_with_gemini(text, os.getenv("TDS_GEMINI_API_KEY", ""))
    else:
        return _extract_with_regex(text)


def _extract_with_openai(text: str, api_key: str) -> dict:
    try:
        import openai
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": _build_extraction_prompt(text)}],
            temperature=0.1,
            max_tokens=4000,
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        return {
            "_extraction_error": _friendly_ai_error(e, "OpenAI"),
            **_extract_with_regex(text),
        }


def _extract_with_gemini(text: str, api_key: str) -> dict:
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model_name = os.getenv("TDS_GEMINI_MODEL", "gemini-2.5-flash")
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(_build_extraction_prompt(text))
        raw = response.text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        return {
            "_extraction_error": _friendly_ai_error(e, "Gemini"),
            **_extract_with_regex(text),
        }


def _friendly_ai_error(error: Exception, provider: str) -> str:
    """Return a safe UI message without echoing API keys or provider internals."""
    message = str(error).lower()
    if "invalid_api_key" in message or "incorrect api key" in message or "401" in message:
        return f"{provider} API key is invalid. Used regex fallback extraction; update the backend API key for full AI extraction."
    if "quota" in message or "rate limit" in message or "429" in message:
        return f"{provider} extraction quota/rate limit was reached. Used regex fallback extraction."
    if "not found" in message or "not supported" in message or "404" in message:
        return f"{provider} model is unavailable for this API key. Set TDS_GEMINI_MODEL to an available model such as gemini-2.5-flash."
    return f"{provider} extraction failed. Used regex fallback extraction."


def _infer_category(text: str) -> str:
    lowered = text.lower()
    category_rules = [
        ("Tile Adhesive", ["tile adhesive", "adhesive mortar", "thin bed adhesive", "c2te", "c2tes1"]),
        ("Block Jointing Mortar", ["block jointing", "fixoblock", "aac block", "block adhesive"]),
        ("Waterproofing", ["waterproofing", "water proofing", "membrane"]),
        ("Grout", ["grout", "grouting"]),
        ("Concrete Admixture", ["admixture", "plasticizer", "superplasticizer"]),
        ("Construction Material", ["technical data sheet", "tds"]),
    ]
    for category, needles in category_rules:
        if any(needle in lowered for needle in needles):
            return category
    return "Construction Material"


def _infer_manufacturer(text: str, product_name: str) -> str:
    candidates = {
        "UltraTech": ["ultratech", "fixoblock"],
        "LATICRETE": ["laticrete", "super flex"],
        "Maccaferri": ["maccaferri"],
        "Sika": ["sika"],
        "Fosroc": ["fosroc"],
        "MYK LATICRETE": ["myk laticrete"],
    }
    combined = f"{product_name}\n{text}".lower()
    for manufacturer, needles in candidates.items():
        if any(needle in combined for needle in needles):
            return manufacturer
    return "Unknown Manufacturer"


def _extract_with_regex(text: str) -> dict:
    """Fallback: basic regex extraction when no AI API key is configured."""
    extracted: dict[str, Any] = {}
    lines = text.split("\n")

    for line in lines[:5]:
        line = line.strip()
        if line and len(line) > 3 and not line.startswith(("http", "www", "page", "Page")):
            extracted.setdefault("product_name", line)
            break

    product_name = extracted.get("product_name", "Unknown Product")
    extracted["manufacturer"] = _infer_manufacturer(text, product_name)
    extracted["category"] = _infer_category(text)

    standards = []
    tech_props = {}
    for line in lines:
        for pattern in [r"(ISO\s*\d+[\w\-]*)", r"(EN\s*\d+[\w\-]*)", r"(ASTM\s*[A-Z]\d+[\w\-]*)", r"(BIS\s*IS\s*\d+[\w\-]*)"]:
            for match in re.findall(pattern, line, re.IGNORECASE):
                if match not in standards:
                    standards.append(match)

        kv = re.match(r"^([A-Za-z\s\-/]+)\s*[:=]\s*([\d.,]+)\s*([A-Za-z/%°²³⁻¹]+.*)$", line.strip())
        if kv:
            key = re.sub(r"[^a-z0-9]+", "_", kv.group(1).lower()).strip("_")
            try:
                val = float(kv.group(2).replace(",", ""))
                if val == int(val):
                    val = int(val)
            except ValueError:
                val = kv.group(2)
            tech_props[key] = {"value": val, "unit": normalize_unit(kv.group(3).strip())}

    if standards:
        extracted["standards_compliance"] = standards
    if tech_props:
        extracted["technical_properties"] = tech_props

    extracted["_extraction_method"] = "regex_fallback"
    return extracted


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_dpp(dpp: dict) -> list[str]:
    warnings = []
    required = ["product_name", "manufacturer", "category", "technical_properties", "standards_compliance"]
    for field in required:
        if not dpp.get(field):
            warnings.append(f"Missing or empty: {field}")

    if isinstance(dpp.get("technical_properties"), dict) and len(dpp["technical_properties"]) == 0:
        warnings.append("No technical properties extracted")

    if isinstance(dpp.get("standards_compliance"), list) and len(dpp["standards_compliance"]) == 0:
        warnings.append("No standards compliance entries found")

    return warnings


# ---------------------------------------------------------------------------
# DPP JSON builder
# ---------------------------------------------------------------------------

def build_full_dpp(fields: dict, batch_number: str = "", origin_country: str = "India") -> dict:
    product_name = fields.get("product_name", "Unknown Product")
    slug = re.sub(r"[^A-Z0-9]", "-", product_name.upper())[:20].strip("-")
    passport_id = f"DPP-{slug}-{date.today().year}"

    return {
        "dpp_version": "1.0",
        "passport_id": passport_id,
        "product_name": product_name,
        "manufacturer": fields.get("manufacturer", ""),
        "category": fields.get("category", ""),
        "description": fields.get("description", ""),
        "technical_properties": fields.get("technical_properties", {}),
        "working_properties": fields.get("working_properties", {}),
        "application": {
            "primary_use": fields.get("applications", []),
            "suitable_for": fields.get("suitable_for", []),
        },
        "standards_compliance": fields.get("standards_compliance", []),
        "packaging_and_storage": {
            "packaging": fields.get("packaging", ""),
            "storage": fields.get("storage", ""),
            "shelf_life": {
                "value": fields.get("shelf_life_months", 12),
                "unit": "months",
                "condition": "unopened, original packaging",
            },
        },
        "sustainability": {
            "recycled_content_pct": fields.get("recycled_content_pct", 0),
            "carbon_footprint": {
                "value": fields.get("carbon_footprint_value", 0),
                "unit": fields.get("carbon_footprint_unit", "kgCO2e/unit"),
            },
            "recyclable": fields.get("recyclable", True),
        },
        "batch_info": {
            "batch_number": batch_number or f"BATCH-{date.today().strftime('%Y%m%d')}",
            "production_date": str(date.today()),
            "origin_country": origin_country,
            "factory_location": fields.get("factory_location", ""),
        },
        "qr_verification": {
            "qr_code": f"QR-{slug}-{date.today().year}",
            "verification_url": f"{os.getenv('PUBLIC_VERIFY_BASE_URL', 'https://constructask.vercel.app')}/verify/{passport_id}",
            "scan_type": "check_specification",
        },
        "source_document": {
            "type": "Technical Data Sheet",
            "document_title": fields.get("tds_title", f"{product_name} - Technical Data Sheet"),
            "revision": fields.get("tds_revision", ""),
            "date_issued": fields.get("tds_date", ""),
            "conversion_method": fields.get("_extraction_method", "manual"),
            "converted_by": fields.get("converted_by", "ConstructAsk System"),
            "conversion_date": str(date.today()),
        },
    }


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ManualTDSInput(BaseModel):
    product_name: str
    manufacturer: str
    category: str
    description: str = ""
    technical_properties: dict = Field(default_factory=dict)
    working_properties: dict = Field(default_factory=dict)
    applications: list[str] = Field(default_factory=list)
    suitable_for: list[str] = Field(default_factory=list)
    standards_compliance: list[str] = Field(default_factory=list)
    batch_number: str = ""
    origin_country: str = "India"
    factory_location: str = ""
    packaging: str = ""
    storage: str = ""
    shelf_life_months: int = 12
    recycled_content_pct: int = 0
    carbon_footprint_value: float = 0.0
    carbon_footprint_unit: str = "kgCO2e/unit"
    tds_title: str = ""
    tds_revision: str = ""
    tds_date: str = ""


class TDSApproveInput(BaseModel):
    dpp_json: dict
    project_id: int | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/manual")
def manual_convert(
    payload: ManualTDSInput,
    current_user: User = Depends(get_current_user),
):
    """Manual TDS-to-JSON conversion. User submits extracted fields directly."""
    fields = payload.model_dump()
    fields["converted_by"] = current_user.name
    fields["_extraction_method"] = "manual"
    dpp = build_full_dpp(fields, payload.batch_number, payload.origin_country)
    warnings = validate_dpp(dpp)

    return {
        "status": "review_required",
        "conversion_method": "manual",
        "warnings": warnings,
        "extracted_dpp": dpp,
    }


@router.post("/extract")
async def auto_extract(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Automatic TDS-to-JSON conversion. Upload PDF, system extracts and maps fields."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    pdf_bytes = await file.read()
    raw_text = extract_text_from_pdf(pdf_bytes)

    if len(raw_text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Could not extract sufficient text from PDF. The file may be a scanned image - OCR support requires Tesseract.",
        )

    extracted_fields = ai_extract_fields(raw_text)
    extracted_fields["converted_by"] = current_user.name

    extraction_method = extracted_fields.pop("_extraction_method", "ai")
    extraction_error = extracted_fields.pop("_extraction_error", None)
    extracted_fields["_extraction_method"] = extraction_method

    dpp = build_full_dpp(
        extracted_fields,
        extracted_fields.get("batch_number", ""),
        extracted_fields.get("origin_country", "India"),
    )
    warnings = validate_dpp(dpp)

    if extraction_error:
        warnings.append(extraction_error)

    return {
        "status": "review_required",
        "conversion_method": extraction_method,
        "raw_text_preview": raw_text[:2000],
        "raw_text_length": len(raw_text),
        "warnings": warnings,
        "extracted_dpp": dpp,
    }


@router.post("/approve")
def approve_dpp(
    payload: TDSApproveInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a reviewed DPP JSON and save it as a material + passport in the database."""
    dpp = payload.dpp_json

    product_name = dpp.get("product_name", "Unknown")
    manufacturer = dpp.get("manufacturer", "Unknown")
    batch = dpp.get("batch_info", {}).get("batch_number", "")
    passport_id = dpp.get("passport_id", "")
    qr_code = dpp.get("qr_verification", {}).get("qr_code", "")

    project_id = payload.project_id
    if not project_id:
        from models import Project
        project = db.query(Project).first()
        if project:
            project_id = project.id
        else:
            raise HTTPException(status_code=400, detail="No project found. Create a project first.")

    material = Material(
        project_id=project_id,
        name=product_name,
        supplier=manufacturer,
        batch_number=batch,
        qr_code=qr_code or f"QR-TDS-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        status="pending",
        category=dpp.get("category", "general"),
        quantity=1,
        unit="unit",
    )
    db.add(material)
    db.flush()

    sustainability = dpp.get("sustainability", {})
    carbon = sustainability.get("carbon_footprint", {})

    passport = ProductPassport(
        material_id=material.id,
        passport_number=passport_id,
        passport_id=passport_id,
        project_id=project_id,
        supplier=manufacturer,
        manufacturer=manufacturer,
        origin_country=dpp.get("batch_info", {}).get("origin_country", ""),
        carbon_footprint=carbon.get("value", 0),
        compliance_score=85,
        sustainability_score=75,
        carbon_score=carbon.get("value", 0),
        status="active",
        metadata_json=json.dumps({
            "dpp_json": dpp,
            "source": "tds_converter",
            "converted_at": datetime.utcnow().isoformat(),
            "converted_by": current_user.name,
        }),
        created_at=datetime.utcnow(),
    )
    db.add(passport)
    db.commit()

    return {
        "status": "approved",
        "material_id": material.id,
        "passport_id": passport_id,
        "passport_db_id": passport.id,
        "message": f"DPP for '{product_name}' saved. Material and passport created.",
    }


@router.get("/converted")
def list_converted(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all DPP records created via TDS conversion."""
    passports = (
        db.query(ProductPassport)
        .filter(ProductPassport.metadata_json.contains('"tds_converter"'))
        .all()
    )
    results = []
    for p in passports:
        try:
            meta = json.loads(p.metadata_json) if p.metadata_json else {}
        except Exception:
            meta = {}
        dpp = meta.get("dpp_json", {})
        results.append({
            "id": p.id,
            "passport_id": p.passport_id,
            "product_name": dpp.get("product_name", p.passport_number),
            "manufacturer": dpp.get("manufacturer", p.manufacturer),
            "category": dpp.get("category", ""),
            "conversion_method": dpp.get("source_document", {}).get("conversion_method", "unknown"),
            "converted_by": meta.get("converted_by", ""),
            "converted_at": meta.get("converted_at", ""),
            "standards_count": len(dpp.get("standards_compliance", [])),
            "properties_count": len(dpp.get("technical_properties", {})),
        })
    return results


@router.get("/workflow")
def get_workflow_info():
    """Return the TDS conversion workflow documentation (public, no auth)."""
    return {
        "manual_workflow": {
            "title": "Manual TDS-to-JSON Conversion",
            "steps": [
                "Read the Technical Data Sheet (PDF/document)",
                "Identify important engineering fields (strength, density, pot life, etc.)",
                "Extract values with their units",
                "Enter data into the DPP JSON schema",
                "Normalize units (MPa, kN/m, g/m², etc.)",
                "Review correctness of all values",
                "Save as structured DPP JSON",
                "Generate QR code for public DPP access",
            ],
            "advantages": ["Full control over extracted data", "Best accuracy for complex TDS", "Good for learning the schema"],
            "time_estimate": "20-60 minutes per TDS",
        },
        "automatic_workflow": {
            "title": "Automatic TDS-to-JSON Conversion (AI/OCR)",
            "steps": [
                "Upload TDS PDF to the system",
                "Extract text from PDF (PyMuPDF / OCR for scanned documents)",
                "AI model identifies product fields and engineering parameters",
                "Map extracted fields into DPP JSON schema",
                "Normalize units automatically",
                "Validate for missing or suspicious values",
                "Human review and correction of extracted data",
                "Approve and save final DPP JSON",
                "Generate QR code for public DPP access",
            ],
            "advantages": ["Much faster (1-5 minutes)", "Scalable to many products", "Consistent extraction"],
            "important_note": "Human review is mandatory because construction material values affect safety and compliance",
            "time_estimate": "1-5 minutes per TDS (plus review time)",
        },
        "architecture": {
            "frontend": "React + TypeScript (upload, review, approve)",
            "backend": "FastAPI (extraction API, validation, database)",
            "pdf_parser": "PyMuPDF (text-based PDFs)",
            "ocr": "Tesseract OCR (scanned PDFs - optional)",
            "ai_extraction": "GPT/Gemini (field identification and mapping)",
            "validation": "Pydantic + custom schema validation",
            "database": "PostgreSQL / Supabase",
            "qr_generation": "qrcode Python package",
        },
        "api_endpoints": {
            "POST /api/tds/manual": "Manual field entry and conversion",
            "POST /api/tds/extract": "Upload PDF for automatic extraction",
            "POST /api/tds/approve": "Approve reviewed DPP and save to database",
            "GET /api/tds/converted": "List all converted DPP records",
            "GET /api/tds/workflow": "This workflow documentation",
        },
    }
