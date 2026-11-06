import { LuCheck, LuDownload, LuRefreshCw } from "react-icons/lu";
import { t } from "../lib/i18n";
import type { App } from "../lib/types";
import { activeTaskFor, availableUpdates, openDialog, updateApps, useStore } from "../state/store";
import { Button } from "./ui";

const RUNNING_VERB = { install: "Memasang", update: "Mengupdate", rollback: "Rollback", uninstall: "Menghapus" } as const;

/** Tombol aksi utama untuk satu aplikasi, sesuai keadaannya. */
export function AppAction({ app, size = "sm" }: { app: App; size?: "sm" | "md" }) {
  const task = useStore((s) => activeTaskFor(s, app.id));
  const inst = useStore((s) => s.installed[app.id]);
  const update = useStore((s) => availableUpdates(s).find((u) => u.app.id === app.id));

  if (task) {
    return (
      <span className="inline-flex h-8 items-center gap-2 px-1 text-[13px] font-medium text-accent tabular-nums">
        {task.status === "queued" ? t("Dalam antrian") : `${t(RUNNING_VERB[task.kind])} ${Math.round(task.progress)}%`}
      </span>
    );
  }
  if (inst && update && !inst.pinned) {
    return (
      <Button size={size} variant="accent" icon={<LuRefreshCw className="size-3.5" aria-hidden />} onClick={(e) => { e.stopPropagation(); updateApps([app.id]); }}>
        {t("Update")}
      </Button>
    );
  }
  if (inst) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-medium text-success">
        <LuCheck className="size-4" aria-hidden /> {t("Terpasang")}
      </span>
    );
  }
  return (
    <Button size={size} variant="primary" icon={<LuDownload className="size-3.5" aria-hidden />} onClick={(e) => { e.stopPropagation(); openDialog({ install: app.id }); }}>
      {t("Install")}
    </Button>
  );
}
