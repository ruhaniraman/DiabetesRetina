"""The downloadable screening report (PDF): both eyes, the referral result, quality notes, the heatmaps and the disclaimer.

Built in memory from a result the server has just computed (see run_report in server.py); nothing is written to disk and the report is
not kept. All wording comes from clinical_text.py (PDF_TEXT and the summary the app already shows), so a clinician reviews one set of text.

Deliberately NOT included: the raw class probabilities (the model is over-confident; the app shows confidence as a band). Lesions appear only
when the Stage 2 overlay is turned on (ENABLE_LESION_OVERLAY), and then only as POSSIBLE lesions with the caveat from clinical_text.py.
"""
import datetime as _dt
import io
from xml.sax.saxutils import escape

import cv2
import numpy as np
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from clinical_text import LESION_LABELS, PDF_TEXT

NAVY = colors.HexColor("#1c2033")
MUTED = colors.HexColor("#6b7280")
RED = colors.HexColor("#dc4a4a")
SLATE = colors.HexColor("#5b6b85")          # "no referral flagged": neutral on purpose, never green (the tool can miss disease)
GOLD = colors.HexColor("#f5b842")
LIGHT = colors.HexColor("#f3f4f8")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

_base = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=_base["BodyText"], fontName="Helvetica", fontSize=9, leading=12.5, textColor=colors.HexColor("#374151"))
SMALL = ParagraphStyle("small", parent=BODY, fontSize=7.5, leading=10, textColor=MUTED)
KICKER = ParagraphStyle("kicker", parent=BODY, fontName="Helvetica-Bold", fontSize=8, textColor=MUTED)
TITLE = ParagraphStyle("title", parent=BODY, fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY, spaceAfter=4)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=3)
LABEL = ParagraphStyle("label", parent=BODY, fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=MUTED)
VALUE = ParagraphStyle("value", parent=BODY, fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NAVY)
BADGE = ParagraphStyle("badge", parent=BODY, fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.white, alignment=TA_CENTER)

EYE_NAMES = {"left": "Left eye (OS)", "right": "Right eye (OD)"}


def printable_name(name: str | None) -> str:
    """The patient's name if the report font can print it (Latin letters), otherwise a note. Never raises."""
    if not name or not name.strip():
        return PDF_TEXT["not_provided"]
    try:
        name.encode("cp1252")
    except UnicodeEncodeError:
        return PDF_TEXT["name_unprintable"]
    return name.strip()


def _png(img_bgr: np.ndarray) -> io.BytesIO:
    ok, buf = cv2.imencode(".png", img_bgr)
    if not ok:
        raise ValueError("Could not encode an image for the report.")
    return io.BytesIO(buf.tobytes())


def _image(img_bgr: np.ndarray, width: float) -> Image:
    return Image(_png(img_bgr), width=width, height=width)      # every picture is the model's square 224 x 224 view


def _labelled(label: str, value: str) -> list:
    return [Paragraph(escape(label.upper()), LABEL), Paragraph(escape(value), VALUE)]


def _age(dob: str, today: _dt.date) -> int | None:
    try:
        born = _dt.date.fromisoformat(dob)
    except ValueError:
        return None
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _footer(generated: str):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#d9dbe3"))
        canvas.line(MARGIN, 16 * mm, PAGE_W - MARGIN, 16 * mm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 11.5 * mm, f"RetinaRescue  |  Automated screening aid, not a diagnosis  |  {generated}")
        canvas.drawRightString(PAGE_W - MARGIN, 11.5 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def _eye_block(eye: str, result: dict, images: dict) -> list:
    """One column of the report: the two pictures and the facts for one eye."""
    side = eye
    width = (CONTENT_W / 2 - 8 * mm) / 2
    pictures = Table([[_image(images["analysed"], width), _image(images["heatmap"], width)],
                      [Paragraph(escape(PDF_TEXT["photo_caption"]), SMALL), Paragraph(escape(PDF_TEXT["heatmap_caption"]), SMALL)]],
                     colWidths=[width + 1 * mm, width + 1 * mm])
    pictures.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 1 * mm)]))

    score = result[f"{side}ReferableProbability"]
    threshold = result["referralThreshold"]
    flagged = bool(result[f"{side}Referable"])
    grade = result[f"{side}Grade"]
    milder = flagged and not any(k in grade for k in ("Moderate", "Severe", "Proliferative"))
    facts = [
        _labelled("Estimated stage (an estimate)", grade),
        _labelled("Confidence in that stage", result[f"{side}ConfidenceBand"]),
        _labelled("Referral score", f"{score:.0%} (flagged at {threshold:.0%} or more)"),
        _labelled("Result for this eye", PDF_TEXT["badge_referral"] if flagged else PDF_TEXT["badge_no_referral"]),
    ]
    fact_table = Table([[Table([[f[0]], [f[1]]], colWidths=[CONTENT_W / 2 - 8 * mm])] for f in facts], colWidths=[CONTENT_W / 2 - 8 * mm])
    fact_table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))

    block = [Paragraph(EYE_NAMES[eye], H2), pictures, Spacer(1, 3 * mm), fact_table]
    if milder:
        block += [Spacer(1, 1 * mm), Paragraph(escape(PDF_TEXT["escalated_chip"]), SMALL)]
    caption = PDF_TEXT["heatmap_empty_note"] if images.get("heatmap_empty") else PDF_TEXT["heatmap_note"]
    block += [Spacer(1, 1 * mm), Paragraph(escape(caption), SMALL)]
    if not flagged and not images.get("heatmap_empty"):
        block += [Spacer(1, 1 * mm), Paragraph(escape(PDF_TEXT["heatmap_below_threshold_note"]), SMALL)]
    return block


def _lesion_block(eye: str, images: dict) -> list:
    """The Stage 2 overlay for one eye: the photograph with possible lesions drawn on it, the count per type, and the caveat."""
    column = CONTENT_W / 2 - 8 * mm
    width = column / 2 - 4 * mm
    counts = images.get("lesion_counts") or {}
    rest = column - width - 3 * mm
    rows = [[Paragraph(escape(label), SMALL), Paragraph(str(int(counts.get(key, 0))), SMALL)] for key, label in LESION_LABELS.items()]
    count_table = Table(rows, colWidths=[rest - 6 * mm, 6 * mm])
    count_table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                     ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    pictures = Table([[_image(images["lesions"], width), count_table]], colWidths=[width + 3 * mm, rest])
    pictures.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 1 * mm)]))
    note = PDF_TEXT["lesion_note"] if sum(int(v) for v in counts.values()) else PDF_TEXT["lesion_none_note"]
    return [Paragraph(f"{EYE_NAMES[eye]}: {escape(PDF_TEXT['lesion_caption'].lower())}", H2), pictures, Spacer(1, 1 * mm), Paragraph(escape(note), SMALL)]


def build_report_pdf(result: dict, eyes: dict, *, patient: dict | None = None, generated_at: _dt.datetime | None = None, compress: bool = True) -> bytes:
    """Return the report as PDF bytes.

    result   the assessment the API returns (leftGrade, rightGrade, ...ConfidenceBand, ...ReferableProbability, ...Referable, referable,
             referralThreshold, referralThresholdSource, overallSummary, qualityWarnings)
    eyes     {"left": {"analysed": BGR array, "heatmap": BGR array, "heatmap_empty": bool}, "right": {...}}; with the lesion overlay on, each eye
             also has "lesions" (BGR photo with the overlay, square) and "lesion_counts" ({microaneurysms, hemorrhages, exudates, softExudates})
    patient  optional {"name": str, "dob": "YYYY-MM-DD"}; printed on the report only
    """
    generated_at = generated_at or _dt.datetime.now(_dt.timezone.utc)
    stamp = generated_at.strftime("%d %b %Y, %H:%M UTC")
    patient = patient or {}
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=14 * mm, bottomMargin=22 * mm,
                            title="RetinaRescue screening report", author="RetinaRescue", subject="Automated diabetic retinopathy screening aid", pageCompression=1 if compress else 0)

    dob = patient.get("dob")
    age = _age(dob, generated_at.date()) if dob else None
    meta = Table(
        [[_labelled("Patient", printable_name(patient.get("name"))), _labelled("Date of birth", (f"{dob}" + (f" (age {age})" if age is not None else "")) if dob else PDF_TEXT["not_provided"]),
          _labelled("Report generated", stamp)]],
        colWidths=[CONTENT_W * 0.38, CONTENT_W * 0.34, CONTENT_W * 0.28])
    meta.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
                              ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))

    referable = bool(result["referable"])
    badge = Table([[Paragraph(PDF_TEXT["badge_referral"] if referable else PDF_TEXT["badge_no_referral"], BADGE)]], colWidths=[CONTENT_W], rowHeights=[11 * mm])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), RED if referable else SLATE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))

    story = [Paragraph(escape(PDF_TEXT["kicker"]), KICKER), Paragraph(escape(PDF_TEXT["title"]), TITLE), Spacer(1, 2 * mm), meta, Spacer(1, 4 * mm), badge,
             Spacer(1, 3 * mm), Paragraph(escape(result["overallSummary"]), BODY), Spacer(1, 3 * mm)]

    rows = [[_eye_block("left", result, eyes["left"]), _eye_block("right", result, eyes["right"])]]
    if any(eyes[e].get("lesions") is not None for e in ("left", "right")):     # a second row, so the table can break between the rows
        rows.append([_lesion_block(e, eyes[e]) if eyes[e].get("lesions") is not None else "" for e in ("left", "right")])
    columns = Table(rows, colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    columns.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8 * mm),
                                 ("TOPPADDING", (0, 1), (-1, -1), 4 * mm)]))
    story.append(columns)

    notes = [Paragraph("Notes on this report", H2)]
    warnings = result.get("qualityWarnings") or []
    for w in warnings:
        notes.append(Paragraph("Photograph quality: " + escape(w), BODY))
    if result.get("referralThresholdSource") == "site":
        notes.append(Paragraph(escape(PDF_TEXT["site_threshold_note"]), BODY))
    notes += [Paragraph(escape(PDF_TEXT["confidence_note"]), BODY), Spacer(1, 1.5 * mm), Paragraph(escape(PDF_TEXT["stage_note"]), BODY), Spacer(1, 1.5 * mm),
              Paragraph(escape(PDF_TEXT["generated_note"]), SMALL)]
    story.append(KeepTogether(notes))

    doc.build(story, onFirstPage=_footer(stamp), onLaterPages=_footer(stamp))
    return buffer.getvalue()
