"""
ConstructAsk Enterprise Intelligence Report (PDF)
=================================================

Replaces the old jsPDF report with a proper executive-grade PDF:
  Cover           — branded header, project meta, CONFIDENTIAL badge, QR verification
  Exec Dashboard  — 5 KPI cards + executive summary + key risks + actions + outcome
  Material Intel  — material table (status / risk / passport)
  Product Passport — top passports with QR, supplier, batch, scores
  Audit Trail     — last events as a timeline + SHA-256 chain status
  AI Executive    — root cause, predicted impact (7/14/30 d), recommended priorities

Design follows the audit brief: navy header, KPI cards, color-coded risk,
generous whitespace, executive-first hierarchy.
"""

from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Iterable

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas


# ── Brand palette ──────────────────────────────────────────────────────────────
NAVY = colors.HexColor("#0B132B")
INK = colors.HexColor("#0F172A")
GRAY = colors.HexColor("#64748B")
MUTED = colors.HexColor("#94A3B8")
LINE = colors.HexColor("#E2E8F0")
BG_SOFT = colors.HexColor("#F8FAFC")
WHITE = colors.white
GREEN = colors.HexColor("#10B981")
AMBER = colors.HexColor("#F59E0B")
RED = colors.HexColor("#EF4444")

PAGE_W, PAGE_H = A4  # 595.27 × 841.89 pt
MARGIN = 48


# ── Configurable branding (matches the "Branding" idea: brand colour + logo) ────
def _brand_accent() -> colors.Color:
    """Cover accent colour. Override per-deployment with BRAND_COLOR (hex)."""
    raw = (os.getenv("BRAND_COLOR") or "").strip()
    if raw:
        try:
            return colors.HexColor(raw if raw.startswith("#") else f"#{raw}")
        except Exception:
            pass
    return RED


def _brand_logo_path() -> str | None:
    """Optional logo drawn on the cover. Set BRAND_LOGO_PATH to a PNG/JPG file."""
    p = (os.getenv("BRAND_LOGO_PATH") or "").strip()
    return p if p and os.path.exists(p) else None


def _tone_color(label: str | None) -> colors.Color:
    s = (label or "").lower()
    if any(t in s for t in ("high", "critical", "block", "fail", "expired", "red")):
        return RED
    if any(t in s for t in ("medium", "warn", "hold", "expiring", "delay", "overdue", "amber")):
        return AMBER
    return GREEN


def _qr_image(payload: str, size_px: int = 320):
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size_px, size_px))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


# ── Drawing helpers ────────────────────────────────────────────────────────────

def _page_chrome(c: pdf_canvas.Canvas):
    """Thin navy accent stripe on the left margin — premium minimal cue."""
    c.setFillColor(NAVY)
    c.rect(0, 60, 4, PAGE_H - 120, fill=1, stroke=0)


def _footer(c: pdf_canvas.Canvas, project_name: str, page_label: str, generated_by: str = ""):
    y = 32
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(MARGIN, y + 12, PAGE_W - MARGIN, y + 12)
    
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y, "ConstructAsk")
    
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN + 62, y, f"·  {project_name}")
    
    c.drawRightString(PAGE_W - MARGIN, y, page_label)
    
    if generated_by:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawString(MARGIN, y - 12, f"Securely generated for: {generated_by}")

def _section_header(c: pdf_canvas.Canvas, y: float, eyebrow: str, title: str) -> float:
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y, eyebrow.upper())
    y -= 18
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN, y, title)
    y -= 6
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.2)
    c.line(MARGIN, y, MARGIN + 36, y)
    return y - 16


def _kpi_card(c: pdf_canvas.Canvas, x: float, y: float, w: float, h: float,
              label: str, value: str, tone: str = "neutral", suffix: str | None = None):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.setFillColor(WHITE)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
    tone_c = {"good": GREEN, "warn": AMBER, "bad": RED}.get(tone, NAVY)
    c.setFillColor(tone_c)
    c.roundRect(x, y + h - 4, w, 4, 1.5, fill=1, stroke=0)
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(x + 12, y + h - 20, label.upper())
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(x + 12, y + 22, str(value))
    if suffix:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 12, y + 10, suffix)


def _progress_bar(c: pdf_canvas.Canvas, x: float, y: float, w: float, pct: float, tone_c: colors.Color):
    pct = max(0, min(100, pct))
    c.setFillColor(LINE)
    c.roundRect(x, y, w, 5, 2.5, fill=1, stroke=0)
    c.setFillColor(tone_c)
    c.roundRect(x, y, w * (pct / 100), 5, 2.5, fill=1, stroke=0)


def _wrap_text(text: str, max_chars: int) -> list[str]:
    """Greedy word-wrap suitable for PDF lines."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _measure_bullet_block(w: float, items: list[tuple[str, colors.Color]], font_size: int = 10) -> float:
    h = 0
    for text, _ in items:
        lines = _wrap_text(text, max_chars=int(w / 5.4))
        h += max(font_size + 4, len(lines) * (font_size + 2) + 4)
    return h


def _bullet_block(c: pdf_canvas.Canvas, x: float, y: float, w: float,
                  items: list[tuple[str, colors.Color]], font_size: int = 10) -> float:
    c.setFont("Helvetica", font_size)
    for text, dot_color in items:
        lines = _wrap_text(text, max_chars=int(w / 5.4))
        c.setFillColor(dot_color)
        c.circle(x + 4, y + 4, 2.6, fill=1, stroke=0)
        c.setFillColor(INK)
        for i, line in enumerate(lines):
            c.drawString(x + 14, y - i * (font_size + 2), line)
        y -= max(font_size + 4, len(lines) * (font_size + 2) + 4)
    return y


# ── Pages ──────────────────────────────────────────────────────────────────────

def _draw_cover(c: pdf_canvas.Canvas, project, verify_url: str, gen_dt: datetime,
                kpis: dict, generated_by: str = ""):
    # ── Top dark band (clean, like the reference brief) ──────────────────────
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 150, PAGE_W, 150, fill=1, stroke=0)
    # Brand accent strip directly below — the visual cue from the reference PDF
    c.setFillColor(_brand_accent())
    c.rect(0, PAGE_H - 154, PAGE_W, 4, fill=1, stroke=0)

    # Brand row (optional logo, else the wordmark)
    brand_x = MARGIN
    logo = _brand_logo_path()
    if logo:
        try:
            c.drawImage(ImageReader(logo), MARGIN, PAGE_H - 62, width=24, height=24,
                        preserveAspectRatio=True, mask="auto")
            brand_x = MARGIN + 30
        except Exception:
            brand_x = MARGIN
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(brand_x, PAGE_H - 48, "CONSTRUCTASK")
    c.setFillColor(colors.HexColor("#94A3B8"))
    c.setFont("Helvetica", 8.5)
    c.drawString(brand_x, PAGE_H - 60, "Project Intelligence Platform · Digital Product Passports")
    # CONFIDENTIAL badge
    c.setFillColor(colors.HexColor("#1E293B"))
    c.roundRect(PAGE_W - 142, PAGE_H - 56, 94, 20, 3, fill=1, stroke=0)
    c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(PAGE_W - 95, PAGE_H - 50, "CONFIDENTIAL")

    # Title
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(MARGIN, PAGE_H - 100, "Executive Intelligence Report")
    c.setFillColor(colors.HexColor("#CBD5E1"))
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN, PAGE_H - 118, f"{project.name} · {project.location}")
    c.drawString(MARGIN, PAGE_H - 132, f"Generated {gen_dt.strftime('%B %d, %Y · %H:%M')}")

    # ── About ConstructAsk (plain-language so any reader understands) ────────
    y = PAGE_H - 200
    c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y, "ABOUT THIS REPORT")
    y -= 16
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN, y, "Can this material be safely released on this project today?")
    y -= 16
    c.setFillColor(GRAY); c.setFont("Helvetica", 10)
    intro = (
        "ConstructAsk is a construction project intelligence platform. For every material it "
        "maintains a Digital Product Passport — supplier, certificates, QR scans, and a "
        "tamper-evident audit trail — and uses AI to answer one question: is this project on track, "
        "and what should be fixed first. This report is generated directly from live project records."
    )
    for line in _wrap_text(intro, max_chars=96):
        c.drawString(MARGIN, y, line); y -= 13

    # ── Snapshot strip (gives the reader a 3-second feel for the project) ────
    y -= 18
    c.setFillColor(BG_SOFT); c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - 78, PAGE_W - 2 * MARGIN, 78, 6, fill=1, stroke=1)
    pills = [
        ("Project Health", kpis.get("health_label", "—"), kpis.get("health_tone", "neutral")),
        ("Readiness",      f"{kpis.get('readiness', '—')}%", kpis.get("readiness_tone", "neutral")),
        ("Compliance",     f"{kpis.get('compliance', '—')}%", kpis.get("compliance_tone", "neutral")),
        ("Open Risks",     str(kpis.get("open_risks", "—")), kpis.get("risks_tone", "neutral")),
    ]
    px = MARGIN + 20
    pw = (PAGE_W - 2 * MARGIN - 40) / len(pills)
    for label, value, tone in pills:
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(px, y - 22, label.upper())
        c.setFillColor({"good": GREEN, "warn": AMBER, "bad": RED}.get(tone, NAVY))
        c.setFont("Helvetica-Bold", 20)
        c.drawString(px, y - 50, str(value))
        px += pw
    y -= 100

    # ── QR re-open / verify card ──────────────────────────────────────────────
    c.setFillColor(WHITE); c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - 188, PAGE_W - 2 * MARGIN, 188, 8, fill=1, stroke=1)
    # QR on right
    qr_size = 140
    qr_x = PAGE_W - MARGIN - qr_size - 22
    qr_y = y - 22 - qr_size
    c.drawImage(_qr_image(verify_url), qr_x, qr_y, width=qr_size, height=qr_size)
    # Label under QR
    c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 12, "SCAN WITH PHONE")
    # Left text column
    c.setFillColor(RED); c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN + 22, y - 22, "SCAN TO RE-OPEN ON PHONE")
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN + 22, y - 42, "Re-open this report on the live platform")
    c.setFillColor(GRAY); c.setFont("Helvetica", 9.5)
    qr_blurb = (
        "Point your phone camera at the code to jump straight to the live project — every "
        "number in this PDF can be re-verified against current records, including the Ed25519 "
        "passport signatures and SHA-256 audit chain. No login needed for verification."
    )
    ty = y - 64
    for line in _wrap_text(qr_blurb, max_chars=52):
        c.drawString(MARGIN + 22, ty, line); ty -= 12

    # ── Trust footer ribbon ──────────────────────────────────────────────────
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, 60, fill=1, stroke=0)
    c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 8.5)
    c.drawString(MARGIN, 38, "Ed25519 signed passports · SHA-256 hash-chained audit · Accredited trust registry")
    c.setFillColor(colors.HexColor("#94A3B8")); c.setFont("Helvetica", 7.5)
    gen_for = f"Generated for {generated_by} · " if generated_by else ""
    c.drawString(MARGIN, 24, f"{gen_for}Every figure on every page is derived from live project records.")


def _draw_exec_dashboard(c: pdf_canvas.Canvas, project, kpis: dict, summary_text: str,
                         risks: list[tuple[str, str]], actions: list[str],
                         expected_outcome: str | None, generated_by: str = ""):
    y = PAGE_H - MARGIN
    y = _section_header(c, y, "Page 1", "Executive Dashboard")

    # KPI cards row (5 across)
    cards = [
        ("Project Health", kpis["health_label"], kpis["health_tone"], f"{kpis['health_score']}/100"),
        ("Readiness", f"{kpis['readiness']}%", kpis["readiness_tone"], kpis.get("readiness_status", "")),
        ("Compliance", f"{kpis['compliance']}%", kpis["compliance_tone"], f"{kpis['valid_certs']}/{kpis['total_certs']} valid"),
        ("Supplier Health", f"{kpis['supplier']}%", kpis["supplier_tone"], "on-time rate"),
        ("Open Risks", str(kpis["open_risks"]), kpis["risks_tone"], f"{kpis['blockers']} blockers"),
    ]
    gap = 8
    avail = PAGE_W - 2 * MARGIN
    card_w = (avail - gap * (len(cards) - 1)) / len(cards)
    card_h = 72
    cx = MARGIN
    for label, value, tone, suffix in cards:
        _kpi_card(c, cx, y - card_h, card_w, card_h, label, value, tone, suffix)
        cx += card_w + gap
    y -= card_h + 26

    # Executive Summary
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y, "EXECUTIVE SUMMARY")
    y -= 16
    c.setFillColor(INK)
    c.setFont("Helvetica", 11)
    for line in _wrap_text(summary_text, max_chars=98):
        c.drawString(MARGIN, y, line)
        y -= 14
    y -= 8

    # Two-column: Key Risks | Recommended Actions
    col_w = (avail - 20) / 2
    items_risks = [(t, _tone_color(sev)) for t, sev in risks] or [("No active risks recorded.", GREEN)]
    items_actions = [(t, NAVY) for t in actions] or [("No action required.", GREEN)]
    
    h_risks = 36 + _measure_bullet_block(col_w - 28, items_risks[:6], 9) + 12
    h_actions = 36 + _measure_bullet_block(col_w - 28, items_actions[:6], 9) + 12
    card_h = max(150.0, float(h_risks), float(h_actions))
    
    # Risks card
    c.setFillColor(WHITE); c.setStrokeColor(LINE)
    c.roundRect(MARGIN, y - card_h, col_w, card_h, 6, fill=1, stroke=1)
    c.setFillColor(RED); c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN + 14, y - 18, "KEY RISKS")
    _bullet_block(c, MARGIN + 14, y - 36, col_w - 28, items_risks[:6], font_size=9)
    # Actions card
    ax = MARGIN + col_w + 20
    c.setFillColor(WHITE); c.setStrokeColor(LINE)
    c.roundRect(ax, y - card_h, col_w, card_h, 6, fill=1, stroke=1)
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9)
    c.drawString(ax + 14, y - 18, "RECOMMENDED ACTIONS")
    _bullet_block(c, ax + 14, y - 36, col_w - 28, items_actions[:6], font_size=9)
    y -= (card_h + 20)

    # Expected outcome strip
    if expected_outcome:
        c.setFillColor(colors.HexColor("#ECFDF5"))
        c.setStrokeColor(GREEN)
        c.roundRect(MARGIN, y - 50, avail, 50, 6, fill=1, stroke=1)
        c.setFillColor(GREEN); c.setFont("Helvetica-Bold", 9)
        c.drawString(MARGIN + 16, y - 18, "EXPECTED OUTCOME")
        c.setFillColor(INK); c.setFont("Helvetica", 10)
        c.drawString(MARGIN + 16, y - 34, expected_outcome)
        y -= 60

    _footer(c, project.name, "Page 1 · Executive Dashboard", generated_by)


def _draw_materials_section(c: pdf_canvas.Canvas, project, rows: list[dict], y_start: float | None = None) -> float:
    y = y_start if y_start is not None else PAGE_H - MARGIN
    y = _section_header(c, y, "Materials", "Material Intelligence")
    c.setFillColor(GRAY); c.setFont("Helvetica", 10)
    c.drawString(MARGIN, y, "Every material registered on this project, with verification status and release risk.")
    y -= 22

    # Header row
    avail = PAGE_W - 2 * MARGIN
    col = [int(avail * f) for f in (0.40, 0.22, 0.13, 0.13, 0.12)]
    headers = ["Material / Batch", "Supplier", "Status", "Risk", "Passport"]
    c.setFillColor(BG_SOFT)
    c.rect(MARGIN, y - 22, avail, 22, fill=1, stroke=0)
    c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 8)
    cx = MARGIN + 10
    for i, h in enumerate(headers):
        c.drawString(cx, y - 14, h.upper())
        cx += col[i]
    y -= 28

    c.setFont("Helvetica", 9.5)
    for r in rows[:18]:
        if y < 90:
            break
        cx = MARGIN + 10
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 9.5)
        name = (r["name"] or "")[:42]
        c.drawString(cx, y, name)
        c.setFont("Helvetica", 8); c.setFillColor(GRAY)
        c.drawString(cx, y - 11, f"Batch {r.get('batch') or '—'}")
        cx += col[0]
        c.setFillColor(INK); c.setFont("Helvetica", 9.5)
        c.drawString(cx, y, (r.get("supplier") or "—")[:26])
        cx += col[1]
        # Status pill
        tone = _tone_color(r["status"])
        c.setFillColor(tone)
        c.roundRect(cx, y - 3, 62, 14, 7, fill=1, stroke=0)
        c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(cx + 31, y + 1, r["status"].upper()[:10])
        cx += col[2]
        # Risk dot
        c.setFillColor(_tone_color(r["risk"]))
        c.circle(cx + 5, y + 4, 4, fill=1, stroke=0)
        c.setFillColor(INK); c.setFont("Helvetica", 9.5)
        c.drawString(cx + 14, y, r["risk"].title())
        cx += col[3]
        c.setFillColor(INK if r.get("passport") else MUTED)
        c.drawString(cx, y, r.get("passport") or "Pending")
        # row separator
        c.setStrokeColor(LINE); c.setLineWidth(0.4)
        c.line(MARGIN, y - 18, PAGE_W - MARGIN, y - 18)
        y -= 28

    return y


def _draw_passport_page(c: pdf_canvas.Canvas, project, passports: list[dict], generated_by: str = ""):
    y = PAGE_H - MARGIN
    y = _section_header(c, y, "Passports", "Product Passports")
    c.setFillColor(GRAY); c.setFont("Helvetica", 10)
    c.drawString(MARGIN, y, "A Digital Product Passport for each material — issuer-signed and verifiable.")
    y -= 22

    # Up to 3 compact passport cards (fills the page), priority risk first
    for p in passports[:3]:
        card_h = 210
        c.setStrokeColor(LINE); c.setFillColor(WHITE)
        c.roundRect(MARGIN, y - card_h, PAGE_W - 2 * MARGIN, card_h, 8, fill=1, stroke=1)
        # Header strip
        c.setFillColor(NAVY)
        c.roundRect(MARGIN, y - 30, PAGE_W - 2 * MARGIN, 30, 8, fill=1, stroke=0)
        c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN + 14, y - 20, p["name"])
        c.setFillColor(colors.HexColor("#CBD5E1")); c.setFont("Helvetica", 9)
        c.drawRightString(PAGE_W - MARGIN - 14, y - 20, f"DPP {p.get('passport_id') or p.get('code')}")

        # Body
        body_top = y - 48
        left_x = MARGIN + 18
        # QR
        qr_size = 110
        c.drawImage(_qr_image(p["qr_payload"]), PAGE_W - MARGIN - qr_size - 18, body_top - qr_size + 10, width=qr_size, height=qr_size)
        
        # Metadata
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 6, "SUPPLIER")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        c.drawString(left_x, body_top - 18, str(p.get("supplier") or "—"))
        
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 36, "BATCH")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        c.drawString(left_x, body_top - 48, str(p.get("batch") or "—"))
        
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 66, "ORIGIN")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        c.drawString(left_x, body_top - 78, str(p.get("origin") or "—"))
        
        # Scores
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 102, "COMPLIANCE SCORE")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        cs = p.get('compliance_score')
        c.drawString(left_x, body_top - 114, f"{cs}/100" if cs is not None else "Pending")
        if cs is not None:
            _progress_bar(c, left_x, body_top - 122, 200, cs, GREEN if cs >= 85 else (AMBER if cs >= 70 else RED))
            
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 138, "SUSTAINABILITY SCORE")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        ss = p.get('sustainability_score')
        c.drawString(left_x, body_top - 150, f"{ss}/100" if ss is not None else "Pending")
        if ss is not None:
            _progress_bar(c, left_x, body_top - 158, 200, ss, GREEN if ss >= 85 else (AMBER if ss >= 70 else RED))
            
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(left_x, body_top - 174, "CARBON FOOTPRINT")
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10.5)
        cf = p.get('carbon_footprint')
        c.drawString(left_x, body_top - 186, f"{cf} kg CO₂e/kg" if cf is not None else "Pending")
        
        # Explanation
        c.setFillColor(MUTED); c.setFont("Helvetica", 8)
        c.drawString(left_x, body_top - 198, f"Simplified: 1 kg of material = {cf if cf is not None else '?'} kg of greenhouse gases.")

        y -= card_h + 14

    _footer(c, project.name, "Page 4 · Product Passports", generated_by)


def _draw_audit_section(c: pdf_canvas.Canvas, project, chain_ok: bool, chain_total: int,
                        chain_verified: int, events: list[dict], generated_by: str = "", y_start: float | None = None) -> float:
    y = y_start if y_start is not None else PAGE_H - MARGIN
    y = _section_header(c, y, "Audit", "Audit Trail")

    # Chain status banner
    banner_c = GREEN if chain_ok else RED
    soft_bg = colors.HexColor("#ECFDF5") if chain_ok else colors.HexColor("#FEF2F2")
    c.setFillColor(soft_bg); c.setStrokeColor(banner_c)
    c.roundRect(MARGIN, y - 60, PAGE_W - 2 * MARGIN, 60, 8, fill=1, stroke=1)
    c.setFillColor(banner_c); c.setFont("Helvetica-Bold", 11)
    label = "SHA-256 CHAIN VERIFIED" if chain_ok else "CHAIN INTEGRITY BROKEN"
    c.drawString(MARGIN + 16, y - 22, f"🔐 {label}")
    c.setFillColor(INK); c.setFont("Helvetica", 9.5)
    c.drawString(MARGIN + 16, y - 40, f"{chain_verified} of {chain_total} audit records re-hashed and verified at report time.")
    y -= 78

    # Timeline of events
    c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, y, "RECENT EVENTS")
    y -= 12
    c.setStrokeColor(LINE); c.setLineWidth(0.6)
    c.line(MARGIN + 8, y - 8, MARGIN + 8, max(110, y - 12 - 28 * min(len(events), 10)))

    for ev in events[:10]:
        if y < 130:
            break
        c.setFillColor(NAVY)
        c.circle(MARGIN + 8, y - 4, 3.5, fill=1, stroke=0)
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGIN + 22, y - 2, (ev["action"] or "").replace("_", " ").title()[:60])
        c.setFillColor(GRAY); c.setFont("Helvetica", 8.5)
        meta = f"{ev.get('when', '')} · by {ev.get('actor', '—')}"
        if ev.get("hash"):
            meta += f" · hash {ev['hash'][:10]}…"
        c.drawString(MARGIN + 22, y - 14, meta[:90])
        y_step = 28
        if ev.get("details"):
            c.setFillColor(MUTED); c.setFont("Helvetica", 9)
            lines = _wrap_text(ev["details"], max_chars=80)
            for i, line in enumerate(lines):
                c.drawString(MARGIN + 22, y - 26 - i * 11, line)
            y_step = 28 + len(lines) * 11
        y -= y_step

    return y


def _draw_ai_executive_page(c: pdf_canvas.Canvas, project, root_causes: list[str],
                            forecast: dict, priorities: list[tuple[str, str]], generated_by: str = ""):
    y = PAGE_H - MARGIN
    y = _section_header(c, y, "AI Intelligence", "AI Executive Intelligence")
    c.setFillColor(GRAY); c.setFont("Helvetica", 10)
    c.drawString(MARGIN, y, "Generated from live project data — root causes, predicted impact, and prioritized actions.")
    y -= 24

    # Root cause analysis
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "ROOT CAUSE ANALYSIS")
    y -= 14
    items = [(t, RED if i == 0 else AMBER) for i, t in enumerate(root_causes[:5])] or [("No active root causes detected.", GREEN)]
    y = _bullet_block(c, MARGIN, y, PAGE_W - 2 * MARGIN, items, font_size=10) - 12

    # Predicted impact (forecast strip)
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "PREDICTED IMPACT (IF UNRESOLVED)")
    y -= 14
    avail = PAGE_W - 2 * MARGIN
    blocks = [
        ("7 days",  forecast.get("d7"),  forecast.get("d7_note", "Readiness projection")),
        ("14 days", forecast.get("d14"), forecast.get("d14_note", "Schedule impact")),
        ("30 days", forecast.get("d30"), forecast.get("d30_note", "Compliance exposure")),
    ]
    gap = 12
    bw = (avail - gap * 2) / 3
    bx = MARGIN
    for label, score, note in blocks:
        c.setFillColor(BG_SOFT); c.setStrokeColor(LINE)
        c.roundRect(bx, y - 72, bw, 72, 6, fill=1, stroke=1)
        c.setFillColor(GRAY); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(bx + 12, y - 16, label.upper())
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 22)
        c.drawString(bx + 12, y - 44, f"{score}%" if score is not None else "—")
        c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
        c.drawString(bx + 12, y - 58, note[:36])
        bx += bw + gap
    y -= 90

    # Priorities
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, y, "RECOMMENDED PRIORITIES")
    y -= 14
    pri_items = [(t, _tone_color(sev)) for t, sev in priorities[:5]] or [("No prioritized actions.", GREEN)]
    _bullet_block(c, MARGIN, y, PAGE_W - 2 * MARGIN, pri_items, font_size=10)

    _footer(c, project.name, "Page 5 · AI Executive Intelligence", generated_by)


# ── Entry point ───────────────────────────────────────────────────────────────

def build_executive_report(payload: dict) -> bytes:
    """Render all pages and return the PDF as bytes."""
    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"ConstructAsk Report — {payload['project'].name}")
    c.setAuthor("ConstructAsk")
    c.setSubject("Executive Intelligence Report")

    project = payload["project"]
    gen_by = payload.get("generated_by", "")

    # Page 1 — Cover
    _draw_cover(c, project, payload["verify_url"], payload["generated_at"], payload["kpis"], gen_by)
    c.showPage()

    # Page 2 — Executive Dashboard
    _page_chrome(c)
    _draw_exec_dashboard(c, project, payload["kpis"], payload["summary_text"],
                         payload["risks"], payload["actions"], payload["expected_outcome"], gen_by)
    c.showPage()

    # Page 3 — Material Intelligence + Audit Trail (combined to fill the page)
    _page_chrome(c)
    y = _draw_materials_section(c, project, payload["material_rows"])
    _draw_audit_section(c, project, payload["chain_ok"], payload["chain_total"],
                        payload["chain_verified"], payload["audit_events"], gen_by, y_start=y - 18)
    _footer(c, project.name, "Page 3 · Materials & Audit Trail", gen_by)
    c.showPage()

    # Page 4 — Product Passports (3 compact cards)
    _page_chrome(c)
    _draw_passport_page(c, project, payload["passport_rows"], gen_by)
    c.showPage()

    # Page 5 — AI Executive Intelligence
    _page_chrome(c)
    _draw_ai_executive_page(c, project, payload["root_causes"],
                            payload["forecast"], payload["priorities"], gen_by)
    c.showPage()
    c.save()
    return buf.getvalue()
