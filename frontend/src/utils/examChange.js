// Grade number (0-4) from a stored label such as "Stage 2 - Moderate"; null when it cannot be read.
const gradeNumber = (label) => {
  const m = /Stage (\d)/.exec(label || '');
  return m ? Number(m[1]) : null;
};

/** 'higher' | 'lower' | 'same' | null: this exam's AI grades against the exam before it (either eye higher counts as higher). */
export function changeFromPrevious(exam, previous) {
  if (!previous) return null;
  const diffs = [
    [exam.leftGrade, previous.leftGrade],
    [exam.rightGrade, previous.rightGrade],
  ]
    .map(([now, before]) => [gradeNumber(now), gradeNumber(before)])
    .filter(([now, before]) => now != null && before != null)
    .map(([now, before]) => now - before);
  if (!diffs.length) return null;
  if (diffs.some((d) => d > 0)) return 'higher';
  if (diffs.some((d) => d < 0)) return 'lower';
  return 'same';
}
