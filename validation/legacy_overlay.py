"""The RETIRED Stage 2 lesion overlay: the OpenCV image-processing heuristic the app shipped until 2026-09-24.

Kept only so validation/LESIONS.md (the evidence for retiring it) can be reproduced. It is copied unchanged from backend/server.py at
commit 73057ad, except that "no retina" raises ValueError instead of the web server's HTTPException. The app now uses the trained lesion
network (stage2_structure/dl/, validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md). Do not use this for anything else.
"""
import cv2
import numpy as np

# RGBA colours (OpenCV writes BGRA, so these are listed as B, G, R, A).
EXUDATE_BGRA = (153, 211, 52, 200)
HEMORRHAGE_BGRA = (94, 63, 244, 200)
MICROANEURYSM_BGRA = (36, 191, 251, 255)


def _paint_components(binary, min_area, max_area, colour, mask_img) -> int:
    n, labels, stats, _ = cv2.connectedComponentsWithStats((binary * 255).astype(np.uint8))
    count = 0
    for i in range(1, n):
        if min_area <= stats[i, cv2.CC_STAT_AREA] <= max_area:
            mask_img[labels == i] = colour
            count += 1
    return count


def segment_lesions(img: np.ndarray) -> tuple[np.ndarray, dict]:
    height, width = img.shape[:2]
    scale = (height * width) / (512 * 512)

    # Circular field-of-view mask, eroded so border artefacts aren't flagged.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, fov = cv2.threshold(gray, 15, 255, cv2.THRESH_BINARY)
    kernel_circle = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    fov = cv2.morphologyEx(fov, cv2.MORPH_CLOSE, kernel_circle)
    inner = cv2.erode(fov, kernel_circle, iterations=3)
    if not inner.any():
        raise ValueError("No retina was detected in this image.")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(img[:, :, 1]).astype(np.float32) / 255.0
    inside = inner > 0

    def top_percentile(response, pct):
        response = cv2.bitwise_and(response, response, mask=inner)
        _, thresh = cv2.threshold(response, np.percentile(response[inside], pct), 1.0, cv2.THRESH_BINARY)
        return thresh

    mask_img = np.zeros((height, width, 4), dtype=np.uint8)

    bright = enhanced - cv2.GaussianBlur(enhanced, (0, 0), sigmaX=15)
    exudates = _paint_components(top_percentile(bright, 98), 15 * scale, 600 * scale, EXUDATE_BGRA, mask_img)

    dark = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=8) - enhanced
    hemorrhages = _paint_components(top_percentile(dark, 97), 30 * scale, 2000 * scale, HEMORRHAGE_BGRA, mask_img)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, kernel)
    microaneurysms = _paint_components(top_percentile(tophat, 99.4), 2 * scale, 80 * scale, MICROANEURYSM_BGRA, mask_img)

    counts = {"microaneurysms": microaneurysms, "hemorrhages": hemorrhages, "exudates": exudates}
    return mask_img, counts

