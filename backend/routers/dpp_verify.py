"""
Verifiable Digital Product Passport — API (issue + verify)
==========================================================

The headline differentiator. Conventional platforms verify a QR by looking it up
in their database ("trust our server"). Here a passport is signed with a PERSISTENT
Ed25519 key, the signature is stored at issuance, and verification re-checks the
CURRENT material data against that stored signature — so it is genuinely
tamper-evident and checkable by anyone, even offline.

Security model:
  • Private key is persistent (dpp_keystore) — env secret in prod, file in dev.
  • Trust registry is a DATABASE table (TrustedIssuer) — the demo stand-in for an
    EU/GS1/eIDAS accredited registry. A signature is AUTHENTIC only if its public
    key is registered there.
  • Only immutable IDENTITY fields are signed, so legitimate status changes don't
    look like tampering — but altering batch/supplier/quantity DOES.

Routes:
  POST /api/dpp/verify-material  (PUBLIC) -> issue-if-needed + verify one material
  POST /api/dpp/verify           (PUBLIC) -> verify a full passport credential
  POST /api/dpp/issue            (auth)   -> (re)issue + store a signed passport
  GET  /api/dpp/registry         (PUBLIC) -> list accredited issuers
"""

from __future__ import annotations

import io
import json
import os
from datetime import datetime

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from dpp_crypto import sign_passport, verify_passport
from dpp_keystore import get_issuer, key_fingerprint
from models import Certificate, Material, ProductPassport, TrustedIssuer, User
from schemas import DPPVerifyMaterialRequest, DPPIssueRequest, DPPVerifyCredentialRequest

router = APIRouter()


# --- Trust registry helpers (DB-backed) ---------------------------------------

def _ensure_issuer_registered(db: Session) -> dict:
    """Make sure the demo issuer's current public key is in the trust registry."""
    issuer = get_issuer()
    row = db.query(TrustedIssuer).filter(TrustedIssuer.issuer_id == issuer["issuer_id"]).first()
    if not row:
        row = TrustedIssuer(
            issuer_id=issuer["issuer_id"],
            name=issuer["issuer_name"],
            public_key=issuer["public_hex"],
            accredited_at=datetime.utcnow(),
            status="active",
        )
        db.add(row)
        db.commit()
    elif row.public_key != issuer["public_hex"]:
        row.public_key = issuer["public_hex"]
        db.commit()
    return issuer


def _is_trusted(db: Session, issuer_id: str, public_hex: str) -> tuple[bool, str | None]:
    row = db.query(TrustedIssuer).filter(TrustedIssuer.issuer_id == issuer_id).first()
    if row and row.status == "active" and row.public_key == public_hex:
        return True, row.name
    return False, (row.name if row else None)


# --- Canonical passport (only IMMUTABLE identity fields are signed) -----------

def _identity_passport(material: Material, certificates: list[Certificate]) -> dict:
    return {
        "passport_id": f"DPP-{material.qr_code}",
        "product": material.name,
        "batch": material.batch_number,
        "supplier": material.supplier,
        "quantity": f"{material.quantity} {material.unit}",
        "certificates": sorted(c.certificate_name for c in certificates),
    }


def _load_meta(passport: ProductPassport) -> dict:
    try:
        return json.loads(passport.metadata_json) if passport.metadata_json else {}
    except Exception:
        return {}


# --- Endpoints ----------------------------------------------------------------

@router.post("/verify-material")
def verify_material_passport(payload: DPPVerifyMaterialRequest, db: Session = Depends(get_db)):
    """PUBLIC. Verify one material's passport signature against its current data.
    Issues + stores a signature on first call so the demo always has something to verify."""
    material_id = payload.material_id

    material = db.query(Material).filter(Material.id == int(material_id)).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    issuer = _ensure_issuer_registered(db)
    certificates = db.query(Certificate).filter(Certificate.material_id == material.id).all()
    identity = _identity_passport(material, certificates)

    passport = db.query(ProductPassport).filter(ProductPassport.material_id == material.id).first()
    if not passport:
        passport = ProductPassport(
            material_id=material.id, passport_number=f"PP-{material.project_id}-{material.id}",
            passport_id=f"PP-{material.project_id}-{material.id}", compliance_score=85,
            carbon_score=1.2, status="active", metadata_json="{}",
        )
        db.add(passport)
        db.flush()

    meta = _load_meta(passport)
    freshly_issued = False

    if not meta.get("dpp_signature"):
        # First verification: issue + store the signature (tamper baseline).
        meta["dpp_signature"] = sign_passport(identity, issuer["private_hex"])
        meta["dpp_issuer_id"] = issuer["issuer_id"]
        meta["dpp_public_key"] = issuer["public_hex"]
        meta["dpp_issued_at"] = datetime.utcnow().isoformat()
        passport.metadata_json = json.dumps(meta)
        db.commit()
        freshly_issued = True

    stored_sig = meta["dpp_signature"]
    stored_pub = meta["dpp_public_key"]
    issuer_id = meta["dpp_issuer_id"]

    signature_ok = verify_passport(identity, stored_sig, stored_pub)
    trusted, issuer_name = _is_trusted(db, issuer_id, stored_pub)

    if not signature_ok:
        verdict = "TAMPERED"
        reason = "The material's identity data does not match its signed passport — it was altered after issuance."
    elif not trusted:
        verdict = "UNTRUSTED_ISSUER"
        reason = "Signature is valid, but the issuer is not in the accredited trust registry."
    else:
        verdict = "AUTHENTIC"
        reason = f"Signature valid and issued by accredited issuer '{issuer_name}'. Not tampered."

    return {
        "verdict": verdict,
        "reason": reason,
        "signature_ok": signature_ok,
        "issuer_trusted": trusted,
        "issuer_name": issuer_name or issuer["issuer_name"],
        "issuer_id": issuer_id,
        "key_fingerprint": key_fingerprint(stored_pub),
        "signature_preview": f"{stored_sig[:24]}…",
        "algorithm": "Ed25519",
        "issued_at": meta.get("dpp_issued_at"),
        "freshly_issued": freshly_issued,
        "signed_fields": identity,
    }


@router.post("/verify")
def verify_signed_passport(vc: DPPVerifyCredentialRequest, db: Session = Depends(get_db)):
    """PUBLIC — verify a full passport credential {credential, proof}. No login."""
    credential = vc.credential
    proof = vc.proof
    public_hex = proof.get("issuer_public_key", "")
    signature = proof.get("signature", "")
    issuer_id = credential.get("issuer_id", "")
    signature_ok = verify_passport(credential, signature, public_hex)
    trusted, issuer_name = _is_trusted(db, issuer_id, public_hex)
    verdict = "TAMPERED" if not signature_ok else ("UNTRUSTED_ISSUER" if not trusted else "AUTHENTIC")
    return {"verdict": verdict, "signature_ok": signature_ok, "issuer_trusted": trusted, "issuer_name": issuer_name}


@router.post("/issue")
def issue_signed_passport(payload: DPPIssueRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Re-issue + store a signed passport for a material (overwrites the stored signature)."""
    material_id = payload.material_id
    material = db.query(Material).filter(Material.id == int(material_id)).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    issuer = _ensure_issuer_registered(db)
    certificates = db.query(Certificate).filter(Certificate.material_id == material.id).all()
    identity = _identity_passport(material, certificates)
    passport = db.query(ProductPassport).filter(ProductPassport.material_id == material.id).first()
    if not passport:
        raise HTTPException(status_code=404, detail="Passport not found for material")

    meta = _load_meta(passport)
    meta["dpp_signature"] = sign_passport(identity, issuer["private_hex"])
    meta["dpp_issuer_id"] = issuer["issuer_id"]
    meta["dpp_public_key"] = issuer["public_hex"]
    meta["dpp_issued_at"] = datetime.utcnow().isoformat()
    passport.metadata_json = json.dumps(meta)
    db.commit()
    return {"status": "issued", "issuer": issuer["issuer_name"], "key_fingerprint": key_fingerprint(issuer["public_hex"]), "signed_fields": identity}


def _public_base_url() -> str:
    """Where the public verification page is served (the QR points here)."""
    return os.getenv("PUBLIC_VERIFY_BASE_URL", "https://constructask.vercel.app").rstrip("/")


@router.get("/qr/{material_id}.png")
def material_qr_png(material_id: int, db: Session = Depends(get_db)):
    """PUBLIC. A scannable QR PNG that opens the public verification page for this material.
    This is the physical label a site worker scans — it carries no trust itself; the
    authenticity is proven by the Ed25519 signature checked on the verify page."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    verify_url = f"{_public_base_url()}/?verify={material_id}"
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("/registry")
def list_trusted_issuers(db: Session = Depends(get_db)):
    """PUBLIC — the accredited trust registry (demo stand-in for EU/GS1/eIDAS)."""
    _ensure_issuer_registered(db)
    rows = db.query(TrustedIssuer).all()
    return [
        {"issuer_id": r.issuer_id, "name": r.name, "status": r.status,
         "key_fingerprint": key_fingerprint(r.public_key),
         "accredited_at": r.accredited_at.isoformat() if r.accredited_at else None}
        for r in rows
    ]
