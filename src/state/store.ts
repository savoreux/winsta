// State aplikasi dengan dua mode:
// - "native": berjalan di Tauri dan menjalankan winget sungguhan.
// - "demo":   di browser biasa, memakai data contoh dan proses simulasi.
import { useRef, useSyncExternalStore } from "react";
import { CATALOG } from "../data/catalog";
import { DEFAULT_SETTINGS, DEMO_DRIVES, UNMANAGED, fakeSha, seedInstalled, seedLog } from "../data/seed";
import { compareVersions, expandPath, folderName, glyphOf, hueOf, joinPath, nameKey, setLocalAppData } from "../lib/format";
import { t as tx } from "../lib/i18n";
import { isNative, listen } from "../lib/native";
import type {
  App, CheckStatus, Drive, GhInstallResult, GhRecord, GhTaskAsset, Installed, LogEntry, ScopeChoice, Settings, Task,
  TaskKind, Unmanaged, View,
} from "../lib/types";
import * as gh from "../lib/github";
import { invoke } from "../lib/native";
import { sampleRepo, sampleSearch } from "../data/githubSample";
import { WINGET_LOG_EVENT, system, winget, type InstallLocation, type WingetPackage } from "../lib/winget";

export type Mode = "demo" | "native";

export interface Toast {
  id: string;
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
}

export interface Dialogs {
  install?: string;
  rollback?: string;
  uninstall?: string;
  detail?: string;
  /** Sisa file setelah uninstall. */
  leftovers?: boolean;
}

export interface Leftover {
  path: string;
  /** "install" (folder aplikasi), "data" (AppData/ProgramData), "shortcut". */
  kind: string;
}

/** Pembersihan sisa file setelah uninstall. */
export interface Cleanup {
  appId: string;
  name: string;
  publisher: string;
  path: string;
  items: Leftover[];
  status: "ready" | "deleting" | "done";
  failed: { path: string; reason: string }[];
}

/** Yang diingat Winsta tentang aplikasi yang ia pasang (winget tidak mencatat lokasi). */
export interface AppRecord {
  path: string;
  scope: Installed["scope"];
  pinned: boolean;
  installedAt: number;
}

type Status = "idle" | "loading" | "done" | "error";

export interface State {
  mode: Mode;
  view: View;
  category: string;
  query: string;
  apps: Record<string, App>;
  installed: Record<string, Installed>;
  unmanaged: Unmanaged[];
  /** Versi terbaru per aplikasi dari cek update terakhir. */
  latest: Record<string, string>;
  records: Record<string, AppRecord>;
  versions: Record<string, { status: Status; list: string[] }>;
  scan: { status: Status; error?: string; at?: number };
  search: { query: string; status: Status; ids: string[]; error?: string };
  drives: Drive[];
  wingetVersion?: string;
  /** Cara membaca winget: modul resmi (lengkap) atau output CLI. */
  engine: { kind: "unknown" | "module" | "cli"; installing: boolean; error?: string };
  /** Sumber GitHub. */
  gh: {
    search: { query: string; status: Status; ids: string[]; error?: string };
    releases: Record<string, { status: Status; list: gh.GhRelease[]; error?: string }>;
    records: Record<string, GhRecord>;
    rate?: gh.RateInfo;
  };
  tasks: Task[];
  log: LogEntry[];
  settings: Settings;
  check: { status: CheckStatus; lastChecked?: number; error?: string };
  dialogs: Dialogs;
  cleanup: Cleanup | null;
  toasts: Toast[];
  queueOpen: boolean;
  selectedUpdates: string[];
}

// ---------------------------------------------------------------------------
// Penyimpanan lokal (dibungkus try/catch: bisa tidak tersedia)
// ---------------------------------------------------------------------------
const MODE: Mode = isNative() ? "native" : "demo";
const KEY = `winsta.v2.${MODE}`;

interface Saved {
  installed?: Record<string, Installed>;
  records?: Record<string, AppRecord>;
  log?: LogEntry[];
  settings?: Partial<Settings>;
  lastChecked?: number;
  scannedOnce?: boolean;
  ghRecords?: Record<string, GhRecord>;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let scannedOnce = false;

function persist(s: State) {
  try {
    const data: Saved = {
      log: s.log,
      settings: s.settings,
      lastChecked: s.check.lastChecked,
      scannedOnce,
      ghRecords: s.gh.records,
      ...(s.mode === "demo" ? { installed: s.installed } : { records: s.records }),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* abaikan */
  }
}

const saved = load();
scannedOnce = !!saved.scannedOnce;

// Di mode native, versi dan ukuran di katalog contoh tidak dipakai: datanya diambil dari winget.
const initialApps: Record<string, App> = Object.fromEntries([
  ...CATALOG.map((a) => [a.id, MODE === "native" ? { ...a, versions: [], sizeMB: 0, downloads: "" } : a]),
  ...Object.values(saved.ghRecords ?? {}).map((r) => [r.appId, appFromRecord(r)]),
]);

let state: State = {
  mode: MODE,
  view: "discover",
  category: "all",
  query: "",
  apps: initialApps,
  installed: MODE === "demo" ? saved.installed ?? seedInstalled() : {},
  unmanaged: MODE === "demo" ? UNMANAGED : [],
  latest: {},
  records: saved.records ?? {},
  versions: {},
  scan: { status: MODE === "demo" ? "done" : "idle" },
  search: { query: "", status: "idle", ids: [] },
  drives: MODE === "demo" ? DEMO_DRIVES : [],
  engine: { kind: MODE === "demo" ? "module" : "unknown", installing: false },
  gh: { search: { query: "", status: "idle", ids: [] }, releases: {}, records: saved.ghRecords ?? {} },
  tasks: [],
  log: saved.log ?? (MODE === "demo" ? seedLog() : []),
  settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
  check: { status: "idle", lastChecked: saved.lastChecked },
  dialogs: {},
  cleanup: null,
  toasts: [],
  queueOpen: false,
  selectedUpdates: [],
};

gh.setToken(state.settings.githubToken);
gh.onRateChange((rate) => setState((s) => ({ gh: { ...s.gh, rate } })));

const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  persist(state);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  }
  return false;
}

/**
 * Ambil sebagian state. Hasil di-cache per versi state, sehingga selektor yang
 * membuat array baru (mis. daftar update) tidak memicu render tanpa henti.
 */
export function useStore<T>(selector: (s: State) => T): T {
  const cache = useRef<{ s: State; v: T } | null>(null);
  const get = () => {
    const c = cache.current;
    if (c && c.s === state) return c.v;
    const v = selector(state);
    if (c && shallowEqual(c.v, v)) {
      cache.current = { s: state, v: c.v };
      return c.v;
    }
    cache.current = { s: state, v };
    return v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

// ---------------------------------------------------------------------------
// Aplikasi dari winget yang tidak ada di katalog
// ---------------------------------------------------------------------------
function appFromPackage(p: WingetPackage): App {
  const name = p.name.replace(/…$/, "").trim() || p.id;
  return {
    id: p.id,
    name,
    packageId: p.id,
    publisher: p.id.includes(".") ? p.id.split(".")[0] : "",
    category: "",
    tagline: "",
    description: "",
    license: "",
    homepage: "",
    versions: [],
    sizeMB: 0,
    installer: "unknown",
    needsAdmin: false,
    hue: hueOf(p.id),
    glyph: glyphOf(name),
    downloads: "",
    source: p.source,
  };
}

function withPackages(apps: Record<string, App>, pkgs: WingetPackage[]): Record<string, App> {
  let out = apps;
  for (const p of pkgs) {
    if (!out[p.id]) {
      if (out === apps) out = { ...apps };
      out[p.id] = appFromPackage(p);
    }
  }
  return out;
}

function samePath(a: string, b: string): boolean {
  const n = (p: string) => expandPath(p).replace(/[\\/]+$/, "").toLowerCase();
  return n(a) === n(b);
}

function norm(s: string) {
  return s.replace(/…$/, "").trim().toLowerCase();
}

/**
 * Cocokkan nama di `winget list` dengan nama di registry Uninstall Windows.
 * Urutan: nama persis, lalu nama tanpa versi/arsitektur ("VLC media player 3.0.21 (x64)" = "VLC media player"),
 * lalu awalan yang cukup panjang.
 */
export function matchLocation(name: string, locs: InstallLocation[]): string | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = locs.find((l) => norm(l.name) === n);
  if (exact) return exact.path;
  const k = nameKey(name);
  if (k.length < 3) return undefined;
  const keyed = locs.find((l) => nameKey(l.name) === k);
  if (keyed) return keyed.path;
  if (k.length < 5) return undefined;
  return locs.find((l) => {
    const m = nameKey(l.name);
    return m.length >= 5 && (m.startsWith(k) || k.startsWith(m));
  })?.path;
}

// ---------------------------------------------------------------------------
// Selektor
// ---------------------------------------------------------------------------
export function getApp(id: string): App | undefined {
  return state.apps[id];
}

export interface UpdateInfo {
  app: App;
  inst: Installed;
  latest: string;
}

/** Update hanya diketahui setelah pengecekan selesai. */
export function availableUpdates(s: State): UpdateInfo[] {
  if (s.check.status !== "done") return [];
  const out: UpdateInfo[] = [];
  for (const inst of Object.values(s.installed)) {
    const app = s.apps[inst.appId];
    if (!app) continue;
    const latest = s.mode === "demo" && !isGhId(inst.appId) ? app.versions[0] : s.latest[inst.appId];
    if (latest && compareVersions(latest, inst.version) > 0) out.push({ app, inst, latest });
  }
  return out.sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export function updatesToRun(s: State): UpdateInfo[] {
  return availableUpdates(s).filter((u) => !u.inst.pinned);
}

export function pinnedUpdates(s: State): UpdateInfo[] {
  return availableUpdates(s).filter((u) => u.inst.pinned);
}

export function activeTaskFor(s: State, appId: string): Task | undefined {
  return s.tasks.find((t) => t.appId === appId && (t.status === "queued" || t.status === "running"));
}

/** Daftar versi di repositori winget (terbaru dulu). Di mode native diambil saat dibutuhkan. */
export function versionsOf(s: State, appId: string): { status: Status; list: string[] } {
  if (isGhId(appId)) {
    const r = s.gh.releases[appId];
    return r ? { status: r.status, list: r.list.filter((x) => x.assets.length).map((x) => x.version) } : { status: "idle", list: [] };
  }
  if (s.mode === "demo") return { status: "done", list: s.apps[appId]?.versions ?? [] };
  return s.versions[appId] ?? { status: "idle", list: [] };
}

export async function ensureVersions(appId: string) {
  if (isGhId(appId)) {
    await loadReleases(appId);
    return;
  }
  if (state.mode === "demo") return;
  const cur = state.versions[appId];
  if (cur && (cur.status === "loading" || cur.status === "done")) return;
  setState((s) => ({ versions: { ...s.versions, [appId]: { status: "loading", list: [] } } }));
  try {
    const list = (await winget.versions(appId)).sort((a, b) => compareVersions(b, a));
    setState((s) => ({ versions: { ...s.versions, [appId]: { status: "done", list } } }));
  } catch {
    setState((s) => ({ versions: { ...s.versions, [appId]: { status: "error", list: [] } } }));
  }
}

export interface RollbackOption {
  version: string;
  source: "archive" | "repo";
  archivedAt?: number;
  sha256?: string;
}

/** Hingga `limit` versi lebih lama dari versi aktif: dari arsip lokal dulu, lalu dari repositori winget. */
export function rollbackOptions(s: State, appId: string): RollbackOption[] {
  const inst = s.installed[appId];
  if (!inst) return [];
  const limit = s.settings.keepVersions;
  const seen = new Set<string>();
  const opts: RollbackOption[] = [];
  for (const a of inst.archive) {
    if (compareVersions(a.version, inst.version) >= 0 || seen.has(a.version)) continue;
    seen.add(a.version);
    opts.push({ version: a.version, source: "archive", archivedAt: a.archivedAt, sha256: a.sha256 });
  }
  for (const v of versionsOf(s, appId).list) {
    if (compareVersions(v, inst.version) >= 0 || seen.has(v)) continue;
    seen.add(v);
    opts.push({ version: v, source: "repo" });
  }
  return opts.sort((a, b) => compareVersions(b.version, a.version)).slice(0, limit);
}

/** Apakah tombol Rollback layak ditampilkan aktif untuk aplikasi ini. */
export function canRollback(s: State, appId: string): boolean {
  if (!s.installed[appId]) return false;
  if (isGhId(appId)) return true;
  if (s.mode === "demo") return rollbackOptions(s, appId).length > 0;
  return s.apps[appId]?.source === "winget";
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------
export function isGhId(id: string) {
  return id.startsWith("gh:");
}

function appFromRepo(r: gh.GhRepo): App {
  const name = gh.prettyName(r.name);
  return {
    id: gh.ghAppId(r.owner, r.name),
    name,
    packageId: r.fullName,
    publisher: r.owner,
    category: "",
    tagline: r.description,
    description: r.description,
    license: "",
    homepage: r.homepage || r.htmlUrl,
    versions: [],
    sizeMB: 0,
    installer: "unknown",
    needsAdmin: false,
    hue: hueOf(r.fullName),
    glyph: glyphOf(name),
    downloads: "",
    source: "github",
    stars: r.stars,
    repoUrl: r.htmlUrl,
  };
}

function appFromRecord(r: GhRecord): App {
  const app = appFromRepo({
    owner: r.owner, name: r.repo, fullName: `${r.owner}/${r.repo}`, description: r.description, stars: r.stars,
    htmlUrl: `https://github.com/${r.owner}/${r.repo}`, homepage: r.homepage, archived: false,
  });
  return { ...app, name: r.name || app.name, glyph: glyphOf(r.name || app.name) };
}

function installedFromRecord(r: GhRecord): Installed {
  const scope = r.kind.startsWith("portable") ? "user" : "unknown";
  return { appId: r.appId, version: r.version, path: r.path, scope, installedAt: r.installedAt, pinned: r.pinned, archive: [] };
}

function withRepos(apps: Record<string, App>, repos: gh.GhRepo[]): Record<string, App> {
  const out = { ...apps };
  for (const r of repos) {
    const id = gh.ghAppId(r.owner, r.name);
    out[id] = { ...appFromRepo(r), ...(out[id]?.source === "github" ? { name: out[id].name } : {}) };
  }
  return out;
}

/** Mode demo di pratinjau tidak bisa menghubungi GitHub: pakai data contoh. */
async function demoFallback<T>(run: () => Promise<T>, sample: () => T | undefined): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (state.mode === "demo" && e instanceof gh.GhError && e.code === "network") {
      const v = sample();
      if (v !== undefined) return v;
    }
    throw e;
  }
}

let ghSeq = 0;
/** Cari di GitHub: alamat repo langsung, atau pencarian nama. */
export async function searchGithub(query: string) {
  const q = query.trim();
  const seq = ++ghSeq;
  const ref = gh.parseRepoRef(q);
  if (!ref && q.length < 3) {
    setState((s) => ({ gh: { ...s.gh, search: { query: q, status: "idle", ids: [] } } }));
    return;
  }
  setState((s) => ({ gh: { ...s.gh, search: { query: q, status: "loading", ids: s.gh.search.ids } } }));
  try {
    const repos: gh.GhRepo[] = [];
    if (ref) {
      const r = await demoFallback(() => gh.getRepo(ref.owner, ref.repo), () => sampleRepo(ref.owner, ref.repo)?.repo);
      repos.push(r);
    } else {
      repos.push(...(await demoFallback(() => gh.searchRepos(q), () => sampleSearch(q))));
    }
    if (seq !== ghSeq) return;
    setState((s) => ({
      apps: withRepos(s.apps, repos),
      gh: { ...s.gh, search: { query: q, status: "done", ids: repos.map((r) => gh.ghAppId(r.owner, r.name)) } },
    }));
  } catch (e) {
    if (seq !== ghSeq) return;
    setState((s) => ({ gh: { ...s.gh, search: { query: q, status: "error", ids: [], error: errText(e) } } }));
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Muat rilis sebuah repo (terbaru dulu). `force` = abaikan yang sudah dimuat (ETag tetap dipakai). */
export async function loadReleases(appId: string, force = false): Promise<gh.GhRelease[]> {
  const ref = gh.parseGhAppId(appId);
  if (!ref) return [];
  const cur = state.gh.releases[appId];
  if (!force && cur?.status === "done") return cur.list;
  if (!force && cur?.status === "loading") return cur.list;
  setState((s) => ({ gh: { ...s.gh, releases: { ...s.gh.releases, [appId]: { status: "loading", list: cur?.list ?? [] } } } }));
  try {
    const list = await demoFallback(() => gh.getReleases(ref.owner, ref.repo), () => sampleRepo(ref.owner, ref.repo)?.releases);
    const better = gh.nameFromAssets(ref.repo, list.flatMap((r) => r.assets.slice(0, 1)));
    setState((s) => ({
      gh: { ...s.gh, releases: { ...s.gh.releases, [appId]: { status: "done", list } } },
      ...(better && s.apps[appId] ? { apps: { ...s.apps, [appId]: { ...s.apps[appId], name: better, glyph: glyphOf(better) } } } : {}),
    }));
    return list;
  } catch (e) {
    setState((s) => ({ gh: { ...s.gh, releases: { ...s.gh.releases, [appId]: { status: "error", list: cur?.list ?? [], error: errText(e) } } } }));
    throw e;
  }
}

/** Rilis terbaru yang punya file untuk Windows. */
export function latestGhRelease(s: State, appId: string): gh.GhRelease | undefined {
  return s.gh.releases[appId]?.list.find((r) => r.assets.length);
}

/** Cek update aplikasi GitHub yang terpasang (satu permintaan per repo, 304 tidak dihitung). */
async function refreshGithubLatest() {
  const latest: Record<string, string> = {};
  for (const rec of Object.values(state.gh.records)) {
    try {
      const list = await loadReleases(rec.appId, true);
      const top = list.find((r) => r.assets.length);
      if (top) latest[rec.appId] = top.version;
    } catch {
      /* lewati repo yang gagal; lainnya tetap dicek */
    }
  }
  setState((s) => ({ latest: { ...s.latest, ...latest } }));
}

/** Pilih file untuk update/rollback: sejenis dan searsitektur dengan yang terpasang. */
export function matchAsset(assets: gh.GhAsset[], rec?: GhRecord): gh.GhAsset | undefined {
  if (!rec) return assets[0];
  const same = assets.filter((a) => a.kind === rec.assetKind);
  const prevArch = gh.classifyAsset(rec.assetName)?.arch;
  return same.find((a) => a.arch === prevArch) ?? same[0] ?? assets[0];
}

export function installGithub(appId: string, release: gh.GhRelease, asset: gh.GhAsset, path: string) {
  enqueue({
    kind: "install", appId, targetVersion: release.version, path, scope: "user",
    gh: { name: asset.name, url: asset.url, size: asset.size, digest: asset.digest, kind: asset.kind, tag: release.tag },
  });
}

export function setGithubToken(token: string) {
  gh.setToken(token);
  updateSettings({ githubToken: token.trim() });
}

// ---------------------------------------------------------------------------
// Navigasi, dialog, toast
// ---------------------------------------------------------------------------
export function go(view: View) {
  setState({ view, queueOpen: false, query: "" });
}

export function openDialog(d: Dialogs) {
  setState({ dialogs: d });
}

export function closeDialogs() {
  setState({ dialogs: {} });
}

let toastSeq = 0;
export function toast(t: Omit<Toast, "id">, ms = 5500) {
  const id = `t${++toastSeq}`;
  setState((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-3) }));
  window.setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: string) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function resetDemo() {
  setState((s) => ({
    gh: { ...s.gh, records: {} },
    installed: seedInstalled(),
    log: seedLog(),
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    check: { status: "idle" },
    selectedUpdates: [],
  }));
  checkUpdates();
}

// ---------------------------------------------------------------------------
// Saat aplikasi dibuka: pindai aplikasi terpasang, lalu cek update (tanpa proses latar belakang)
// ---------------------------------------------------------------------------
let started = false;

export async function startup() {
  if (started) return;
  started = true;
  if (state.mode === "demo") {
    if (state.settings.checkOnLaunch) checkUpdates();
    return;
  }
  listen<{ taskId: string; line: string }>(WINGET_LOG_EVENT, onWingetLine);
  system.localAppData().then(setLocalAppData).catch(() => {});
  system.drives().then((drives) => setState({ drives })).catch(() => {});
  winget.version().then((wingetVersion) => setState({ wingetVersion })).catch(() => {});
  try {
    const kind = await winget.engine();
    setState((s) => ({ engine: { ...s.engine, kind } }));
  } catch {
    setState((s) => ({ engine: { ...s.engine, kind: "cli" } }));
  }
  await scanInstalled();
  if (state.settings.checkOnLaunch) await checkUpdates();
}

/** Baca semua aplikasi yang terpasang di Windows lewat `winget list`. */
export async function scanInstalled() {
  if (state.mode !== "native" || state.scan.status === "loading") return;
  setState((s) => ({ scan: { ...s.scan, status: "loading" } }));
  try {
    const pkgs = await winget.listInstalled();
    const locs = await system.installLocations().catch(() => [] as InstallLocation[]);
    const s = state;
    const installed: Record<string, Installed> = {};
    const unmanaged: Unmanaged[] = [];
    const managed = pkgs.filter((p) => p.source);
    const records = { ...s.records };
    const ignored: string[] = [];
    // Aplikasi dari GitHub juga tercatat di Windows: tampilkan sekali saja, sebagai aplikasi GitHub.
    const ghNames = new Set(Object.values(s.gh.records).map((r) => norm(r.displayName ?? "")).filter(Boolean));
    for (const p of pkgs) {
      if (ghNames.has(norm(p.name))) continue;
      const found = matchLocation(p.name, locs);
      if (p.source) {
        const rec = s.records[p.id];
        // Lokasi yang dicatat Windows adalah yang sebenarnya. Bila berbeda dari pilihan
        // saat install, berarti installer mengabaikan --location.
        if (rec?.path && found && samePath(rec.path, found) === false && Date.now() - rec.installedAt < 30 * 60e3) {
          ignored.push(`${p.name.replace(/…$/, "")}: ${found}`);
          // Pilihan lokasi tidak dipakai installer: jangan tandai sebagai lokasi kustom.
          records[p.id] = { ...rec, path: "" };
        }
        installed[p.id] = {
          appId: p.id,
          version: p.version,
          path: found || rec?.path || "",
          scope: rec?.scope ?? "unknown",
          installedAt: rec?.installedAt ?? 0,
          pinned: rec?.pinned ?? false,
          archive: [],
        };
      } else {
        const name = p.name.replace(/…$/, "").trim();
        unmanaged.push({ id: p.id, name, publisher: "", version: p.version, glyph: glyphOf(name), hue: hueOf(p.id), path: found });
      }
    }
    unmanaged.sort((a, b) => a.name.localeCompare(b.name));
    for (const rec of Object.values(s.gh.records)) installed[rec.appId] = installedFromRecord(rec);
    const first = !scannedOnce;
    scannedOnce = true;
    setState({
      apps: withPackages(s.apps, managed),
      installed,
      unmanaged,
      records,
      scan: { status: "done", at: Date.now() },
    });
    if (ignored.length) {
      toast({
        tone: "info",
        title: "Installer memakai lokasinya sendiri",
        body: `Pilihan lokasi diabaikan oleh installer. ${ignored.join("; ")}`,
      }, 12000);
    }
    if (first) {
      toast({
        tone: "info",
        title: `Winsta menemukan ${pkgs.length} aplikasi terpasang`,
        body: `${managed.length} di antaranya bisa di-update dan di-rollback lewat Winsta.`,
        action: { label: "Lihat daftar", run: () => go("installed") },
      }, 9000);
    }
  } catch (e) {
    setState({ scan: { status: "error", error: String(e) } });
  }
}

/** Pasang modul resmi Microsoft.WinGet.Client, lalu baca ulang daftar aplikasi. */
export async function installWingetClient() {
  if (state.mode !== "native" || state.engine.installing) return;
  setState((s) => ({ engine: { ...s.engine, installing: true, error: undefined } }));
  try {
    await winget.installClient();
    setState({ engine: { kind: "module", installing: false } });
    toast({ tone: "success", title: "Modul Microsoft.WinGet.Client terpasang", body: "Daftar aplikasi dibaca ulang dengan data lengkap." });
    await scanInstalled();
    await checkUpdates();
  } catch (e) {
    setState({ engine: { kind: "cli", installing: false, error: cleanError(e) } });
  }
}

function demoOffline(): boolean {
  try {
    return new URLSearchParams(location.search).has("offline");
  } catch {
    return false;
  }
}

export async function checkUpdates() {
  if (state.check.status === "checking") return;
  setState((s) => ({ check: { ...s.check, status: "checking", error: undefined } }));
  if (state.mode === "demo") {
    window.setTimeout(() => {
      if (demoOffline()) setState((s) => ({ check: { ...s.check, status: "error" } }));
      else setState({ check: { status: "done", lastChecked: Date.now() } });
      void refreshGithubLatest();
    }, 1700);
    return;
  }
  try {
    const ups = await winget.listUpgrades();
    const latest: Record<string, string> = {};
    for (const u of ups) if (u.available) latest[u.id] = u.available;
    setState((s) => ({
      latest: { ...Object.fromEntries(Object.entries(s.latest).filter(([k]) => isGhId(k))), ...latest },
      apps: withPackages(s.apps, ups),
      check: { status: "done", lastChecked: Date.now() },
    }));
  } catch (e) {
    setState((s) => ({ check: { ...s.check, status: "error", error: String(e) } }));
  }
  await refreshGithubLatest();
}

/** Cari langsung di repositori winget (mode native). */
let searchSeq = 0;
export async function searchWinget(query: string) {
  const q = query.trim();
  const seq = ++searchSeq;
  if (state.mode !== "native" || q.length < 2) {
    setState({ search: { query: q, status: "idle", ids: [] } });
    return;
  }
  setState({ search: { query: q, status: "loading", ids: state.search.ids } });
  try {
    const pkgs = await winget.search(q);
    if (seq !== searchSeq) return;
    setState((s) => ({ apps: withPackages(s.apps, pkgs), search: { query: q, status: "done", ids: pkgs.map((p) => p.id) } }));
  } catch (e) {
    if (seq !== searchSeq) return;
    setState({ search: { query: q, status: "error", ids: [], error: String(e) } });
  }
}

// ---------------------------------------------------------------------------
// Antrian: satu tugas winget berjalan pada satu waktu
// ---------------------------------------------------------------------------
const PHASES: Record<TaskKind, string[]> = {
  install: ["Mengunduh installer", "Memverifikasi SHA-256", "Memasang"],
  update: ["Mengarsipkan versi lama", "Mengunduh", "Memverifikasi SHA-256", "Memasang"],
  rollback: ["Melepas kunci versi", "Menyiapkan installer", "Memasang versi lama", "Menyelesaikan"],
  uninstall: ["Menghapus aplikasi"],
};
const SPEED: Record<TaskKind, number> = { install: 3.2, update: 3, rollback: 3, uninstall: 7 };

let taskSeq = 0;

function patchTask(id: string, patch: Partial<Task>) {
  setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

function enqueue(t: Omit<Task, "id" | "status" | "progress" | "phase" | "createdAt">) {
  const task: Task = {
    ...t,
    id: `k${Date.now().toString(36)}${++taskSeq}`,
    status: "queued",
    progress: 0,
    phase: "Menunggu giliran",
    createdAt: Date.now(),
  };
  setState((s) => ({ tasks: [...s.tasks, task] }));
  ensureRunner();
  return task;
}

/** `version` kosong berarti versi terbaru. */
export function installApp(appId: string, opts: { version: string; path: string; scope: ScopeChoice }) {
  enqueue({ kind: "install", appId, targetVersion: opts.version, path: opts.path, scope: opts.scope });
}

export function updateApps(appIds: string[]) {
  const ups = new Map(availableUpdates(state).map((u) => [u.app.id, u.latest]));
  for (const id of appIds) {
    const inst = state.installed[id];
    if (!inst || activeTaskFor(state, id)) continue;
    enqueue({
      kind: "update", appId: id, targetVersion: ups.get(id) ?? "", fromVersion: inst.version,
      path: inst.path, scope: inst.scope === "unknown" ? "auto" : inst.scope,
    });
  }
  setState({ selectedUpdates: [] });
}

export function rollbackApp(appId: string, opt: { version: string; fromArchive: boolean; uninstallFirst: boolean; pin: boolean }) {
  const inst = state.installed[appId];
  if (!inst) return;
  enqueue({
    kind: "rollback", appId, targetVersion: opt.version, fromVersion: inst.version,
    path: inst.path, scope: inst.scope === "unknown" ? "auto" : inst.scope, fromArchive: opt.fromArchive,
    uninstallFirst: opt.uninstallFirst, pin: opt.pin,
  });
}

export function uninstallApp(appId: string, dropArchive: boolean, interactive = false) {
  const inst = state.installed[appId];
  if (!inst) return;
  enqueue({
    kind: "uninstall", appId, targetVersion: inst.version, path: inst.path,
    scope: inst.scope === "unknown" ? "auto" : inst.scope, dropArchive, interactive,
  });
}

// ---------------------------------------------------------------------------
// Pembersihan sisa file setelah uninstall
// ---------------------------------------------------------------------------
interface Removed { appId: string; name: string; publisher: string; path: string; interactive: boolean }

/** Contoh sisa file untuk mode demo. */
function demoLeftovers(r: Removed): Leftover[] {
  const folder = folderName(r.name);
  const items: Leftover[] = [];
  if (r.path) items.push({ path: expandPath(r.path), kind: "install" });
  items.push({ path: expandPath(`%APPDATA%\\${folder}`), kind: "data" });
  items.push({ path: expandPath(`%LOCALAPPDATA%\\${folder}`), kind: "data" });
  items.push({ path: expandPath(`%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\${r.name}.lnk`), kind: "shortcut" });
  return items;
}

/**
 * Setelah uninstall: pastikan aplikasinya benar-benar hilang, lalu tawarkan menghapus folder, data,
 * dan shortcut yang ditinggalkan uninstaller.
 */
async function afterUninstall(r: Removed) {
  if (state.mode === "native") {
    const k = nameKey(r.name);
    const still = !!state.installed[r.appId] || state.unmanaged.some((u) => nameKey(u.name) === k);
    if (still) {
      toast({
        tone: "error",
        title: tx("{name} masih terdeteksi di Windows", { name: r.name }),
        body: tx("Uninstaller-nya tidak menghapus aplikasi secara diam-diam. Jalankan uninstaller dengan jendelanya sendiri, lalu ikuti langkahnya."),
        action: !r.interactive && state.installed[r.appId]
          ? { label: tx("Uninstall dengan jendela installer"), run: () => uninstallApp(r.appId, false, true) }
          : undefined,
      }, 15000);
      return;
    }
  }
  let items: Leftover[] = [];
  try {
    items = state.mode === "native"
      ? await invoke<Leftover[]>("find_leftovers", { name: r.name, publisher: r.publisher, path: r.path })
      : demoLeftovers(r);
  } catch {
    return;
  }
  if (!items.length) return;
  setState({ cleanup: { ...r, items, status: "ready", failed: [] }, dialogs: { leftovers: true } });
}

export async function deleteLeftovers(paths: string[]) {
  const c = state.cleanup;
  if (!c || !paths.length) return;
  setState({ cleanup: { ...c, status: "deleting" } });
  let failed: Cleanup["failed"] = [];
  if (state.mode === "native") {
    try {
      failed = await invoke<Cleanup["failed"]>("delete_leftovers", { paths, name: c.name, publisher: c.publisher, path: c.path });
    } catch (e) {
      failed = paths.map((p) => ({ path: p, reason: cleanError(e) }));
    }
  } else {
    await new Promise((r) => setTimeout(r, 600));
  }
  const removed = paths.length - failed.length;
  setState({ cleanup: { ...c, status: "done", failed, items: c.items.filter((i) => !paths.includes(i.path) || failed.some((f) => f.path === i.path)) } });
  if (!failed.length) {
    closeDialogs();
    toast({ tone: "success", title: tx("Sisa {name} dibersihkan", { name: c.name }), body: tx("{n} folder dan file dihapus.", { n: removed }) });
  }
}

export function retryTask(id: string, patch: Partial<Task> = {}) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  setState((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }));
  enqueue({
    kind: t.kind, appId: t.appId, targetVersion: t.targetVersion, fromVersion: t.fromVersion,
    path: t.path, scope: t.scope, uninstallFirst: t.uninstallFirst, pin: t.pin,
    fromArchive: t.fromArchive, dropArchive: t.dropArchive, interactive: t.interactive, ...patch,
  });
}

export function cancelTask(id: string) {
  setState((s) => ({ tasks: s.tasks.filter((t) => !(t.id === id && t.status === "queued")) }));
}

export function clearFinished() {
  setState((s) => ({ tasks: s.tasks.filter((t) => t.status === "queued" || t.status === "running") }));
}

export async function setPinned(appId: string, pinned: boolean) {
  const app = state.apps[appId];
  if (state.mode === "native" && !isGhId(appId)) {
    try {
      await winget.setPinned(appId, pinned);
    } catch (e) {
      toast({ tone: "error", title: `Kunci ${app?.name ?? appId} gagal diubah`, body: String(e) });
      return;
    }
  }
  setState((s) => {
    const inst = s.installed[appId];
    if (!inst) return {};
    const ghRec = s.gh.records[appId];
    return {
      installed: { ...s.installed, [appId]: { ...inst, pinned } },
      ...(ghRec
        ? { gh: { ...s.gh, records: { ...s.gh.records, [appId]: { ...ghRec, pinned } } } }
        : { records: { ...s.records, [appId]: { ...recordOf(s, appId), pinned } } }),
    };
  });
  toast({ tone: "info", title: pinned ? `${app?.name} dikunci` : `Kunci ${app?.name} dibuka`, body: pinned ? "Tidak ikut Update semua." : "Akan ikut Update semua lagi." });
}

function recordOf(s: State, appId: string): AppRecord {
  const inst = s.installed[appId];
  return s.records[appId] ?? { path: inst?.path ?? "", scope: inst?.scope ?? "unknown", pinned: inst?.pinned ?? false, installedAt: inst?.installedAt ?? 0 };
}

export function defaultInstallPath(app: App, root = state.settings.defaultRoot) {
  return joinPath(root, folderName(app.name));
}

function ensureRunner() {
  if (state.mode === "native") void runNativeQueue();
  else ensureDemoRunner();
}

// --- Mode native: jalankan winget sungguhan -------------------------------
let nativeRunning = false;

async function runNativeQueue() {
  if (nativeRunning) return;
  nativeRunning = true;
  let changed = false;
  const removed: Removed[] = [];
  try {
    for (;;) {
      const t = state.tasks.find((x) => x.status === "queued");
      if (!t) break;
      patchTask(t.id, { status: "running", progress: 2, phase: "Menyiapkan winget", log: [] });
      try {
        const app = state.apps[t.appId];
        const rec = state.gh.records[t.appId];
        await runWinget(t);
        finish(t, true);
        if (t.kind === "uninstall") {
          removed.push({
            appId: t.appId, name: rec?.displayName || app?.name || t.appId, publisher: app?.publisher ?? "",
            path: t.path || rec?.path || "", interactive: !!t.interactive,
          });
        }
      } catch (e) {
        finish(t, false, cleanError(e));
      }
      changed = true;
    }
  } finally {
    nativeRunning = false;
  }
  if (changed) {
    // Samakan daftar dengan keadaan Windows yang sebenarnya.
    await scanInstalled();
    for (const r of removed) await afterUninstall(r);
    if (state.check.status === "done") await checkUpdates();
  }
}

function cleanError(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  return s.replace(/^Error:\s*/, "");
}

/** Tugas untuk aplikasi GitHub: unduh file rilis lalu pasang lewat Rust. */
async function runGithub(t: Task) {
  const app = state.apps[t.appId];
  const rec = state.gh.records[t.appId];
  const name = app?.name ?? t.appId;
  if (t.kind === "uninstall") {
    if (!rec) throw new Error("Catatan aplikasi ini tidak ditemukan.");
    patchTask(t.id, { phase: "Menghapus", progress: 40 });
    await invoke("gh_uninstall", { taskId: t.id, args: { kind: rec.kind, path: rec.path, displayName: rec.displayName ?? null, name } });
    return;
  }
  let asset = t.gh;
  if (!asset) {
    patchTask(t.id, { phase: "Membaca rilis GitHub", progress: 3 });
    const list = await loadReleases(t.appId);
    const rel = list.find((r) => r.version === t.targetVersion);
    const a = rel && matchAsset(rel.assets, rec);
    if (!rel || !a) throw new Error(`Rilis ${t.targetVersion} tidak punya file untuk Windows.`);
    asset = { name: a.name, url: a.url, size: a.size, digest: a.digest, kind: a.kind, tag: rel.tag };
    patchTask(t.id, { gh: asset });
  }
  // Installer biasa: uninstall dulu bila diminta (aplikasi portable diganti utuh oleh Rust).
  if (t.kind === "rollback" && t.uninstallFirst && rec && !rec.kind.startsWith("portable") && rec.displayName) {
    patchTask(t.id, { phase: "Uninstall versi aktif", progress: 5 });
    await invoke("gh_uninstall", { taskId: t.id, args: { kind: rec.kind, path: rec.path, displayName: rec.displayName, name } });
  }
  const ref = gh.parseGhAppId(t.appId)!;
  const result = await invoke<GhInstallResult>("gh_install", {
    taskId: t.id,
    args: {
      url: asset.url, fileName: asset.name, size: asset.size, digest: asset.digest ?? null,
      location: t.path || null, name, repo: `${ref.owner}/${ref.repo}`, version: t.targetVersion,
    },
  });
  patchTask(t.id, { ghResult: result });
}

async function runWinget(t: Task) {
  if (isGhId(t.appId)) return runGithub(t);
  const id = t.appId;
  const scope = t.scope === "auto" ? undefined : t.scope;
  const location = t.path || undefined;
  switch (t.kind) {
    case "install":
      await winget.install(t.id, { id, version: t.targetVersion || undefined, location, scope });
      return;
    case "update":
      await winget.upgrade(t.id, id);
      return;
    case "uninstall":
      await winget.uninstall(t.id, id, !!t.interactive);
      return;
    case "rollback":
      if (t.uninstallFirst) {
        patchTask(t.id, { phase: "Uninstall versi aktif", progress: 5 });
        await winget.uninstall(t.id, id);
      }
      patchTask(t.id, { phase: "Melepas kunci versi" });
      await winget.setPinned(id, false).catch(() => {});
      await winget.install(t.id, { id, version: t.targetVersion, location, scope, force: true });
      if (t.pin) {
        patchTask(t.id, { phase: "Mengunci versi", progress: 98 });
        await winget.setPinned(id, true);
      }
      return;
  }
}

const UNIT_MB: Record<string, number> = { kb: 1 / 1024, mb: 1, gb: 1024 };

/** Terjemahkan output winget menjadi fase dan progres untuk antrian. */
export function interpretLine(line: string, t: Pick<Task, "phase" | "progress" | "kind">): { phase: string; progress: number } {
  let phase = t.phase;
  let p = t.progress;
  const dl = line.match(/([\d.,]+)\s*(KB|MB|GB)\s*\/\s*([\d.,]+)\s*(KB|MB|GB)/i);
  const num = (v: string) => Number(v.replace(",", "."));
  if (dl) {
    const done = num(dl[1]) * UNIT_MB[dl[2].toLowerCase()];
    const total = num(dl[3]) * UNIT_MB[dl[4].toLowerCase()];
    if (total > 0) {
      phase = "Mengunduh installer";
      p = Math.max(p, 8 + Math.min(1, done / total) * 60);
    }
  } else {
    const pc = line.match(/(\d{1,3})\s?%/);
    if (pc) {
      const v = Math.min(100, Number(pc[1]));
      p = Math.max(p, phase.startsWith("Memasang") || phase.startsWith("Menghapus") ? 72 + v * 0.25 : 8 + v * 0.6);
    }
  }
  if (/^Found\b/i.test(line)) { phase = "Menemukan paket"; p = Math.max(p, 5); }
  if (/^Downloading\b/i.test(line)) { phase = "Mengunduh installer"; p = Math.max(p, 8); }
  if (/verified installer hash/i.test(line)) { phase = "Hash SHA-256 cocok"; p = Math.max(p, 70); }
  if (/Starting package install/i.test(line)) { phase = "Memasang"; p = Math.max(p, 72); }
  if (/Starting package uninstall/i.test(line)) { phase = "Menghapus"; p = Math.max(p, 40); }
  if (/^Successfully\b/i.test(line)) { phase = "Menyelesaikan"; p = Math.max(p, 97); }
  // Baris dari pemasang GitHub (Rust).
  if (/^Mengunduh .* dari GitHub/.test(line)) { phase = "Mengunduh"; p = Math.max(p, 5); }
  if (/^Memverifikasi SHA-256/.test(line)) { phase = "Memverifikasi SHA-256"; p = Math.max(p, 68); }
  if (/^Hash SHA-256 cocok/.test(line)) { phase = "Hash SHA-256 cocok"; p = Math.max(p, 70); }
  if (/verifikasi dilewati/.test(line)) { phase = "Tanpa hash dari GitHub"; p = Math.max(p, 70); }
  if (/^Memasang/.test(line)) { phase = line.replace(/\s*\(.*\)$/, ""); p = Math.max(p, 72); }
  if (/^Selesai$/.test(line)) { phase = "Menyelesaikan"; p = Math.max(p, 97); }
  return { phase, progress: Math.min(p, 98) };
}

function onWingetLine({ taskId, line }: { taskId: string; line: string }) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const next = interpretLine(line, t);
  patchTask(taskId, { ...next, log: [...(t.log ?? []), line].slice(-300) });
}

// --- Mode demo: simulasi --------------------------------------------------
let runner: number | undefined;

function ensureDemoRunner() {
  if (runner !== undefined) return;
  runner = window.setInterval(tick, 110);
}

/** Demo: installer MSI menolak downgrade bila versi aktif tidak di-uninstall dulu. */
function shouldFail(t: Task): string | undefined {
  const app = state.apps[t.appId];
  if (t.kind === "rollback" && app?.installer === "msi" && !t.uninstallFirst) {
    return "Installer menolak downgrade karena versi yang lebih baru sudah terpasang (kode 0x80070666).";
  }
  return undefined;
}

function tick() {
  const s = state;
  const current = s.tasks.find((t) => t.status === "running") ?? s.tasks.find((t) => t.status === "queued");
  if (!current) {
    window.clearInterval(runner);
    runner = undefined;
    return;
  }
  const phases = PHASES[current.kind];
  const progress = Math.min(100, current.progress + SPEED[current.kind] * (0.7 + Math.random() * 0.6));
  const failure = shouldFail(current);
  if (failure && progress >= 68) {
    finish(current, false, failure);
    return;
  }
  if (progress >= 100) {
    finish(current, true);
    return;
  }
  const phase = phases[Math.min(phases.length - 1, Math.floor((progress / 100) * phases.length))];
  patchTask(current.id, { status: "running", progress, phase });
}

// --- Selesai (kedua mode) -------------------------------------------------
function finish(taskIn: Task, ok: boolean, error?: string) {
  // Pakai versi tugas terbaru: runGithub menyimpan file terpilih dan hasil install di sana.
  const task = state.tasks.find((x) => x.id === taskIn.id) ?? taskIn;
  const app = state.apps[task.appId];
  const name = app?.name ?? task.appId;
  const now = Date.now();
  const target = task.targetVersion || app?.versions[0] || "versi terbaru";

  if (!ok) {
    setState((s) => ({
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, status: "error", error, phase: "Gagal", finishedAt: now } : t)),
      log: [{ id: `${task.id}-log`, time: now, appId: task.appId, kind: task.kind, text: `${KIND_VERB[task.kind]} ${name} gagal`, ok: false, from: task.fromVersion, to: task.targetVersion }, ...s.log].slice(0, 200),
    }));
    toast({
      tone: "error",
      title: `${KIND_VERB[task.kind]} ${name} gagal`,
      body: error?.split("\n")[0],
      action: retryAction(task, error),
    }, 9000);
    return;
  }

  const installed = { ...state.installed };
  const records = { ...state.records };
  const latest = { ...state.latest };
  const keep = state.settings.keepVersions;
  const cur = installed[task.appId];
  const demo = state.mode === "demo";
  const archived = (v: string) => (demo ? [{ version: v, archivedAt: now, sha256: fakeSha(task.appId + v) }] : []);
  let text = "";
  let action: Toast["action"];

  switch (task.kind) {
    case "install": {
      const newest = app?.versions[0] ?? target;
      const scope = task.scope === "auto" ? "unknown" : task.scope;
      const pinned = !!task.targetVersion && compareVersions(newest, task.targetVersion) > 0;
      installed[task.appId] = { appId: task.appId, version: target, path: task.path, scope, installedAt: now, pinned, archive: [] };
      records[task.appId] = { path: task.path, scope, pinned, installedAt: now };
      const ver = task.targetVersion ? ` ${task.targetVersion}` : "";
      // Di mode native lokasi akhirnya diperiksa saat pindai ulang (installer bisa mengabaikan --location).
      text = task.path && demo ? `${name}${ver} dipasang di ${task.path}` : `${name}${ver} terpasang`;
      break;
    }
    case "update": {
      if (cur) {
        installed[task.appId] = {
          ...cur, version: target, installedAt: now,
          archive: [...archived(cur.version), ...cur.archive].slice(0, keep),
        };
      }
      delete latest[task.appId];
      text = `${name} diperbarui ${task.fromVersion} → ${target}`;
      action = { label: `Kembalikan ke ${task.fromVersion}`, run: () => openDialog({ rollback: task.appId }) };
      break;
    }
    case "rollback": {
      if (cur) {
        installed[task.appId] = {
          ...cur, version: target, installedAt: now, pinned: !!task.pin,
          archive: [...archived(cur.version), ...cur.archive.filter((a) => a.version !== target)].slice(0, keep),
        };
        records[task.appId] = { ...recordOf(state, task.appId), pinned: !!task.pin };
      }
      text = `${name} dikembalikan ke ${target} (dari ${task.fromVersion})${task.pin ? " · versi dikunci" : ""}`;
      break;
    }
    case "uninstall": {
      delete installed[task.appId];
      delete records[task.appId];
      text = `${name} dihapus${task.path ? ` dari ${task.path}` : ""}${task.dropArchive ? " beserta arsipnya" : ""}`;
      if (demo) {
        const r: Removed = { appId: task.appId, name, publisher: app?.publisher ?? "", path: task.path, interactive: false };
        window.setTimeout(() => void afterUninstall(r), 400);
      }
      break;
    }
  }

  let ghRecords = state.gh.records;
  if (isGhId(task.appId)) {
    delete records[task.appId];
    ghRecords = { ...ghRecords };
    if (task.kind === "uninstall") {
      delete ghRecords[task.appId];
    } else {
      const ref = gh.parseGhAppId(task.appId)!;
      const prev = ghRecords[task.appId];
      const res = task.ghResult;
      let asset: GhTaskAsset | undefined = task.gh;
      if (!asset) {
        const rel = state.gh.releases[task.appId]?.list.find((r) => r.version === target);
        const a = rel && matchAsset(rel.assets, prev);
        if (rel && a) asset = { name: a.name, url: a.url, size: a.size, digest: a.digest, kind: a.kind, tag: rel.tag };
      }
      const assetKind = asset?.kind ?? prev?.assetKind ?? "setup";
      const rustKind = { zip: "portable", exe: "portable-exe", msi: "msi", setup: "exe" }[assetKind];
      const rec: GhRecord = {
        appId: task.appId,
        owner: ref.owner,
        repo: ref.repo,
        name: app?.name ?? ref.repo,
        description: app?.description ?? prev?.description ?? "",
        homepage: app?.homepage ?? prev?.homepage ?? "",
        stars: app?.stars ?? prev?.stars ?? 0,
        version: target,
        tag: asset?.tag ?? prev?.tag ?? target,
        assetName: asset?.name ?? prev?.assetName ?? "",
        assetKind,
        kind: res?.kind ?? prev?.kind ?? rustKind,
        path: res?.path || task.path || prev?.path || "",
        displayName: res?.displayName ?? prev?.displayName,
        exe: res?.exe ?? prev?.exe,
        installedAt: now,
        // Versi lama yang dipasang sengaja (install atau rollback) dikunci agar tidak langsung ikut Update semua.
        pinned: task.kind === "rollback"
          ? !!task.pin
          : task.kind === "install"
            ? compareVersions(latestGhRelease(state, task.appId)?.version ?? target, target) > 0
            : prev?.pinned ?? false,
      };
      ghRecords[task.appId] = rec;
      installed[task.appId] = installedFromRecord(rec);
    }
  }

  setState((s) => ({
    installed,
    records,
    latest,
    gh: { ...s.gh, records: ghRecords },
    tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, status: "done", progress: 100, phase: "Selesai", finishedAt: now } : t)),
    log: [{ id: `${task.id}-log`, time: now, appId: task.appId, kind: task.kind, text, ok: true, from: task.fromVersion, to: target }, ...s.log].slice(0, 200),
  }));
  toast({ tone: "success", title: text, action });
}

/** Tombol coba lagi yang paling mungkin berhasil untuk kegagalan ini. */
export function retryAction(task: Task, error?: string): { label: string; run: () => void } {
  if (task.scope !== "auto" && /cakupan Otomatis|No applicable installer/i.test(error ?? "")) {
    return { label: "Coba lagi dengan cakupan Otomatis", run: () => retryTask(task.id, { scope: "auto" }) };
  }
  if (task.kind === "uninstall" && !task.interactive && !isGhId(task.appId)) {
    return { label: "Uninstall dengan jendela installer", run: () => retryTask(task.id, { interactive: true }) };
  }
  if (task.kind === "rollback" && !task.uninstallFirst) {
    return { label: "Coba lagi dengan uninstall dulu", run: () => retryTask(task.id, { uninstallFirst: true }) };
  }
  return { label: "Coba lagi", run: () => retryTask(task.id) };
}

export const KIND_VERB: Record<TaskKind, string> = {
  install: "Install",
  update: "Update",
  rollback: "Rollback",
  uninstall: "Uninstall",
};

export const KIND_LABEL: Record<TaskKind, string> = {
  install: "Install",
  update: "Update",
  rollback: "Rollback",
  uninstall: "Uninstall",
};
