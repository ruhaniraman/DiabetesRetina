"""Stage 1: image-quality measures for a fundus photograph.

Everything is measured on the 224x224 image the classifier actually sees, on the green channel, inside the retina only
(never the black border). That makes the numbers comparable between a small file and a 12-megapixel upload, and reflects
what matters for grading: blur that vanishes when the photo is shrunk to 224 pixels does not hurt the network.

The team's MATLAB Stage 1 (stage1_quality/) worked the same way (green channel, retina mask, contrast-normalised blur);
an earlier Python port dropped all of that. Thresholds are set in verdict() from the evidence in validation/QUALITY.md.

Besides exposure and sharpness, the gate now checks that the upload is plausibly a whole colour fundus photograph (fundus_measures):
a warm (red/orange) colour cast and a retina outline that is not cut off. It cannot prove an image is a fundus photograph.
"""
import cv2
import numpy as np

SIZE = 224


def model_view(img_bgr: np.ndarray) -> np.ndarray:
    """The image as the network sees it: the whole frame resized to SIZE x SIZE (no cropping)."""
    return cv2.resize(img_bgr, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def fundus_measures(img_bgr: np.ndarray) -> dict:
    """Does this look like a whole colour fundus photograph? Measured on a small copy that keeps the photo's own proportions.

    - retina_aspect: width / height of the retina's bounding box. Real photos: 0.75 to 1.24 (APTOS 0.75-1.0, IDRiD 1.18-1.24);
      half a retina is about 0.4 and a top-half crop about 1.7.
    - warm_share: share of retina pixels that are red/orange and saturated. Real photos: median 1.0, 1st percentile 0.6, lowest 0.06
      (a handful of green/grey-toned APTOS photos); scenes, drawings, pages and greyscale images are 0.0 to 0.28.
    - mean_saturation: greyscale and washed-out images are near 0 (real photos: at least 0.17).
    """
    h, w = img_bgr.shape[:2]
    scale = 256 / max(h, w)
    small = cv2.resize(img_bgr, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    tissue = (cv2.GaussianBlur(gray, (0, 0), 2) > 15).astype(np.uint8)
    tissue = cv2.morphologyEx(tissue, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(tissue)
    if n < 2:
        return {"retina_aspect": 0.0, "warm_share": 0.0, "mean_saturation": 0.0}
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    region = labels == biggest
    box_w, box_h = stats[biggest, cv2.CC_STAT_WIDTH], stats[biggest, cv2.CC_STAT_HEIGHT]
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    hue, sat = hsv[..., 0][region], hsv[..., 1][region]
    warm = ((hue <= 25) | (hue >= 170)) & (sat > 60)
    return {"retina_aspect": float(box_w / max(box_h, 1)), "warm_share": float(warm.mean()), "mean_saturation": float(sat.mean() / 255)}


def _structure_signature(img_bgr: np.ndarray, size: int = 96):
    """Fine retinal structure (vessels, lesions) on a small copy, ignoring overall brightness and the black border."""
    grey = cv2.cvtColor(cv2.resize(img_bgr, (size, size), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    return cv2.GaussianBlur(grey, (0, 0), 1) - cv2.GaussianBlur(grey, (0, 0), 4), grey > 15


def picture_similarity(a_bgr: np.ndarray, b_bgr: np.ndarray) -> float:
    """Correlation (-1 to 1) of the fine structure of two photographs. About 1.0 for the same picture (even re-saved, shrunk or
    brightened); different fundus photographs reach at most 0.92 (3,100 random pairs from APTOS and IDRiD)."""
    (band_a, mask_a), (band_b, mask_b) = _structure_signature(a_bgr), _structure_signature(b_bgr)
    both = mask_a & mask_b
    if both.sum() < 500:
        return 0.0
    x, y = band_a[both] - band_a[both].mean(), band_b[both] - band_b[both].mean()
    denom = float(np.sqrt((x * x).sum() * (y * y).sum()))
    return float((x * y).sum() / denom) if denom > 0 else 0.0


def is_same_picture(a_bgr: np.ndarray, b_bgr: np.ndarray) -> bool:
    """True when the two uploads are the same photograph. A mirrored or cropped copy is not detected."""
    return picture_similarity(a_bgr, b_bgr) >= THRESHOLDS["same_picture"]


def measures(img_bgr: np.ndarray) -> dict:
    """All quality measures for one image (any size, BGR uint8). `no_retina` is 1 when no retina could be found."""
    view = model_view(img_bgr)
    fundus = fundus_measures(img_bgr)
    gray = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY)
    green = view[:, :, 1].astype(np.float32)

    # Retina region: bright enough to be tissue, closed, then eroded so the rim's strong edge is not counted as detail.
    fov = (gray > 15).astype(np.uint8)
    fov = cv2.morphologyEx(fov, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    inner = cv2.erode(fov, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(bool)
    fov = fov.astype(bool)
    if fov.sum() < 500 or inner.sum() < 300:
        return {"fov_fraction": float(fov.mean()), "no_retina": 1, **fundus}

    g_fov, g_in = green[fov], green[inner]
    lap = cv2.Laplacian(green, cv2.CV_32F)
    fine = green - cv2.GaussianBlur(green, (0, 0), 1.5)          # fine detail (vessel edges, small lesions)
    mid = green - cv2.GaussianBlur(green, (0, 0), 6.0)           # mid-scale structure
    gx, gy = cv2.Sobel(green, cv2.CV_32F, 1, 0), cv2.Sobel(green, cv2.CV_32F, 0, 1)

    contrast = float(g_in.std())
    return {
        "no_retina": 0,
        **fundus,
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
    "colour_reject": 0.03,     # warm_share below this: no red/orange retina colour at all (real photos: never below 0.06)
    "grey_reject": 0.10,       # mean_saturation below this: greyscale or washed out (real photos: never below 0.17)
    "colour_warn": 0.35,       # warm_share below this: unusual colour; 0.7% of real photos, and some non-fundus scenes (up to 0.28)
    "aspect_min": 0.65,        # retina bounding box narrower/wider than this: only part of the retina is in the picture
    "aspect_max": 1.45,        # (real photos: 0.75 to 1.24)
    "same_picture": 0.95,      # two uploads correlate at least this much: the same photo twice (different photos: at most 0.92)
}

MESSAGES = {
    "no_retina": "No retina could be found in this image. Please upload a fundus photograph.",
    "blur_reject": "Image rejected: too blurry for a reliable assessment. Please retake the photo.",
    "dark_reject": "Image rejected: too dark for a reliable assessment. Please retake the photo with better illumination.",
    "bright_reject": "Image rejected: overexposed. Please retake the photo.",
    "noise_reject": "Image rejected: it looks grainy or heavily compressed. Please retake the photo or upload the original file.",
    "not_colour_reject": "Image rejected: this does not look like a colour retinal photograph. Please upload a colour fundus photograph.",
    "partial_reject": "Image rejected: only part of the retina is visible. Please retake the photo with the whole retina in the frame.",
    "colour_warn": "Image has an unusual colour balance for a retinal photograph; results may be less reliable. Check that it is a fundus photograph.",
    "same_picture": "Image rejected: the left and right photos are the same picture. Please upload a separate photo for each eye.",
    "blur_warn": "Image is slightly soft; results may be less reliable.",
    "dark_warn": "Image is dark; results may be less reliable.",
    "bright_warn": "Image is very bright; results may be less reliable.",
    "accept": "Quality check passed.",
}
_REJECT_ORDER = ("no_retina", "not_colour_reject", "partial_reject", "blur_reject", "dark_reject", "bright_reject", "noise_reject")
_WARN_ORDER = ("colour_warn", "blur_warn", "dark_warn", "bright_warn")


def reason_codes(m: dict) -> list[str]:
    """Every quality problem found, most serious first (reject codes before warn codes)."""
    if m.get("no_retina", 0):
        return ["no_retina"]
    t = THRESHOLDS
    found = []
    if m.get("warm_share", 1.0) < t["colour_reject"] or m.get("mean_saturation", 1.0) < t["grey_reject"]:
        found.append("not_colour_reject")
    if not t["aspect_min"] <= m.get("retina_aspect", 1.0) <= t["aspect_max"]:
        found.append("partial_reject")
    if m["lap_var_norm"] < t["blur_reject"]:
        found.append("blur_reject")
    if m["brightness"] < t["dark_reject"]:
        found.append("dark_reject")
    if m["brightness"] > t["bright_reject"] or m["over_fraction"] > t["over_reject"]:
        found.append("bright_reject")
    if m["hf_ratio"] > t["noise_reject"]:
        found.append("noise_reject")
    if not found:                                    # warnings only matter when the image is not already rejected
        if m.get("warm_share", 1.0) < t["colour_warn"]:
            found.append("colour_warn")
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
