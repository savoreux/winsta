import { Switch as HSwitch } from "@headlessui/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { cx } from "../lib/format";
import { t } from "../lib/i18n";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-card",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  accent: "bg-accent-soft text-accent hover:bg-accent/20",
  danger: "bg-error text-white hover:opacity-90",
};

export function Button({
  variant = "secondary", size = "md", icon, loading, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Winsta tidak menampilkan ikon aplikasi (tidak ada ikon asli yang bisa diambil); dibiarkan agar pemanggil lama tetap jalan. */
export function AppIcon(_: { glyph: string; hue: number; size?: number; className?: string }) {
  return null;
}

export function AppGlyph({ glyph, hue, size = 40, className }: { glyph: string; hue: number; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("app-icon inline-flex shrink-0 items-center justify-center font-semibold text-white", className)}
      style={{
        ["--hue" as string]: hue,
        width: size,
        height: size,
        borderRadius: size * 0.26,
        fontSize: size * 0.36,
        letterSpacing: "-0.02em",
      }}
    >
      {glyph}
    </span>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "success" | "warning" | "error"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    error: "bg-error-soft text-error",
  };
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] text-mute">
      {children}
    </kbd>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <HSwitch
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="group relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line bg-surface-3 transition-colors data-checked:border-accent data-checked:bg-accent"
    >
      <span className="size-4 translate-x-1 rounded-full bg-ink-2 shadow transition group-data-checked:translate-x-6 group-data-checked:bg-white dark:group-data-checked:bg-bg" />
    </HSwitch>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label, className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode; hint?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
              on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2",
            )}
          >
            {o.icon && <span className={cx("shrink-0", on ? "text-accent" : "text-mute")}>{o.icon}</span>}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{o.label}</span>
              {o.hint && <span className="block truncate text-xs text-mute">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, tone = "accent", className }: { value: number; tone?: "accent" | "error" | "success"; className?: string }) {
  const color = tone === "error" ? "bg-error" : tone === "success" ? "bg-success" : "bg-accent";
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-150", color)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function ArchiveDots({ count, max }: { count: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-2" title={t("{n} dari {max} versi lama tersimpan di arsip", { n: count, max })}>
      <span className="inline-flex gap-1" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cx("size-1.5 rounded-full", i < count ? "bg-accent" : "bg-surface-3")} />
        ))}
      </span>
      <span className="text-xs text-mute tabular-nums">{count}/{max}</span>
    </span>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-mute">{icon}</span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-md text-sm text-mute">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surface-2", className)} />;
}
