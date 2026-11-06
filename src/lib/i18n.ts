// Bahasa antarmuka. Teks Indonesia adalah kuncinya; terjemahan Inggris ada di i18n-en.ts.
// Pemakaian: t("Pindai ulang"), t("{n} aplikasi", { n: 5 }).
// Cek kunci yang belum diterjemahkan: node scripts/check-i18n.mjs
import { EN } from "./i18n-en";

export type Lang = "id" | "en";

let lang: Lang = "id";

export function systemLang(): Lang {
  try {
    return (navigator.language || "").toLowerCase().startsWith("id") ? "id" : "en";
  } catch {
    return "id";
  }
}

export function setLang(l: Lang) {
  lang = l;
  try {
    document.documentElement.lang = l;
  } catch {
    /* abaikan */
  }
}

export function getLang(): Lang {
  return lang;
}

/** Locale untuk tanggal dan angka. */
export function locale(): string {
  return lang === "en" ? "en-US" : "id-ID";
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = lang === "en" ? EN[key] ?? key : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/**
 * Pesan dari Rust/winget (berbahasa Indonesia) ke bahasa aktif. Pesan dengan bagian dinamis
 * dicocokkan lewat pola; sisanya lewat kamus biasa.
 */
const PATTERNS: [RegExp, string][] = [
  [/^winget gagal \(kode (0x[0-9A-F]+)\)\.$/i, "winget failed (code $1)."],
  [/^Installer selesai dengan kode (-?\d+)\.$/, "The installer finished with code $1."],
  [/^Unduhan gagal: (.*)$/s, "Download failed: $1"],
  [/^Folder (.*) sudah berisi file lain\. Pilih folder kosong atau folder baru\.$/s, "The folder $1 already contains other files. Choose an empty or new folder."],
  [/^Folder (.*) tidak bisa dibuat: (.*)$/s, "The folder $1 couldn't be created: $2"],
  [/^File baru tidak bisa dipindahkan ke (.*): (.*)$/s, "The new files couldn't be moved to $1: $2"],
  [/^Folder lama sedang dipakai\. Tutup aplikasinya dulu\. \((.*)\)$/s, "The old folder is in use. Close the app first. ($1)"],
  [/^Folder tidak bisa dihapus\. Tutup aplikasinya dulu\. \((.*)\)$/s, "The folder couldn't be deleted. Close the app first. ($1)"],
  [/^Arsip zip tidak bisa diekstrak: (.*)$/s, "The zip archive couldn't be extracted: $1"],
  [/^Installer tidak bisa dijalankan: (.*)$/s, "The installer couldn't start: $1"],
  [/^Microsoft\.WinGet\.Client: (.*)$/s, "Microsoft.WinGet.Client: $1"],
  [/^Modul tidak bisa dipasang: (.*)$/s, "The module couldn't be installed: $1"],
  [/^Rilis (.*) tidak punya file untuk Windows\.$/, "Release $1 has no files for Windows."],
  [/^Hasil winget export tidak terbaca: (.*)$/s, "The winget export result couldn't be read: $1"],
  [/^PowerShell tidak bisa dijalankan: (.*)$/s, "PowerShell couldn't start: $1"],
  [/^GitHub menjawab (\d+)\.$/, "GitHub answered $1."],
  [/^Batas permintaan GitHub habis\. Coba lagi setelah pukul (.+), atau isi token GitHub di Pengaturan\.$/, "GitHub's request limit is used up. Try again after $1, or add a GitHub token in Settings."],
  // Notifikasi dari store.
  [/^Winsta menemukan (\d+) aplikasi terpasang$/, "Winsta found $1 installed apps"],
  [/^(\d+) di antaranya bisa di-update dan di-rollback lewat Winsta\.$/, "$1 of them can be updated and rolled back with Winsta."],
  [/^Pilihan lokasi diabaikan oleh installer\. (.*)$/s, "The installer ignored the chosen location. $1"],
  [/^(Install|Update|Rollback|Uninstall) (.+) gagal$/s, "$1 $2 failed"],
  [/^(.+) diperbarui (.+) → (.+)$/s, "$1 updated $2 → $3"],
  [/^(.+) dikembalikan ke (.+) \(dari (.+)\) · versi dikunci$/s, "$1 rolled back to $2 (from $3) · version pinned"],
  [/^(.+) dikembalikan ke (.+) \(dari (.+)\)$/s, "$1 rolled back to $2 (from $3)"],
  [/^(.+) dihapus dari (.+) beserta arsipnya$/s, "$1 removed from $2 along with its archive"],
  [/^(.+) dihapus dari (.+)$/s, "$1 removed from $2"],
  [/^(.+) dihapus beserta arsipnya$/s, "$1 removed along with its archive"],
  [/^(.+) dihapus$/s, "$1 removed"],
  [/^(.+) dipasang di (.+)$/s, "$1 installed in $2"],
  [/^(.+) terpasang$/s, "$1 installed"],
  [/^Kembalikan ke (.+)$/s, "Roll back to $1"],
  [/^Kunci (.+) gagal diubah$/s, "Couldn't change the pin for $1"],
  [/^Kunci (.+) dibuka$/s, "$1 unpinned"],
  [/^(.+) dikunci$/s, "$1 pinned"],
  [/^Rilis (.+) tidak punya file untuk Windows\.$/, "Release $1 has no files for Windows."],
  [/^Mengunduh ([\d.,]+ MB) \/ ([\d.,]+ MB)$/, "Downloading $1 / $2"],
  [/^Mengunduh (.+) dari GitHub$/, "Downloading $1 from GitHub"],
];

export function tr(message: string): string {
  if (lang !== "en") return message;
  // Pesan bisa berisi beberapa paragraf: kalimat pertama diterjemahkan, output winget dibiarkan.
  const [head, ...rest] = message.split("\n\n");
  let out = EN[head] ?? head;
  if (out === head) {
    for (const [re, rep] of PATTERNS) {
      if (re.test(head)) {
        out = head.replace(re, rep);
        break;
      }
    }
  }
  return [out, ...rest].join("\n\n");
}
