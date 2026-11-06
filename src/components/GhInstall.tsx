import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { useEffect, useState } from "react";
import {
  LuCheck, LuChevronDown, LuCircleAlert, LuCircleCheck, LuDownload, LuFolderOpen, LuInfo, LuLoaderCircle, LuShieldAlert,
  LuShieldCheck, LuStar,
} from "react-icons/lu";
import { ASSET_LABEL, isPortable, type GhAsset, type GhRelease } from "../lib/github";
import { cx, driveOf, folderName, formatCount, formatSize, joinPath } from "../lib/format";
import { locale, t, tr } from "../lib/i18n";
import { pickFolder } from "../lib/native";
import type { App } from "../lib/types";
import { closeDialogs, defaultInstallPath, installGithub, loadReleases, useStore } from "../state/store";
import { Footer, Header, Label, LocationCard } from "./Dialogs";
import { ExternalLink } from "./ExternalLink";
import { Button, Kbd } from "./ui";

const ARCH_LABEL = { x64: "64-bit", x86: "32-bit", arm64: "ARM64", any: "" } as const;

function releaseDate(iso: string) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

/** Dialog install untuk aplikasi dari rilis GitHub. */
export function GhInstallBody({ app }: { app: App }) {
  const rel = useStore((s) => s.gh.releases[app.id]);
  const drives = useStore((s) => s.drives);
  useEffect(() => {
    loadReleases(app.id).catch(() => {});
  }, [app.id]);

  const usable = (rel?.list ?? []).filter((r) => r.assets.length);
  const [tag, setTag] = useState<string>();
  const release = usable.find((r) => r.tag === tag) ?? usable[0];
  const [assetName, setAssetName] = useState<string>();
  const asset = release?.assets.find((a) => a.name === assetName) ?? release?.assets[0];

  const portable = asset ? isPortable(asset.kind) : true;
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [customRoot, setCustomRoot] = useState("D:\\Apps");
  const [subfolder, setSubfolder] = useState(true);
  const custom = subfolder ? joinPath(customRoot || "D:\\Apps", folderName(app.name)) : customRoot;
  // Portable: Winsta selalu butuh folder. Installer: "default" = biarkan installer memilih.
  const path = mode === "custom" ? custom : portable ? defaultInstallPath(app) : "";
  const drive = drives.find((d) => d.id === driveOf(path || "C:"));
  const needMB = asset ? Math.round((asset.size / 1_048_576) * (portable ? 2.2 : 3)) : 0;
  const enough = !drive || drive.freeGB * 1024 > Math.max(needMB, 50);
  const canInstall = !!release && !!asset && enough && (mode === "default" || customRoot.trim().length > 2);

  const submit = () => {
    if (!canInstall || !release || !asset) return;
    installGithub(app.id, release, asset, path);
    closeDialogs();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const loading = !rel || (rel.status === "loading" && !usable.length);
  const sub = (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="font-mono">{app.packageId}</span>
      <span className="inline-flex items-center gap-1"><LuStar className="size-3" aria-hidden /> {formatCount(app.stars ?? 0)}</span>
      <span>{t("dari GitHub")}</span>
    </span>
  );

  return (
    <>
      <Header app={app} title={t("Install {name}", { name: app.name })} sub={sub} />
      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            <LuLoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> {t("Membaca rilis dari GitHub…")}
          </p>
        ) : rel?.status === "error" && !usable.length ? (
          <div className="rounded-xl bg-warning-soft p-4 text-sm text-ink">
            <p className="flex items-start gap-2"><LuCircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {tr(rel.error ?? "")}</p>
            <Button size="sm" className="mt-3" onClick={() => void loadReleases(app.id, true).catch(() => {})}>{t("Coba lagi")}</Button>
          </div>
        ) : !usable.length ? (
          <div className="space-y-3 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            <p>{t("Rilis di repositori ini tidak punya file untuk Windows, jadi Winsta tidak bisa memasangnya langsung.")}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {app.homepage && app.homepage !== app.repoUrl && <ExternalLink href={app.homepage}>{t("Buka situs resmi")}</ExternalLink>}
              {app.repoUrl && <ExternalLink href={`${app.repoUrl}/releases`}>{t("Lihat halaman rilis")}</ExternalLink>}
            </div>
          </div>
        ) : release && asset && (
          <>
            <div>
              <Label>{t("Versi")}</Label>
              <ReleaseSelect releases={usable} value={release} onChange={(r) => { setTag(r.tag); setAssetName(undefined); }} />
              {release !== usable[0] && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-mute">
                  <LuInfo className="size-3.5" aria-hidden /> {t("Versi lama akan dikunci agar tidak langsung ikut Update semua.")}
                </p>
              )}
            </div>

            <div>
              <Label>{t("File")}</Label>
              <div className="space-y-2" role="radiogroup" aria-label={t("File rilis")}>
                {release.assets.map((a, i) => (
                  <AssetOption key={a.name} asset={a} best={i === 0} checked={a.name === asset.name} onSelect={() => setAssetName(a.name)} />
                ))}
              </div>
              <p className={cx("mt-2.5 flex items-start gap-1.5 text-xs", asset.digest ? "text-success" : "text-mute")}>
                {asset.digest
                  ? <><LuShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden /> {t("GitHub mencatat hash SHA-256 file ini. Winsta mencocokkannya setelah mengunduh.")}</>
                  : <><LuShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {t("GitHub tidak mencatat hash untuk file ini (umum pada rilis lama), jadi file tidak bisa diverifikasi.")}</>}
              </p>
            </div>

            <div>
              <Label>{t("Lokasi instalasi")}</Label>
              <p className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] text-ink", portable ? "bg-success-soft" : "bg-warning-soft")}>
                {portable
                  ? <><LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t("Aplikasi portable: Winsta menaruh file-nya sendiri, jadi lokasi yang dipilih pasti dipakai.")}</>
                  : asset.kind === "msi"
                    ? <><LuInfo className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {t("Installer MSI: folder tujuan dikirim ke installer. Sebagian installer tetap memakai lokasinya sendiri.")}</>
                    : <><LuInfo className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {t("Installer .exe: bila jenisnya Inno Setup atau NSIS, folder dipakai dan pemasangan berjalan tanpa jendela. Installer lain menampilkan jendelanya sendiri.")}</>}
              </p>
              <div className="mt-3 space-y-2" role="radiogroup" aria-label={t("Lokasi instalasi")}>
                <LocationCard
                  checked={mode === "default"}
                  onSelect={() => setMode("default")}
                  title={t(portable ? "Lokasi default Winsta" : "Lokasi bawaan installer")}
                  desc={t(portable ? "Tanpa izin admin · mudah dikelola dan di-rollback" : "Installer memilih foldernya sendiri")}
                >
                  {portable && <p className="mt-2 truncate font-mono text-xs text-ink-2">{defaultInstallPath(app)}</p>}
                </LocationCard>
                <LocationCard checked={mode === "custom"} onSelect={() => setMode("custom")} title={t("Folder pilihan sendiri")} desc={t("Misalnya drive D: untuk menghemat SSD sistem")}>
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
                      <p className="truncate font-mono text-xs text-ink-2">{t("Dipasang ke:")} {custom}</p>
                    </div>
                  )}
                </LocationCard>
              </div>
              <p className={cx("mt-2.5 flex items-center gap-1.5 text-xs", !drive ? "text-mute" : enough ? "text-success" : "text-error")}>
                {enough ? <LuCircleCheck className="size-3.5" aria-hidden /> : <LuCircleAlert className="size-3.5" aria-hidden />}
                {drive
                  ? <>{t("{drive}: {gb} GB tersisa", { drive: t(drive.label), gb: drive.freeGB.toLocaleString(locale(), { maximumFractionDigits: 1 }) })}{needMB > 0 && t(", butuh ±{size}", { size: formatSize(needMB) })}{!enough && t(" · pilih drive lain")}</>
                  : t("Ruang disk akan diperiksa saat memasang.")}
              </p>
            </div>
          </>
        )}
      </div>
      <Footer left={<span className="hidden items-center gap-1.5 text-xs text-mute sm:flex"><Kbd>Ctrl</Kbd><Kbd>↵</Kbd> {t("install")}</span>}>
        <Button variant="ghost" onClick={closeDialogs}>{t("Batal")}</Button>
        <Button variant="primary" disabled={!canInstall} onClick={submit} icon={<LuDownload className="size-4" aria-hidden />}>
          {t("Install {v}", { v: release?.version ?? "" })}
        </Button>
      </Footer>
    </>
  );
}

function AssetOption({ asset, best, checked, onSelect }: { asset: GhAsset; best: boolean; checked: boolean; onSelect: () => void }) {
  const arch = ARCH_LABEL[asset.arch];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
        checked ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
      )}
    >
      <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-accent" : "border-line")}>
        {checked && <span className="size-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-ink">
          {t(ASSET_LABEL[asset.kind])}
          {arch && <span className="text-xs font-normal text-mute">{arch}</span>}
          {best && <span className="rounded bg-surface-3 px-1.5 py-px text-[10px] font-semibold tracking-wide text-ink-2 uppercase">{t("Disarankan")}</span>}
        </span>
        <span className="block truncate font-mono text-xs text-mute">{asset.name}</span>
      </span>
      <span className="shrink-0 text-xs text-mute tabular-nums">{formatSize(asset.size / 1_048_576)}</span>
    </button>
  );
}

function ReleaseSelect({ releases, value, onChange }: { releases: GhRelease[]; value: GhRelease; onChange: (r: GhRelease) => void }) {
  const label = (r: GhRelease, i: number) => `${r.version}${i === 0 ? ` · ${t("terbaru")}` : ""}`;
  return (
    <Listbox value={value} onChange={onChange} by="tag">
      <ListboxButton className="flex h-10 w-full items-center justify-between rounded-lg border border-line bg-bg px-3 text-left text-sm text-ink data-open:border-accent">
        <span className="tabular-nums">{label(value, releases.indexOf(value))} <span className="text-mute">· {releaseDate(value.publishedAt)}</span></span>
        <LuChevronDown className="size-4 text-mute" aria-hidden />
      </ListboxButton>
      <ListboxOptions
        anchor={{ to: "bottom start", gap: 4 }}
        transition
        className="z-[60] max-h-72 w-(--button-width) overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop transition duration-100 focus:outline-none data-closed:opacity-0"
      >
        {releases.map((r, i) => (
          <ListboxOption key={r.tag} value={r} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-ink tabular-nums data-focus:bg-surface-2">
            <span>{label(r, i)} <span className="text-mute">· {releaseDate(r.publishedAt)}</span></span>
            {r.tag === value.tag && <LuCheck className="size-4 text-accent" aria-hidden />}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
