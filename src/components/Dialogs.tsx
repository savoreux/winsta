import {
  Dialog, DialogBackdrop, DialogPanel, DialogTitle, Listbox, ListboxButton, ListboxOption, ListboxOptions,
} from "@headlessui/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  LuArchive, LuCheck, LuChevronDown, LuCircleAlert, LuCircleCheck, LuCloudDownload, LuCopy, LuDownload,
  LuFile, LuFolder, LuFolderOpen, LuGlobe, LuInfo, LuLoaderCircle, LuRotateCcw, LuTrash2, LuTriangleAlert, LuX,
} from "react-icons/lu";
import {
  INSTALLER_LABEL, cx, driveOf, expandPath, folderName, formatCount, formatSize, joinPath, locationSupport, timeAgo,
} from "../lib/format";
import { locale, t, tr } from "../lib/i18n";
import { pickFolder } from "../lib/native";
import type { App, ScopeChoice } from "../lib/types";
import {
  canRollback, closeDialogs, defaultInstallPath, deleteLeftovers, ensureVersions, getApp, installApp, openDialog, rollbackApp,
  rollbackOptions, toast, uninstallApp, useStore, versionsOf,
} from "../state/store";
import { AppAction } from "./AppAction";
import { ExternalLink } from "./ExternalLink";
import { GhInstallBody } from "./GhInstall";
import { Badge, Button, Kbd, Segmented } from "./ui";

/** Simpan nilai terakhir agar isi dialog tetap terlihat selama animasi tutup. */
function useSticky<T>(value: T | undefined): T | undefined {
  const ref = useRef(value);
  if (value !== undefined) ref.current = value;
  return ref.current;
}

export function Dialogs() {
  const d = useStore((s) => s.dialogs);
  const install = useSticky(d.install);
  const rollback = useSticky(d.rollback);
  const uninstall = useSticky(d.uninstall);
  const detail = useSticky(d.detail);
  const cleanupId = useStore((s) => s.cleanup?.appId);
  return (
    <>
      <Modal open={!!d.install} wide>
        {install && (getApp(install)?.source === "github"
          ? <GhInstallBody key={install} app={getApp(install)!} />
          : <InstallBody key={install} app={getApp(install)!} />)}
      </Modal>
      <Modal open={!!d.rollback}>{rollback && <RollbackBody key={rollback} app={getApp(rollback)!} />}</Modal>
      <Modal open={!!d.uninstall}>{uninstall && <UninstallBody key={uninstall} app={getApp(uninstall)!} />}</Modal>
      <Modal open={!!d.detail} wide>{detail && <DetailBody key={detail} app={getApp(detail)!} />}</Modal>
      <Modal open={!!d.leftovers}><LeftoversBody key={cleanupId} /></Modal>
    </>
  );
}

function Modal({ open, wide, children }: { open: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <Dialog open={open} onClose={closeDialogs} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition duration-150 data-closed:opacity-0" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel
          transition
          className={cx(
            "relative max-h-[calc(100vh-32px)] w-full overflow-y-auto rounded-2xl border border-line bg-surface shadow-pop transition duration-150 ease-out data-closed:translate-y-2 data-closed:scale-[.98] data-closed:opacity-0",
            wide ? "max-w-[600px]" : "max-w-[520px]",
          )}
        >
          <button type="button" onClick={closeDialogs} aria-label={t("Tutup")} className="absolute top-4 right-4 rounded-md p-1 text-mute hover:bg-surface-2 hover:text-ink">
            <LuX className="size-4" />
          </button>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export function Header({ app, title, sub }: { app: App; title: string; sub: ReactNode }) {
  return (
    <div className="px-6 pt-6 pr-12" data-app={app.id}>
      <div className="min-w-0">
        <DialogTitle className="font-display text-xl font-semibold text-ink">{title}</DialogTitle>
        <p className="text-[13px] text-mute">{sub}</p>
      </div>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm font-medium text-ink">{children}</p>;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------
function InstallBody({ app }: { app: App }) {
  const drives = useStore((s) => s.drives);
  const versions = useStore((s) => versionsOf(s, app.id));
  useEffect(() => void ensureVersions(app.id), [app.id]);
  // "" = versi terbaru (winget memilih sendiri).
  const [version, setVersion] = useState("");
  const support = locationSupport(app.installer);
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [customRoot, setCustomRoot] = useState("D:\\Apps");
  const [subfolder, setSubfolder] = useState(true);
  const [scope, setScope] = useState<ScopeChoice>("auto");

  // Paket MSIX selalu dipasang Windows di lokasinya sendiri: jangan kirim --location.
  const path = support === "no"
    ? ""
    : mode === "default"
      ? defaultInstallPath(app)
      : subfolder ? joinPath(customRoot || "D:\\Apps", folderName(app.name)) : customRoot;
  const drive = drives.find((d) => d.id === driveOf(path || "C:"));
  const needMB = app.sizeMB > 0 ? Math.round(app.sizeMB * 1.7) : 0;
  const enough = !drive || drive.freeGB * 1024 > Math.max(needMB, 50);
  const canInstall = enough && (mode === "default" || support === "no" || customRoot.trim().length > 2);

  const submit = () => {
    if (!canInstall) return;
    installApp(app.id, { version, path, scope });
    closeDialogs();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <Header app={app} title={t("Install {name}", { name: app.name })} sub={[app.publisher || app.packageId, app.sizeMB > 0 && formatSize(app.sizeMB), t("{type} via winget", { type: INSTALLER_LABEL[app.installer] })].filter(Boolean).join(" · ")} />
      <div className="space-y-5 px-6 py-5">
        <div>
          <Label>{t("Versi")}</Label>
          <VersionSelect versions={versions.list} loading={versions.status === "loading"} value={version} onChange={setVersion} />
          {version !== "" && version !== versions.list[0] && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-mute">
              <LuInfo className="size-3.5" aria-hidden /> {t("Versi lama akan dikunci agar tidak langsung ikut Update semua.")}
            </p>
          )}
        </div>

        <div>
          <Label>{t("Lokasi instalasi")}</Label>
          <SupportNote installer={app.installer} />
          {support !== "no" && (
            <div className="mt-3 space-y-2" role="radiogroup" aria-label={t("Lokasi instalasi")}>
              <LocationCard
                checked={mode === "default"}
                onSelect={() => setMode("default")}
                title={t("Lokasi default Winsta")}
                desc={t("Tanpa izin admin · mudah dikelola dan di-rollback")}
              >
                <p className="mt-2 truncate font-mono text-xs text-ink-2">{defaultInstallPath(app)}</p>
              </LocationCard>
              <LocationCard
                checked={mode === "custom"}
                onSelect={() => setMode("custom")}
                title={t("Folder pilihan sendiri")}
                desc={t("Misalnya drive D: untuk menghemat SSD sistem")}
              >
                {mode === "custom" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={customRoot}
                        onChange={(e) => setCustomRoot(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("Folder tujuan")}
                        spellCheck={false}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
                      />
                      <Button
                        icon={<LuFolderOpen className="size-4" aria-hidden />}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const p = await pickFolder(customRoot);
                          if (p) setCustomRoot(p);
                        }}
                      >
                        {t("Pilih…")}
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-ink-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={subfolder} onChange={(e) => setSubfolder(e.target.checked)} className="size-4 accent-[var(--w-accent)]" />
                      {t("Buat subfolder “{name}”", { name: folderName(app.name) })}
                    </label>
                    <p className="truncate font-mono text-xs text-ink-2">{t("Dipasang ke:")} {path}</p>
                  </div>
                )}
              </LocationCard>
            </div>
          )}
          <p className={cx("mt-2.5 flex items-center gap-1.5 text-xs", !drive ? "text-mute" : enough ? "text-success" : "text-error")}>
            {enough ? <LuCircleCheck className="size-3.5" aria-hidden /> : <LuCircleAlert className="size-3.5" aria-hidden />}
            {drive
              ? <>{t("{drive}: {gb} GB tersisa", { drive: t(drive.label), gb: drive.freeGB.toLocaleString(locale(), { maximumFractionDigits: 1 }) })}{needMB > 0 && t(", butuh ±{size}", { size: formatSize(needMB) })}{!enough && t(" · pilih drive lain")}</>
              : t("Ruang disk akan diperiksa oleh installer.")}
          </p>
        </div>

        <div>
          <Label>{t("Cakupan")}</Label>
          <Segmented<ScopeChoice>
            label={t("Cakupan instalasi")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "auto", label: t("Otomatis"), hint: t("Ikuti installer") },
              { value: "user", label: t("Hanya saya"), hint: t("Tanpa UAC") },
              { value: "machine", label: t("Semua pengguna"), hint: t("Butuh izin admin") },
            ]}
          />
        </div>

      </div>
      <Footer
        left={<span className="hidden items-center gap-1.5 text-xs text-mute sm:flex"><Kbd>Ctrl</Kbd><Kbd>↵</Kbd> {t("install")}</span>}
      >
        <Button variant="ghost" onClick={closeDialogs}>{t("Batal")}</Button>
        <Button variant="primary" disabled={!canInstall} onClick={submit} icon={<LuDownload className="size-4" aria-hidden />}>
          {t("Install {v}", { v: version || (versions.list[0] ?? t("versi terbaru")) })}
        </Button>
      </Footer>
    </>
  );
}

function SupportNote({ installer }: { installer: App["installer"] }) {
  const s = locationSupport(installer);
  const label = INSTALLER_LABEL[installer];
  if (s === "yes") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-ink">
        <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t("Installer {label}: lokasi kustom didukung.", { label })}
      </p>
    );
  }
  if (s === "maybe") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-ink">
        <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {installer === "unknown"
          ? t("Jenis installer belum diketahui. Lokasi kustom dipakai bila installer mendukung; Winsta memeriksa foldernya setelah install.")
          : t("Installer {label}: lokasi kustom biasanya didukung, tapi tidak dijamin. Winsta memeriksa foldernya setelah install.", { label })}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
      <LuInfo className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />
      {t("Paket {label} dipasang oleh Windows di lokasinya sendiri, jadi pilihan lokasi tidak berlaku.", { label })}
    </p>
  );
}

export function LocationCard({ checked, onSelect, title, desc, children }: { checked: boolean; onSelect: () => void; title: string; desc: string; children?: ReactNode }) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
      className={cx(
        "cursor-pointer rounded-xl border p-3.5 transition-colors",
        checked ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-accent" : "border-line")}>
          {checked && <span className="size-2 rounded-full bg-accent" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="text-xs text-mute">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function VersionSelect({ versions, loading, value, onChange }: { versions: string[]; loading: boolean; value: string; onChange: (v: string) => void }) {
  const label = (v: string) => (v === "" ? `${t("Terbaru")}${versions[0] ? ` (${versions[0]})` : ""}` : v);
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="flex h-10 w-full items-center justify-between rounded-lg border border-line bg-bg px-3 text-left text-sm text-ink data-open:border-accent">
        <span className="tabular-nums">{label(value)}</span>
        {loading
          ? <span className="flex items-center gap-1.5 text-xs text-mute"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> {t("memuat versi")}</span>
          : <LuChevronDown className="size-4 text-mute" aria-hidden />}
      </ListboxButton>
      <ListboxOptions
        anchor={{ to: "bottom start", gap: 4 }}
        transition
        className="z-[60] max-h-72 w-(--button-width) overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop transition duration-100 focus:outline-none data-closed:opacity-0"
      >
        {["", ...versions].map((v) => (
          <ListboxOption key={v || "latest"} value={v} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-ink tabular-nums data-focus:bg-surface-2">
            <span>{label(v)}</span>
            {v === value && <LuCheck className="size-4 text-accent" aria-hidden />}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}

export function Footer({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line-soft bg-surface px-6 py-4">
      <div className="min-w-0">{left}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
function RollbackBody({ app }: { app: App }) {
  const inst = useStore((s) => s.installed[app.id]);
  const options = useStore((s) => rollbackOptions(s, app.id));
  const keep = useStore((s) => s.settings.keepVersions);
  const pinDefault = useStore((s) => s.settings.pinAfterRollback);
  const demo = useStore((s) => s.mode === "demo");
  const fromGh = app.source === "github";
  const loading = useStore((s) => versionsOf(s, app.id).status === "loading");
  const failed = useStore((s) => versionsOf(s, app.id).status === "error");
  useEffect(() => void ensureVersions(app.id), [app.id]);
  const [picked, setTarget] = useState<string | undefined>();
  const target = picked ?? options[0]?.version;
  const [uninstallFirst, setUninstallFirst] = useState(false);
  const [pin, setPin] = useState(pinDefault);
  if (!inst) return null;
  const chosen = options.find((o) => o.version === target);

  return (
    <>
      <Header
        app={app}
        title={t("Rollback {name}", { name: app.name })}
        sub={fromGh
          ? t("Versi aktif {v} · versi lama diambil dari rilis GitHub", { v: inst.version })
          : demo ? t("Versi aktif {v} · {n}/{k} versi tersimpan di arsip lokal", { v: inst.version, n: inst.archive.length, k: keep }) : t("Versi aktif {v} · versi lama diambil dari repositori winget", { v: inst.version })}
      />
      <div className="px-6 py-5">
        {loading && options.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            <LuLoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> {t(fromGh ? "Mengambil daftar rilis dari GitHub…" : "Mengambil daftar versi dari winget…")}
          </p>
        ) : options.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            {t(failed
              ? "Daftar versi tidak bisa diambil. Periksa koneksi internet, lalu buka dialog ini lagi."
              : demo
                ? "Belum ada versi lama. Arsip dibuat otomatis setiap kali aplikasi ini di-update lewat Winsta."
                : fromGh ? "Tidak ada rilis GitHub yang lebih lama dengan file untuk Windows." : "Repositori winget tidak punya versi yang lebih lama dari versi yang terpasang.")}
          </p>
        ) : (
          <ol className="relative space-y-1.5" role="radiogroup" aria-label={t("Versi tujuan")}>
            <span className="absolute top-5 bottom-5 left-[19px] w-px bg-line" aria-hidden />
            <li className="relative flex items-start gap-3 rounded-xl px-3 py-2.5">
              <span className="relative z-10 mt-1 size-3.5 rounded-full border-2 border-surface bg-success ring-2 ring-success/30" aria-hidden />
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink tabular-nums">{inst.version} <Badge tone="success">{t("Aktif")}</Badge></p>
                <p className="text-xs text-mute">{inst.installedAt ? t("Dipasang {when}", { when: timeAgo(inst.installedAt) }) : t("Versi yang terpasang sekarang")}</p>
              </div>
            </li>
            {options.map((o, i) => {
              const on = o.version === target;
              return (
                <li key={o.version}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTarget(o.version)}
                    className={cx(
                      "relative flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      on ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2",
                    )}
                  >
                    <span className={cx("relative z-10 mt-1 flex size-3.5 items-center justify-center rounded-full border-2 bg-surface", on ? "border-accent" : "border-line")} aria-hidden>
                      {on && <span className="size-1.5 rounded-full bg-accent" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold text-ink tabular-nums">
                        {o.version} <span className="text-xs font-normal text-mute">−{i + 1} {t("versi")}</span>
                      </p>
                      {o.source === "archive" ? (
                        <p className="flex items-center gap-1.5 truncate font-mono text-xs text-mute">
                          <LuArchive className="size-3 shrink-0" aria-hidden /> {t("arsip lokal")} · {timeAgo(o.archivedAt!)} · sha256 {o.sha256!.slice(0, 12)}…
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-mute">
                          <LuCloudDownload className="size-3 shrink-0" aria-hidden /> {t(fromGh ? "dari rilis GitHub" : "dari repositori winget")} · {t("perlu diunduh")}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {options.length > 0 && (
          <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={uninstallFirst} onChange={(e) => setUninstallFirst(e.target.checked)} className="mt-0.5 size-4 accent-[var(--w-accent)]" />
              <span>
                {t("Uninstall versi sekarang dulu")}
                <span className="block text-xs text-mute">{t("Pakai bila installer menolak downgrade (umum pada MSI). Pengaturan aplikasi biasanya tetap tersimpan.")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="mt-0.5 size-4 accent-[var(--w-accent)]" />
              <span>
                {t("Kunci versi ini")}
                <span className="block text-xs text-mute">{t("Tidak ikut Update semua sampai kuncinya dibuka.")}</span>
              </span>
            </label>
          </div>
        )}
      </div>
      <Footer left={demo && <span className="hidden items-center gap-1.5 text-xs text-mute sm:flex"><LuArchive className="size-3.5" aria-hidden /> {t("Versi aktif ikut diarsipkan")}</span>}>
        <Button variant="ghost" onClick={closeDialogs}>{t("Batal")}</Button>
        <Button
          variant="primary"
          disabled={!chosen}
          icon={<LuRotateCcw className="size-4" aria-hidden />}
          onClick={() => {
            if (!chosen) return;
            rollbackApp(app.id, { version: chosen.version, fromArchive: chosen.source === "archive", uninstallFirst, pin });
            closeDialogs();
          }}
        >
          {t("Kembalikan ke {v}", { v: target ?? "…" })}
        </Button>
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------
function UninstallBody({ app }: { app: App }) {
  const inst = useStore((s) => s.installed[app.id]);
  const ghRec = useStore((s) => s.gh.records[app.id]);
  const [drop, setDrop] = useState(false);
  const [interactive, setInteractive] = useState(false);
  if (!inst) return null;
  return (
    <>
      <Header app={app} title={t("Uninstall {name}?", { name: app.name })} sub={t("Versi {v}", { v: inst.version })} />
      <div className="space-y-4 px-6 py-5 text-sm text-ink-2">
        <p>
          {ghRec?.kind.startsWith("portable")
            ? <>{t("Folder ini akan dihapus beserta isinya, termasuk shortcut di Start Menu. Simpan dulu file milikmu yang ada di folder itu:")} <span className="font-mono text-xs text-ink">{expandPath(inst.path)}</span></>
            : inst.path
            ? <>{t("Aplikasi akan dihapus dari:")} <span className="font-mono text-xs text-ink">{expandPath(inst.path)}</span></>
            : t("winget akan menjalankan uninstaller bawaan aplikasi ini.")}
        </p>
        {!ghRec?.kind.startsWith("portable") && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
            <LuInfo className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />
            {t("Setelah uninstaller selesai, Winsta memeriksa apakah aplikasinya benar-benar hilang, lalu menawarkan menghapus folder, data, dan shortcut yang tertinggal.")}
          </p>
        )}
        {!ghRec && (
          <label className="flex items-start gap-2.5 text-ink">
            <input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} className="mt-0.5 size-4 accent-[var(--w-accent)]" />
            <span>
              {t("Tampilkan jendela uninstaller")}
              <span className="block text-xs text-mute">{t("Pakai bila uninstall diam-diam tidak menghapus aplikasinya. Ikuti langkah di jendela yang muncul.")}</span>
            </span>
          </label>
        )}
        {inst.archive.length > 0 && (
          <label className="flex items-start gap-2.5 text-ink">
            <input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} className="mt-0.5 size-4 accent-[var(--w-accent)]" />
            <span>
              {t("Hapus juga {n} versi lama di arsip", { n: inst.archive.length })}
              <span className="block text-xs text-mute">{t("Biarkan tidak dicentang bila mungkin memasangnya lagi nanti.")}</span>
            </span>
          </label>
        )}
      </div>
      <Footer>
        <Button variant="ghost" onClick={closeDialogs}>{t("Batal")}</Button>
        <Button variant="danger" icon={<LuTrash2 className="size-4" aria-hidden />} onClick={() => { uninstallApp(app.id, drop, interactive); closeDialogs(); }}>
          {t("Uninstall")}
        </Button>
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail aplikasi
// ---------------------------------------------------------------------------
function DetailBody({ app }: { app: App }) {
  const inst = useStore((s) => s.installed[app.id]);
  const rollbackable = useStore((s) => canRollback(s, app.id));
  const versions = useStore((s) => versionsOf(s, app.id));
  useEffect(() => void ensureVersions(app.id), [app.id]);
  const support = locationSupport(app.installer);
  const fromGh = app.source === "github";
  const facts = useMemo(() => [
    [t(fromGh ? "Rilis terbaru" : "Versi terbaru"), versions.list[0] ?? (versions.status === "loading" ? t("memuat…") : versions.status === "done" && fromGh ? t("tidak ada file untuk Windows") : "")],
    [t("Bintang di GitHub"), fromGh ? formatCount(app.stars ?? 0) : ""],
    [t("Ukuran"), app.sizeMB > 0 ? formatSize(app.sizeMB) : ""],
    [t("Lisensi"), app.license],
    [t("Installer"), app.installer === "unknown" ? "" : `${INSTALLER_LABEL[app.installer]} · ${t(support === "yes" ? "lokasi kustom didukung" : support === "maybe" ? "lokasi kustom biasanya didukung" : "lokasi diatur Windows")}`],
  ].filter(([, v]) => v), [app, support, versions, fromGh]);

  return (
    <>
      <div className="px-6 pt-6 pr-12">
        <div className="min-w-0">
          <DialogTitle className="font-display text-2xl font-semibold text-ink">{app.name}</DialogTitle>
          <p className="text-sm text-mute">{[app.publisher, app.downloads && t("{n} unduhan", { n: app.downloads })].filter(Boolean).join(" · ") || app.packageId}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {inst ? <AppAction app={app} size="md" /> : (
              <Button variant="primary" icon={<LuDownload className="size-4" aria-hidden />} onClick={() => openDialog({ install: app.id })}>{t("Install")}</Button>
            )}
            {inst && rollbackable && (
              <Button variant="ghost" icon={<LuRotateCcw className="size-4" aria-hidden />} onClick={() => openDialog({ rollback: app.id })}>{t("Rollback")}</Button>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-5 px-6 py-6">
        {app.description && <p className="text-sm leading-relaxed text-ink-2">{t(app.description)}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-surface-2 p-4 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-mute">{k}</dt>
              <dd className="truncate text-ink">{v}</dd>
            </div>
          ))}
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-mute">{t(fromGh ? "Repositori GitHub" : "ID paket winget")}</dt>
            <dd className="flex items-center gap-2">
              <code className="truncate font-mono text-[13px] text-ink">{app.packageId}</code>
              <button
                type="button"
                aria-label={t("Salin ID paket")}
                onClick={() => {
                  navigator.clipboard?.writeText(app.packageId).then(
                    () => toast({ tone: "success", title: t("ID paket disalin"), body: app.packageId }, 2500),
                    () => {},
                  );
                }}
                className="text-mute hover:text-ink"
              >
                <LuCopy className="size-3.5" />
              </button>
            </dd>
          </div>
        </dl>
        {inst && (
          <p className="text-sm text-ink-2">
            {t("Terpasang")} <span className="font-medium text-ink tabular-nums">{inst.version}</span>
            {inst.path ? <> {t("di")} <span className="font-mono text-xs">{expandPath(inst.path)}</span></> : ` ${t("(lokasi tidak dicatat installer)")}`}
          </p>
        )}
        {(versions.list.length > 0 || versions.status === "loading" || versions.status === "error") && <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-mute uppercase">{t(fromGh ? "Rilis dengan file untuk Windows" : "Versi tersedia di winget")}</p>
          {versions.status === "loading" && <p className="flex items-center gap-1.5 text-xs text-mute"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> {t("Memuat…")}</p>}
          {versions.status === "error" && <p className="text-xs text-mute">{t("Daftar versi tidak bisa diambil.")}</p>}
          <div className="flex flex-wrap gap-1.5">
            {versions.list.slice(0, 20).map((v, i) => (
              <span key={v} className={cx("rounded-md border px-2 py-0.5 font-mono text-xs", i === 0 ? "border-accent/50 text-accent" : "border-line text-ink-2")}>{v}</span>
            ))}
          </div>
        </div>}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {app.homepage && app.homepage !== app.repoUrl && <span className="flex items-center gap-1.5 text-mute"><LuGlobe className="size-3.5" aria-hidden /> {app.homepage}</span>}
          {app.repoUrl && <ExternalLink href={app.repoUrl}>{t("Buka di GitHub")}</ExternalLink>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sisa file setelah uninstall
// ---------------------------------------------------------------------------
const KIND_TEXT: Record<string, string> = {
  install: "Folder aplikasi",
  data: "Data dan pengaturan",
  shortcut: "Shortcut",
};

function LeftoversBody() {
  const c = useStore((s) => s.cleanup);
  const [off, setOff] = useState<string[]>([]);
  if (!c) return null;
  const chosen = c.items.filter((i) => !off.includes(i.path)).map((i) => i.path);
  const busy = c.status === "deleting";
  const toggle = (p: string) => setOff((o) => (o.includes(p) ? o.filter((x) => x !== p) : [...o, p]));

  return (
    <>
      <div className="px-6 pt-6 pr-12">
        <DialogTitle className="font-display text-xl font-semibold text-ink">{t("Bersihkan sisa {name}?", { name: c.name })}</DialogTitle>
        <p className="mt-1 text-[13px] text-mute">
          {t("Uninstaller sudah selesai, tapi meninggalkan {n} folder atau file berikut. Centang yang ingin dihapus permanen.", { n: c.items.length })}
        </p>
      </div>
      <div className="space-y-3 px-6 py-5">
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
          {c.items.map((i) => {
            const fail = c.failed.find((f) => f.path === i.path);
            return (
              <li key={i.path}>
                <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={!off.includes(i.path)}
                    onChange={() => toggle(i.path)}
                    disabled={busy}
                    className="mt-1 size-4 accent-[var(--w-accent)]"
                  />
                  {i.kind === "shortcut" ? <LuFile className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden /> : <LuFolder className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-mute">{t(KIND_TEXT[i.kind] ?? "Folder")}</span>
                    <span className="block font-mono text-xs break-all text-ink">{i.path}</span>
                    {fail && <span className="mt-0.5 block text-xs text-error">{tr(fail.reason)}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="flex items-start gap-2 text-xs text-mute">
          <LuTriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          {t("File yang dihapus tidak masuk Recycle Bin. Data dan pengaturan berisi profil, simpanan, atau konfigurasi aplikasi; biarkan bila ingin memasangnya lagi nanti.")}
        </p>
        {c.failed.length > 0 && (
          <p className="rounded-lg bg-error-soft px-3 py-2 text-[13px] text-error">
            {t("{n} item tidak bisa dihapus. Tutup aplikasinya (cek juga ikon di system tray), lalu coba lagi.", { n: c.failed.length })}
          </p>
        )}
      </div>
      <Footer>
        <Button variant="ghost" onClick={closeDialogs} disabled={busy}>{t("Biarkan")}</Button>
        <Button variant="danger" loading={busy} disabled={busy || !chosen.length} icon={<LuTrash2 className="size-4" aria-hidden />} onClick={() => void deleteLeftovers(chosen)}>
          {t("Hapus {n} item", { n: chosen.length })}
        </Button>
      </Footer>
    </>
  );
}
