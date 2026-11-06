import { useEffect, useMemo, type ReactNode } from "react";
import {
  LuArchiveRestore, LuArrowRight, LuFolderOpen, LuGithub, LuLoaderCircle, LuPackage, LuRefreshCw, LuShieldCheck,
  LuStar, LuTriangleAlert,
} from "react-icons/lu";
import { AppAction } from "../components/AppAction";
import { ExternalLink } from "../components/ExternalLink";
import { Button } from "../components/ui";
import { CATALOG, CATEGORIES, SHORT_ID } from "../data/catalog";
import { cx, formatCount, formatSize } from "../lib/format";
import { t } from "../lib/i18n";
import type { App } from "../lib/types";
import {
  checkUpdates, getApp, go, openDialog, searchGithub, searchWinget, setState, updateApps, updatesToRun, useStore,
} from "../state/store";

/** Hasil pencarian dari dua sumber sekaligus: repositori winget dan GitHub. */
function SearchResults({ query }: { query: string }) {
  const mode = useStore((s) => s.mode);
  const search = useStore((s) => s.search);
  const ghSearch = useStore((s) => s.gh.search);

  // winget: mode native mencari langsung di repositori; demo memakai katalog contoh.
  useEffect(() => {
    if (mode !== "native") return;
    const id = window.setTimeout(() => void searchWinget(query), 350);
    return () => window.clearTimeout(id);
  }, [query, mode]);
  // GitHub: jeda lebih lama karena pencarian dibatasi 10 kali per menit tanpa token.
  useEffect(() => {
    const id = window.setTimeout(() => void searchGithub(query), 650);
    return () => window.clearTimeout(id);
  }, [query]);

  const demoResults = useMemo(
    () => CATALOG.filter((a) => [a.name, a.publisher, a.packageId, a.tagline].some((f) => f.toLowerCase().includes(query))),
    [query],
  );
  const winget = mode === "native" ? search.ids.map((id) => getApp(id)).filter((a): a is App => !!a) : demoResults;
  const wingetBusy = mode === "native" && (search.status === "loading" || search.query !== query);
  const repos = ghSearch.ids.map((id) => getApp(id)).filter((a): a is App => !!a);
  const ghBusy = ghSearch.status === "loading" || ghSearch.query !== query;

  return (
    <div className="space-y-10">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t("Hasil untuk “{q}”", { q: query })}</h1>

      <ResultSection
        icon={<LuPackage className="size-4" aria-hidden />}
        title="winget"
        busy={wingetBusy}
        status={wingetBusy ? t("Mencari di repositori winget…")
          : search.status === "error" && mode === "native" ? t("Pencarian winget gagal. Periksa koneksi internet, lalu ketik ulang.")
          : winget.length ? t("{n} aplikasi · terverifikasi, bisa pilih lokasi, update, dan rollback", { n: winget.length })
          : t("Tidak ada di repositori winget.")}
      >
        {winget.length > 0 && <Grid apps={winget} />}
      </ResultSection>

      <ResultSection
        icon={<LuGithub className="size-4" aria-hidden />}
        title="GitHub"
        busy={ghBusy}
        status={ghBusy ? t("Mencari di GitHub…")
          : ghSearch.status === "error" ? ghSearch.error ?? t("Pencarian GitHub gagal.")
          : ghSearch.status === "idle" ? t("Ketik minimal 3 huruf, atau tempel alamat repo seperti github.com/pemilik/aplikasi.")
          : repos.length ? t("{n} repositori · file rilis untuk Windows dipilih otomatis saat install", { n: repos.length })
          : t("Tidak ada repositori yang cocok.")}
        tone={ghSearch.status === "error" ? "warning" : undefined}
      >
        {repos.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {repos.map((a) => <RepoCard key={a.id} app={a} />)}
          </div>
        )}
      </ResultSection>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-dashed border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{t("Tidak menemukan aplikasinya?")}</p>
          <p className="text-sm text-mute">
            {t("Tempel alamat repo GitHub-nya langsung di kotak pencarian, misalnya github.com/pemilik/aplikasi.")}
          </p>
        </div>
        <ExternalLink href={`https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`} className="text-sm">
          {t("Cari di situs GitHub")}
        </ExternalLink>
      </div>
    </div>
  );
}

function ResultSection({ icon, title, busy, status, tone, children }: {
  icon: ReactNode; title: string; busy: boolean; status: string; tone?: "warning"; children?: ReactNode;
}) {
  return (
    <section aria-busy={busy}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-md bg-surface-2 text-ink-2">{icon}</span>
          {title}
        </h2>
        <p className={cx("flex items-center gap-1.5 text-sm", tone === "warning" ? "text-warning" : "text-mute")}>
          {busy && <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden />}
          {status}
        </p>
      </div>
      {children}
    </section>
  );
}

/** Kartu ringkas: nama, sumber, deskripsi maksimal dua baris. */
function Card({ app, meta, children }: { app: App; meta: ReactNode; children?: ReactNode }) {
  const desc = app.tagline ? t(app.tagline) : "";
  return (
    <article className="flex flex-col rounded-xl border border-line bg-surface transition-colors hover:border-ink-2/30">
      <button
        type="button"
        onClick={() => openDialog({ detail: app.id })}
        className="flex min-w-0 flex-1 flex-col gap-1 px-4 pt-3.5 pb-3 text-left"
        aria-label={t("Detail {name}", { name: app.name })}
      >
        <span className="truncate font-semibold text-ink">{app.name}</span>
        <span className="truncate font-mono text-xs text-mute">{app.source === "github" ? app.packageId : app.publisher || app.packageId}</span>
        {desc && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2" title={desc}>{desc}</p>}
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-xs text-mute">{meta}</span>
        {children}
      </div>
    </article>
  );
}

function RepoCard({ app }: { app: App }) {
  return (
    <Card
      app={app}
      meta={<>
        <span className="rounded border border-line px-1.5 py-px font-mono text-[11px]">github</span>
        <span className="flex items-center gap-1 tabular-nums"><LuStar className="size-3.5" aria-hidden /> {formatCount(app.stars ?? 0)}</span>
      </>}
    >
      <AppAction app={app} />
    </Card>
  );
}

function AppCard({ app }: { app: App }) {
  return (
    <Card
      app={app}
      meta={<>
        <span className="rounded border border-line px-1.5 py-px font-mono text-[11px]">winget</span>
        {(app.versions[0] || app.sizeMB > 0) && (
          <span className="truncate tabular-nums">
            {[app.versions[0] && `v${app.versions[0]}`, app.sizeMB > 0 && formatSize(app.sizeMB)].filter(Boolean).join(" · ")}
          </span>
        )}
      </>}
    >
      <AppAction app={app} />
    </Card>
  );
}

function Grid({ apps }: { apps: App[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {apps.map((a) => <AppCard key={a.id} app={a} />)}
    </div>
  );
}

export function Discover() {
  const category = useStore((s) => s.category);
  const query = useStore((s) => s.query.trim().toLowerCase());
  const catalog = useStore((s) => (s.mode === "native" ? CATALOG.map((a) => s.apps[a.id] ?? a) : CATALOG));

  if (query) return <SearchResults query={query} />;

  const apps = category === "all" ? catalog : catalog.filter((a) => a.category === category);
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label;

  return (
    <div className="space-y-8">
      <UpdateBanner />
      {category === "all" && <Spotlight />}
      <section>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={t("Kategori")}>
          {[{ id: "all", label: "Semua" }, ...CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => setState({ category: c.id })}
              className={cx(
                "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                category === c.id ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-2 hover:text-ink",
              )}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{catLabel ? t(catLabel) : t("Populer di Winsta")}</h2>
          <span className="text-sm text-mute">{t("{n} aplikasi", { n: apps.length })}</span>
        </div>
        <Grid apps={apps} />
      </section>
    </div>
  );
}

function UpdateBanner() {
  const status = useStore((s) => s.check.status);
  const updates = useStore(updatesToRun);
  const sizeMB = updates.reduce((n, u) => n + u.app.sizeMB, 0);

  if (status === "checking") {
    return (
      <div className="flex h-[76px] items-center gap-3 rounded-2xl border border-line bg-surface px-5 text-sm text-ink-2">
        <LuLoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> {t("Memeriksa update aplikasi terpasang…")}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex min-h-[76px] flex-wrap items-center gap-4 rounded-2xl border border-warning/40 bg-warning-soft px-5 py-3">
        <LuTriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{t("Cek update gagal")}</p>
          <p className="text-sm text-ink-2">{t("winget tidak bisa menghubungi repositori. Periksa koneksi internet, lalu coba lagi.")}</p>
        </div>
        <Button onClick={checkUpdates} icon={<LuRefreshCw className="size-4" aria-hidden />}>{t("Coba lagi")}</Button>
      </div>
    );
  }
  if (!updates.length) return null;
  const names = updates.slice(0, 3).map((u) => u.app.name).join(", ") + (updates.length > 3 ? ", …" : "");
  return (
    <div className="flex min-h-[76px] flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3 shadow-card">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t("{n} aplikasi punya versi baru", { n: updates.length })}</p>
        <p className="truncate text-sm text-ink-2" title={names}>{names}</p>
      </div>
      <Button variant="ghost" onClick={() => go("updates")}>
        {t("Lihat detail")} <LuArrowRight className="size-4" aria-hidden />
      </Button>
      <Button variant="primary" icon={<LuRefreshCw className="size-4" aria-hidden />} onClick={() => updateApps(updates.map((u) => u.app.id))}>
        {t("Update semua")}{sizeMB > 0 ? ` · ${formatSize(sizeMB)}` : ""}
      </Button>
    </div>
  );
}

function Spotlight() {
  const featured = useStore((s) => s.apps[SHORT_ID.blender]) ?? CATALOG[0];
  const chips: [typeof LuFolderOpen, string][] = [
    [LuFolderOpen, "Pilih lokasi install"],
    [LuArchiveRestore, "Rollback hingga 5 versi"],
    [LuShieldCheck, "Hash installer selalu dicek"],
  ];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="hero-stripes pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight text-ink">
            {t("Install aplikasi Windows tanpa mengetik perintah.")}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-2">
            {t("Pasang dari winget atau GitHub ke folder pilihanmu, update sekaligus, dan kembalikan ke versi lama kapan saja.")}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-[13px] text-ink-2">
            {chips.map(([Icon, label]) => (
              <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1">
                <Icon className="size-3.5 text-accent" aria-hidden /> {t(label)}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => openDialog({ detail: featured.id })}
          className="flex w-full flex-col rounded-xl border border-line bg-surface/90 p-4 text-left backdrop-blur transition-colors hover:border-accent lg:w-[340px]"
        >
          <span className="block text-xs text-mute">{t("Aplikasi pilihan")} · {featured.publisher}</span>
          <span className="block font-semibold text-ink">{featured.name} {featured.versions[0] ?? ""}</span>
          <span className="block truncate text-sm text-ink-2">{t(featured.tagline)}</span>
        </button>
      </div>
    </section>
  );
}
