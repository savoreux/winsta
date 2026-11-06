import { useState, type ReactNode } from "react";
import { LuCircleCheck, LuFolderOpen, LuLanguages, LuMonitor, LuMoon, LuShieldCheck, LuSun } from "react-icons/lu";
import { Button, PageHeader, Segmented, Toggle } from "../components/ui";
import { expandPath } from "../lib/format";
import { locale, t, type Lang } from "../lib/i18n";
import { pickFolder } from "../lib/native";
import { useSystemDark } from "../lib/theme";
import type { ThemePref } from "../lib/types";
import { installWingetClient, resetDemo, scanInstalled, setGithubToken, toast, updateSettings, useStore } from "../state/store";
import { ExternalLink } from "../components/ExternalLink";

export function Settings() {
  const s = useStore((st) => st.settings);
  const demo = useStore((st) => st.mode === "demo");
  const wingetVersion = useStore((st) => st.wingetVersion);
  const scanning = useStore((st) => st.scan.status === "loading");
  const engine = useStore((st) => st.engine);
  const rate = useStore((st) => st.gh.rate);
  const [token, setToken] = useState(s.githubToken);
  const systemDark = useSystemDark();
  const [root, setRoot] = useState(s.defaultRoot);
  const dirty = root.trim() !== s.defaultRoot;

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("Pengaturan")} sub={t("Tampilan, bahasa, lokasi install default, dan kebijakan update serta rollback.")} />

      <Section title="Tampilan">
        <Row title="Bahasa" desc="Bahasa antarmuka Winsta. Berlaku langsung tanpa restart." stacked>
          <Segmented<Lang>
            label={t("Bahasa")}
            value={s.lang}
            onChange={(lang) => updateSettings({ lang })}
            className="mt-3"
            options={[
              { value: "id", label: "Bahasa Indonesia", hint: "Indonesian", icon: <LuLanguages className="size-4" /> },
              { value: "en", label: "English", hint: "Bahasa Inggris", icon: <LuLanguages className="size-4" /> },
            ]}
          />
        </Row>
        <Row title="Tema" desc="Ikuti Windows berubah otomatis saat tema Windows diganti, tanpa restart." stacked>
          <Segmented<ThemePref>
            label={t("Tema")}
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            className="mt-3"
            options={[
              { value: "system", label: t("Ikuti Windows"), hint: t(systemDark ? "Saat ini gelap" : "Saat ini terang"), icon: <LuMonitor className="size-4" /> },
              { value: "light", label: t("Terang"), icon: <LuSun className="size-4" /> },
              { value: "dark", label: t("Gelap"), icon: <LuMoon className="size-4" /> },
            ]}
          />
        </Row>
        <Row title="Efek Mica" desc="Latar title bar dan sidebar mengikuti wallpaper di Windows 11. Windows 10 memakai warna solid.">
          <Toggle label={t("Efek Mica")} checked={s.mica} onChange={(mica) => updateSettings({ mica })} />
        </Row>
        <Row title="Tampilkan aplikasi lain terpasang" desc="Aplikasi yang dipasang di luar winget. Disembunyikan agar halaman Terpasang fokus pada aplikasi yang bisa dikelola Winsta.">
          <Toggle label={t("Tampilkan aplikasi lain terpasang")} checked={s.showUnmanaged} onChange={(showUnmanaged) => updateSettings({ showUnmanaged })} />
        </Row>
      </Section>

      <Section title="Instalasi">
        <Row title="Folder instalasi default" desc="Dipakai saat memilih “Lokasi default” di dialog install. Mendukung %LOCALAPPDATA%." stacked>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              aria-label={t("Folder instalasi default")}
              spellCheck={false}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <Button
              icon={<LuFolderOpen className="size-4" aria-hidden />}
              onClick={async () => {
                const p = await pickFolder(expandPath(root));
                if (p) setRoot(p);
              }}
            >
              {t("Pilih…")}
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || !root.trim()}
              onClick={() => {
                updateSettings({ defaultRoot: root.trim() });
                toast({ tone: "success", title: t("Folder default disimpan"), body: expandPath(root.trim()) });
              }}
            >
              {t("Simpan")}
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-mute">
            <LuCircleCheck className="size-3.5 text-success" aria-hidden /> {expandPath(root || s.defaultRoot)}
          </p>
        </Row>
        <Row title="Verifikasi SHA-256" desc="winget selalu mencocokkan hash installer dengan manifest sebelum memasang. Pemeriksaan ini tidak bisa dimatikan dari Winsta.">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
            <LuShieldCheck className="size-3.5" aria-hidden /> {t("Selalu aktif")}
          </span>
        </Row>
      </Section>

      <Section title="Update dan rollback">
        <Row title="Cek update saat Winsta dibuka" desc="Tidak ada proses latar belakang atau ikon system tray. Hasilnya muncul sebagai angka di menu Update.">
          <Toggle label={t("Cek update saat Winsta dibuka")} checked={s.checkOnLaunch} onChange={(checkOnLaunch) => updateSettings({ checkOnLaunch })} />
        </Row>
        <Row
          title={demo ? "Simpan versi lama untuk rollback" : "Versi lama di daftar Rollback"}
          desc={demo ? "Installer versi sebelumnya diarsipkan sebelum update. Lebih banyak versi berarti lebih banyak ruang disk." : "Berapa versi sebelumnya dari repositori winget yang ditawarkan saat rollback."}
          stacked
        >
          <div className="mt-3 flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={5}
              value={s.keepVersions}
              onChange={(e) => updateSettings({ keepVersions: Number(e.target.value) })}
              aria-label={t("Jumlah versi yang disimpan")}
              className="flex-1 accent-[var(--w-accent)]"
            />
            <span className="w-20 text-right text-sm text-ink-2"><span className="text-lg font-semibold text-ink tabular-nums">{s.keepVersions}</span> {t("versi")}</span>
          </div>
        </Row>
        <Row title="Kunci versi setelah rollback" desc="Aplikasi yang di-rollback tidak ikut Update semua sampai kuncinya dibuka.">
          <Toggle label={t("Kunci versi setelah rollback")} checked={s.pinAfterRollback} onChange={(pinAfterRollback) => updateSettings({ pinAfterRollback })} />
        </Row>
      </Section>

      <Section title="GitHub">
        <Row
          title="Token GitHub (opsional)"
          desc="Tanpa token, GitHub membatasi 60 permintaan per jam dan pencarian 10 kali per menit. Token pribadi tanpa izin apa pun menaikkannya ke 5.000 per jam. Token hanya disimpan di PC ini."
          stacked
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              aria-label={t("Token GitHub")}
              autoComplete="off"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <Button
              variant="primary"
              disabled={token.trim() === s.githubToken}
              onClick={() => {
                setGithubToken(token);
                toast({ tone: "success", title: t(token.trim() ? "Token GitHub disimpan" : "Token GitHub dihapus") });
              }}
            >
              {t("Simpan")}
            </Button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
            {rate
              ? <span className="tabular-nums">{t("Sisa {n} dari {limit} permintaan · direset pukul {time}", { n: rate.remaining, limit: rate.limit, time: new Date(rate.reset).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })}</span>
              : <span>{t("Kuota belum diketahui; terlihat setelah permintaan pertama ke GitHub.")}</span>}
            <ExternalLink href="https://github.com/settings/personal-access-tokens/new" className="text-xs">{t("Buat token")}</ExternalLink>
          </p>
        </Row>
      </Section>

      <Section title="Tentang">
        {demo ? (
          <Row title={`Winsta 0.1.0 · ${t("mode demo")}`} desc="Berjalan di browser dengan data contoh. Install, update, dan rollback hanya simulasi; winget tidak dijalankan.">
            <Button variant="ghost" onClick={resetDemo}>{t("Reset data demo")}</Button>
          </Row>
        ) : (
          <>
            <Row title="Winsta 0.1.0" desc={t("Terhubung ke winget {v}. Daftar aplikasi dibaca saat Winsta dibuka.", { v: wingetVersion ?? t("(memeriksa versi…)") })}>
              <Button variant="ghost" loading={scanning} disabled={scanning} onClick={() => void scanInstalled()}>{t("Pindai ulang")}</Button>
            </Row>
            <Row
              title="Pembaca daftar aplikasi"
              desc={engine.kind === "module"
                ? "Memakai modul resmi Microsoft.WinGet.Client: nama dan ID terbaca lengkap."
                : "Membaca output winget. Pasang modul Microsoft.WinGet.Client agar nama dan ID tidak terpotong."}
            >
              {engine.kind === "module"
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">{t("Modul aktif")}</span>
                : <Button variant="primary" loading={engine.installing} disabled={engine.installing} onClick={() => void installWingetClient()}>{t("Pasang modul")}</Button>}
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t(title)}</h2>
      <div className="divide-y divide-line-soft rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({ title, desc, children, stacked }: { title: string; desc?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={stacked ? "p-5" : "flex items-center justify-between gap-6 p-5"}>
      <div className="min-w-0">
        <p className="font-medium text-ink">{t(title)}</p>
        {desc && <p className="mt-0.5 text-sm text-mute">{t(desc)}</p>}
      </div>
      {children}
    </div>
  );
}
