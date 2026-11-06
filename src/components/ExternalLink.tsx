import type { ReactNode } from "react";
import { LuExternalLink } from "react-icons/lu";
import { cx } from "../lib/format";
import { isNative } from "../lib/native";
import { system } from "../lib/winget";
import { toast } from "../state/store";

/** Tautan ke situs luar. Di aplikasi Windows dibuka lewat browser bawaan. */
export function ExternalLink({ href, children, className, icon = true }: { href: string; children: ReactNode; className?: string; icon?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (isNative()) {
          e.preventDefault();
          system.openUrl(href).catch(() => toast({ tone: "error", title: "Browser tidak bisa dibuka", body: href }));
        }
      }}
      className={cx("inline-flex items-center gap-1 font-medium text-accent hover:underline", className)}
    >
      {children} {icon && <LuExternalLink className="size-3.5" aria-hidden />}
    </a>
  );
}
