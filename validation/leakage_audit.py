"""Look for the same photograph appearing in both the training and the held-out data.

APTOS 2019 is known to contain duplicate and near-duplicate images (the same eye exported or scaled twice). If a test
image also sits in the training set, the model is being graded on something it has effectively seen, and the test
metrics are optimistic. This script finds:
  * exact duplicates (identical file bytes), and
  * near duplicates: images whose fine retinal structure (vessels, lesions) correlates almost perfectly.

Fundus photographs are all a bright disc on a dark background, so comparing raw thumbnails makes unrelated images look
alike. Each image is therefore reduced to its green channel, resized, and high-pass filtered (the disc and the
illumination gradient removed) before correlating.

    python validation/leakage_audit.py            # needs validation/results/splits.csv (run export_splits.py)

Writes validation/results/leakage.json.
"""
import csv
import hashlib
import json
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "aptos2019" / "colored_images"
RESULTS = ROOT / "validation" / "results"

SIZE = 96
NEAR_DUPLICATE_MIN = 0.90     # structural correlation at or above this counts as the same photograph


def fingerprint(item):
    image_id, label = item
    path = DATA / label / f"{image_id}.png"
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return image_id, sha, np.zeros(SIZE * SIZE, np.float32)
    green = cv2.resize(img[:, :, 1], (SIZE, SIZE), interpolation=cv2.INTER_AREA).astype(np.float32)
    structure = green - cv2.GaussianBlur(green, (0, 0), 4)          # remove the disc shape and lighting
    yy, xx = np.mgrid[:SIZE, :SIZE]
    inside = (yy - SIZE / 2) ** 2 + (xx - SIZE / 2) ** 2 < (SIZE * 0.42) ** 2   # ignore the black border
    v = np.where(inside, structure, 0).ravel()
    v -= v[inside.ravel()].mean() * inside.ravel()
    return image_id, sha, v / (np.linalg.norm(v) + 1e-9)


def main():
    rows = list(csv.DictReader(open(RESULTS / "splits.csv", encoding="utf-8")))
    ids = [r["id"] for r in rows]
    meta = {r["id"]: (r["label"], r["split"]) for r in rows}
    print(f"fingerprinting {len(rows)} images ...", flush=True)
    with Pool(3) as pool:
        prints = pool.map(fingerprint, [(r["id"], r["label"]) for r in rows], chunksize=32)
    sha = [p[1] for p in prints]
    X = np.stack([p[2] for p in prints]).astype(np.float32)

    by_hash = {}
    for i, h in enumerate(sha):
        by_hash.setdefault(h, []).append(i)
    exact = {(a, b) for group in by_hash.values() for a in group for b in group if a < b}

    near, top = set(), np.zeros(len(ids), np.float32)
    exact_corr = []
    for start in range(0, len(ids), 512):
        C = X[start:start + 512] @ X.T
        for k in range(C.shape[0]):
            C[k, start + k] = -1                                     # ignore self-similarity
        top[start:start + 512] = C.max(1)
        for k, j in zip(*np.where(C >= NEAR_DUPLICATE_MIN)):
            i = start + k
            if i < j:
                near.add((i, int(j)))
    for a, b in exact:
        exact_corr.append(float(X[a] @ X[b]))

    hist_edges = [0.0, 0.3, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99, 1.01]
    counts, _ = np.histogram(top, bins=hist_edges)
    print("nearest-neighbour correlation of every image (calibration):")
    for lo, hi, n in zip(hist_edges[:-1], hist_edges[1:], counts):
        print(f"   {lo:.2f}-{hi:.2f}: {n}")
    if exact_corr:
        print(f"exact-duplicate pairs: {len(exact_corr)}, min correlation between them: {min(exact_corr):.3f}")

    pair_set = {(a, b, "exact") for a, b in exact} | {(a, b, "near") for a, b in near if (a, b) not in exact}
    pairs = []
    for a, b, kind in sorted(pair_set):
        ia, ib = ids[a], ids[b]
        pairs.append({"a": ia, "b": ib, "a_split": meta[ia][1], "b_split": meta[ib][1],
                      "a_label": meta[ia][0], "b_label": meta[ib][0], "kind": kind,
                      "corr": round(float(X[a] @ X[b]), 4)})

    # Calibration: genuine duplicates almost always share a label; merely-similar images agree only by chance.
    label_share = {}
    for lbl, _ in meta.values():
        label_share[lbl] = label_share.get(lbl, 0) + 1
    chance = sum((n / len(ids)) ** 2 for n in label_share.values())
    print(f"label agreement expected by chance between two random images: {chance:.2f}")
    print("label agreement of candidate pairs, by correlation band:")
    for lo, hi in [(0.90, 0.93), (0.93, 0.96), (0.96, 0.98), (0.98, 0.995), (0.995, 1.01)]:
        band = [p for p in pairs if lo <= p["corr"] < hi]
        if band:
            agree = sum(p["a_label"] == p["b_label"] for p in band) / len(band)
            print(f"   {lo:.3f}-{hi:.3f}: {len(band):4d} pairs, labels agree {agree:.0%}")

    crosses = lambda p, s1, s2: {p["a_split"], p["b_split"]} == {s1, s2}

    def leaked(split, others):
        out = set()
        for p in pairs:
            for x, y, sx, sy in ((p["a"], p["b"], p["a_split"], p["b_split"]), (p["b"], p["a"], p["b_split"], p["a_split"])):
                if sx == split and sy in others:
                    out.add(x)
        return sorted(out)

    test_leaked = leaked("test", {"train", "validation"})
    val_leaked = leaked("validation", {"train"})
    summary = {
        "images": len(ids),
        "duplicate_pairs_total": len(pairs),
        "exact_pairs": sum(p["kind"] == "exact" for p in pairs),
        "pairs_train_vs_test": sum(crosses(p, "train", "test") for p in pairs),
        "pairs_validation_vs_test": sum(crosses(p, "validation", "test") for p in pairs),
        "pairs_train_vs_validation": sum(crosses(p, "train", "validation") for p in pairs),
        "pairs_within_same_split": sum(p["a_split"] == p["b_split"] for p in pairs),
        "test_images_with_a_duplicate_in_train_or_validation": len(test_leaked),
        "validation_images_with_a_duplicate_in_train": len(val_leaked),
        "duplicate_pairs_with_conflicting_labels": sum(p["a_label"] != p["b_label"] for p in pairs),
        "near_duplicate_threshold": NEAR_DUPLICATE_MIN,
    }
    (RESULTS / "leakage.json").write_text(
        json.dumps({"summary": summary, "test_leaked_ids": test_leaked, "validation_leaked_ids": val_leaked, "pairs": pairs}, indent=1),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
