"""Evaluate the RETIRED Stage 2 lesion overlay (`segment_lesions`, kept in validation/legacy_overlay.py; the app shipped it until 2026-09-24).

    python validation/evaluate_lesions.py            # both parts (about 15 minutes)
    python validation/evaluate_lesions.py --part idrid
    python validation/evaluate_lesions.py --part aptos

Part A  IDRiD pixel-level ground truth (81 images): overlap with the annotated lesions, per lesion type.
Part B  APTOS, by disease grade: how many "lesion" candidates does it draw on healthy vs diseased eyes?

Needs data/idrid_segmentation and data/aptos2019. Writes validation/results/lesions.json and lesions.md.
"""
import argparse
import csv
import json
import os
import sys
from multiprocessing import Pool
from pathlib import Path

os.environ.setdefault("DISABLE_MATLAB", "true")
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "validation"))
import legacy_overlay as server  # noqa: E402  (the retired code under test; named server so the evaluation reads as before)

IDRID = ROOT / "data" / "idrid_segmentation" / "A. Segmentation" / "A. Segmentation"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"
RESULTS = ROOT / "validation" / "results"

# Overlay colours (BGRA) written by segment_lesions, and the IDRiD masks they should correspond to.
TYPES = {
    "exudates": (server.EXUDATE_BGRA, "3. Hard Exudates", "EX"),
    "hemorrhages": (server.HEMORRHAGE_BGRA, "2. Haemorrhages", "HE"),
    "microaneurysms": (server.MICROANEURYSM_BGRA, "1. Microaneurysms", "MA"),
}
GRADES = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]


def predicted_masks(img):
    """Run the shipped segmentation and split its colour-coded overlay back into one binary mask per lesion type."""
    overlay, counts = server.segment_lesions(img)
    masks = {}
    for name, (bgra, _, _) in TYPES.items():
        masks[name] = np.all(overlay == np.array(bgra, np.uint8), axis=2)
    return masks, counts


# ------------------------------------------------------------------------------------------ Part A: IDRiD
def load_gt(split, stem, folder, code, shape):
    path = IDRID / "2. All Segmentation Groundtruths" / split / folder / f"{stem}_{code}.tif"
    if not path.exists():                      # IDRiD omits the file when an image has none of that lesion
        return np.zeros(shape, bool)
    m = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if m.ndim == 3:                            # colour channels only: IDRiD_81_EX.tif is RGBA, lesion in red, alpha all 255
        m = m[:, :, :3].max(axis=2)
    return m > 0


def components(mask):
    n, labels = cv2.connectedComponents(mask.astype(np.uint8))
    return n - 1, labels


def evaluate_idrid_image(job):
    split_dir, split_gt, path = job
    stem = Path(path).stem
    img = cv2.imread(path)
    pred, _ = predicted_masks(img)
    out = {"image": stem, "split": "test" if "Testing" in split_dir else "train", "types": {}}
    fov = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 15
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    for name, (_, folder, code) in TYPES.items():
        gt = load_gt(split_gt, stem, folder, code, img.shape[:2])
        p = pred[name]
        gt_tol = cv2.dilate(gt.astype(np.uint8), kernel).astype(bool)        # ~3 px boundary tolerance
        tp = int((p & gt).sum())
        n_gt, gt_lab = components(gt)
        n_pr, pr_lab = components(p)
        gt_found = len(np.unique(gt_lab[p & gt])) if n_gt else 0             # annotated lesions the overlay touches
        pr_hit = len(np.unique(pr_lab[gt_tol & p])) if n_pr else 0          # drawn regions that sit on a real lesion
        out["types"][name] = {
            "gt_pixels": int(gt.sum()), "pred_pixels": int(p.sum()), "tp_pixels": tp,
            "fov_pixels": int(fov.sum()),
            "gt_lesions": n_gt, "gt_lesions_found": int(gt_found),
            "pred_regions": n_pr, "pred_regions_on_lesion": int(pr_hit),
        }
    return out


def part_idrid(processes):
    jobs = []
    for split_dir, split_gt in (("1. Original Images/a. Training Set", "a. Training Set"), ("1. Original Images/b. Testing Set", "b. Testing Set")):
        jobs += [(split_dir, split_gt, str(p)) for p in sorted((IDRID / split_dir).glob("*.jpg"))]
    print(f"Part A: {len(jobs)} IDRiD images ...", flush=True)
    with Pool(processes) as pool:
        return pool.map(evaluate_idrid_image, jobs)


def summarise_idrid(rows):
    out = {}
    for scope, sel in (("all 81 images", rows), ("test set (27)", [r for r in rows if r["split"] == "test"])):
        per = {}
        for name in TYPES:
            t = [r["types"][name] for r in sel]
            gt, pr, tp = sum(x["gt_pixels"] for x in t), sum(x["pred_pixels"] for x in t), sum(x["tp_pixels"] for x in t)
            fov = sum(x["fov_pixels"] for x in t)
            gl, gf = sum(x["gt_lesions"] for x in t), sum(x["gt_lesions_found"] for x in t)
            pg, ph = sum(x["pred_regions"] for x in t), sum(x["pred_regions_on_lesion"] for x in t)
            precision, recall = tp / max(1, pr), tp / max(1, gt)
            base = gt / max(1, fov)                                          # precision of a random guess = lesion share of the retina
            per[name] = {
                "pixel_precision": precision, "pixel_recall": recall,
                "dice": 2 * tp / max(1, gt + pr), "chance_precision": base, "lift_over_chance": precision / base if base else None,
                "lesion_sensitivity": gf / max(1, gl), "lesion_count": gl,
                "region_precision": ph / max(1, pg), "regions_drawn": pg, "regions_per_true_lesion": pg / max(1, gl),
            }
        out[scope] = per
    return out


# ------------------------------------------------------------------------------------------ Part B: APTOS
def aptos_candidates(job):
    label, image_id = job
    img = cv2.imread(str(APTOS / label / f"{image_id}.png"))
    try:
        overlay, counts = server.segment_lesions(img)
    except Exception:                                                        # noqa: BLE001 - e.g. no retina found
        return None
    inside = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 15
    flagged = float((overlay[:, :, 3] > 0).sum()) / max(1, int(inside.sum()))
    return {"label": label, "id": image_id, **counts, "total": sum(counts.values()), "flagged_share": flagged}


def part_aptos(processes, per_grade):
    rows = list(csv.DictReader(open(RESULTS / "splits.csv", encoding="utf-8")))
    rng = np.random.default_rng(3)
    jobs = []
    for g in GRADES:
        pool_ids = [r["id"] for r in rows if r["split"] == "test" and r["label"] == g]
        pick = rng.choice(pool_ids, size=min(per_grade, len(pool_ids)), replace=False)
        jobs += [(g, i) for i in pick]
    print(f"Part B: {len(jobs)} APTOS test images ...", flush=True)
    with Pool(processes) as pool:
        return [r for r in pool.map(aptos_candidates, jobs) if r]


def auc(score, positive):
    pos, neg = np.asarray(score)[positive], np.asarray(score)[~positive]
    return float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg]))


def summarise_aptos(rows):
    by = {}
    for g in GRADES:
        sel = [r for r in rows if r["label"] == g]
        if not sel:
            continue
        by[g] = {"n": len(sel)}
        for k in ("microaneurysms", "hemorrhages", "exudates", "total", "flagged_share"):
            v = np.array([r[k] for r in sel], float)
            by[g][k] = {"median": float(np.median(v)), "p10": float(np.percentile(v, 10)), "p90": float(np.percentile(v, 90))}
    ref = np.array([r["label"] in ("Moderate", "Severe", "Proliferate_DR") for r in rows])
    aucs = {k: auc([r[k] for r in rows], ref) for k in ("microaneurysms", "hemorrhages", "exudates", "total")}
    healthy = [r for r in rows if r["label"] == "No_DR"]
    return {"by_grade": by, "auc_referable_vs_not": aucs, "n": len(rows),
            "healthy_with_any_candidate": float(np.mean([r["total"] > 0 for r in healthy])) if healthy else None,
            "healthy_median_total": float(np.median([r["total"] for r in healthy])) if healthy else None}


# ------------------------------------------------------------------------------------------ report
def to_markdown(idrid, aptos):
    L = []
    if idrid:
        L.append("## A. Overlap with annotated lesions (IDRiD, pixel-level ground truth)\n")
        L.append("Precision = share of drawn pixels that lie on a real lesion. Chance = precision of a random guess (the lesion share of the "
                 "retina). Lesion sensitivity = share of annotated lesions the overlay touches. Region precision = share of drawn regions "
                 "sitting on a real lesion (3 px tolerance).\n")
        for scope, per in idrid.items():
            L.append(f"**{scope}**\n")
            L.append("| Overlay label | Pixel precision | Chance | Pixel recall | Dice | Lesion sensitivity | Region precision | Regions drawn per true lesion |\n|---|---|---|---|---|---|---|---|")
            for name, m in per.items():
                L.append(f"| {name} | {m['pixel_precision']:.1%} | {m['chance_precision']:.1%} | {m['pixel_recall']:.1%} | {m['dice']:.3f} | "
                         f"{m['lesion_sensitivity']:.1%} of {m['lesion_count']} | {m['region_precision']:.1%} | {m['regions_per_true_lesion']:.1f} |")
            L.append("")
    if aptos:
        L.append("## B. What the overlay draws on healthy vs diseased eyes (APTOS test images)\n")
        L.append(f"{aptos['n']} images, evenly sampled across true grades. Numbers are the median (10th-90th percentile) count of drawn regions per image.\n")
        L.append("| True grade | n | Microaneurysm-like | Hemorrhage-like | Exudate-like | All regions | Share of retina painted |\n|---|---|---|---|---|---|---|")
        for g, m in aptos["by_grade"].items():
            f = lambda k: f"{m[k]['median']:.0f} ({m[k]['p10']:.0f}-{m[k]['p90']:.0f})"
            L.append(f"| {g} | {m['n']} | {f('microaneurysms')} | {f('hemorrhages')} | {f('exudates')} | {f('total')} | {m['flagged_share']['median']:.1%} |")
        L.append("")
        L.append("How well does the number of drawn regions tell referable from non-referable eyes? (AUC; 0.5 = no information)\n")
        L.append("| Count used | AUC |\n|---|---|")
        for k, v in aptos["auc_referable_vs_not"].items():
            L.append(f"| {k} | {v:.3f} |")
        L.append(f"\nHealthy (No_DR) eyes with at least one drawn region: **{aptos['healthy_with_any_candidate']:.0%}** "
                 f"(median {aptos['healthy_median_total']:.0f} regions).\n")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["idrid", "aptos", "both"], default="both")
    ap.add_argument("--processes", type=int, default=3)
    ap.add_argument("--per-grade", type=int, default=60)
    args = ap.parse_args()

    out = {}
    path = RESULTS / "lesions.json"
    if path.exists():
        out = json.loads(path.read_text(encoding="utf-8"))
    if args.part in ("idrid", "both"):
        rows = part_idrid(args.processes)
        out["idrid_images"] = rows
        out["idrid"] = summarise_idrid(rows)
    if args.part in ("aptos", "both"):
        rows = part_aptos(args.processes, args.per_grade)
        out["aptos_images"] = rows
        out["aptos"] = summarise_aptos(rows)
    path.write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    md = to_markdown(out.get("idrid"), out.get("aptos"))
    (RESULTS / "lesions.md").write_text(md, encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
