// lib/utils.js
export function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** KudaGo -> наши ярлыки на русском */
export function mapCategoryRu(c) {
  const v = String(c || "").toLowerCase();
  if (["opera"].includes(v)) return "Опера";
  if (["ballet"].includes(v)) return "Балет";
  if (["theatre", "theater"].includes(v)) return "Театр";
  if (["drama"].includes(v)) return "Драма";
  return null;
}
