// Keadaan awal untuk mode demo (data contoh dari prototipe Winsta).
import type { Drive, Installed, LogEntry, Settings, Unmanaged } from "../lib/types";
import { SHORT_ID } from "./catalog";
import { systemLang } from "../lib/i18n";

const DAY = 864e5;

/** SHA-256 tiruan yang stabil per versi, hanya untuk tampilan demo. */
export function fakeSha(seed: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  let out = "";
  for (let round = 0; out.length < 64; round++) {
    for (let i = 0; i < seed.length; i++) {
      const c = seed.charCodeAt(i) + round;
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (c * 31), 2246822519) >>> 0;
    }
    out += h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function inst(
  short: string, version: string, path: string, scope: "user" | "machine",
  archive: string[], daysAgo: number, now: number,
): Installed {
  const appId = SHORT_ID[short];
  return {
    appId, version, path, scope,
    installedAt: now - daysAgo * DAY,
    pinned: false,
    archive: archive.map((v, i) => ({
      version: v,
      archivedAt: now - (daysAgo + (i + 1) * 21) * DAY,
      sha256: fakeSha(appId + v),
    })),
  };
}

export function seedInstalled(now = Date.now()): Record<string, Installed> {
  const list = [
    inst("vscode", "1.104.3", "D:\\Apps\\vscode", "user", ["1.103.2", "1.102.3", "1.101.2"], 34, now),
    inst("firefox", "145.0.1", "%LOCALAPPDATA%\\Winsta\\apps\\firefox", "user", ["144.0.2"], 6, now),
    inst("7zip", "25.01", "C:\\Program Files\\7-Zip", "machine", ["25.00", "24.09"], 120, now),
    inst("git", "2.50.1", "C:\\Program Files\\Git", "machine", ["2.49.0", "2.48.1", "2.47.1"], 64, now),
    inst("python", "3.13.7", "D:\\Dev\\Python313", "user", ["3.13.6", "3.13.5", "3.13.4"], 41, now),
    inst("powertoys", "0.94.2", "%LOCALAPPDATA%\\Winsta\\apps\\powertoys", "user", ["0.93.0", "0.92.1", "0.91.1", "0.90.1", "0.89.0"], 22, now),
    inst("notepadpp", "8.8.7", "D:\\Apps\\notepadpp", "user", ["8.8.6", "8.8.5"], 3, now),
  ];
  return Object.fromEntries(list.map((i) => [i.appId, i]));
}

export const UNMANAGED: Unmanaged[] = [
  { id: "ARP\\Machine\\X64\\ZoomUMX", name: "Zoom Workplace", publisher: "Zoom Communications", version: "6.2.5", glyph: "Zm", hue: 225 },
];

export function seedLog(now = Date.now()): LogEntry[] {
  return [
    { id: "l1", time: now - 3 * DAY, appId: SHORT_ID.notepadpp, kind: "update", text: "Notepad++ diperbarui 8.8.6 → 8.8.7", ok: true, from: "8.8.6", to: "8.8.7" },
    { id: "l2", time: now - 6 * DAY, appId: SHORT_ID.firefox, kind: "update", text: "Mozilla Firefox diperbarui 144.0.2 → 145.0.1", ok: true, from: "144.0.2", to: "145.0.1" },
    { id: "l3", time: now - 9 * DAY, appId: SHORT_ID.vscode, kind: "rollback", text: "Visual Studio Code dikembalikan ke 1.104.3 (dari 1.105.1)", ok: true, from: "1.105.1", to: "1.104.3" },
    { id: "l4", time: now - 34 * DAY, appId: SHORT_ID.vscode, kind: "install", text: "Visual Studio Code 1.105.1 dipasang di D:\\Apps\\vscode", ok: true, to: "1.105.1" },
  ];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  lang: systemLang(),
  showUnmanaged: false,
  githubToken: "",
  mica: true,
  defaultRoot: "%LOCALAPPDATA%\\Winsta\\apps",
  createShortcut: true,
  checkOnLaunch: true,
  keepVersions: 5,
  pinAfterRollback: true,
};

export const DEMO_DRIVES: Drive[] = [
  { id: "C", label: "C: Sistem (SSD)", freeGB: 48.2, totalGB: 476 },
  { id: "D", label: "D: Data", freeGB: 312.5, totalGB: 931 },
  { id: "E", label: "E: USB Portable", freeGB: 0.4, totalGB: 29 },
];
