"""Per-site calibration of the referral threshold: the analysis, with no MATLAB and no images (numpy only).

The deployed model flags an eye as referable when its referral score (P(Moderate)+P(Severe)+P(Proliferative)) reaches a threshold
(0.2, tuned on APTOS). validation/QUALITY.md shows that on a different dataset the same threshold flags far more healthy eyes, so a
site should measure the model on its OWN clinician-graded images and choose the operating point deliberately.

What this module will and will not do:
  * It measures sensitivity/specificity (with confidence intervals) across thresholds on the site's graded images.
  * It recommends a threshold ONLY for a sensitivity target the caller names. What miss rate is acceptable is a clinical decision.
  * By default the target must hold at the LOWER end of the confidence interval, so a small sample cannot look better than it is.
  * It reports how the choice would have performed on images it was not chosen on (repeated stratified hold-out), because choosing
    and scoring on the same images is optimistic.
  * It refuses to recommend anything when there are too few graded cases, or when the target cannot be reached.
"""
import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "validation"))
import analyze  # noqa: E402  (wilson, auc, predictive_values, class names: shared with the validation report)

CLASSES = analyze.CLASSES                      # column order of the prediction CSVs
GRADE_NAMES = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]   # ICDR grades 0-4
REFERABLE = set(analyze.REFERABLE)
DEFAULT_THRESHOLD = analyze.DEPLOYED_THRESHOLD
GRID = np.round(np.arange(0.02, 0.96, 0.01), 2)      # thresholds considered (the deployed model was tuned at 0.20)
MIN_POSITIVES_TO_RECOMMEND = 30                       # below this a sensitivity estimate is close to meaningless
COMFORTABLE_POSITIVES = 140                           # about +/-5 points at 90% sensitivity
COMFORTABLE_NEGATIVES = 140
SENSITIVITY_TARGETS = (0.85, 0.90, 0.95, 0.97)
MAX_RECOMMENDED_THRESHOLD = 0.60                      # the app refuses to run with a higher override (see backend/server.py)

_SYNONYMS = {
    "no_dr": "No_DR", "nodr": "No_DR", "no dr": "No_DR", "none": "No_DR", "normal": "No_DR",
    "mild": "Mild", "mild_npdr": "Mild", "moderate": "Moderate", "moderate_npdr": "Moderate",
    "severe": "Severe", "severe_npdr": "Severe", "proliferate_dr": "Proliferate_DR", "proliferative": "Proliferate_DR",
    "proliferative_dr": "Proliferate_DR", "pdr": "Proliferate_DR",
}


# ---------------------------------------------------------------------------------------------------------- labels
def parse_grade(value, label_type="grade"):
    """One label cell -> class name. label_type 'grade': ICDR 0-4 or a class name. 'binary': 1 = referable, 0 = not."""
    text = str(value).strip()
    if label_type == "binary":
        if text.lower() in ("1", "true", "yes", "referable"):
            return "Moderate"                     # stands in for "referable" (only the referable/not distinction is used)
        if text.lower() in ("0", "false", "no", "non-referable", "nonreferable", "not referable"):
            return "No_DR"
        raise ValueError(f"cannot read {value!r} as a binary referable label (use 1/0)")
    if text in ("0", "1", "2", "3", "4"):
        return GRADE_NAMES[int(text)]
    key = text.lower().replace("-", "_")
    if key in _SYNONYMS:
        return _SYNONYMS[key]
    raise ValueError(f"cannot read {value!r} as a DR grade (use 0-4 or one of {GRADE_NAMES})")


class DuplicateNames(ValueError):
    """The labels file names the same image more than once, so it is unclear which photograph each grade belongs to."""

    def __init__(self, names):
        self.names = names
        shown = ", ".join(names[:5]) + (" ..." if len(names) > 5 else "")
        super().__init__(
            f"{len(names)} image names appear more than once in the labels file ({shown}). Two different photographs can share a file name "
            "(for example one per folder or per year). Use relative paths in the first column, like train/IDRiD_001.jpg, so each row identifies one image."
        )


IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp")


def normalise_name(value):
    """A labels-file image name -> the key used everywhere else: forward slashes, no image extension. A bare name stays bare;
    a relative path (folder/name.jpg) keeps its folders so identically named files in different folders stay distinct."""
    text = str(value).strip().replace(chr(92), "/").strip("/")
    if text.lower().endswith(IMAGE_EXTENSIONS):
        text = text[: text.rfind(".")]
    return text


def read_labels(path, image_col=None, label_col=None, label_type="grade"):
    """CSV -> ({image key: class name}, list of problems). Raises DuplicateNames if any image is named twice."""
    problems, out, seen, repeated = [], {}, set(), []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise ValueError("the labels file has no rows")
    columns = [c for c in rows[0].keys() if c is not None]
    image_col = image_col or columns[0]
    if label_col is None:
        guesses = [c for c in columns if c.strip().lower() in ("grade", "label", "diagnosis", "dr_grade", "retinopathy grade", "dr", "referable")]
        if not guesses:
            raise ValueError(f"cannot tell which column holds the grade; columns are {columns}. Use --label-col.")
        label_col = guesses[0]
    for line, row in enumerate(rows, start=2):
        name = normalise_name(row[image_col])
        if not name:
            continue
        if name in seen:
            repeated.append(name)
            continue
        seen.add(name)
        try:
            out[name] = parse_grade(row[label_col], label_type)
        except ValueError as exc:
            problems.append(f"line {line}: {exc}")
    if repeated:
        raise DuplicateNames(sorted(set(repeated)))
    return out, problems


# ------------------------------------------------------------------------------------------------------ measures
def referral_score(probs):
    return np.asarray(probs)[:, [CLASSES.index(c) for c in sorted(REFERABLE)]].sum(1)


def confusion(truth, score, threshold):
    flagged = score >= threshold
    return {"TP": int((flagged & truth).sum()), "FN": int((~flagged & truth).sum()),
            "TN": int((~flagged & ~truth).sum()), "FP": int((flagged & ~truth).sum())}


def rates(c):
    pos, neg = c["TP"] + c["FN"], c["TN"] + c["FP"]
    sens, spec = (c["TP"] / pos if pos else float("nan")), (c["TN"] / neg if neg else float("nan"))
    return {**c, "sensitivity": sens, "sensitivity_ci": analyze.wilson(c["TP"], pos), "specificity": spec,
            "specificity_ci": analyze.wilson(c["TN"], neg), "flagged_share": (c["TP"] + c["FP"]) / max(1, pos + neg)}


def sweep(truth, score, grid=GRID):
    return {float(t): rates(confusion(truth, score, t)) for t in grid}


def meets_target(r, target, bound):
    """Does this operating point reach the sensitivity target ('lower' = the 95% lower confidence bound must reach it)?"""
    value = r["sensitivity_ci"][0] if bound == "lower" else r["sensitivity"]
    return not np.isnan(value) and value >= target


def choose_threshold(truth, score, target, bound="lower"):
    """The HIGHEST threshold (fewest false referrals) whose sensitivity reaches the target, or None if no threshold does.
    Sensitivity never rises as the threshold rises, so scanning downward finds it."""
    if int(truth.sum()) < MIN_POSITIVES_TO_RECOMMEND:
        return None
    for t in GRID[::-1]:
        if meets_target(rates(confusion(truth, score, t)), target, bound):
            return float(t)
    return None


def holdout_study(truth, score, target, bound="lower", repeats=300, held_out=0.3, seed=0):
    """How would 'choose a threshold on part of the data' have performed on data it did not see?
    Repeated stratified splits: choose on the tuning part, score on the held-out part."""
    rng = np.random.default_rng(seed)
    pos, neg = np.flatnonzero(truth), np.flatnonzero(~truth)
    if len(pos) == 0 or len(neg) == 0:
        return None
    chosen, sens, spec, reached = [], [], [], 0
    for _ in range(repeats):
        hp = rng.choice(pos, size=max(1, int(round(len(pos) * held_out))), replace=False)
        hn = rng.choice(neg, size=max(1, int(round(len(neg) * held_out))), replace=False)
        hold = np.zeros(len(truth), bool)
        hold[hp], hold[hn] = True, True
        t = choose_threshold(truth[~hold], score[~hold], target, bound)
        if t is None:
            continue
        r = rates(confusion(truth[hold], score[hold], t))
        chosen.append(t)
        sens.append(r["sensitivity"])
        spec.append(r["specificity"])
        reached += r["sensitivity"] >= target
    if not chosen:
        return None
    return {"repeats": repeats, "usable_repeats": len(chosen), "threshold_median": float(np.median(chosen)),
            "threshold_p10": float(np.percentile(chosen, 10)), "threshold_p90": float(np.percentile(chosen, 90)),
            "held_out_sensitivity_mean": float(np.mean(sens)), "held_out_sensitivity_p5": float(np.percentile(sens, 5)),
            "held_out_specificity_mean": float(np.mean(spec)), "share_reaching_target": reached / len(chosen)}


def positives_needed(target, half_width=0.05):
    """Referable cases needed for a sensitivity estimate at `target` to be known to within +/- half_width (95%)."""
    return int(np.ceil(1.96 ** 2 * target * (1 - target) / half_width ** 2))


# ------------------------------------------------------------------------------------------------------ analysis
def analyse(labels, scores, target=None, bound="lower", prevalence=None, deployed=DEFAULT_THRESHOLD, seed=0):
    """labels: class names, scores: referral scores (aligned). Returns a plain-dict result (see render_markdown)."""
    truth = np.array([l in REFERABLE for l in labels], dtype=bool)
    score = np.asarray(scores, float)
    n_pos, n_neg = int(truth.sum()), int((~truth).sum())
    out = {
        "n": len(truth), "positives": n_pos, "negatives": n_neg, "observed_prevalence": n_pos / max(1, len(truth)),
        "auc": analyze.auc(score, truth) if n_pos and n_neg else float("nan"),
        "bound": bound, "target": target, "deployed_threshold": deployed,
        "at_deployed": rates(confusion(truth, score, deployed)),
        "sweep": sweep(truth, score),
        "class_counts": {g: int(sum(1 for l in labels if l == g)) for g in GRADE_NAMES},
        "warnings": [],
    }
    if n_pos < COMFORTABLE_POSITIVES:
        out["warnings"].append(f"Only {n_pos} referable cases: sensitivity is uncertain (about {COMFORTABLE_POSITIVES} give roughly +/-5 points at 90% sensitivity).")
    if n_neg < COMFORTABLE_NEGATIVES:
        out["warnings"].append(f"Only {n_neg} non-referable cases: specificity is uncertain (about {COMFORTABLE_NEGATIVES} are recommended).")
    if n_pos == 0 or n_neg == 0:
        out["warnings"].append("The sample needs both referable and non-referable eyes; nothing can be measured otherwise.")
    if out["auc"] == out["auc"] and out["auc"] < 0.80:
        out["warnings"].append(f"The model separates referable from non-referable poorly on this data (AUC {out['auc']:.2f}); no threshold will fix that.")

    out["options"] = {}
    for tgt in SENSITIVITY_TARGETS:
        t = choose_threshold(truth, score, tgt, bound)
        out["options"][tgt] = None if t is None else {"threshold": t, **rates(confusion(truth, score, t))}

    out["recommendation"] = None
    out["recommendation_note"] = "No sensitivity target was named, so no threshold is recommended: pick a target from the table (a clinical decision)."
    if target is not None:
        if n_pos == 0 or n_neg == 0:
            out["recommendation_note"] = ("Refused: the sample needs both referable and non-referable eyes. With only one kind, sensitivity or specificity "
                                          "cannot be measured, so the cost of any threshold is unknown.")
        elif n_pos < MIN_POSITIVES_TO_RECOMMEND:
            out["recommendation_note"] = f"Refused: only {n_pos} referable cases (at least {MIN_POSITIVES_TO_RECOMMEND} are needed, ideally {COMFORTABLE_POSITIVES}+)."
        else:
            t = choose_threshold(truth, score, target, bound)
            if t is None:
                out["recommendation_note"] = (f"No threshold reaches {target:.0%} sensitivity"
                                              f"{' with its lower confidence bound' if bound == 'lower' else ''} on this data. "
                                              "The model may not be suitable for this population, or more graded cases are needed.")
            else:
                # A LOWER threshold flags more eyes, so it can only raise sensitivity: capping at the app's maximum still meets the target.
                capped = t > MAX_RECOMMENDED_THRESHOLD
                t = min(t, MAX_RECOMMENDED_THRESHOLD)
                out["recommendation"] = {"threshold": t, "target": target, "capped": capped, **rates(confusion(truth, score, t)),
                                         "holdout": holdout_study(truth, score, target, bound, seed=seed)}
                out["recommendation_note"] = "See the hold-out estimate below: it, not the figures on the full sample, is the fair expectation."

    prev = prevalence if prevalence is not None else out["observed_prevalence"]
    out["prevalence_used"] = prev
    out["predictive_values"] = {}
    for label, r in (("deployed", out["at_deployed"]), ("recommended", out["recommendation"])):
        usable = r is not None and r["sensitivity"] == r["sensitivity"] and r["specificity"] == r["specificity"] and 0 < prev < 1
        if usable:
            ppv, npv = analyze.predictive_values(r["sensitivity"], r["specificity"], prev)
            flagged = 1000 * (r["sensitivity"] * prev + (1 - r["specificity"]) * (1 - prev))
            out["predictive_values"][label] = {"ppv": ppv, "npv": npv, "flagged_per_1000": flagged}
    return out
