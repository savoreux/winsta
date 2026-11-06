// Klien API GitHub (publik, tanpa login). Batas tanpa token: 60 permintaan per jam,
// pencarian 10 per menit. Permintaan bersyarat (ETag) yang menjawab 304 tidak dihitung.
import { compareVersions } from "./format";
import { locale } from "./i18n";

export interface GhRepo {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  stars: number;
  htmlUrl: string;
  homepage: string;
  archived: boolean;
}

/** Jenis file rilis untuk Windows. */
export type AssetKind = "msi" | "setup" | "exe" | "zip";
export type Arch = "x64" | "x86" | "arm64" | "any";

export interface GhAsset {
  name: string;
  size: number;
  url: string;
  /** "sha256:…" bila GitHub mencatatnya. */
  digest?: string;
  kind: AssetKind;
  arch: Arch;
  score: number;
}

export interface GhRelease {
  tag: string;
  version: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  htmlUrl: string;
  /** Hanya file untuk Windows, terbaik dulu. */
  assets: GhAsset[];
}

export interface RateInfo {
  remaining: number;
  limit: number;
  reset: number;
}

export class GhError extends Error {
  constructor(message: string, readonly code: "rate" | "notfound" | "network" | "http", readonly reset?: number) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Klasifikasi file rilis
// ---------------------------------------------------------------------------
const OTHER_OS = /(linux|ubuntu|debian|fedora|rhel|appimage|flatpak|snap\b|macos|mac-?os|darwin|osx|apple|universal\.dmg|freebsd|openbsd|android|\bios\b|\.deb$|\.rpm$|\.dmg$|\.pkg$|\.apk$)/;
const NOISE = /(source|\bsrc\b|symbols|debug|\bpdbs?\b|\.pdb|sha256|sha512|checksum|\.sig$|\.asc$|\.blockmap$|\.sbom|\.spdx|delta\.nupkg|full\.nupkg)/;
const WIN_HINT = /(win|windows|setup|install|portable|msvc|mingw)/;

export function classifyAsset(name: string): Omit<GhAsset, "size" | "url" | "digest"> | null {
  const n = name.toLowerCase();
  if (OTHER_OS.test(n) || NOISE.test(n)) return null;
  let kind: AssetKind;
  if (n.endsWith(".msi")) kind = "msi";
  else if (n.endsWith(".exe")) kind = /(setup|install)/.test(n) ? "setup" : "exe";
  else if (n.endsWith(".zip")) kind = "zip";
  else return null;

  let arch: Arch = "any";
  if (/(arm64|aarch64)/.test(n)) arch = "arm64";
  else if (/(x64|amd64|x86[_-]64|win64|64-?bit)/.test(n)) arch = "x64";
  else if (/(\bx86\b|[-_.]x86[-_.]|win32|ia32|i[3-6]86|32-?bit)/.test(n)) arch = "x86";
  // Zip tanpa tanda Windows atau arsitektur bisa jadi kode sumber atau untuk OS lain.
  if (kind === "zip" && !WIN_HINT.test(n) && arch === "any") return null;

  const base = { msi: 30, setup: 28, zip: 20, exe: 18 }[kind] + (kind === "zip" && n.includes("portable") ? 3 : 0);
  const archScore = { x64: 10, any: 6, x86: 0, arm64: -25 }[arch];
  return { name, kind, arch, score: base + archScore };
}

/** Label Indonesia; diterjemahkan dengan t() saat ditampilkan. */
export const ASSET_LABEL: Record<AssetKind, string> = {
  msi: "Installer MSI",
  setup: "Installer .exe",
  exe: "Aplikasi .exe portable",
  zip: "Portable .zip",
};

/** Portable = Winsta yang menaruh file-nya, jadi lokasi pasti dipakai. */
export function isPortable(kind: AssetKind) {
  return kind === "zip" || kind === "exe";
}

/** "v1.2.3" → "1.2.3", "Flow.Launcher-v2.0.1" → "2.0.1", "release-2024.10" → "2024.10". */
export function versionFromTag(tag: string): string {
  const m = tag.match(/\d+(?:[._]\d+)+(?:[-+.]?[0-9A-Za-z]+)*/) ?? tag.match(/\d+/);
  return m ? m[0].replace(/_/g, ".") : tag.replace(/^v/i, "");
}

export function parseRepoRef(q: string): { owner: string; repo: string } | null {
  const s = q.trim().replace(/\.git$/, "");
  const m = s.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m || m[1].startsWith(".")) return null;
  return { owner: m[1], repo: m[2] };
}

// ---------------------------------------------------------------------------
// HTTP dengan ETag
// ---------------------------------------------------------------------------
const API = "https://api.github.com";
const CACHE_KEY = "winsta.gh.cache";
type CacheEntry = { etag: string; data: unknown; at: number };
let cache: Record<string, CacheEntry> = {};
try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
} catch {
  cache = {};
}
function saveCache() {
  try {
    const entries = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, 80);
    cache = Object.fromEntries(entries);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* abaikan */
  }
}

let token = "";
export function setToken(t: string) {
  token = t.trim();
}

let onRate: (r: RateInfo) => void = () => {};
export function onRateChange(cb: (r: RateInfo) => void) {
  onRate = cb;
}

async function ghFetch<T>(path: string, map: (json: unknown) => T): Promise<T> {
  const url = API + path;
  const cached = cache[url];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store" });
  } catch {
    throw new GhError("GitHub tidak bisa dihubungi. Periksa koneksi internet.", "network");
  }
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  const limit = Number(res.headers.get("x-ratelimit-limit"));
  const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
  if (res.headers.has("x-ratelimit-remaining")) onRate({ remaining, limit, reset });

  if (res.status === 304 && cached) return cached.data as T;
  if ((res.status === 403 || res.status === 429) && remaining === 0) {
    const at = new Date(reset).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
    throw new GhError(`Batas permintaan GitHub habis. Coba lagi setelah pukul ${at}, atau isi token GitHub di Pengaturan.`, "rate", reset);
  }
  if (res.status === 404) throw new GhError("Repositori tidak ditemukan di GitHub.", "notfound");
  if (!res.ok) throw new GhError(`GitHub menjawab ${res.status}.`, "http");
  const data = map(await res.json());
  const etag = res.headers.get("etag");
  if (etag) {
    cache[url] = { etag, data, at: Date.now() };
    saveCache();
  }
  return data;
}

type RawRepo = {
  name: string; full_name: string; owner: { login: string }; description: string | null;
  stargazers_count: number; html_url: string; homepage: string | null; archived: boolean;
};
type RawAsset = { name: string; size: number; browser_download_url: string; digest?: string | null };
type RawRelease = {
  tag_name: string; name: string | null; published_at: string; prerelease: boolean; draft: boolean;
  html_url: string; assets: RawAsset[];
};

function mapRepo(r: RawRepo): GhRepo {
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? "",
    stars: r.stargazers_count,
    htmlUrl: r.html_url,
    homepage: r.homepage ?? "",
    archived: r.archived,
  };
}

export function mapRelease(r: RawRelease): GhRelease {
  const assets = r.assets
    .map((a): GhAsset | null => {
      const c = classifyAsset(a.name);
      return c ? { ...c, size: a.size, url: a.browser_download_url, digest: a.digest ?? undefined } : null;
    })
    .filter((a): a is GhAsset => !!a)
    .sort((a, b) => b.score - a.score);
  return {
    tag: r.tag_name,
    version: versionFromTag(r.tag_name),
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    prerelease: r.prerelease,
    htmlUrl: r.html_url,
    assets,
  };
}

/** Huruf kecil tanpa spasi, tanda hubung, dan titik: "iPhone Link" = "iphone-link" = "iphonelink". */
function squash(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}+]/gu, "");
}

/**
 * Urutkan hasil agar repo yang namanya cocok dengan kata kunci selalu di atas, walau bintangnya sedikit.
 * Urutan bawaan GitHub ("best match") dipakai sebagai pemecah seri berikutnya, lalu bintang.
 */
export function rankRepos(q: string, repos: GhRepo[]): GhRepo[] {
  const key = squash(q);
  const words = q.toLowerCase().split(/[\s/_.-]+/).filter((w) => w.length > 1);
  const score = (r: GhRepo) => {
    const name = squash(r.name);
    if (name === key || squash(r.fullName) === key) return 4;
    if (name.startsWith(key) || key.startsWith(name)) return 3;
    if (words.length && words.every((w) => r.name.toLowerCase().includes(w))) return 2;
    if (words.length && words.every((w) => `${r.name} ${r.description}`.toLowerCase().includes(w))) return 1;
    return 0;
  };
  return repos
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export async function searchRepos(q: string): Promise<GhRepo[]> {
  // Tanpa sort=stars: urutan "best match" GitHub mengutamakan nama yang cocok, bukan hanya repo populer.
  const query = encodeURIComponent(`${q} in:name,description archived:false`);
  const repos = await ghFetch(`/search/repositories?q=${query}&per_page=30`, (j) =>
    ((j as { items: RawRepo[] }).items ?? []).map(mapRepo),
  );
  return rankRepos(q, repos).slice(0, 12);
}

export async function getRepo(owner: string, repo: string): Promise<GhRepo> {
  return ghFetch(`/repos/${owner}/${repo}`, (j) => mapRepo(j as RawRepo));
}

/** Rilis stabil yang punya file untuk Windows, terbaru dulu. */
export async function getReleases(owner: string, repo: string): Promise<GhRelease[]> {
  const all = await ghFetch(`/repos/${owner}/${repo}/releases?per_page=30`, (j) =>
    (j as RawRelease[]).filter((r) => !r.draft).map(mapRelease),
  );
  return all
    .filter((r) => !r.prerelease)
    .sort((a, b) => compareVersions(b.version, a.version) || b.publishedAt.localeCompare(a.publishedAt));
}

export function ghAppId(owner: string, repo: string) {
  return `gh:${owner}/${repo}`;
}

export function parseGhAppId(id: string): { owner: string; repo: string } | null {
  const m = id.match(/^gh:([^/]+)\/(.+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Repo dengan nama huruf kecil sering punya ejaan resmi di nama file rilisnya:
 * "keepassxc" + "KeePassXC-2.7.10-Win64.msi" → "KeePassXC".
 */
export function nameFromAssets(repo: string, assets: { name: string }[]): string | undefined {
  if (repo !== repo.toLowerCase()) return undefined;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const a of assets) {
    const m = a.name.match(/^([A-Za-z][A-Za-z0-9+]*(?:[-. ][A-Za-z0-9+]+)*?)(?=[-_ .]v?\d|[-_ .](?:setup|portable|win|x64|x86))/i);
    if (m && key(m[1]) === key(repo) && m[1] !== m[1].toLowerCase()) return m[1].replace(/[-._]/g, " ");
  }
  return undefined;
}

/** "Flow.Launcher" → "Flow Launcher", "notepad4" → "Notepad4". */
export function prettyName(repo: string): string {
  const s = repo.replace(/[._-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
