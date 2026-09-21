"""Generate class-probability CSVs for the recorded validation/test splits (needs MATLAB + the local APTOS data).

    python validation/run_predictions.py            # everything (about 15 minutes on CPU)
    python validation/run_predictions.py --quick    # test split of the deployed model only

Output goes to validation/results/<model>_<split>_<method>.csv. Existing files are kept unless --force is given.
"""
import argparse
import time
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "validation" / "results"

# (model, split, maxN)
JOBS = [
    ("app", "test", None),
    ("app", "validation", None),
    ("baseline", "test", None),       # control: reproduces the saved baseline results
    ("app", "train", 500),            # a reproducible sample of training images, to measure the train/test gap
]
METHODS = ["crop", "resize"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    jobs = JOBS[:1] if args.quick else JOBS
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage1_quality", "stage_3", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)

    for model, split, max_n in jobs:
        for method in METHODS:
            out = OUT / f"{model}_{split}_{method}.csv"
            if out.exists() and not args.force:
                print(f"skip (exists): {out.name}")
                continue
            print(f"== {model} / {split} / {method}", flush=True)
            t = time.time()
            if max_n:
                eng.predictSplit(model, split, method, out.as_posix(), float(max_n), nargout=0)
            else:
                eng.predictSplit(model, split, method, out.as_posix(), nargout=0)
            print(f"   done in {time.time() - t:.0f}s", flush=True)
    eng.quit()


if __name__ == "__main__":
    main()
