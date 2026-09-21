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
    v = verdict_of(realistic_fundus(brightness=2.5))
    assert v["reasons"][0] == "bright_warn" and v["message"] == quality.MESSAGES["bright_warn"]        # the disc washes out too, but the exposure message comes first
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


# ----------------------------------------------------------------------------------- is it a whole colour fundus photograph?
def _scene(kind):
    rng = np.random.default_rng(0)
    if kind == "text page":
        img = np.full((600, 800, 3), 235, np.uint8)
        for _ in range(300):
            cv2.putText(img, "abc def", (int(rng.integers(0, 700)), int(rng.integers(20, 580))), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        return img
    if kind == "grey disc on black":
        img = np.zeros((600, 600, 3), np.uint8)
        cv2.circle(img, (300, 300), 280, (170, 170, 170), -1)
        return img
    if kind == "blue disc on black":
        img = np.zeros((600, 600, 3), np.uint8)
        cv2.circle(img, (300, 300), 280, (200, 120, 60), -1)
        return cv2.add(img, (rng.random((600, 600, 3)) * 20).astype(np.uint8))
    if kind == "green scene":
        img = cv2.GaussianBlur(rng.random((600, 800, 3)).astype(np.float32), (0, 0), 6)
        img[..., 1] += 0.5                                              # green cast
        return cv2.normalize(img, None, 40, 200, cv2.NORM_MINMAX).astype(np.uint8)
    raise ValueError(kind)


@pytest.mark.parametrize("kind", ["text page", "grey disc on black", "blue disc on black"])
def test_a_picture_that_is_not_a_colour_retinal_photo_is_rejected(kind):
    v = verdict_of(_scene(kind))
    assert v["verdict"] == "reject" and "not_colour_reject" in v["reasons"]
    assert "colour retinal photograph" in v["message"]


def test_a_greyscale_copy_of_a_good_photo_is_rejected():
    grey = cv2.cvtColor(cv2.cvtColor(realistic_fundus(), cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    assert "not_colour_reject" in verdict_of(grey)["reasons"]


def test_a_photo_with_a_wrong_colour_cast_only_warns_because_a_few_real_photos_look_like_that():
    v = verdict_of(_scene("green scene"))
    assert "colour_warn" in v["reasons"] or v["verdict"] == "reject"          # never silently accepted
    warm = verdict_of(realistic_fundus())
    assert "colour_warn" not in warm["reasons"]


@pytest.mark.parametrize("name, crop", [
    ("left half", lambda f: f[:, : f.shape[1] // 2]),
    ("right third", lambda f: f[:, -f.shape[1] // 3:]),
    ("top half", lambda f: f[: f.shape[0] // 2]),
])
def test_only_part_of_the_retina_is_rejected(name, crop):
    wide = cv2.resize(realistic_fundus(), (448, 448))
    v = verdict_of(np.ascontiguousarray(crop(wide)))
    assert v["verdict"] == "reject" and "partial_reject" in v["reasons"], name
    assert "whole retina" in v["message"]


def test_a_full_photo_is_not_taken_for_partial_at_any_proportion_seen_in_real_data():
    base = realistic_fundus()
    for w, h in ((224, 224), (285, 224), (224, 300)):        # 1.0, IDRiD-like 1.27 wide frame, tall frame with the retina inside
        canvas = np.zeros((h, w, 3), np.uint8)
        y, x = (h - 224) // 2, (w - 224) // 2
        canvas[y:y + 224, x:x + 224] = base
        assert "partial_reject" not in verdict_of(canvas)["reasons"], (w, h)


def test_the_new_measures_do_not_depend_on_file_size():
    small, large = realistic_fundus(224), cv2.resize(realistic_fundus(224), (1600, 1600))
    a, b = quality.fundus_measures(small), quality.fundus_measures(large)
    for k in a:
        assert abs(a[k] - b[k]) <= 0.05 * max(1.0, abs(a[k])), k        # 5% (the disc score is about 5, the others are 0 to 1)


# ----------------------------------------------------------------------------------- is the optic disc in the picture?
def _fundus_with_disc_removed():
    """The synthetic fundus with its bright optic disc painted over with the surrounding colour."""
    img = realistic_fundus(seed=3)
    size = img.shape[0]
    cv2.circle(img, (int(size * 0.68), int(size * 0.5)), int(size * 0.09), (35, 85, 150), -1)
    return cv2.GaussianBlur(img, (0, 0), 0.8)


def test_a_photo_with_an_optic_disc_gets_no_disc_warning():
    v = verdict_of(realistic_fundus(seed=3))
    assert "disc_warn" not in v["reasons"], quality.measures(realistic_fundus(seed=3))["disc_score"]


def test_a_photo_without_a_disc_gets_the_disc_warning_but_is_not_rejected():
    m = quality.measures(_fundus_with_disc_removed())
    assert m["disc_score"] < quality.measures(realistic_fundus(seed=3))["disc_score"]
    v = quality.verdict({**quality.measures(realistic_fundus(seed=3)), "disc_score": 1.5})
    assert v["verdict"] == "warn" and v["reasons"] == ["disc_warn"] and "optic disc" in v["message"]


def test_the_disc_warning_is_the_lowest_priority_warning():
    v = quality.verdict({**GOOD, "brightness": 0.12, "disc_score": 1.0})
    assert v["reasons"] == ["dark_warn", "disc_warn"] and v["message"] == quality.MESSAGES["dark_warn"]


# ----------------------------------------------------------------------------------- the same picture twice
def test_the_same_picture_is_recognised_even_when_resaved_shrunk_or_brightened():
    a = realistic_fundus(seed=1)
    jpeg = cv2.imdecode(cv2.imencode(".jpg", a, [cv2.IMWRITE_JPEG_QUALITY, 40])[1], cv2.IMREAD_COLOR)
    for copy in (a.copy(), jpeg, cv2.resize(a, (112, 112), interpolation=cv2.INTER_AREA), np.clip(a.astype(np.float32) * 1.3, 0, 255).astype(np.uint8)):
        assert quality.is_same_picture(a, copy)


def test_different_photographs_are_not_the_same_picture():
    assert not quality.is_same_picture(realistic_fundus(seed=1), realistic_fundus(seed=2))
    assert quality.picture_similarity(realistic_fundus(seed=1), realistic_fundus(seed=2)) < quality.THRESHOLDS["same_picture"] - 0.1


def test_a_blank_image_is_never_the_same_picture_as_anything():
    assert quality.picture_similarity(np.zeros((224, 224, 3), np.uint8), realistic_fundus()) == 0.0


# ----------------------------------------------------------------------------------- decision logic
def test_thresholds_are_ordered_so_warn_bands_sit_between_accept_and_reject():
    t = quality.THRESHOLDS
    assert t["blur_reject"] < t["blur_warn"]
    assert t["dark_reject"] < t["dark_warn"]
    assert t["bright_warn"] < t["bright_reject"]
    assert t["colour_reject"] < t["colour_warn"]
    assert t["aspect_min"] < 1.0 < t["aspect_max"]


@pytest.mark.parametrize("change, expected", [
    ({"lap_var_norm": 0.02}, "blur_reject"), ({"lap_var_norm": 0.05}, "blur_warn"),
    ({"brightness": 0.09}, "dark_reject"), ({"brightness": 0.12}, "dark_warn"),
    ({"brightness": 0.75}, "bright_reject"), ({"brightness": 0.6}, "bright_warn"),
    ({"over_fraction": 0.2}, "bright_reject"), ({"hf_ratio": 0.6}, "noise_reject"),
    ({"warm_share": 0.01}, "not_colour_reject"), ({"mean_saturation": 0.05}, "not_colour_reject"), ({"warm_share": 0.2}, "colour_warn"),
    ({"retina_aspect": 0.4}, "partial_reject"), ({"retina_aspect": 1.8}, "partial_reject"),
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
