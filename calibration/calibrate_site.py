"""Calibrate the referral threshold on YOUR clinician-graded images.

    python calibration/calibrate_site.py --images D:/site_images --labels D:/site_grades.csv
    python calibration/calibrate_site.py --images D:/site_images --labels D:/site_grades.csv --target-sensitivity 0.95 --prevalence 0.10

Inputs
  --images   a folder of fundus photographs (searched recursively)
  --labels   a CSV: one row per image, the image name (extension optional) in the first column and the clinician's DR grade
             (0-4, or No_DR/Mild/Moderate/Severe/Proliferate_DR) in a column named grade/label/diagnosis (or use --label-col).
             For yes/no referral labels use --label-type binary (1 = referable).

It runs the deployed model on every image (needs MATLAB), applies the photo-quality gate, and writes a report showing what each
sensitivity target would cost, a recommendation ONLY if you name a target, and how that choice would have performed on images it was
not chosen on. Read calibration/README.md first: the target is a clinical decision, and this tool produces evidence, not approval.

Faster re-runs:  --predictions <out>/predictions.csv  skips the (slow) model run;  --skip-quality skips the photo check.
"""
import argparse
import csv
import datetime
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "backend"))

import core  # noqa: E402
from render import render_markdown  # noqa: E402

IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


def index_images(folder):
    """Index every image under `folder`: by bare name (stem) and by relative path. Returns (by_stem, by_relpath, ambiguous_stems)."""
    root = Path(folder)
    by_stem, by_rel, seen, ambiguous = {}, {}, set(), set()
    for p in sorted(root.rglob("*")):
        if p.suffix.lower() in IMAGE_TYPES and p.is_file():
            rel = p.relative_to(root).with_suffix("").as_posix()
            by_rel[rel] = p
            if p.stem in seen:
                ambiguous.add(p.stem)
            seen.add(p.stem)
            by_stem.setdefault(p.stem, p)
    return by_stem, by_rel, ambiguous


def resolve_images(keys, folder):
    """Match each labels-file key to a file. Returns ({key: path}, [problem strings]); ambiguous or missing keys are reported, never guessed."""
    by_stem, by_rel, ambiguous = index_images(folder)
    found, problems = {}, []
    for key in keys:
        if "/" in key:
            hits = [p for rel, p in by_rel.items() if rel == key or rel.endswith("/" + key)]
            if len(hits) == 1:
                found[key] = hits[0]
            elif not hits:
                problems.append(f"{key}: not found")
            else:
                problems.append(f"{key}: matches {len(hits)} files, give a longer path")
        elif key in ambiguous:
            problems.append(f"{key}: several images have this name; use a relative path such as folder/{key}.jpg in the labels file")
        elif key in by_stem:
            found[key] = by_stem[key]
        else:
            problems.append(f"{key}: not found")
    return found, problems


def read_predictions(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    return {r["id"]: np.array([float(r[f"p_{c}"]) for c in core.CLASSES]) for r in rows}


def run_model(paths, labels, ids, out_csv):
    """Run the deployed Stage 3 network over the images with the app's own preprocessing (MATLAB Engine)."""
    import matlab.engine

    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    # 'crop_mirror' is the app's own preparation and scoring (utils/preprocessStage3Input.m, utils/stage3Scores.m): calibrate what is deployed.
    eng.predictFiles([str(p) for p in paths], list(labels), Path(out_csv).as_posix(), list(ids), 'crop_mirror', nargout=0)
    eng.quit()


def check_quality(paths):
    import cv2

    import quality

    verdicts = {}
    for k, p in enumerate(paths):
        img = cv2.imread(str(p))
        verdicts[str(p)] = "reject" if img is None else quality.verdict(quality.measures(img))["verdict"]
        if (k + 1) % 50 == 0:
            print(f"  quality check {k + 1}/{len(paths)}", flush=True)
    return verdicts


def jsonable(x):
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    if isinstance(x, (np.floating, np.integer)):
        return x.item()
    return x


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("Inputs")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--out", help="output folder (default: calibration/output/<date-time>)")
    ap.add_argument("--target-sensitivity", type=float, help="the sensitivity you (and your clinical lead) require, e.g. 0.95. Without it no threshold is recommended.")
    ap.add_argument("--bound", choices=["lower", "point"], default="lower", help="lower: the 95%% lower confidence bound must reach the target (default, conservative)")
    ap.add_argument("--prevalence", type=float, help="share of referable eyes in your real screening population (default: the sample's, which is usually higher)")
    ap.add_argument("--current-threshold", type=float, default=core.DEFAULT_THRESHOLD, help="the threshold the app uses now (default: the model's 0.20)")
    ap.add_argument("--site", help="a name for the report")
    ap.add_argument("--label-col")
    ap.add_argument("--image-col")
    ap.add_argument("--label-type", choices=["grade", "binary"], default="grade")
    ap.add_argument("--predictions", help="reuse a predictions.csv from an earlier run instead of running the model")
    ap.add_argument("--skip-quality", action="store_true")
    ap.add_argument("--include-rejected", action="store_true", help="keep photos the quality gate rejects in the analysis (default: exclude them)")
    ap.add_argument("--limit", type=int, help="use only the first N labelled images (for a quick trial)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)

    if args.target_sensitivity is not None and not 0.5 < args.target_sensitivity < 1.0:
        ap.error("--target-sensitivity must be between 0.5 and 1 (for example 0.95)")

    try:
        labels, label_problems = core.read_labels(args.labels, args.image_col, args.label_col, args.label_type)
    except core.DuplicateNames as exc:
        sys.exit(f"Stopped: {exc}")
    resolved, path_problems = resolve_images(list(labels), args.images)
    missing = [p.split(":")[0] for p in path_problems]
    label_problems = label_problems + [p for p in path_problems if "not found" not in p]
    names = [n for n in labels if n in resolved]
    if args.limit:
        names = names[: args.limit]
    if not names:
        sys.exit("None of the labelled images were found in the images folder. Check the names in the first column of the labels file.")
    print(f"{len(names)} labelled images found ({len(missing)} labelled but missing or ambiguous)", flush=True)

    out = Path(args.out) if args.out else HERE / "output" / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    paths = [resolved[n] for n in names]

    quality_counts, verdicts = None, {}
    if not args.skip_quality:
        print("Checking photo quality ...", flush=True)
        verdicts = dict(zip(names, check_quality(paths).values()))
        v = list(verdicts.values())
        quality_counts = {k: v.count(k) for k in ("accept", "warn", "reject")}
        quality_counts["excluded_rejected"] = not args.include_rejected

    if args.predictions:
        preds = read_predictions(args.predictions)
    else:
        print("Running the model (this takes a while) ...", flush=True)
        run_model(paths, [labels[n] for n in names], names, out / "predictions.csv")
        preds = read_predictions(out / "predictions.csv")
    still_missing = [n for n in names if n not in preds]
    if still_missing:
        missing += still_missing
        names = [n for n in names if n in preds]

    if verdicts and not args.include_rejected:
        names = [n for n in names if verdicts.get(n) != "reject"]
    if not names:
        sys.exit("No images left to analyse after removing rejected photos.")

    grades = [labels[n] for n in names]
    scores = core.referral_score(np.array([preds[n] for n in names]))
    result = core.analyse(grades, scores, target=args.target_sensitivity, bound=args.bound, prevalence=args.prevalence,
                          deployed=args.current_threshold, seed=args.seed)

    used = result["recommendation"]["threshold"] if result["recommendation"] else args.current_threshold
    missed = sorted(((n, g, float(s)) for n, g, s in zip(names, grades, scores) if g in core.REFERABLE and s < used),
                    key=lambda t: (-core.GRADE_NAMES.index(t[1]), t[2]))
    meta = {"site": args.site, "quality": quality_counts, "missing_images": missing, "label_problems": label_problems, "missed_ids": missed}

    report = render_markdown(result, meta)
    (out / "calibration_report.md").write_text(report, encoding="utf-8")
    (out / "calibration_results.json").write_text(json.dumps(jsonable({**result, "meta": meta}), indent=1), encoding="utf-8")
    with open(out / "threshold_sweep.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["threshold", "sensitivity", "specificity", "TP", "FN", "TN", "FP", "share_flagged"])
        for t, r in result["sweep"].items():
            w.writerow([t, f"{r['sensitivity']:.4f}", f"{r['specificity']:.4f}", r["TP"], r["FN"], r["TN"], r["FP"], f"{r['flagged_share']:.4f}"])
    print(f"\nReport written to {out / 'calibration_report.md'}\n")
    print(report)
    return result


if __name__ == "__main__":
    main()
