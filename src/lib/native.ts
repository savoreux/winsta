// Penghubung ke Tauri. Memakai API global (`app.withGlobalTauri: true`) agar
// prototipe tetap bisa dibuka di browser biasa tanpa Tauri.
import type { ThemePref } from "./types";

type TauriGlobal = {
  core: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
  window: {
    getCurrentWindow: () => {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
      setTheme: (t: "light" | "dark" | null) => Promise<void>;
    };
  };
  dialog?: { open: (o: { directory: boolean; title?: string; defaultPath?: string }) => Promise<string | null> };
  event: {
    listen: <T>(event: string, cb: (e: { payload: T }) => void) => Promise<() => void>;
  };
};

const tauri = (): TauriGlobal | undefined =>
  (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;

export const isNative = () => !!tauri();

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = tauri();
  if (!t) return Promise.reject(new Error("Tidak berjalan di Tauri"));
  return t.core.invoke<T>(cmd, args);
}

/** Dengarkan event dari Rust (mis. output winget per tugas). */
export function listen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  const t = tauri();
  if (!t) return Promise.resolve(() => {});
  return t.event.listen<T>(event, (e) => cb(e.payload));
}

export const windowControls = {
  minimize: () => tauri()?.window.getCurrentWindow().minimize(),
  toggleMaximize: () => tauri()?.window.getCurrentWindow().toggleMaximize(),
  close: () => tauri()?.window.getCurrentWindow().close(),
};

/** Samakan tema jendela Windows (title bar, scrollbar WebView2) dengan pilihan pengguna. */
export function setNativeTheme(pref: ThemePref) {
  tauri()?.window.getCurrentWindow().setTheme(pref === "system" ? null : pref).catch(() => {});
}

const DEMO_FOLDERS = ["D:\\Apps", "E:\\Portable", "D:\\Dev"];
let demoIdx = 0;

/** Dialog pilih folder: native di Tauri, folder contoh bergiliran di browser. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const t = tauri();
  if (t?.dialog) return t.dialog.open({ directory: true, title: "Pilih folder instalasi", defaultPath });
  return DEMO_FOLDERS[demoIdx++ % DEMO_FOLDERS.length];
}
