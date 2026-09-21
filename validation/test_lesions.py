"""Unit tests for the lesion-overlay evaluation helpers (no dataset needed). Run: python -m pytest validation"""
import os
import sys
from pathlib import Path

os.environ.setdefault("DISABLE_MATLAB", "true")
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluate_lesions as ev  # noqa: E402


def test_components_counts_separate_blobs():
    m = np.zeros((20, 20), bool)
    m[2:4, 2:4] = True
    m[10:12, 10:12] = True
    n, labels = ev.components(m)
    assert n == 2 and labels.max() == 2


def test_overlay_colours_decode_back_into_one_mask_per_type():
    """segment_lesions colour-codes its output; the evaluation must recover each type exactly."""
    rng = np.random.default_rng(0)
    img = np.zeros((400, 400, 3), np.uint8)
    import cv2

    cv2.circle(img, (200, 200), 180, (40, 90, 140), -1)
    img = cv2.add(img, rng.integers(0, 30, img.shape, dtype=np.uint8)) * (img > 0)
    masks, counts = ev.predicted_masks(img)
    assert set(masks) == {"exudates", "hemorrhages", "microaneurysms"}
    assert all(m.dtype == bool and m.shape == img.shape[:2] for m in masks.values())
    assert set(counts) == {"microaneurysms", "hemorrhages", "exudates"}


def test_summary_precision_recall_and_lift_over_chance():
    row = lambda split, tp, pred, gt: {"image": "x", "split": split, "types": {n: {
        "gt_pixels": gt, "pred_pixels": pred, "tp_pixels": tp, "fov_pixels": 10_000,
        "gt_lesions": 10, "gt_lesions_found": 5, "pred_regions": 8, "pred_regions_on_lesion": 4} for n in ev.TYPES}}
    out = ev.summarise_idrid([row("train", 30, 60, 100), row("test", 30, 60, 100)])
    m = out["all 81 images"]["exudates"]
    assert m["pixel_precision"] == pytest.approx(0.5)          # 60 of 120 drawn pixels are on a lesion
    assert m["pixel_recall"] == pytest.approx(0.3)             # 60 of 200 real lesion pixels found
    assert m["chance_precision"] == pytest.approx(0.01)        # 200 lesion pixels in 20,000 retina pixels
    assert m["lift_over_chance"] == pytest.approx(50)
    assert m["lesion_sensitivity"] == pytest.approx(0.5) and m["region_precision"] == pytest.approx(0.5)
    assert set(out) == {"all 81 images", "test set (27)"}


def test_a_count_with_no_information_has_auc_one_half():
    rows = [{"label": g, "microaneurysms": 100, "hemorrhages": 10, "exudates": 10, "total": 120, "flagged_share": 0.027}
            for g in ev.GRADES for _ in range(4)]
    assert ev.summarise_aptos(rows)["auc_referable_vs_not"]["total"] == pytest.approx(0.5)
    assert ev.summarise_aptos(rows)["healthy_with_any_candidate"] == 1.0
