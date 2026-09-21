"""Stage 1 quality gate (backend/quality.py). Evidence for the thresholds: validation/QUALITY.md."""
import os
import re

os.environ["DISABLE_MATLAB"] = "true"

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from synthetic import realistic_fundus  # noqa: E402

import quality  # noqa: E402

GOOD = {"no_retina": 0, "lap_var_norm": 0.7, "brightness": 0.3, "over_fraction": 0.0, "hf_ratio": 0.34}


def verdict_of(img):
    return quality.verdict(quality.measures(img))


# ----------------------------------------------------------------------------------- behaviour on images
def test_a_good_photo_is_accepted():
    assert verdict_of(realistic_fundus())["verdict"] == "accept"


def test_blur_is_rejected_in_proportion():
    assert verdict_of(cv2.GaussianBlur(realistic_fundus(), (0, 0), 2))["verdict"] == "reject"
    assert verdict_of(cv2.GaussianBlur(realistic_fundus(), (0, 0), 0.3))["verdict"] == "accept"      # trivial softening is fine


def test_dark_and_bright_photos_warn_before_they_reject():
    assert verdict_of(realistic_fundus(brightness=0.4))["reasons"] == ["dark_warn"]
    assert verdict_of(realistic_fundus(brightness=2.5))["reasons"] == ["bright_warn"]
    assert verdict_of(realistic_fundus(brightness=0.2))["verdict"] == "reject"                      # far too dark
    assert verdict_of(realistic_fundus(brightness=6.0))["verdict"] == "reject"                      # blown out


def test_grain_is_rejected():
    noisy = np.clip(realistic_fundus().astype(np.float32) + np.random.default_rng(1).normal(0, 25, (224, 224, 3)), 0, 255).astype(np.uint8)
    assert verdict_of(noisy)["reasons"] == ["noise_reject"]


def test_no_retina_is_rejected_with_its_own_message():
    v = verdict_of(np.zeros((224, 224, 3), np.uint8))
    assert v["verdict"] == "reject" and v["reasons"] == ["no_retina"] and "fundus photograph" in v["message"]


def test_a_flat_image_is_rejected():
    assert verdict_of(np.full((224, 224, 3), 100, np.uint8))["verdict"] == "reject"


def test_a_large_black_border_no_longer_changes_the_verdict():
    """The previous gate averaged the whole frame, so a wide black border made a healthy photo look 'poorly lit'."""
    plain, bordered = realistic_fundus(), realistic_fundus(border=0.15)
    assert verdict_of(plain)["verdict"] == verdict_of(bordered)["verdict"] == "accept"
    assert abs(quality.measures(plain)["brightness"] - quality.measures(bordered)["brightness"]) < 0.06


def test_the_verdict_does_not_depend_on_file_resolution():
    """Measured on the 224 px view the classifier sees, so a 1792 px upload and a 224 px file are judged alike."""
    small = realistic_fundus()
    large = cv2.resize(small, (1792, 1792), interpolation=cv2.INTER_CUBIC)
    assert verdict_of(small)["verdict"] == verdict_of(large)["verdict"] == "accept"
    assert abs(quality.measures(small)["brightness"] - quality.measures(large)["brightness"]) < 0.01


def test_any_reasonable_image_size_is_handled():
    for size in (224, 512, 1200):
        assert verdict_of(cv2.resize(realistic_fundus(), (size, size)))["verdict"] in ("accept", "warn")


# ----------------------------------------------------------------------------------- decision logic
def test_thresholds_are_ordered_so_warn_bands_sit_between_accept_and_reject():
    t = quality.THRESHOLDS
    assert t["blur_reject"] < t["blur_warn"]
    assert t["dark_reject"] < t["dark_warn"]
    assert t["bright_warn"] < t["bright_reject"]


@pytest.mark.parametrize("change, expected", [
    ({"lap_var_norm": 0.02}, "blur_reject"), ({"lap_var_norm": 0.05}, "blur_warn"),
    ({"brightness": 0.09}, "dark_reject"), ({"brightness": 0.12}, "dark_warn"),
    ({"brightness": 0.75}, "bright_reject"), ({"brightness": 0.6}, "bright_warn"),
    ({"over_fraction": 0.2}, "bright_reject"), ({"hf_ratio": 0.6}, "noise_reject"),
])
def test_each_threshold_triggers_its_reason(change, expected):
    assert expected in quality.reason_codes({**GOOD, **change})


def test_warnings_are_dropped_when_the_image_is_already_rejected():
    codes = quality.reason_codes({**GOOD, "lap_var_norm": 0.01, "brightness": 0.12})
    assert "blur_reject" in codes and not any(c.endswith("_warn") for c in codes)


def test_reasons_are_reported_most_serious_first_and_the_message_is_the_first_reject():
    v = quality.verdict({**GOOD, "lap_var_norm": 0.01, "brightness": 0.05})
    assert v["verdict"] == "reject" and v["reasons"][0] == "blur_reject" and v["message"] == quality.MESSAGES["blur_reject"]


# ----------------------------------------------------------------------------------- wording
BANNED = [r"\bclear\b", r"\bnormal\b", r"\bhealthy\b", r"\bsafe\b", r"\brequired\b", r"\bmust\b", r"\benhanc", r"\bdiagnos"]


@pytest.mark.parametrize("code", list(quality.MESSAGES))
def test_quality_messages_follow_the_wording_rules(code):
    text = quality.MESSAGES[code].lower()
    for pattern in BANNED:
        assert not re.search(pattern, text), f"{code}: {pattern!r} in {text!r}"


def test_the_gate_never_claims_to_alter_the_image():
    assert not any("enhanc" in m.lower() or "correct" in m.lower() for m in quality.MESSAGES.values())
    assert all(m.startswith("Image") or m.startswith("No retina") or m.startswith("Quality") for m in quality.MESSAGES.values())


def test_every_reject_message_says_what_to_do_and_every_warning_says_results_may_suffer():
    for code, text in quality.MESSAGES.items():
        if code.endswith("_reject") or code == "no_retina":
            assert "Please" in text
        if code.endswith("_warn"):
            assert "less reliable" in text
