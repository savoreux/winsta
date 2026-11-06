import { LuCircleCheck, LuLock, LuLockOpen, LuRefreshCw, LuSearch, LuTriangleAlert } from "react-icons/lu";
import { Button, Empty, PageHeader, Progress, Skeleton } from "../components/ui";
import { cx, formatSize, timeAgo } from "../lib/format";
import { t, tr } from "../lib/i18n";
import {
  activeTaskFor, checkUpdates, pinnedUpdates, setPinned, setState, updateApps, updatesToRun, useStore,
  type UpdateInfo,
} from "../state/store";

export function Updates() {
  const check = useStore((s) => s.check);
  const allUpdates = useStore(updatesToRun);
  const allPinned = useStore(pinnedUpdates);
  // Kotak pencarian di bilah atas menyaring daftar update juga.
  const q = useStore((s) => s.query.trim().toLowerCase());
  const match = (u: UpdateInfo) => !q || u.app.name.toLowerCase().includes(q) || u.app.packageId.toLowerCase().includes(q);
  const updates = q ? allUpdates.filter(match) : allUpdates;
  const pinned = q ? allPinned.filter(match) : allPinned;
  const selected = useStore((s) => s.selectedUpdates);
  const keep = useStore((s) => s.settings.keepVersions);
  const mode = useStore((s) => s.mode);
  const checking = check.status === "checking";

  const sizeMB = updates.reduce((n, u) => n + u.app.sizeMB, 0);
  const sel = selected.filter((id) => updates.some((u) => u.app.id === id));
  const allSelected = updates.length > 0 && sel.length === updates.length;

  const sub = checking
    ? t("Memeriksa repositori winget…")
    : check.status === "error"
      ? t("Cek terakhir gagal")
      : check.lastChecked
        ? `${t("Terakhir dicek {when}", { when: timeAgo(check.lastChecked) })} · ${t(mode === "demo" ? "versi lama diarsipkan otomatis sebelum update" : "versi lama tetap bisa dipasang lagi lewat Rollback")}`
        : t("Belum dicek sejak Winsta dibuka");

  return (
    <div>
      <PageHeader
        title={t("Update")}
        sub={sub}
        actions={
          <>
            <Button onClick={checkUpdates} loading={checking} icon={<LuRefreshCw className="size-4" aria-hidden />} disabled={checking}>
              {t("Cek sekarang")}
            </Button>
            {sel.length > 0 && !allSelected && (
              <Button variant="secondary" onClick={() => updateApps(sel)}>{t("Update terpilih ({n})", { n: sel.length })}</Button>
            )}
            <Button variant="primary" disabled={!updates.length} onClick={() => updateApps(updates.map((u) => u.app.id))}>
              {t("Update semua ({n})", { n: updates.length })}{sizeMB > 0 ? ` · ${formatSize(sizeMB)}` : ""}
            </Button>
          </>
        }
      />

      {checking ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-72" /></div>
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>
      ) : check.status === "error" ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-warning/40 bg-warning-soft p-5">
          <LuTriangleAlert className="size-6 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{t("winget tidak bisa menghubungi repositori")}</p>
            <p className="text-sm text-ink-2">{t("Periksa koneksi internet atau proxy, lalu cek lagi.")}</p>
            {check.error && <p className="mt-1 line-clamp-2 font-mono text-xs text-mute">{tr(check.error).split("\n")[0]}</p>}
          </div>
          <Button onClick={checkUpdates} icon={<LuRefreshCw className="size-4" aria-hidden />}>{t("Coba lagi")}</Button>
        </div>
      ) : check.status === "idle" ? (
        <Empty
          icon={<LuSearch className="size-5" />}
          title={t("Update belum dicek")}
          body={t("Cek otomatis saat dibuka sedang dimatikan di Pengaturan.")}
          action={<Button variant="primary" onClick={checkUpdates}>{t("Cek sekarang")}</Button>}
        />
      ) : updates.length === 0 && q && allUpdates.length > 0 ? (
        <Empty icon={<LuSearch className="size-5" />} title={t("Tidak ada update yang cocok dengan “{q}”", { q })} body={t("Ubah kata pencarian di kotak atas.")} />
      ) : updates.length === 0 ? (
        <Empty icon={<LuCircleCheck className="size-5" />} title={t("Semua aplikasi sudah versi terbaru")} body={t("Winsta akan memeriksa lagi saat aplikasi dibuka berikutnya.")} />
      ) : (
        <>
          <label className="mb-2 flex w-fit cursor-pointer items-center gap-2.5 px-1 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = sel.length > 0 && !allSelected; }}
              onChange={(e) => setState({ selectedUpdates: e.target.checked ? updates.map((u) => u.app.id) : [] })}
              className="size-4 accent-[var(--w-accent)]"
            />
            {t("Pilih semua")}
          </label>
          <ul className="space-y-2">
            {updates.map((u) => (
              <UpdateRow key={u.app.id} u={u} keep={mode === "demo" ? keep : 0} checked={sel.includes(u.app.id)} />
            ))}
          </ul>
        </>
      )}

      {pinned.length > 0 && !checking && (
        <section className="mt-10">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink"><LuLock className="size-4 text-mute" aria-hidden /> {t("Dikunci")}</h2>
          <p className="mb-3 text-sm text-mute">{t("Tidak ikut Update semua. Buka kuncinya bila ingin memperbarui.")}</p>
          <ul className="space-y-2">
            {pinned.map((u) => (
              <li key={u.app.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line-soft bg-surface/60 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{u.app.name}</p>
                  <p className="text-xs text-mute tabular-nums">{t("Terkunci di {v} · {latest} tersedia", { v: u.inst.version, latest: u.latest })}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<LuLockOpen className="size-3.5" aria-hidden />} onClick={() => setPinned(u.app.id, false)}>
                  {t("Buka kunci")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function UpdateRow({ u, keep, checked }: { u: UpdateInfo; keep: number; checked: boolean }) {
  const task = useStore((s) => activeTaskFor(s, u.app.id));
  const toggle = () =>
    setState((s) => ({
      selectedUpdates: checked ? s.selectedUpdates.filter((id) => id !== u.app.id) : [...s.selectedUpdates, u.app.id],
    }));
  const archiveAfter = Math.min(keep, u.inst.archive.length + 1);

  return (
    <li className={cx("flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4 transition-colors", checked ? "border-accent/60" : "border-line")}>
      <input type="checkbox" checked={checked} onChange={toggle} aria-label={t("Pilih {name}", { name: u.app.name })} disabled={!!task} className="size-4 accent-[var(--w-accent)]" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{u.app.name}</p>
        <p className="text-[13px] text-ink-2 tabular-nums">
          {u.inst.version} <span className="text-mute">→</span> <span className="font-medium text-accent">{u.latest}</span>
          {u.app.sizeMB > 0 && <span className="text-mute"> · {formatSize(u.app.sizeMB)}</span>}
          {keep > 0 && <span className="text-mute"> · {t("arsip setelah update {a}/{k}", { a: archiveAfter, k: keep })}</span>}
        </p>
        {task?.status === "running" && (
          <div className="mt-2 max-w-sm">
            <Progress value={task.progress} />
            <p className="mt-1 text-xs text-ink-2">{tr(task.phase)}… {Math.round(task.progress)}%</p>
          </div>
        )}
      </div>
      {task ? (
        <span className="text-[13px] font-medium text-accent">{t(task.status === "queued" ? "Dalam antrian" : "Sedang berjalan")}</span>
      ) : (
        <Button size="sm" variant="accent" icon={<LuRefreshCw className="size-3.5" aria-hidden />} onClick={() => updateApps([u.app.id])}>
          {t("Update ke {v}", { v: u.latest })}
        </Button>
      )}
    </li>
  );
}
