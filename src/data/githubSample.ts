// Data contoh GitHub untuk mode demo, dipakai bila api.github.com tidak bisa dihubungi
// (mis. pratinjau di browser). Versi dan ukuran hanya ilustrasi.
import { mapRelease, type GhRelease, type GhRepo } from "../lib/github";

const DAY = 864e5;

function releases(base: number, versions: string[], files: (v: string) => [string, number][], hasDigest = true): GhRelease[] {
  return versions.map((v, i) =>
    mapRelease({
      tag_name: `v${v}`,
      name: `v${v}`,
      published_at: new Date(base - i * 38 * DAY).toISOString(),
      prerelease: false,
      draft: false,
      html_url: "",
      assets: files(v).map(([name, mb]) => ({
        name,
        size: Math.round(mb * 1_048_576),
        browser_download_url: `https://github.com/example/releases/download/v${v}/${name}`,
        digest: hasDigest && i < 4 ? `sha256:${(name + v).split("").map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(64, "0").slice(0, 64)}` : null,
      })),
    }),
  );
}

const NOW = Date.UTC(2026, 9, 20);

export const SAMPLE_REPOS: { repo: GhRepo; releases: GhRelease[] }[] = [
  {
    repo: {
      owner: "Flow-Launcher", name: "Flow.Launcher", fullName: "Flow-Launcher/Flow.Launcher",
      description: "Quick file search & app launcher for Windows with community-made plugins",
      stars: 11800, htmlUrl: "https://github.com/Flow-Launcher/Flow.Launcher", homepage: "https://flowlauncher.com", archived: false,
    },
    releases: releases(NOW, ["2.0.3", "2.0.2", "2.0.1", "1.20.2", "1.20.1", "1.19.5"], () => [
      ["Flow-Launcher-Setup.exe", 74],
      ["Flow-Launcher-Portable.zip", 81],
    ]),
  },
  {
    repo: {
      owner: "zufuliu", name: "notepad4", fullName: "zufuliu/notepad4",
      description: "Notepad4 (Notepad2⨯2) is a light-weight Scintilla based text editor for Windows",
      stars: 4300, htmlUrl: "https://github.com/zufuliu/notepad4", homepage: "", archived: false,
    },
    releases: releases(NOW - 9 * DAY, ["25.10", "25.08", "25.06", "25.04", "25.02", "24.12"], (v) => [
      [`Notepad4_en_x64_v${v}.zip`, 1.9],
      [`Notepad4_en_Win32_v${v}.zip`, 1.7],
      [`Notepad4_en_ARM64_v${v}.zip`, 1.8],
    ], false),
  },
  {
    repo: {
      owner: "keepassxreboot", name: "keepassxc", fullName: "keepassxreboot/keepassxc",
      description: "KeePassXC is a cross-platform community-driven port of the Windows application “KeePass Password Safe”",
      stars: 24500, htmlUrl: "https://github.com/keepassxreboot/keepassxc", homepage: "https://keepassxc.org", archived: false,
    },
    releases: releases(NOW - 20 * DAY, ["2.7.10", "2.7.9", "2.7.8", "2.7.7", "2.7.6", "2.7.5"], (v) => [
      [`KeePassXC-${v}-Win64.msi`, 42],
      [`KeePassXC-${v}-Win64.zip`, 58],
      [`KeePassXC-${v}-x86_64.AppImage`, 44],
    ]),
  },
  {
    repo: {
      owner: "obsproject", name: "obs-studio", fullName: "obsproject/obs-studio",
      description: "OBS Studio - Free and open source software for live streaming and screen recording",
      stars: 66000, htmlUrl: "https://github.com/obsproject/obs-studio", homepage: "https://obsproject.com", archived: false,
    },
    releases: releases(NOW - 4 * DAY, ["32.0.2", "32.0.1", "31.1.2", "31.1.1", "31.0.3", "31.0.2"], (v) => [
      [`OBS-Studio-${v}-Windows-x64-Installer.exe`, 154],
      [`OBS-Studio-${v}-Windows-x64.zip`, 236],
      [`OBS-Studio-${v}-macOS-Apple.dmg`, 180],
    ]),
  },
  {
    repo: {
      owner: "example", name: "linux-only-tool", fullName: "example/linux-only-tool",
      description: "Contoh repo tanpa file untuk Windows (demo)",
      stars: 320, htmlUrl: "https://github.com/example/linux-only-tool", homepage: "https://example.com", archived: false,
    },
    releases: releases(NOW, ["1.4.0", "1.3.0"], (v) => [[`linux-only-tool-${v}-x86_64.AppImage`, 12]]),
  },
];

export function sampleSearch(q: string): GhRepo[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  return SAMPLE_REPOS.filter(({ repo }) =>
    [repo.fullName, repo.description].some((f) => f.toLowerCase().includes(s)),
  ).map((r) => r.repo);
}

export function sampleRepo(owner: string, name: string) {
  return SAMPLE_REPOS.find((r) => r.repo.owner.toLowerCase() === owner.toLowerCase() && r.repo.name.toLowerCase() === name.toLowerCase());
}
