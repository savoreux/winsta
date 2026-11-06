import { useEffect, useSyncExternalStore } from "react";
import { setNativeTheme } from "./native";
import type { ThemePref } from "./types";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Tema sistem: di Windows (Tauri) ini mengikuti pengaturan Windows lewat
 * prefers-color-scheme. Bila halaman disematkan di host yang menyetel
 * `data-theme` pada <html> (mis. pratinjau web), pilihan host itu yang dipakai.
 */
function systemIsDark(): boolean {
  const host = document.documentElement.getAttribute("data-theme");
  if (host === "dark" || host === "light") return host === "dark";
  return query().matches;
}

function subscribeSystem(cb: () => void) {
  const mq = query();
  mq.addEventListener("change", cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", cb);
    mo.disconnect();
  };
}

/** true bila Windows (atau OS) sedang memakai mode gelap. Berubah langsung tanpa restart. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeSystem, systemIsDark, () => true);
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** Terapkan tema ke <html> dan ke jendela native. */
export function useApplyTheme(pref: ThemePref, mica: boolean) {
  const systemDark = useSystemDark();
  const resolved = resolveTheme(pref, systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    try {
      localStorage.setItem("winsta.theme", pref);
    } catch {
      /* abaikan */
    }
  }, [resolved, pref]);
  useEffect(() => {
    setNativeTheme(pref);
  }, [pref]);
  useEffect(() => {
    // Mica hanya aktif di dalam Tauri (jendela transparan); di browser tetap warna solid.
    const native = !!(globalThis as { __TAURI__?: unknown }).__TAURI__;
    document.documentElement.classList.toggle("mica", native && mica);
  }, [mica]);
  return resolved;
}
