import { useEffect, useState } from "react";
import { LuDownload, LuHistory, LuRefreshCw, LuRotateCcw, LuTrash2, LuX } from "react-icons/lu";
import { Button, Empty, PageHeader } from "../components/ui";
import { cx, dayLabel, timeAgo } from "../lib/format";
import { t, tr } from "../lib/i18n";
import type { LogEntry, TaskKind } from "../lib/types";
import { KIND_LABEL, canRollback, getApp, openDialog, rollbackOptions, setState, useStore } from "../state/store";

const KIND_STYLE: Record<TaskKind, { Icon: typeof LuDownload; cls: string }> = {
  install: { Icon: LuDownload, cls: "bg-success-soft text-success" },
  update: { Icon: LuRefreshCw, cls: "bg-accent-soft text-accent" },
  rollback: { Icon: LuRotateCcw, cls: "bg-warning-soft text-warning" },
  uninstall: { Icon: LuTrash2, cls: "bg-surface-3 text-ink-2" },
};

export function History() {
  const log = useStore((s) => s.log);
  const [kind, setKind] = useState<TaskKind | "all">("all");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!confirm) return;
    const id = window.setTimeout(() => setConfirm(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirm]);

  const q = useStore((s) => s.query.trim().toLowerCase());
  const items = log.filter((l) =>
    (kind === "all" || l.kind === kind) &&
    (!q || l.text.toLowerCase().includes(q) || (getApp(l.appId)?.name ?? "").toLowerCase().includes(q)));
  const groups: { label: string; items: LogEntry[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.time);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t("Riwayat aktivitas")}
        sub={t("Jejak setiap install, update, rollback, dan uninstall, berguna saat melacak kapan sesuatu berubah.")}
        actions={
          log.length > 0 && (
            <Button
              variant={confirm ? "danger" : "ghost"}
              icon={<LuTrash2 className="size-4" aria-hidden />}
              onClick={() => (confirm ? (setState({ log: [] }), setConfirm(false)) : setConfirm(true))}
            >
              {t(confirm ? "Klik lagi untuk menghapus" : "Bersihkan riwayat")}
            </Button>
          )
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "install", "update", "rollback", "uninstall"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cx(
              "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              kind === k ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {t(k === "all" ? "Semua" : KIND_LABEL[k])}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty icon={<LuHistory className="size-5" />} title={t(q ? "Tidak ada aktivitas yang cocok" : "Belum ada aktivitas")} body={t(q ? "Ubah kata pencarian di kotak atas." : "Install, update, rollback, dan uninstall akan tercatat di sini.")} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-xs font-semibold tracking-wider text-mute uppercase">{g.label}</h2>
              <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                {g.items.map((l, i) => <HistoryRow key={l.id} l={l} first={i === 0} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Catatan lama disimpan dalam bahasa Indonesia. Bila ada versi asal/tujuan, kalimatnya disusun ulang
 * agar mengikuti bahasa yang dipilih; selain itu teks aslinya ditampilkan.
 */
function logText(l: LogEntry): string {
  const name = getApp(l.appId)?.name;
  if (!name || !l.ok) return tr(l.text);
  if (l.kind === "update" && l.from && l.to) return t("{name} diperbarui {from} → {to}", { name, from: l.from, to: l.to });
  if (l.kind === "rollback" && l.from && l.to) return t("{name} dikembalikan ke {to} (dari {from})", { name, from: l.from, to: l.to });
  return tr(l.text);
}

function HistoryRow({ l, first }: { l: LogEntry; first: boolean }) {
  const { Icon, cls } = KIND_STYLE[l.kind];
  const canRevert = useStore((s) =>
    l.ok && l.kind === "update" && !!l.from && s.installed[l.appId]?.version === l.to &&
    (s.mode === "demo" ? rollbackOptions(s, l.appId).some((o) => o.version === l.from) : canRollback(s, l.appId)),
  );
  return (
    <li className={cx("flex items-center gap-4 px-4 py-3", !first && "border-t border-line-soft")}>
      <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-full", l.ok ? cls : "bg-error-soft text-error")}>
        {l.ok ? <Icon className="size-4" aria-hidden /> : <LuX className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm", l.ok ? "text-ink" : "text-error")}>{logText(l)}</p>
        <p className="text-xs text-mute">{t(KIND_LABEL[l.kind])} · {timeAgo(l.time)}</p>
      </div>
      {canRevert && (
        <Button size="sm" variant="ghost" icon={<LuRotateCcw className="size-3.5" aria-hidden />} onClick={() => openDialog({ rollback: l.appId })}>
          {t("Kembalikan ke {v}", { v: l.from ?? "" })}
        </Button>
      )}
    </li>
  );
}
