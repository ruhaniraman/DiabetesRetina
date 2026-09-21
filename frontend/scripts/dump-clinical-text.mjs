// Prints every string exported by src/clinicalText.js as JSON (used to build docs/CLINICAL_REVIEW.md).
import * as text from '../src/clinicalText.js';

const out = {};
for (const [name, value] of Object.entries(text)) {
  if (typeof value !== 'function') out[name] = value;
}
out.basisText = { withThreshold: text.basisText('20%'), withoutThreshold: text.basisText(null) };
console.log(JSON.stringify(out));
