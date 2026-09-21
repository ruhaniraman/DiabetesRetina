"""Stage 1: image-quality measures for a fundus photograph.

Everything is measured on the 224x224 image the classifier actually sees, on the green channel, inside the retina only
(never the black border). That makes the numbers comparable between a small file and a 12-megapixel upload, and reflects
what matters for grading: blur that vanishes when the photo is shrunk to 224 pixels does not hurt the network.

The team's MATLAB Stage 1 (stage1_quality/) worked the same way (green channel, retina mask, contrast-normalised blur);
an earlier Python port dropped all of that. Thresholds are set in verdict() from the evidence in validation/QUALITY.md.
"""
import cv2
import numpy as np

SIZE = 224


def model_view(img_bgr: np.ndarray) -> np.ndarray:
    """The image as the network sees it: the whole frame resized to SIZE x SIZE (no cropping)."""
    return cv2.resize(img_bgr, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def measures(img_bgr: np.ndarray) -> dict:
    """All quality measures for one image (any size, BGR uint8). `no_retina` is 1 when no retina could be found."""
    view = model_view(img_bgr)
    gray = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY)
    green = view[:, :, 1].astype(np.float32)

    # Retina region: bright enough to be tissue, closed, then eroded so the rim's strong edge is not counted as detail.
    fov = (gray > 15).astype(np.uint8)
    fov = cv2.morphologyEx(fov, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    inner = cv2.erode(fov, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(bool)
    fov = fov.astype(bool)
    if fov.sum() < 500 or inner.sum() < 300:
        return {"fov_fraction": float(fov.mean()), "no_retina": 1}

    g_fov, g_in = green[fov], green[inner]
    lap = cv2.Laplacian(green, cv2.CV_32F)
    fine = green - cv2.GaussianBlur(green, (0, 0), 1.5)          # fine detail (vessel edges, small lesions)
    mid = green - cv2.GaussianBlur(green, (0, 0), 6.0)           # mid-scale structure
    gx, gy = cv2.Sobel(green, cv2.CV_32F, 1, 0), cv2.Sobel(green, cv2.CV_32F, 0, 1)

    contrast = float(g_in.std())
    return {
        "no_retina": 0,
        "fov_fraction": float(fov.mean()),
        # exposure (green channel, retina only)
        "brightness": float(g_fov.mean() / 255),
        "under_fraction": float((g_fov < 25).mean()),
        "over_fraction": float((g_fov > 235).mean()),
        "contrast": contrast / 255,
        "range_p5_p95": float((np.percentile(g_in, 95) - np.percentile(g_in, 5)) / 255),
        # sharpness candidates
        "lap_var": float(lap[inner].var()),
        "lap_var_norm": float(lap[inner].var() / max(contrast ** 2, 1.0)),    # contrast-normalised, like the MATLAB blurScore
        "tenengrad_norm": float(np.hypot(gx, gy)[inner].mean() / max(contrast, 1.0)),
        "hf_ratio": float((fine[inner] ** 2).mean() / max((mid[inner] ** 2).mean(), 1e-6)),   # fine/mid detail energy
    }


# --------------------------------------------------------------------------- #
# Decision
# --------------------------------------------------------------------------- #
# Thresholds come from validation/QUALITY.md (natural images: APTOS and IDRiD; controlled degradations of held-out images).
# The rule for each: REJECT only where a controlled degradation seriously damages the classifier AND natural photographs almost
# never fall; WARN in the band between. Sharpness is measured at the model's own 224 px scale, where IDRiD photographs are
# already softer than APTOS ones, so the blur limits sit well below both datasets' natural ranges.
THRESHOLDS = {
    "blur_reject": 0.03,       # lap_var_norm below this: blur about as strong as sigma 1 px at 224 px (specificity halves)
    "blur_warn": 0.08,         # just under the softest 5% of IDRiD photographs
    "dark_reject": 0.10,       # retina brightness below this: darker than 99% of natural photographs (darkening x0.35)
    "dark_warn": 0.13,         # about the darkest 1% of natural photographs
    "bright_reject": 0.70,     # brighter than anything natural (brightening x3 costs 36 points of specificity)
    "bright_warn": 0.55,
    "over_reject": 0.10,       # more than 10% of the retina saturated
    "noise_reject": 0.55,      # hf_ratio: fine-detail energy far above natural photographs (grain, compression noise)
}

MESSAGES = {
    "no_retina": "No retina could be found in this image. Please upload a fundus photograph.",
    "blur_reject": "Image rejected: too blurry for a reliable assessment. Please retake the photo.",
    "dark_reject": "Image rejected: too dark for a reliable assessment. Please retake the photo with better illumination.",
    "bright_reject": "Image rejected: overexposed. Please retake the photo.",
    "noise_reject": "Image rejected: it looks grainy or heavily compressed. Please retake the photo or upload the original file.",
    "blur_warn": "Image is slightly soft; results may be less reliable.",
    "dark_warn": "Image is dark; results may be less reliable.",
    "bright_warn": "Image is very bright; results may be less reliable.",
    "accept": "Quality check passed.",
}
_REJECT_ORDER = ("no_retina", "blur_reject", "dark_reject", "bright_reject", "noise_reject")
_WARN_ORDER = ("blur_warn", "dark_warn", "bright_warn")


def reason_codes(m: dict) -> list[str]:
    """Every quality problem found, most serious first (reject codes before warn codes)."""
    if m.get("no_retina", 0):
        return ["no_retina"]
    t = THRESHOLDS
    found = []
    if m["lap_var_norm"] < t["blur_reject"]:
        found.append("blur_reject")
    if m["brightness"] < t["dark_reject"]:
        found.append("dark_reject")
    if m["brightness"] > t["bright_reject"] or m["over_fraction"] > t["over_reject"]:
        found.append("bright_reject")
    if m["hf_ratio"] > t["noise_reject"]:
        found.append("noise_reject")
    if not found:                                    # warnings only matter when the image is not already rejected
        if m["lap_var_norm"] < t["blur_warn"]:
            found.append("blur_warn")
        if t["dark_reject"] <= m["brightness"] < t["dark_warn"]:
            found.append("dark_warn")
        if t["bright_warn"] < m["brightness"] <= t["bright_reject"]:
            found.append("bright_warn")
    return found


def verdict(m: dict) -> dict:
    """Turn measures into a decision: {"verdict": "reject" | "warn" | "accept", "reasons": [...], "message": str}."""
    reasons = reason_codes(m)
    if any(r in _REJECT_ORDER for r in reasons):
        first = next(r for r in _REJECT_ORDER if r in reasons)
        return {"verdict": "reject", "reasons": reasons, "message": MESSAGES[first]}
    if reasons:
        first = next(r for r in _WARN_ORDER if r in reasons)
        return {"verdict": "warn", "reasons": reasons, "message": MESSAGES[first]}
    return {"verdict": "accept", "reasons": [], "message": MESSAGES["accept"]}
