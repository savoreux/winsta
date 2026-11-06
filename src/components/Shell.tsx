import { Menu, MenuButton, MenuItem, MenuItems, Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useEffect, useRef, useState } from "react";
import {
  LuCheck, LuCircleAlert, LuCircleCheck, LuCompass, LuHardDrive, LuHistory, LuInfo, LuListChecks,
  LuHeart, LuLoaderCircle, LuMinus, LuMonitor, LuMoon, LuPackage, LuRefreshCw, LuSearch, LuSettings, LuSquare,
  LuSun, LuX,
} from "react-icons/lu";
import { CATEGORIES } from "../data/catalog";
import { cx, dec, timeAgo } from "../lib/format";
import { t, t as tt, tr } from "../lib/i18n";
import { isNative, windowControls } from "../lib/native";
import { system } from "../lib/winget";
import { resolveTheme, useSystemDark } from "../lib/theme";
import type { Task, ThemePref, View } from "../lib/types";
import {
  KIND_LABEL, cancelTask, clearFinished, dismissToast, getApp, go, retryAction, retryTask, setState, toast,
  updateSettings, updatesToRun, useStore,
} from "../state/store";
import { Button, Kbd, Progress } from "./ui";

export const SAWERIA_URL = "https://saweria.co/davidhandy";

/** Tombol dukungan di title bar. */
function SupportButton() {
  return (
    <a
      href={SAWERIA_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (isNative()) {
          e.preventDefault();
          system.openUrl(SAWERIA_URL).catch(() => toast({ tone: "error", title: t("Browser tidak bisa dibuka"), body: SAWERIA_URL }));
        }
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-orange-500 px-2.5 text-xs font-semibold text-white shadow-card transition-colors hover:bg-orange-600 focus-visible:outline-orange-500"
    >
      <LuHeart className="size-3.5 fill-white/90" aria-hidden />
      <span className="hidden sm:inline">Support on Saweria</span>
      <span className="sm:hidden">Saweria</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Title bar
// ---------------------------------------------------------------------------
const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof LuSun }[] = [
  { value: "system", label: "Ikuti Windows", Icon: LuMonitor },
  { value: "light", label: "Terang", Icon: LuSun },
  { value: "dark", label: "Gelap", Icon: LuMoon },
];

export function ThemeMenu() {
  const pref = useStore((s) => s.settings.theme);
  const systemDark = useSystemDark();
  const resolved = resolveTheme(pref, systemDark);
  const Current = pref === "system" ? LuMonitor : resolved === "dark" ? LuMoon : LuSun;
  return (
    <Menu>
      <MenuButton
        aria-label={t("Tema")}
        title={t("Tema")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink data-open:bg-surface-2"
      >
        <Current className="size-4" aria-hidden />
      </MenuButton>
      <MenuItems
        anchor={{ to: "bottom end", gap: 6 }}
        transition
        className="z-50 w-56 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-pop transition duration-100 ease-out focus:outline-none data-closed:scale-95 data-closed:opacity-0"
      >
        <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-mute uppercase">{t("Tema")}</p>
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <MenuItem key={value}>
            <button
              type="button"
              onClick={() => updateSettings({ theme: value })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink data-focus:bg-surface-2"
            >
              <Icon className="size-4 text-ink-2" aria-hidden />
              <span className="flex-1">
                {t(label)}
                {value === "system" && <span className="block text-xs text-mute">{systemDark ? t("Saat ini gelap") : t("Saat ini terang")}</span>}
              </span>
              {pref === value && <LuCheck className="size-4 text-accent" aria-label={t("dipilih")} />}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

export function TitleBar() {
  return (
    <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-3 bg-chrome pl-4 select-none">
      <span data-tauri-drag-region className="flex items-center gap-2">
        <span className="grid size-[18px] grid-cols-2 gap-[2px] rounded-[5px] bg-accent p-[3px]" aria-hidden>
          <span className="rounded-[2px] bg-white/90" />
          <span className="rounded-[2px] bg-white/55" />
          <span className="rounded-[2px] bg-white/55" />
          <span className="rounded-[2px] bg-white/90" />
        </span>
        <span className="text-[13px] font-semibold text-ink">Winsta</span>
      </span>
      <span data-tauri-drag-region className="flex-1 self-stretch" />
      <SupportButton />
      <ThemeMenu />
      <div className="flex h-full">
        <WinButton label={t("Minimalkan")} onClick={windowControls.minimize}><LuMinus className="size-4" /></WinButton>
        <WinButton label={t("Maksimalkan")} onClick={windowControls.toggleMaximize}><LuSquare className="size-3.5" /></WinButton>
        <WinButton label={t("Tutup")} onClick={windowControls.close} danger><LuX className="size-4" /></WinButton>
      </div>
    </div>
  );
}

function WinButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        "inline-flex w-12 items-center justify-center text-ink-2 transition-colors",
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
const NAV: { view: View; label: string; Icon: typeof LuCompass; key: string }[] = [
  { view: "discover", label: "Jelajahi", Icon: LuCompass, key: "1" },
  { view: "installed", label: "Terpasang", Icon: LuPackage, key: "2" },
  { view: "updates", label: "Update", Icon: LuRefreshCw, key: "3" },
  { view: "history", label: "Riwayat", Icon: LuHistory, key: "4" },
  { view: "settings", label: "Pengaturan", Icon: LuSettings, key: "5" },
];

function UpdateBadge() {
  const status = useStore((s) => s.check.status);
  const count = useStore((s) => updatesToRun(s).length);
  if (status === "checking") {
    return <LuLoaderCircle className="size-3.5 animate-spin text-mute" aria-label={t("Memeriksa update")} />;
  }
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span title={t("Cek update gagal")} aria-label={t("Cek update gagal")} className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-warning-soft px-1 text-xs font-bold text-warning">
        !
      </span>
    );
  }
  if (count === 0) return null;
  return (
    <span aria-label={t("{n} update tersedia", { n: count })} className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-accent px-1.5 text-xs font-semibold text-on-primary dark:text-bg">
      {count}
    </span>
  );
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const category = useStore((s) => s.category);
  const installedCount = useStore((s) => Object.keys(s.installed).length + (s.settings.showUnmanaged ? s.unmanaged.length : 0));
  const scanning = useStore((s) => s.scan.status === "loading");
  const drives = useStore((s) => s.drives);

  return (
    <nav aria-label={t("Navigasi utama")} className="flex w-16 shrink-0 flex-col bg-chrome md:w-[232px]">
      <ul className="space-y-0.5 px-2 pt-2 md:px-3">
        {NAV.map(({ view: v, label, Icon, key }) => {
          const active = view === v;
          return (
            <li key={v}>
              <button
                type="button"
                onClick={() => go(v)}
                aria-current={active ? "page" : undefined}
                title={`${t(label)} (Ctrl+${key})`}
                className={cx(
                  "group relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active ? "bg-surface-2 font-medium text-ink shadow-card dark:bg-surface-3/60" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" aria-hidden />}
                <Icon className={cx("size-[18px] shrink-0", active && "text-accent")} aria-hidden />
                <span className="hidden flex-1 text-left md:block">{t(label)}</span>
                <span className="hidden md:inline-flex">
                  {v === "updates" ? <UpdateBadge /> : v === "installed" ? (scanning
                    ? <LuLoaderCircle className="size-3.5 animate-spin text-mute" aria-label={t("Memindai aplikasi terpasang")} />
                    : <span className="text-xs text-mute tabular-nums">{installedCount}</span>) : (
                    <span className="opacity-0 transition-opacity group-hover:opacity-100"><Kbd>Ctrl {key}</Kbd></span>
                  )}
                </span>
                {v === "updates" && <span className="absolute top-1 right-1 md:hidden"><UpdateBadge /></span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 hidden min-h-0 flex-1 overflow-y-auto px-3 md:block">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-mute uppercase">{t("Kategori")}</p>
        <ul className="space-y-px">
          {CATEGORIES.map((c) => {
            const active = view === "discover" && category === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setState({ view: "discover", category: active ? "all" : c.id, query: "" })}
                  className={cx(
                    "flex h-8 w-full items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                  )}
                >
                  <span className={cx("size-1.5 rounded-full", active ? "bg-accent" : "bg-line")} aria-hidden />
                  {t(c.label)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {drives.length > 0 && <div className="mt-auto hidden border-t border-line-soft p-4 md:block">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-mute uppercase">
          <LuHardDrive className="size-3.5" aria-hidden /> {t("Penyimpanan")}
        </p>
        <ul className="space-y-3">
          {drives.map((d) => {
            const used = 1 - d.freeGB / d.totalGB;
            const low = d.freeGB < 2;
            return (
              <li key={d.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink-2">{d.label}</span>
                  <span className={cx("tabular-nums", low ? "font-medium text-error" : "text-mute")}>
                    {dec(d.freeGB)} GB
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-3" title={t("{free} GB tersisa dari {total} GB", { free: dec(d.freeGB), total: dec(d.totalGB) })}>
                  <div className={cx("h-full rounded-full", low ? "bg-error" : "bg-accent")} style={{ width: `${used * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Top bar: pencarian + antrian
// ---------------------------------------------------------------------------
/** Halaman yang memfilter isinya sendiri dengan kotak pencarian atas. */
const FILTER_VIEWS: View[] = ["installed", "updates", "history"];

const PLACEHOLDER: Record<View, string> = {
  discover: "Cari aplikasi di winget dan GitHub, atau tempel alamat repo GitHub…",
  installed: "Cari di aplikasi terpasang…",
  updates: "Cari di daftar update…",
  history: "Cari di riwayat…",
  settings: "Cari aplikasi di winget dan GitHub, atau tempel alamat repo GitHub…",
};

export function TopBar() {
  const query = useStore((s) => s.query);
  const view = useStore((s) => s.view);
  const ref = useRef<HTMLInputElement>(null);
  const filtering = FILTER_VIEWS.includes(view);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-4 py-3 md:px-6">
      <label className="relative flex h-10 flex-1 items-center rounded-xl border border-line bg-surface transition-colors focus-within:border-accent">
        <LuSearch className="pointer-events-none absolute left-3.5 size-4 text-mute" aria-hidden />
        <input
          ref={ref}
          value={query}
          // Di Terpasang, Update, dan Riwayat: menyaring halaman itu. Di halaman lain: mencari aplikasi.
          onChange={(e) => setState(filtering ? { query: e.target.value } : { query: e.target.value, view: "discover" })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setState({ query: "" });
              e.currentTarget.blur();
            }
          }}
          placeholder={t(PLACEHOLDER[view])}
          aria-label={t(PLACEHOLDER[view])}
          className="h-full w-full rounded-xl bg-transparent pr-24 pl-10 text-sm text-ink outline-none placeholder:text-mute focus-visible:outline-none"
        />
        <span className="pointer-events-none absolute right-3 hidden items-center gap-1 sm:flex">
          {query ? <Kbd>Esc</Kbd> : <><Kbd>Ctrl</Kbd><Kbd>K</Kbd></>}
        </span>
      </label>
      <QueueButton />
    </div>
  );
}

function QueueButton() {
  const tasks = useStore((s) => s.tasks);
  const active = tasks.filter((t) => t.status === "queued" || t.status === "running");
  const failed = tasks.filter((t) => t.status === "error").length;
  const running = tasks.find((t) => t.status === "running");

  return (
    <Popover className="relative">
      <PopoverButton
        className={cx(
          "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors md:px-4",
          active.length ? "border-accent/60 bg-accent-soft text-ink" : "border-line bg-surface text-ink hover:bg-surface-2",
          "data-open:border-accent",
        )}
      >
        {running ? <ProgressRing value={running.progress} /> : <LuListChecks className="size-4" aria-hidden />}
        <span className="hidden sm:inline">{t("Antrian")}</span>
        {active.length > 0 && <span className="text-xs text-accent tabular-nums">{active.length}</span>}
        {failed > 0 && <span className="size-2 rounded-full bg-error" aria-label={t("{n} gagal", { n: failed })} />}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 8 }}
        transition
        className="z-40 flex max-h-[min(560px,75vh)] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop transition duration-150 ease-out data-closed:translate-y-1 data-closed:opacity-0"
      >
        <QueuePanel />
      </PopoverPanel>
    </Popover>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 7, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--w-surface-3)" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--w-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
    </svg>
  );
}

function QueuePanel() {
  const tasks = useStore((s) => s.tasks);
  const ordered = [
    ...tasks.filter((t) => t.status === "running"),
    ...tasks.filter((t) => t.status === "queued"),
    ...tasks.filter((t) => t.status === "error"),
    ...tasks.filter((t) => t.status === "done").reverse(),
  ];
  const finished = tasks.some((t) => t.status === "done" || t.status === "error");

  return (
    <>
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
        <p className="font-semibold text-ink">{t("Antrian")}</p>
        {finished && (
          <button type="button" onClick={clearFinished} className="text-xs text-mute hover:text-ink">
            {t("Bersihkan yang selesai")}
          </button>
        )}
      </div>
      {ordered.length === 0 ? (
        <p className="px-4 py-8 text-sm text-mute">
          {t("Antrian kosong. Install, update, atau rollback akan muncul di sini beserta progresnya, dan dijalankan satu per satu.")}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-y-auto">
          {ordered.map((t) => <QueueItem key={t.id} t={t} />)}
        </ul>
      )}
    </>
  );
}

function QueueItem({ t }: { t: Task }) {
  const app = getApp(t.appId);
  const [showLog, setShowLog] = useState(false);
  if (!app) return null;
  const target = t.targetVersion || tt("versi terbaru");
  const versions = t.fromVersion ? `${t.fromVersion} → ${target}` : target;
  const log = t.log ?? [];
  return (
    <li className="px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">{app.name}</p>
          <span className="shrink-0 text-xs text-mute">{tt(KIND_LABEL[t.kind])}</span>
        </div>
        <p className="text-xs text-mute tabular-nums">{versions}</p>
        {t.status === "running" && (
          <div className="mt-2">
            <Progress value={t.progress} />
            <p className="mt-1 text-xs text-ink-2">{tr(t.phase)}… {Math.round(t.progress)}%</p>
          </div>
        )}
        {t.status === "queued" && (
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-mute">{tt("Menunggu giliran")}</p>
            <button type="button" onClick={() => cancelTask(t.id)} className="text-xs text-mute hover:text-error">{tt("Batalkan")}</button>
          </div>
        )}
        {t.status === "done" && (
          <p className="mt-1 flex items-center gap-1 text-xs text-success">
            <LuCircleCheck className="size-3.5" aria-hidden /> {tt("Selesai")} {t.finishedAt ? timeAgo(t.finishedAt) : ""}
          </p>
        )}
        {t.status === "error" && (
          <div className="mt-2 rounded-lg bg-error-soft p-2.5">
            <p className="flex gap-1.5 text-xs whitespace-pre-line text-error">
              <LuCircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {tr(t.error ?? "").split("\n\n")[0]}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(() => {
                const best = retryAction(t, t.error);
                return (
                  <>
                    <Button size="sm" variant="secondary" onClick={best.run}>{tt(best.label)}</Button>
                    {best.label !== "Coba lagi" && <Button size="sm" variant="ghost" onClick={() => retryTask(t.id)}>{tt("Coba lagi")}</Button>}
                  </>
                );
              })()}
            </div>
          </div>
        )}
        {log.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowLog((v) => !v)} className="text-xs text-mute hover:text-ink" aria-expanded={showLog}>
              {showLog ? tt("Sembunyikan output") : tt("Lihat output")}
            </button>
            {showLog && (
              <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-bg p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {log.slice(-40).join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.tone === "success" ? LuCircleCheck : t.tone === "error" ? LuCircleAlert : LuInfo;
        const color = t.tone === "success" ? "text-success" : t.tone === "error" ? "text-error" : "text-accent";
        return (
          <div key={t.id} role="status" className="pointer-events-auto flex gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop">
            <Icon className={cx("mt-0.5 size-[18px] shrink-0", color)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{tr(t.title)}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink-2">{tr(t.body)}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action?.run(); dismissToast(t.id); }}
                  className="mt-2 text-xs font-semibold text-accent hover:underline"
                >
                  {tr(t.action.label)}
                </button>
              )}
            </div>
            <button type="button" aria-label={tt("Tutup notifikasi")} onClick={() => dismissToast(t.id)} className="self-start text-mute hover:text-ink">
              <LuX className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
