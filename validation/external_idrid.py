"""External validation of the Stage 3 model on IDRiD (Disease Grading, 516 full-resolution images it never saw).

    python validation/external_idrid.py

The app receives full-resolution uploads and the network only ever saw 224x224 APTOS images, so this also tests the
resolution handling. Two variants isolate it:
  * app   : the file exactly as the app would receive it (MATLAB imresize to 224 inside preprocessStage3Input)
  * area  : first shrunk to 224 with OpenCV area averaging, then the same network path

Needs MATLAB and data/idrid_grading. Writes validation/results/idrid_<variant>.csv (needs about 5 minutes).
"""
import csv
import tempfile
from pathlib import Path

import cv2
import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data" / "idrid_grading" / "B. Disease Grading" / "B. Disease Grading"
OUT = ROOT / "validation" / "results"
GRADE = {"0": "No_DR", "1": "Mild", "2": "Moderate", "3": "Severe", "4": "Proliferate_DR"}


def items():
    out = []
    for split, folder, labels in (
        ("train", "a. Training Set", "a. IDRiD_Disease Grading_Training Labels.csv"),
        ("test", "b. Testing Set", "b. IDRiD_Disease Grading_Testing Labels.csv"),
    ):
        for r in csv.DictReader(open(BASE / "2. Groundtruths" / labels, encoding="utf-8-sig")):
            name = r["Image name"].strip()
            out.append((BASE / "1. Original Images" / folder / f"{name}.jpg", GRADE[r["Retinopathy grade"].strip()], split))
    return out


def main():
    data = items()
    print(f"{len(data)} IDRiD grading images", flush=True)
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)

    print("== variant: app (native resolution)", flush=True)
    eng.predictFiles([str(p) for p, _, _ in data], [l for _, l, _ in data], (OUT / "idrid_app.csv").as_posix(), nargout=0)

    print("== variant: area (OpenCV area-averaged to 224 first)", flush=True)
    with tempfile.TemporaryDirectory(prefix="idrid224_") as tmp:
        paths = []
        for p, _, _ in data:
            small = cv2.resize(cv2.imread(str(p)), (224, 224), interpolation=cv2.INTER_AREA)
            q = Path(tmp) / f"{p.stem}.png"
            cv2.imwrite(str(q), small)
            paths.append(str(q))
        eng.predictFiles(paths, [l for _, l, _ in data], (OUT / "idrid_area.csv").as_posix(), nargout=0)
    eng.quit()

    with open(OUT / "idrid_splits.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "label", "split"])
        w.writerows((p.stem, l, s) for p, l, s in data)


if __name__ == "__main__":
    main()
