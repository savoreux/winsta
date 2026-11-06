// Build tanpa Vite: esbuild + compiler Tailwind 4, hasilnya satu file HTML mandiri
// (dipakai untuk pratinjau di browser). Untuk pengembangan biasa pakai `npm run dev`.
//
//   node scripts/build-standalone.mjs [--out dist-standalone/index.html] [--node-path <dir>]
import { build } from "esbuild";
import { compile } from "tailwindcss";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.resolve(root, opt("--out", "dist-standalone/index.html"));
const extraNodePath = opt("--node-path", process.env.WINSTA_NODE_PATH);
const nodePaths = [path.join(root, "node_modules"), ...(extraNodePath ? [extraNodePath] : [])];

// 1) JavaScript
const js = await build({
  entryPoints: [path.join(root, "src/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  jsx: "automatic",
  target: ["chrome110"],
  nodePaths,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
  logLevel: "warning",
});
const jsCode = js.outputFiles[0].text;

// 2) CSS: kandidat class diambil dari semua file sumber
const req = createRequire(path.join(nodePaths.find((p) => fs.existsSync(path.join(p, "tailwindcss"))) ?? root, "x.js"));
const twDir = path.dirname(req.resolve("tailwindcss/package.json").replace(/package\.json$/, "x"));
const loadStylesheet = async (id, base) => {
  const file = id === "tailwindcss" ? path.join(twDir, "index.css") : path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
};
const cssSrc = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const compiler = await compile(cssSrc, { base: path.join(root, "src"), loadStylesheet });

const candidates = new Set();
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|html)$/.test(f)) {
      // Pisah hanya di spasi dan tanda kutip: class seperti grid-cols-[minmax(0,1fr)_auto] tetap utuh.
      for (const tok of fs.readFileSync(p, "utf8").split(/[\s"'`]+/)) {
        if (!tok || tok.length > 160) continue;
        candidates.add(tok);
        const trimmed = tok.replace(/^[^a-z0-9[\-!@*]+/i, "").replace(/[,;)}>]+$/, "");
        if (trimmed !== tok) candidates.add(trimmed);
      }
    }
  }
};
walk(path.join(root, "src"));
const css = compiler.build([...candidates]);

// 3) HTML
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html
  .replace(/<script type="module" src="\/src\/main.tsx"><\/script>/, () => `<script>${jsCode.replace(/<\/script/g, "<\\/script")}</script>`)
  .replace("</head>", () => `<style>${css}</style>\n</head>`);
if (args.includes("--fragment")) {
  // Tanpa <!doctype>/<html>/<head>/<body>: untuk host yang membungkus halaman sendiri.
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*/g, "");
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = `${head.trim()}\n${body.trim()}\n`;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`OK ${path.relative(root, out)} · JS ${(jsCode.length / 1024).toFixed(0)} KB · CSS ${(css.length / 1024).toFixed(0)} KB`);
