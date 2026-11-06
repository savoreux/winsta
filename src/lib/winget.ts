// Klien bertipe untuk perintah di src-tauri/src/lib.rs (dipakai di mode native).
import { invoke } from "./native";
import type { Drive } from "./types";

export interface WingetPackage {
  name: string;
  id: string;
  version: string;
  available: string;
  /** "winget", "msstore", atau kosong bila tidak dikelola winget. */
  source: string;
}

export interface InstallArgs {
  id: string;
  version?: string;
  location?: string;
  scope?: "user" | "machine";
  interactive?: boolean;
  force?: boolean;
}

export interface InstallLocation {
  name: string;
  path: string;
}

export const winget = {
  version: () => invoke<string>("winget_version"),
  search: (query: string) => invoke<WingetPackage[]>("winget_search", { query }),
  listInstalled: () => invoke<WingetPackage[]>("winget_list"),
  listUpgrades: () => invoke<WingetPackage[]>("winget_upgrades"),
  versions: (id: string) => invoke<string[]>("winget_versions", { id }),
  install: (taskId: string, args: InstallArgs) => invoke<void>("winget_install", { taskId, args }),
  upgrade: (taskId: string, id: string) => invoke<void>("winget_upgrade", { taskId, id }),
  uninstall: (taskId: string, id: string, interactive = false) => invoke<void>("winget_uninstall", { taskId, id, interactive }),
  /** Simpan installer versi tertentu ke folder arsip. */
  archive: (taskId: string, id: string, version: string, dir: string) =>
    invoke<void>("winget_archive", { taskId, id, version, dir }),
  setPinned: (id: string, pinned: boolean) => invoke<void>("winget_pin", { id, pinned }),
  /** "module" bila Microsoft.WinGet.Client terpasang, "cli" bila belum. */
  engine: () => invoke<"module" | "cli">("winget_engine"),
  /** Pasang Microsoft.WinGet.Client untuk pengguna ini (tanpa admin). */
  installClient: () => invoke<void>("winget_install_client"),
};

export const system = {
  drives: () => invoke<Drive[]>("system_drives"),
  installLocations: () => invoke<InstallLocation[]>("install_locations"),
  localAppData: () => invoke<string>("local_app_data"),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
};

/** Output winget baris demi baris: event "winget://log" dengan { taskId, line }. */
export const WINGET_LOG_EVENT = "winget://log";
