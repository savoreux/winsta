// Cari teks Indonesia yang belum punya terjemahan Inggris di src/lib/i18n-en.ts.
// Jalankan: node scripts/check-i18n.mjs  (keluar dengan kode 1 bila ada yang kurang)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !f.startsWith("i18n")) files.push(p);
  }
})(root);

const keys = new Set();
const lit = /"((?:[^"\\\n]|\\.)*)"/g;
// strict: teks dari data (bukan dari t()) — abaikan id, nama kelas, dan kata huruf kecil tanpa spasi.
const add = (s, strict = false) => {
  s = s.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  if (!/\p{L}/u.test(s)) return;
  if (/(^|\s)(text|bg|border|flex|inline-flex|grid|size|items|gap|px|py|mt|mb|absolute|pointer-events)-?/.test(s) && /-/.test(s)) return;
  if (strict && /^[a-z0-9_.:/-]+$/.test(s)) return;
  keys.add(s);
};

for (const f of files) {
  const src = readFileSync(f, "utf8");
  // 1. Argumen pertama t(), tt(), tx(): semua literal di dalamnya (termasuk cabang ternary).
  const re = /\b(?:t|tt|tx)\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1, i = m.index + m[0].length, start = i, inStr = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "`" || c === "'") inStr = c;
      else if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === "," && depth === 1) break;
    }
    const arg = src.slice(start, i);
    if (/^\s*["(]/.test(arg) || /\?/.test(arg)) {
      // Lewati literal pembanding di kondisi ternary (support === "yes").
      for (const x of arg.matchAll(/(===|!==)?\s*"((?:[^"\\\n]|\\.)*)"/g)) if (!x[1]) add(x[2]);
    }
  }
  // 2. Teks di data dan tabel label yang diterjemahkan saat ditampilkan.
  for (const x of src.matchAll(/"?\b(?:tagline|description|label|phase)"?:\s*"((?:[^"\\]|\\.)*)"/g)) add(x[1], true);
  for (const x of src.matchAll(/\b(?:title|desc)="([^"]+)"/g)) if (f.endsWith("Settings.tsx")) add(x[1], true);
  for (const x of src.matchAll(/(?:KIND_LABEL|KIND_VERB|ASSET_LABEL|RUNNING_VERB|KIND_TEXT|PLACEHOLDER|PHASES)[^=]*=\s*\{([\s\S]*?)\n\}/g)) {
    for (const y of x[1].matchAll(lit)) add(y[1], true);
  }
  for (const x of src.matchAll(/\[\s*Lu\w+,\s*"([^"]+)"\s*\]/g)) add(x[1], true);
  for (const x of src.matchAll(/\b\w+:\s*\[((?:\s*"[^"]*",?)+)\s*\]/g)) for (const y of x[1].matchAll(lit)) add(y[1], true);
}

const en = readFileSync(join(root, "lib/i18n-en.ts"), "utf8");
const have = new Set([...en.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)].map((x) => JSON.parse(x[1])));
const missing = [...keys].filter((k) => !have.has(k)).sort();
const unused = [...have].filter((k) => !keys.has(k));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(missing, null, 1));
} else {
  for (const k of missing) console.log("KURANG:", JSON.stringify(k));
  console.log(`${keys.size} teks, ${missing.length} belum diterjemahkan, ${unused.length} terjemahan tidak terpakai.`);
}
process.exit(missing.length ? 1 : 0);
