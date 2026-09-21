// Speech engines drop or cut off long utterances (some stop after about 15 seconds), so the text is spoken one short sentence at a time.

const SENTENCE_END = /(?<=[.!?;।])\s+/;   // includes the Devanagari danda

export function splitForSpeech(text, maxLength = 180) {
  const pieces = [];
  for (const sentence of String(text || '').split(SENTENCE_END)) {
    let rest = sentence.trim();
    while (rest.length > maxLength) {
      let cut = rest.lastIndexOf(',', maxLength);
      if (cut < maxLength / 2) cut = rest.lastIndexOf(' ', maxLength);
      if (cut <= 0) cut = maxLength;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
  }
  return pieces;
}
