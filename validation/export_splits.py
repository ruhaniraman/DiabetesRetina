"""Export the train/validation/test membership recorded in stage_3/Stage3_checkpoint.mat to results/splits.csv.

The checkpoint stores absolute paths from the machine that trained the model; only the image id and label matter,
so the CSV keeps just those (id,label,split). Needs MATLAB, no dataset.
"""
import csv
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "validation" / "results" / "splits.csv"


def main():
    eng = matlab.engine.start_matlab()
    ckpt = (ROOT / "stage_3" / "Stage3_checkpoint.mat").as_posix()
    eng.eval(f"S = load('{ckpt}', 'imdsTrain', 'imdsValidation', 'imdsTest');", nargout=0)
    rows = []
    for split, var in [("train", "imdsTrain"), ("validation", "imdsValidation"), ("test", "imdsTest")]:
        eng.eval(f"F = S.{var}.Files; L = cellstr(S.{var}.Labels);", nargout=0)
        for f, label in zip(eng.workspace["F"], eng.workspace["L"]):
            rows.append((Path(f.replace(chr(92), "/")).stem, label, split))

    # The baseline network's own saved test predictions (same order as imdsTest). Comparing these with fresh
    # predictions shows which preprocessing produced them.
    base = (ROOT / "stage_3" / "Stage3_final_baseline.mat").as_posix()
    eng.eval(f"B = load('{base}', 'YTest', 'YPred'); yt = cellstr(B.YTest); yp = cellstr(B.YPred); "
             "F = S.imdsTest.Files;", nargout=0)
    saved = list(zip((Path(f.replace(chr(92), "/")).stem for f in eng.workspace["F"]),
                     eng.workspace["yt"], eng.workspace["yp"]))
    eng.quit()
    with open(OUT.with_name("baseline_saved_test.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "label", "saved_prediction"])
        w.writerows(saved)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "label", "split"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
