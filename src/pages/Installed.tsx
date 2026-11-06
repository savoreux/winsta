import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMemo } from "react";
import {
  LuChevronDown, LuEllipsis, LuEye, LuEyeOff, LuFolderOpen, LuLock, LuLockOpen, LuPackage, LuRefreshCw, LuRotateCcw,
  LuSparkles, LuTrash2, LuTriangleAlert,
} from "react-icons/lu";
import { ArchiveDots, Badge, Button, Empty, PageHeader, Skeleton } from "../components/ui";
import { cx, expandPath, middleTruncate } from "../lib/format";
import { t, tr } from "../lib/i18n";
import { isNative } from "../lib/native";
import type { App, Installed as Inst } from "../lib/types";
import { system } from "../lib/winget";
import {
  activeTaskFor, availableUpdates, canRollback, getApp, installWingetClient, openDialog, scanInstalled, setPinned,
  toast, updateApps, updateSettings, useStore,
} from "../state/store";

function openFolder(path: string) {
  if (!path) return;
  if (isNative()) {
    system.openPath(path).catch((e) => toast({ tone: "error", title: t("Folder tidak bisa dibuka"), body: tr(String(e)) }));
  } else {
    toast({ tone: "info", title: t("Membuka folder"), body: expandPath(path) });
  }
}

const GRID = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_110px_176px_136px]";

export function Installed() {
  const installed = useStore((s) => s.installed);
  const unmanagedAll = useStore((s) => s.unmanaged);
  const keep = useStore((s) => s.settings.keepVersions);
  const root = useStore((s) => s.settings.defaultRoot);
  const mode = useStore((s) => s.mode);
  const scan = useStore((s) => s.scan);
  const engine = useStore((s) => s.engine);
  const showOthers = useStore((s) => s.settings.showUnmanaged);
  // Satu kotak pencarian untuk semua halaman: kotak di bilah atas.
  const filter = useStore((s) => s.query.trim().toLowerCase());

  const rows = useMemo(() => {
    const f = filter;
    return Object.values(installed)
      .map((inst) => ({ inst, app: getApp(inst.appId) }))
      .filter((r): r is { inst: Inst; app: App } => !!r.app)
      .filter((r) => !f || r.app.name.toLowerCase().includes(f) || r.app.packageId.toLowerCase().includes(f))
      .sort((a, b) => a.app.name.localeCompare(b.app.name));
  }, [installed, filter]);
  const unmanaged = unmanagedAll.filter((u) => !filter || u.name.toLowerCase().includes(filter) || (u.publisher ?? "").toLowerCase().includes(filter));
  const total = Object.keys(installed).length + unmanagedAll.length;
  const archived = rows.reduce((n, r) => n + r.inst.archive.length, 0);
  const firstScan = scan.status === "loading" && total === 0;

  const managedCount = Object.keys(installed).length;
  const sub = mode === "native"
    ? scan.status === "loading"
      ? t("Memindai aplikasi yang terpasang di Windows…")
      : t("{n} aplikasi bisa di-update dan di-rollback lewat Winsta", { n: managedCount })
    : t("{n} aplikasi · {a} versi lama di arsip (maks. {k} per aplikasi)", { n: managedCount, a: archived, k: keep });
  const shown = filter ? t("{n} cocok dengan “{q}”", { n: rows.length + unmanaged.length, q: filter }) : null;

  return (
    <div>
      <PageHeader
        title={t("Aplikasi terpasang")}
        sub={shown ? `${sub} · ${shown}` : sub}
        actions={
          <>
            {mode === "native" && (
              <Button onClick={() => void scanInstalled()} loading={scan.status === "loading"} disabled={scan.status === "loading"} icon={<LuRefreshCw className="size-4" aria-hidden />}>
                {t("Pindai ulang")}
              </Button>
            )}
          </>
        }
      />

      {mode === "native" && engine.kind === "cli" && scan.status !== "loading" && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-accent/40 bg-accent-soft p-4">
          <LuSparkles className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{t("Ada aplikasi yang belum terbaca?")}</p>
            <p className="text-sm text-ink-2">
              {t("Pasang modul resmi Microsoft.WinGet.Client agar daftar aplikasi, update, dan pencarian terbaca lengkap. Hanya sekali, untuk akun ini saja, tanpa izin admin.")}
            </p>
            {engine.error && <p className="mt-1 line-clamp-2 text-xs text-error">{tr(engine.error)}</p>}
          </div>
          <Button variant="primary" loading={engine.installing} disabled={engine.installing} onClick={() => void installWingetClient()}>
            {t(engine.installing ? "Memasang modul…" : engine.error ? "Coba lagi" : "Pasang modul")}
          </Button>
        </div>
      )}

      {scan.status === "error" && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-warning/40 bg-warning-soft p-4">
          <LuTriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{t("Daftar aplikasi tidak bisa dibaca")}</p>
            <p className="line-clamp-2 text-sm text-ink-2">{tr(scan.error ?? "").split("\n")[0]}</p>
          </div>
          <Button onClick={() => void scanInstalled()}>{t("Coba lagi")}</Button>
        </div>
      )}

      {firstScan ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-0">
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-28" /></div>
              <Skeleton className="hidden h-3 w-56 lg:block" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-mute">{t("winget sedang membaca daftar aplikasi. Pertama kali bisa butuh 10–20 detik.")}</p>
        </div>
      ) : rows.length === 0 && unmanagedAll.length === 0 ? (
        <Empty
          icon={<LuPackage className="size-5" />}
          title={t(filter ? "Tidak ada aplikasi yang cocok" : "Belum ada aplikasi yang dikelola winget")}
          body={t(filter ? "Ubah kata pencarian, atau cari aplikasi baru di Jelajahi." : "Cari aplikasi di Jelajahi untuk memasangnya lewat Winsta.")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className={cx("hidden items-center gap-4 border-b border-line-soft px-4 py-2.5 text-[11px] font-semibold tracking-wider text-mute uppercase lg:grid", GRID)}>
            <span>{t("Aplikasi")}</span>
            <span>{t("Lokasi")}</span>
            <span>{t(mode === "demo" ? "Arsip" : "Sumber")}</span>
            <span>{t("Status")}</span>
            <span className="w-[136px] text-right">{t("Aksi")}</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {rows.map(({ inst, app }) => <Row key={app.id} inst={inst} app={app} keep={keep} root={root} demo={mode === "demo"} />)}
          </ul>
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-mute">
              {t(filter ? "Tidak ada aplikasi winget yang cocok dengan pencarian." : "Belum ada aplikasi yang dikelola winget.")}
            </p>
          )}
          {unmanagedAll.length > 0 && (!filter || unmanaged.length > 0) && (
            <button
              type="button"
              onClick={() => updateSettings({ showUnmanaged: !showOthers })}
              aria-expanded={showOthers}
              className="flex w-full items-center gap-3 border-t border-line-soft bg-surface-2/50 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-2"
            >
              {showOthers ? <LuEyeOff className="size-4 text-mute" aria-hidden /> : <LuEye className="size-4 text-mute" aria-hidden />}
              <span className="flex-1">
                <span className="font-medium text-ink">{t("Aplikasi lain terpasang ({n})", { n: filter ? unmanaged.length : unmanagedAll.length })}</span>
                <span className="block text-xs text-mute">{t("Dipasang di luar winget, jadi update dan rollback-nya tidak bisa diatur dari Winsta.")}</span>
              </span>
              <span className="text-xs font-medium text-accent">{t(showOthers ? "Sembunyikan" : "Tampilkan")}</span>
              <LuChevronDown className={cx("size-4 text-mute transition-transform", showOthers && "rotate-180")} aria-hidden />
            </button>
          )}
          {showOthers && unmanaged.length > 0 && (
            <>
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {unmanaged.map((u) => (
                  <li key={u.id} className={cx("grid grid-cols-1 items-center gap-3 px-4 py-3 lg:gap-4", GRID)}>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-ink"><span className="truncate">{u.name}</span> <Badge>{t("Tidak dikelola")}</Badge></p>
                        <p className="text-xs text-mute tabular-nums">{u.version ? `v${u.version}` : t("versi tidak diketahui")}{u.publisher && ` · ${u.publisher}`}</p>
                      </div>
                    </div>
                    <PathCell path={u.path ?? ""} />
                    <span className="text-xs text-mute">—</span>
                    <span className="text-xs text-mute">{t("Dipasang di luar Winsta")}</span>
                    <span className="w-[136px] text-right text-xs text-mute" title={t("Aplikasi ini tidak berasal dari winget, jadi tidak bisa di-update atau di-rollback dari sini.")}>
                      {t("Tidak tersedia")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PathCell({ path, custom }: { path: string; custom?: boolean }) {
  if (!path) {
    return (
      <span className="text-xs text-mute" title={t("Installer aplikasi ini tidak mencatat folder pemasangannya di Windows. Aplikasinya tetap terdeteksi dan bisa di-update atau di-uninstall.")}>
        {t("Lokasi tidak dicatat installer")}
      </span>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => openFolder(path)}
        title={`${expandPath(path)}\n${t("Klik untuk membuka folder")}`}
        className="truncate font-mono text-xs text-ink-2 hover:text-accent hover:underline"
      >
        {middleTruncate(path, 38)}
      </button>
      {custom && <Badge tone="accent">{t("Kustom")}</Badge>}
    </div>
  );
}

function Row({ inst, app, keep, root, demo }: { inst: Inst; app: App; keep: number; root: string; demo: boolean }) {
  const task = useStore((s) => activeTaskFor(s, app.id));
  const update = useStore((s) => availableUpdates(s).find((u) => u.app.id === app.id));
  const rollbackable = useStore((s) => canRollback(s, app.id));
  const chosen = useStore((s) => s.records[app.id]?.path);
  const outsideRoot = (p: string) => !expandPath(p).toLowerCase().startsWith(expandPath(root).toLowerCase());
  // "Kustom" = folder yang dipilih sendiri saat install lewat Winsta, di luar folder default.
  const custom = demo
    ? !!inst.path && outsideRoot(inst.path) && !/^[a-z]:\\program files/i.test(expandPath(inst.path))
    : !!chosen && outsideRoot(chosen);
  const scope = inst.scope === "user" ? t("hanya saya") : inst.scope === "machine" ? t("semua pengguna") : app.packageId;

  return (
    <li className={cx("grid grid-cols-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 lg:gap-4", GRID)}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">
            <span className="truncate">{app.name}</span>
            {inst.pinned && <Badge tone="neutral"><LuLock className="size-3" aria-hidden />{t("Dikunci")}</Badge>}
          </p>
          <p className="truncate text-xs text-mute tabular-nums">v{inst.version} · {scope}</p>
        </div>
      </div>

      <PathCell path={inst.path} custom={custom} />

      {app.source === "github"
        ? <span className="text-xs text-mute">GitHub</span>
        : demo ? <ArchiveDots count={inst.archive.length} max={keep} /> : <span className="text-xs text-mute">{app.source || "—"}</span>}

      <div>
        {task ? (
          <span className="text-[13px] font-medium text-accent tabular-nums">
            {task.status === "queued" ? t("Dalam antrian") : `${tr(task.phase)} ${Math.round(task.progress)}%`}
          </span>
        ) : update && !inst.pinned ? (
          <Button size="sm" variant="accent" icon={<LuRefreshCw className="size-3.5" aria-hidden />} onClick={() => updateApps([app.id])}>
            {t("Update ke {v}", { v: update.latest })}
          </Button>
        ) : update && inst.pinned ? (
          <span className="text-xs text-mute">{t("{v} tersedia · dikunci", { v: update.latest })}</span>
        ) : (
          <span className="text-[13px] text-success">{t("Versi terbaru")}</span>
        )}
      </div>

      <div className="flex w-[136px] items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={!rollbackable || !!task}
          title={rollbackable ? t("Kembalikan {name} ke versi sebelumnya", { name: app.name }) : t(app.source && app.source !== "winget" && app.source !== "github" ? "Versi lama hanya tersedia untuk paket dari repositori winget" : "Belum ada versi lama")}
          icon={<LuRotateCcw className="size-3.5" aria-hidden />}
          onClick={() => openDialog({ rollback: app.id })}
        >
          {t("Rollback")}
        </Button>
        <Menu>
          <MenuButton aria-label={t("Aksi lain untuk {name}", { name: app.name })} className="inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink data-open:bg-surface-2">
            <LuEllipsis className="size-4" />
          </MenuButton>
          <MenuItems
            anchor={{ to: "bottom end", gap: 4 }}
            transition
            className="z-40 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-pop transition duration-100 focus:outline-none data-closed:scale-95 data-closed:opacity-0"
          >
            <MenuRow icon={<LuFolderOpen />} label={t("Buka folder")} disabled={!inst.path} onClick={() => openFolder(inst.path)} />
            {inst.pinned
              ? <MenuRow icon={<LuLockOpen />} label={t("Buka kunci versi")} onClick={() => void setPinned(app.id, false)} />
              : <MenuRow icon={<LuLock />} label={t("Kunci versi ini")} onClick={() => void setPinned(app.id, true)} />}
            <div className="my-1 h-px bg-line-soft" />
            <MenuRow icon={<LuTrash2 />} label={t("Uninstall…")} danger disabled={!!task} onClick={() => openDialog({ uninstall: app.id })} />
          </MenuItems>
        </Menu>
      </div>
    </li>
  );
}

function MenuRow({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <MenuItem disabled={disabled}>
      <button
        type="button"
        onClick={onClick}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm data-disabled:opacity-40 data-focus:bg-surface-2 [&_svg]:size-4",
          danger ? "text-error" : "text-ink",
        )}
      >
        <span className={danger ? "" : "text-ink-2"}>{icon}</span>
        {label}
      </button>
    </MenuItem>
  );
}
