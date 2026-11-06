export type CategoryId =
  | "dev" | "browser" | "media" | "design" | "office"
  | "util" | "comm" | "security" | "games";

export interface Category {
  id: CategoryId | string;
  label: string;
}

/** Jenis installer menentukan apakah lokasi kustom (`--location`) dihormati. */
export type InstallerType = "msi" | "exe" | "portable" | "msix" | "unknown";

export interface App {
  id: string;
  name: string;
  packageId: string;
  publisher: string;
  category: string;
  tagline: string;
  description: string;
  license: string;
  homepage: string;
  /** Versi di repositori winget, terbaru di depan. */
  versions: string[];
  sizeMB: number;
  installer: InstallerType;
  needsAdmin: boolean;
  hue: number;
  glyph: string;
  downloads: string;
  featured?: boolean;
  /** "winget", "msstore", "github"; kosong bila dipasang di luar winget. */
  source?: string;
  /** Khusus GitHub. */
  stars?: number;
  repoUrl?: string;
}

/** File rilis GitHub yang dipilih untuk sebuah tugas. */
export interface GhTaskAsset {
  name: string;
  url: string;
  size: number;
  digest?: string;
  kind: "msi" | "setup" | "exe" | "zip";
  tag: string;
}

/** Hasil install dari Rust: jenis yang terdeteksi dan lokasi sebenarnya. */
export interface GhInstallResult {
  kind: string;
  path: string;
  displayName?: string | null;
  exe?: string | null;
}

/** Yang diingat Winsta tentang aplikasi yang dipasang dari GitHub. */
export interface GhRecord {
  appId: string;
  owner: string;
  repo: string;
  name: string;
  description: string;
  homepage: string;
  stars: number;
  version: string;
  tag: string;
  assetName: string;
  assetKind: GhTaskAsset["kind"];
  /** Jenis dari Rust: portable, portable-exe, msi, inno, nsis, exe. */
  kind: string;
  path: string;
  displayName?: string;
  exe?: string;
  installedAt: number;
  pinned: boolean;
}

export interface ArchivedVersion {
  version: string;
  archivedAt: number;
  sha256: string;
}

export type Scope = "user" | "machine";
/** Pilihan cakupan saat install: "auto" berarti tidak mengirim --scope. */
export type ScopeChoice = Scope | "auto";

export interface Installed {
  appId: string;
  version: string;
  /** Kosong bila lokasi tidak diketahui. */
  path: string;
  scope: Scope | "unknown";
  installedAt: number;
  pinned: boolean;
  /** Installer versi lama yang disimpan lokal, terbaru di depan. */
  archive: ArchivedVersion[];
}

/** Aplikasi yang dipasang di luar Winsta/winget: tampil, tapi tidak bisa dikelola. */
export interface Unmanaged {
  id: string;
  name: string;
  publisher: string;
  version: string;
  glyph: string;
  hue: number;
  path?: string;
}

export interface Drive {
  id: string;
  label: string;
  freeGB: number;
  totalGB: number;
}

export type TaskKind = "install" | "update" | "rollback" | "uninstall";
export type TaskStatus = "queued" | "running" | "done" | "error";

export interface Task {
  id: string;
  kind: TaskKind;
  appId: string;
  targetVersion: string;
  fromVersion?: string;
  path: string;
  scope: ScopeChoice;
  status: TaskStatus;
  progress: number;
  phase: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  /** Rollback: uninstall versi aktif dulu. */
  uninstallFirst?: boolean;
  /** Rollback: kunci versi setelah selesai. */
  pin?: boolean;
  /** Rollback: sumber versi tujuan. */
  fromArchive?: boolean;
  /** Uninstall: hapus juga arsip versi lama. */
  dropArchive?: boolean;
  /** Uninstall: tampilkan jendela uninstaller (untuk uninstaller yang menolak mode diam). */
  interactive?: boolean;
  /** Output winget untuk tugas ini (mode native). */
  log?: string[];
  /** Sumber GitHub: file rilis yang akan dipasang (diisi saat dijalankan bila kosong). */
  gh?: GhTaskAsset;
  ghResult?: GhInstallResult;
}

export interface LogEntry {
  id: string;
  time: number;
  appId: string;
  kind: TaskKind;
  text: string;
  ok: boolean;
  from?: string;
  to?: string;
}

export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
  /** Bahasa antarmuka. */
  lang: "id" | "en";
  /** Tampilkan aplikasi yang dipasang di luar winget di halaman Terpasang. */
  showUnmanaged: boolean;
  /** Token GitHub opsional: menaikkan batas dari 60 ke 5.000 permintaan per jam. */
  githubToken: string;
  mica: boolean;
  defaultRoot: string;
  createShortcut: boolean;
  checkOnLaunch: boolean;
  keepVersions: number;
  pinAfterRollback: boolean;
}

export type CheckStatus = "idle" | "checking" | "done" | "error";

export type View = "discover" | "installed" | "updates" | "history" | "settings";
