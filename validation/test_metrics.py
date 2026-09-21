"""Unit tests for the statistics used in analyze.py (numpy only). Run: python -m pytest validation"""
import csv
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze  # noqa: E402

RESULTS = Path(__file__).resolve().parent / "results"


def test_auc_perfect_reversed_and_ties():
    pos = np.array([True, True, False, False])
    assert analyze.auc(np.array([0.9, 0.8, 0.2, 0.1]), pos) == 1.0
    assert analyze.auc(np.array([0.1, 0.2, 0.8, 0.9]), pos) == 0.0
    assert analyze.auc(np.array([0.5, 0.5, 0.5, 0.5]), pos) == 0.5   # ties get half credit


def test_auc_of_random_scores_is_about_half():
    rng = np.random.default_rng(0)
    assert abs(analyze.auc(rng.random(4000), rng.random(4000) < 0.4) - 0.5) < 0.03


def test_quadratic_weighted_kappa():
    grades = [0, 1, 2, 3, 4, 2, 1, 0]
    assert analyze.qwk(grades, grades) == pytest.approx(1.0)
    off_by_one = [min(4, g + 1) for g in grades]
    off_by_four = [4 - g for g in grades]
    assert analyze.qwk(grades, off_by_one) > analyze.qwk(grades, off_by_four)   # near misses hurt less than far ones


def test_wilson_interval_matches_known_value():
    lo, hi = analyze.wilson(50, 100)
    assert lo == pytest.approx(0.4038, abs=1e-3) and hi == pytest.approx(0.5962, abs=1e-3)
    lo, hi = analyze.wilson(0, 20)
    assert lo == 0.0 or lo < 1e-9
    assert 0.15 < hi < 0.20


def test_predictive_values():
    ppv, npv = analyze.predictive_values(0.9, 0.9, 0.5)
    assert ppv == pytest.approx(0.9) and npv == pytest.approx(0.9)
    low_prev_ppv, _ = analyze.predictive_values(0.9, 0.9, 0.01)
    assert low_prev_ppv < 0.10                                                   # rare disease: most flags are false alarms


def test_referable_definition_and_confusion():
    labels = np.array(["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"])
    assert list(analyze.is_referable(labels)) == [False, False, True, True, True]
    # columns: Mild, Moderate, No_DR, Proliferate_DR, Severe
    probs = np.array([[0.0, 0.0, 1.0, 0.0, 0.0],      # No_DR   -> not flagged
                      [0.5, 0.1, 0.3, 0.0, 0.1],      # Mild, referable prob 0.2 -> flagged at 0.2 (a false alarm)
                      [0.6, 0.1, 0.3, 0.0, 0.0],      # Moderate, referable prob 0.1 -> missed
                      [0.0, 0.0, 0.0, 0.0, 1.0],      # Severe  -> flagged
                      [0.0, 0.0, 0.0, 1.0, 0.0]])     # Proliferate -> flagged
    assert analyze.confusion(labels, probs, 0.2) == {"TP": 2, "FN": 1, "TN": 1, "FP": 1}


@pytest.mark.skipif(not (RESULTS / "app_test_resize.csv").exists(), reason="prediction CSVs not present")
def test_committed_predictions_are_valid_probabilities():
    for name in ("app_test_resize", "app_validation_resize"):
        rows = list(csv.DictReader(open(RESULTS / f"{name}.csv", encoding="utf-8")))
        p = np.array([[float(r[f"p_{c}"]) for c in analyze.CLASSES] for r in rows])
        assert np.allclose(p.sum(1), 1.0, atol=1e-4) and (p >= 0).all()


@pytest.mark.skipif(not (RESULTS / "app_test_resize.csv").exists(), reason="prediction CSVs not present")
def test_the_model_reproduces_its_own_stored_test_result():
    """The regression guard behind the preprocessing decision: plain resize matches stage3Results exactly."""
    _, labels, probs = analyze.load("app_test_resize")
    assert analyze.confusion(labels, probs, analyze.DEPLOYED_THRESHOLD) == analyze.STORED


# --- Stage 1 quality analysis helpers (validation/analyze_quality.py) -------------------------------------
def test_the_old_quality_gate_is_reproduced_faithfully_for_comparison():
    import analyze_quality as aq

    assert aq.old_gate_verdict(5.0, 100.0) == "reject"        # Laplacian variance below 12
    assert aq.old_gate_verdict(300.0, 30.0) == "enhance"      # whole-frame mean below 45
    assert aq.old_gate_verdict(300.0, 230.0) == "enhance"     # ... or above 210
    assert aq.old_gate_verdict(300.0, 100.0) == "accept"


def test_blank_measures_are_read_as_nan_not_text():
    import analyze_quality as aq

    assert np.isnan(aq.num("")) and aq.num("0.5") == 0.5 and aq.num("aptos") == "aptos"


def test_outcome_marks_referral_errors_and_misses():
    import analyze_quality as aq

    P = lambda **k: np.array([k.get(c, 0.0) for c in analyze.CLASSES])
    assert aq.outcome("No_DR", P(No_DR=1.0))["wrong"] is False
    assert aq.outcome("Moderate", P(No_DR=0.9, Moderate=0.1)) == {"wrong": True, "missed": True, "truth": True, "flagged": False}
    assert aq.outcome("No_DR", P(Moderate=0.5, No_DR=0.5)) == {"wrong": True, "missed": False, "truth": False, "flagged": True}
