import { getLang, locale, t } from "./i18n";
import type { InstallerType } from "./types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Bandingkan dua versi: >0 bila a lebih baru dari b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const pb = b.split(/[.\-+]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

export function timeAgo(time: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 45) return t("baru saja");
  const m = Math.round(s / 60);
  if (m < 60) return t("{n} menit lalu", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("{n} jam lalu", { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return t("{n} hari lalu", { n: d });
  const mo = Math.round(d / 30);
  if (mo < 12) return t("{n} bln lalu", { n: mo });
  return t("{n} thn lalu", { n: Math.round(mo / 12) });
}

export function dayLabel(time: number, now = Date.now()): string {
  const d = new Date(time);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 864e5);
  if (diff === 0) return t("Hari ini");
  if (diff === 1) return t("Kemarin");
  return d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
}

/** Angka desimal sesuai bahasa: "1,5" atau "1.5". */
export function dec(n: number, digits = 1): string {
  return n.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatSize(mb: number): string {
  if (mb >= 1024) return `${dec(mb / 1024)} GB`;
  if (mb < 10) return `${dec(mb)} MB`;
  return `${Math.round(mb)} MB`;
}

/** Potong path di tengah agar awal (drive) dan akhir (folder aplikasi) tetap terlihat. */
export function middleTruncate(s: string, max = 34): string {
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.4);
  const tail = keep - head;
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

let localAppData = "C:\\Users\\kamu\\AppData\\Local";

/** Di Tauri diisi dengan %LOCALAPPDATA% asli; di demo memakai contoh. */
export function setLocalAppData(p: string) {
  if (p) localAppData = p;
}

export function expandPath(p: string): string {
  return p.replace(/%LOCALAPPDATA%/gi, () => localAppData);
}

export function joinPath(root: string, leaf: string): string {
  return root.replace(/[\\/]+$/, "") + "\\" + leaf;
}

export function folderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

export function driveOf(path: string): string {
  const p = expandPath(path);
  return /^[A-Za-z]:/.test(p) ? p[0].toUpperCase() : "C";
}

export type LocationSupport = "yes" | "maybe" | "no";

export function locationSupport(t: InstallerType): LocationSupport {
  if (t === "msi" || t === "portable") return "yes";
  if (t === "msix") return "no";
  return "maybe";
}

export const INSTALLER_LABEL: Record<InstallerType, string> = {
  msi: "MSI",
  exe: "EXE",
  portable: "Portable",
  msix: "MSIX",
  unknown: "Installer",
};

/** Untuk pencocokan nama aplikasi: tanpa versi, arsitektur, isi kurung, dan tanda baca. */
export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/…$/, "")
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .split(/[\s_-]+/)
    .filter((w) => w && !/^v?\d+(\.\d+)+$/.test(w) && !/^v\d+$/.test(w) && !/^\d{4,}$/.test(w))
    .filter((w) => !["x64", "x86", "64-bit", "32-bit", "64bit", "32bit", "amd64", "arm64", "win64", "win32"].includes(w))
    .join("")
    .replace(/[^\p{L}\p{N}+]/gu, "");
}

/** Warna stabil per nama, untuk ikon aplikasi yang belum punya ikon. */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Dua huruf untuk ikon: "Visual Studio Code" → "VS", "Audacity" → "Au". */
export function glyphOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}+ ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0][0].toUpperCase() + (words[0][1] ?? "").toLowerCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** 11800 → "12 rb" / "12k", 1500 → "1,5 rb" / "1.5k". */
export function formatCount(n: number): string {
  const en = getLang() === "en";
  if (n >= 1_000_000) return `${dec(n / 1_000_000)}${en ? "M" : " jt"}`;
  if (n >= 1000) return `${dec(n / 1000, n >= 10_000 ? 0 : 1)}${en ? "k" : " rb"}`;
  return String(n);
}
