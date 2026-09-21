"""Tests for the calibration tool. No MATLAB and no real images needed. Run: python -m pytest calibration"""
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibrate_site  # noqa: E402
import core  # noqa: E402
from render import render_markdown  # noqa: E402


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return path


def synthetic(n_pos=200, n_neg=300, separation=3.0, seed=0):
    """Referral scores: referable eyes score high, others low, with a controllable overlap (bigger separation = easier)."""
    rng = np.random.default_rng(seed)
    pos = 1 / (1 + np.exp(-(rng.normal(separation, 1.5, n_pos))))
    neg = 1 / (1 + np.exp(-(rng.normal(-separation, 1.5, n_neg))))
    truth = np.array([True] * n_pos + [False] * n_neg)
    return truth, np.concatenate([pos, neg])


# ------------------------------------------------------------------------------------------------ labels
@pytest.mark.parametrize("value, expected", [("0", "No_DR"), ("2", "Moderate"), ("4", "Proliferate_DR"), ("severe", "Severe"),
                                             ("Proliferative", "Proliferate_DR"), ("No DR", "No_DR"), (" mild ", "Mild")])
def test_grades_can_be_numbers_or_names(value, expected):
    assert core.parse_grade(value) == expected


@pytest.mark.parametrize("value", ["5", "-1", "moderate-ish", "", "two"])
def test_unreadable_grades_are_refused_not_guessed(value):
    with pytest.raises(ValueError):
        core.parse_grade(value)


def test_binary_labels():
    assert core.parse_grade("1", "binary") in core.REFERABLE and core.parse_grade("0", "binary") not in core.REFERABLE
    with pytest.raises(ValueError):
        core.parse_grade("3", "binary")


def test_read_labels_finds_the_grade_column_and_strips_extensions(tmp_path):
    f = write_csv(tmp_path / "l.csv", ["Image name", "Retinopathy grade", "Risk of macular edema"], [["a.jpg", "0", "0"], ["b", "3", "1"], ["C.PNG", "2", "0"]])
    labels, problems = core.read_labels(f)
    assert labels == {"a": "No_DR", "b": "Severe", "C": "Moderate"} and problems == []


def test_read_labels_reports_bad_rows_but_keeps_good_ones(tmp_path):
    f = write_csv(tmp_path / "l.csv", ["image", "grade"], [["a", "1"], ["b", "banana"], ["c", "4"]])
    labels, problems = core.read_labels(f)
    assert set(labels) == {"a", "c"} and len(problems) == 1 and "line 3" in problems[0]


def test_read_labels_needs_to_know_which_column_is_the_grade(tmp_path):
    f = write_csv(tmp_path / "l.csv", ["image", "ophthalmologist_opinion"], [["a", "1"]])
    with pytest.raises(ValueError, match="--label-col"):
        core.read_labels(f)
    assert core.read_labels(f, label_col="ophthalmologist_opinion")[0] == {"a": "Mild"}


def test_a_repeated_image_name_is_an_error_not_silently_resolved(tmp_path):
    """IDRiD's training and testing sets both contain IDRiD_001 (different photographs): keeping 'the first' corrupts the analysis."""
    f = write_csv(tmp_path / "l.csv", ["image", "grade"], [["IDRiD_001", "0"], ["IDRiD_002", "2"], ["IDRiD_001", "3"]])
    with pytest.raises(core.DuplicateNames) as exc:
        core.read_labels(f)
    assert "IDRiD_001" in str(exc.value) and "relative paths" in str(exc.value)


def test_relative_paths_keep_same_named_photographs_apart(tmp_path):
    f = write_csv(tmp_path / "l.csv", ["image", "grade"], [["train/IDRiD_001.jpg", "0"], ["test/IDRiD_001.jpg", "3"]])
    assert core.read_labels(f)[0] == {"train/IDRiD_001": "No_DR", "test/IDRiD_001": "Severe"}


def test_windows_paths_are_normalised():
    assert core.normalise_name("site" + chr(92) + "left" + chr(92) + "eye1.JPG") == "site/left/eye1"


# ------------------------------------------------------------------------------------- finding the images
def make_images(root, names):
    import cv2

    for n in names:
        p = root / n
        p.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(p), np.full((8, 8, 3), 90, np.uint8))


def test_images_are_matched_by_bare_name_or_relative_path(tmp_path):
    make_images(tmp_path, ["a.png", "train/x.jpg", "test/x.jpg", "deep/er/y.png"])
    found, problems = calibrate_site.resolve_images(["a", "y", "train/x", "test/x", "missing"], tmp_path)
    assert set(found) == {"a", "y", "train/x", "test/x"}
    assert found["train/x"].parent.name == "train" and found["test/x"].parent.name == "test"
    assert problems == ["missing: not found"]


def test_a_bare_name_shared_by_two_files_is_reported_as_ambiguous(tmp_path):
    make_images(tmp_path, ["train/x.jpg", "test/x.jpg"])
    found, problems = calibrate_site.resolve_images(["x"], tmp_path)
    assert found == {} and "several images have this name" in problems[0]


# ------------------------------------------------------------------------------------- the threshold rule
def test_sensitivity_falls_as_the_threshold_rises():
    truth, score = synthetic()
    s = [r["sensitivity"] for r in core.sweep(truth, score).values()]
    assert all(a >= b - 1e-12 for a, b in zip(s, s[1:]))


def test_the_chosen_threshold_is_the_highest_that_reaches_the_target():
    truth, score = synthetic()
    t = core.choose_threshold(truth, score, 0.90, bound="point")
    assert core.rates(core.confusion(truth, score, t))["sensitivity"] >= 0.90
    assert core.rates(core.confusion(truth, score, t + 0.01))["sensitivity"] < 0.90          # one step higher would miss the target


def test_the_lower_bound_rule_is_more_cautious_than_the_point_estimate():
    truth, score = synthetic(n_pos=60)
    assert core.choose_threshold(truth, score, 0.90, "lower") < core.choose_threshold(truth, score, 0.90, "point")


def test_a_higher_target_gives_a_lower_threshold_and_lower_specificity():
    truth, score = synthetic()
    t90, t97 = core.choose_threshold(truth, score, 0.90), core.choose_threshold(truth, score, 0.97)
    assert t97 < t90
    assert core.rates(core.confusion(truth, score, t97))["specificity"] < core.rates(core.confusion(truth, score, t90))["specificity"]


def test_no_recommendation_when_the_target_cannot_be_reached():
    truth = np.array([True] * 100 + [False] * 100)
    score = np.concatenate([np.full(100, 0.0), np.full(100, 0.5)])          # the model scores every referable eye at zero
    assert core.choose_threshold(truth, score, 0.90) is None


def test_too_few_referable_cases_means_no_recommendation():
    truth, score = synthetic(n_pos=core.MIN_POSITIVES_TO_RECOMMEND - 1)
    assert core.choose_threshold(truth, score, 0.90) is None
    result = core.analyse(["Moderate"] * 29 + ["No_DR"] * 300, score[:329], target=0.9)
    assert result["recommendation"] is None and "Refused" in result["recommendation_note"]


def test_holdout_estimate_is_reported_and_is_not_better_than_the_optimistic_one():
    truth, score = synthetic()
    h = core.holdout_study(truth, score, 0.90, repeats=100)
    assert h["usable_repeats"] > 90 and 0 <= h["share_reaching_target"] <= 1 and h["threshold_p10"] <= h["threshold_median"] <= h["threshold_p90"]
    full = core.rates(core.confusion(truth, score, core.choose_threshold(truth, score, 0.90)))
    assert h["held_out_sensitivity_mean"] <= full["sensitivity"] + 0.03


def test_the_holdout_shows_that_small_samples_are_unstable():
    big = core.holdout_study(*synthetic(n_pos=400, n_neg=600), 0.90, bound="point", repeats=150)
    small = core.holdout_study(*synthetic(n_pos=45, n_neg=60), 0.90, bound="point", repeats=150)
    assert (small["threshold_p90"] - small["threshold_p10"]) > (big["threshold_p90"] - big["threshold_p10"])


def test_positives_needed_for_a_precise_estimate():
    assert core.positives_needed(0.90, 0.05) == 139


# ------------------------------------------------------------------------------------------ analysis
def grades_for(truth):
    rng = np.random.default_rng(1)
    return [str(rng.choice(["Moderate", "Severe", "Proliferate_DR"])) if t else str(rng.choice(["No_DR", "Mild"])) for t in truth]


def test_without_a_named_target_nothing_is_recommended_but_the_options_are_shown():
    truth, score = synthetic()
    r = core.analyse(grades_for(truth), score)
    assert r["recommendation"] is None and "clinical decision" in r["recommendation_note"]
    assert set(r["options"]) == set(core.SENSITIVITY_TARGETS) and r["options"][0.90]["threshold"] > r["options"][0.97]["threshold"]


def test_a_named_target_gives_a_recommendation_with_a_holdout_estimate():
    truth, score = synthetic()
    r = core.analyse(grades_for(truth), score, target=0.90)
    assert r["recommendation"]["threshold"] > 0 and r["recommendation"]["holdout"]["usable_repeats"] > 0


def test_small_samples_and_a_weak_model_produce_warnings():
    truth, score = synthetic(n_pos=60, n_neg=60, separation=0.3)
    text = " ".join(core.analyse(grades_for(truth), score)["warnings"])
    assert "Only 60 referable" in text and "Only 60 non-referable" in text and "AUC" in text


def test_predictive_values_use_the_supplied_prevalence():
    truth, score = synthetic()
    low = core.analyse(grades_for(truth), score, prevalence=0.05)["predictive_values"]["deployed"]
    high = core.analyse(grades_for(truth), score, prevalence=0.5)["predictive_values"]["deployed"]
    assert low["ppv"] < high["ppv"] and low["flagged_per_1000"] < high["flagged_per_1000"]


# ------------------------------------------------------------------------------------------- the report
BANNED = [r"\bsafe\b", r"\bguarantee", r"\bcleared\b", r"\bcertified\b", r"\bvalidated for\b", r"\bapproved\b"]


def report_for(**kw):
    truth, score = synthetic()
    return render_markdown(core.analyse(grades_for(truth), score, **kw), {"site": "Test clinic", "missed_ids": [("img1", "Severe", 0.05)]})


def test_the_report_says_it_is_evidence_and_not_approval():
    text = report_for(target=0.90)
    assert "evidence, not approval" in text and "clinician must choose the sensitivity target" in text and "written sign-off" in text


def test_the_report_has_no_reassuring_or_certifying_language():
    for text in (report_for(), report_for(target=0.90), report_for(target=0.999)):
        for pattern in BANNED:
            assert not re.search(pattern, text.lower()), pattern


def test_the_report_without_a_target_recommends_nothing_and_says_why():
    text = report_for()
    assert "No threshold recommended" in text and "pick a target" in text


def test_the_report_distinguishes_optimistic_from_fair_figures_and_lists_missed_cases():
    text = report_for(target=0.90)
    assert "optimistic" in text and "images not used to choose it" in text and "img1" in text and "NOT flagged" in text


def test_the_report_tells_the_user_how_to_apply_a_threshold():
    text = report_for(target=0.90)
    assert "REFERRAL_THRESHOLD=" in text and "0.02" in text and "0.6" in text


# -------------------------------------------------------------------------------- the command-line tool
def test_the_command_line_tool_end_to_end_on_a_small_synthetic_site(tmp_path):
    truth, score = synthetic(n_pos=80, n_neg=120)
    names = [f"eye{i:03d}" for i in range(len(truth))]
    make_images(tmp_path / "photos", [f"{n}.png" for n in names])
    grades = grades_for(truth)
    write_csv(tmp_path / "grades.csv", ["image", "grade"], [[n, g] for n, g in zip(names, grades)])
    # predictions consistent with the scores (all mass on Moderate for referable-looking scores, else No_DR)
    rows = []
    for n, s in zip(names, score):
        p = {c: 0.0 for c in core.CLASSES}
        p["Moderate"], p["No_DR"] = float(s), float(1 - s)
        rows.append([n, ""] + [p[c] for c in core.CLASSES])
    write_csv(tmp_path / "preds.csv", ["id", "label"] + [f"p_{c}" for c in core.CLASSES], rows)

    out = tmp_path / "out"
    result = calibrate_site.main(["--images", str(tmp_path / "photos"), "--labels", str(tmp_path / "grades.csv"), "--predictions", str(tmp_path / "preds.csv"),
                                  "--skip-quality", "--target-sensitivity", "0.90", "--out", str(out), "--site", "Synthetic"])
    assert result["recommendation"] is not None
    assert (out / "calibration_report.md").read_text(encoding="utf-8").startswith("# Referral-threshold calibration report: Synthetic")
    data = json.loads((out / "calibration_results.json").read_text(encoding="utf-8"))
    assert data["n"] == 200 and data["recommendation"]["threshold"] == result["recommendation"]["threshold"]
    sweep = list(csv.DictReader(open(out / "threshold_sweep.csv", encoding="utf-8")))
    assert len(sweep) == len(core.GRID)


def test_the_command_line_tool_stops_on_duplicate_names_and_on_an_unreachable_target_value(tmp_path):
    make_images(tmp_path / "p", ["a.png"])
    write_csv(tmp_path / "g.csv", ["image", "grade"], [["a", "0"], ["a", "3"]])
    with pytest.raises(SystemExit) as exc:
        calibrate_site.main(["--images", str(tmp_path / "p"), "--labels", str(tmp_path / "g.csv"), "--skip-quality", "--predictions", "x"])
    assert "more than once" in str(exc.value)
    with pytest.raises(SystemExit):
        calibrate_site.main(["--images", str(tmp_path), "--labels", str(tmp_path / "g.csv"), "--target-sensitivity", "1.5"])


def test_a_threshold_above_the_apps_maximum_is_capped_and_still_meets_the_target():
    truth, score = synthetic(separation=4.0)                     # so easy that the ideal threshold is above the cap
    r = core.analyse(grades_for(truth), score, target=0.90)
    rec = r["recommendation"]
    assert rec["capped"] is True and rec["threshold"] == core.MAX_RECOMMENDED_THRESHOLD
    assert rec["sensitivity"] >= 0.90                            # a lower threshold flags more eyes, so the target still holds
    assert "accepts at most" in render_markdown(r)


def test_a_small_sample_cannot_demonstrate_a_high_target_under_the_lower_bound_rule():
    """32 referable cases, all caught: the 95% lower bound is still below 90%, so the cautious rule refuses to certify it."""
    truth = np.array([True] * 32 + [False] * 60)
    score = np.concatenate([np.full(32, 0.9), np.full(60, 0.05)])
    assert core.choose_threshold(truth, score, 0.90, "lower") is None
    assert core.choose_threshold(truth, score, 0.90, "point") is not None


@pytest.mark.parametrize("grades", [["Moderate"] * 60, ["No_DR"] * 60, []])
def test_a_one_sided_or_empty_sample_does_not_crash_and_says_it_cannot_be_measured(grades):
    """A first batch of graded images can easily contain only one kind of eye."""
    score = np.linspace(0.05, 0.9, len(grades)) if grades else np.array([])
    r = core.analyse(grades, score, target=0.90)
    assert r["recommendation"] is None
    text = render_markdown(r)                                 # must render, not raise
    assert "needs both referable and non-referable eyes" in text or not grades
