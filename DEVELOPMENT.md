# Winsta — Panduan pengembangan

Catatan teknis untuk membangun, mengubah, dan menguji Winsta. Panduan untuk pengguna ada di [README.md](README.md),
dan cara merilis ada di [RELEASE.md](RELEASE.md).

## Menjalankan tanpa Node.js

**Cukup melihat tampilannya:** dobel-klik `dist/index.html`, maka halaman terbuka di browser (mode demo).
Tambahkan `?offline` di akhir alamatnya untuk mencoba keadaan "cek update gagal".

**Sebagai aplikasi Windows:** tampilan sudah dibangun di folder `dist`, jadi yang dibutuhkan
hanya Rust dan Visual Studio Build Tools (WebView2 sudah ada di Windows 10/11).

1. Pasang sekali lewat PowerShell, lalu tutup dan buka lagi PowerShell-nya:

   ```powershell
   winget install --id Rustlang.Rustup -e
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

2. Dobel-klik **`jalankan.bat`**. Pertama kali, skrip ini memasang Tauri CLI
   (`cargo install tauri-cli`) dan mengompilasi aplikasi, sekitar 5–10 menit. Setelah itu
   jendela Winsta terbuka dengan efek Mica dan title bar sendiri.
3. Dobel-klik **`buat-installer.bat`** untuk membuat installer `.msi`. Hasilnya ada di
   `src-tauri\target\release\bundle\msi`. Installer ini menampilkan halaman pilihan folder, jadi
   Winsta bisa dipasang di drive mana saja. Cara merilisnya di GitHub ada di [RELEASE.md](RELEASE.md).

Tanpa Node.js, kode UI di `src/` tidak bisa dibangun ulang. Folder `dist` adalah hasil build
terakhir, jadi perubahan tampilan perlu dibangun ulang dengan Node.js.

## Menjalankan dengan Node.js (untuk mengubah tampilan)

Butuh Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173 di browser, reload otomatis saat kode diubah
npm run tauri:dev    # jendela Windows, memakai Vite (src-tauri/tauri.vite.conf.json)
npm run tauri:build  # installer, membangun ulang folder dist lebih dulu
```

## Fitur

| Fitur | Keterangan |
| --- | --- |
| Bahasa | Indonesia atau English, dipilih di Pengaturan > Tampilan. Default mengikuti bahasa Windows. Teks Inggris ada di `src/lib/i18n-en.ts`; `node scripts/check-i18n.mjs` menunjukkan teks yang belum diterjemahkan. |
| Pencarian | Satu kotak di bagian atas. Di Jelajahi mencari di winget dan GitHub; di Terpasang, Update, dan Riwayat menyaring daftar di halaman itu. |
| Uninstall bersih | Setelah uninstaller selesai, Winsta memindai ulang. Bila aplikasinya masih terdeteksi, Winsta menawarkan uninstall dengan jendela installer. Bila sudah hilang, Winsta mencari folder aplikasi, data di AppData/ProgramData, dan shortcut yang tertinggal, lalu menghapus yang dicentang. Folder sistem dan folder bersama tidak pernah disentuh. |
| Tema | Ikuti Windows (default), Terang, Gelap. Pilihan ada di title bar dan di Pengaturan. Mode Ikuti Windows berubah langsung saat tema Windows diganti, dan tema diterapkan sebelum halaman digambar agar tidak berkedip. |
| Cek update saat dibuka | Tanpa system tray dan tanpa timer latar belakang. Badge Update menampilkan spinner saat memeriksa, angka bila ada update, dan "!" bila gagal. |
| Lokasi install | Lokasi default atau folder pilihan sendiri, dengan subfolder otomatis dan pratinjau path akhir. Dukungan lokasi kustom ditampilkan per jenis installer (MSI/Portable didukung, EXE tidak dijamin, MSIX tidak berlaku), ditambah cek ruang disk. |
| Update | Daftar update dengan centang, Update terpilih, Update semua, dan bagian aplikasi yang dikunci. Notifikasi sukses punya tombol "Kembalikan ke versi lama". |
| Rollback | Timeline hingga 5 versi lama, dari arsip lokal (dengan SHA-256) atau dari repositori winget. Ada opsi "Uninstall dulu" dan "Kunci versi". Demo: rollback 7-Zip (MSI) tanpa uninstall akan gagal seperti aslinya, lalu bisa dicoba ulang dengan satu klik. |
| Antrian | Semua tugas berjalan satu per satu, dengan fase, progres, batalkan, dan coba lagi. |
| Riwayat | Dikelompokkan per hari dan bisa difilter per jenis, dengan pintasan rollback dari entri update. |
| Keyboard | `Ctrl+K` cari, `Ctrl+1`–`Ctrl+5` pindah halaman, `Ctrl+Enter` install di dialog, `Esc` tutup. |

## Struktur

```
src/
  App.tsx                 tata letak utama + pintasan keyboard
  index.css               token warna terang/gelap (dari prototipe Winsta), Mica
  components/
    Shell.tsx             title bar, menu tema, sidebar, pencarian, antrian, notifikasi
    Dialogs.tsx           dialog Install, Rollback, Uninstall, sisa file, Detail
    AppAction.tsx         tombol Install / Update / Terpasang sesuai keadaan
    ui.tsx                tombol, badge, toggle, segmented, progress, dll.
  pages/                  Jelajahi, Terpasang, Update, Riwayat, Pengaturan
  state/store.ts          state, antrian (winget asli atau simulasi), pindai, cek update
  lib/
    theme.ts              tema 3 mode, ikut perubahan tema Windows
    native.ts             jembatan ke Tauri (window, tema, dialog folder)
    winget.ts             klien bertipe untuk perintah Rust
    github.ts             API GitHub: cari repo, rilis, pemilihan file Windows, ETag
    i18n.ts, i18n-en.ts   bahasa Indonesia/English
  data/                   data contoh: katalog 26 aplikasi, aplikasi terpasang, riwayat
src-tauri/
  src/winget.rs           pemanggil winget CLI, parser tabel, progres langsung (std saja, ada unit test)
  src/system.rs           drive dan lokasi install dari registry (std saja, ada unit test)
  src/github.rs           unduh, SHA-256, deteksi MSI/Inno/NSIS, pasang portable (std saja, ada unit test)
  src/cleanup.rs          cari dan hapus sisa folder/shortcut setelah uninstall, dengan daftar folder terlindung
  src/lib.rs              perintah Tauri: list, upgrades, search, versions, install,
                          upgrade, uninstall, download (arsip), pin, open_path, system_drives,
                          install_locations, local_app_data
  tauri.conf.json         jendela tanpa bingkai, transparan, efek Mica
  capabilities/           izin jendela dan dialog
dist/index.html          tampilan siap pakai (satu file), dipakai Tauri tanpa Node.js
jalankan.bat             buka Winsta sebagai aplikasi Windows (butuh Rust saja)
buat-installer.bat       buat installer .msi
.github/workflows/release.yml  build .msi otomatis saat tag v* di-push (lihat RELEASE.md)
scripts/build-standalone.mjs   bangun ulang dist/index.html tanpa Vite
```


## Catatan mode Windows

- **Pembaca daftar aplikasi.** Output tabel `winget` memotong nama dan ID panjang ("…"), karena lebar
  kolomnya dihitung dari 50 baris pertama. Karena itu Winsta memakai modul resmi
  **Microsoft.WinGet.Client** bila terpasang. Tombol "Pasang modul" di halaman Terpasang memasangnya
  sekali, untuk akun ini saja, tanpa admin. Tanpa modul, Winsta membaca output CLI dan memulihkan ID
  lengkap dari `winget export`.
- **Pindai aplikasi terpasang.** Aplikasi dengan sumber `winget` atau `msstore` bisa di-update.
  Rollback hanya untuk sumber `winget`, karena repositori itulah yang menyimpan versi lama. Aplikasi
  yang dipasang dengan cara lain disembunyikan di bagian "Aplikasi lain terpasang" (bisa ditampilkan
  di halaman Terpasang atau di Pengaturan).
- **Lokasi install.** winget tidak mencatat lokasi, jadi Winsta membacanya dari registry Uninstall
  Windows: `InstallLocation`, lalu folder ikon aplikasi (`DisplayIcon`), lalu folder uninstaller-nya.
  Sebagian installer tidak mengisi satu pun, jadi lokasinya tampil sebagai "Lokasi tidak dicatat
  installer". Aplikasinya tetap terdeteksi karena winget mengenalinya dari nama dan ID di registry,
  bukan dari folder. Kalau installer mengabaikan folder pilihanmu, Winsta memberi tahu setelah pindai ulang.
- **Cakupan.** Default-nya *Otomatis* (tanpa `--scope`). Memaksa "Hanya saya" atau "Semua
  pengguna" bisa gagal kalau installer tidak mendukung cakupan itu. Panel Antrian lalu menawarkan
  "Coba lagi dengan cakupan Otomatis".
- **Rollback** memasang versi lama dari repositori winget (`winget install --version … --force`),
  lalu mengunci versinya dengan `winget pin` bila dicentang. Arsip installer lokal (`winget download`)
  sudah tersedia di sisi Rust, tapi belum dipakai otomatis.
- Beberapa installer menampilkan jendela UAC atau jendelanya sendiri. Itu perilaku installer, bukan Winsta.

## Sumber GitHub

Pencarian di Jelajahi menampilkan dua bagian: **winget** dan **GitHub**. Hasil GitHub diurutkan agar repo
yang namanya cocok dengan kata kunci selalu di atas, walau bintangnya sedikit (misalnya "iphone link" →
`kelvindaniyar/iphone-link`). Kalau tetap tidak muncul, tempel alamat repo-nya langsung.

1. **Cari.** Ketik nama aplikasi, atau tempel alamat repo (`github.com/pemilik/aplikasi` atau `pemilik/aplikasi`).
2. **Pilih file.** Winsta membaca rilis stabil lewat API GitHub dan hanya menampilkan file untuk Windows.
   Urutan sarannya: installer MSI, installer .exe, lalu .zip portable; 64-bit didahulukan. Pilihan bisa diganti.
3. **Unduh dan verifikasi.** File diunduh dengan `curl.exe` bawaan Windows. Bila GitHub mencatat hash SHA-256
   file itu, Winsta mencocokkannya dan menolak file yang tidak cocok.
4. **Pasang:**
   - `.zip` atau `.exe` portable: diekstrak ke folder pilihan, lalu dibuatkan shortcut Start Menu. Lokasi pasti
     dipakai. Folder lama diganti hanya setelah yang baru siap, dan folder yang berisi file lain tidak pernah ditimpa.
   - MSI: `msiexec /passive`, folder tujuan dikirim sebagai `INSTALLDIR`/`INSTALLFOLDER`.
   - Inno Setup dan NSIS (dikenali dari isi file): dipasang tanpa jendela dengan folder pilihan.
   - Installer lain: jendela installer-nya ditampilkan.
5. **Update dan rollback.** Saat Winsta dibuka, rilis terbaru tiap aplikasi GitHub dicek. Update dan rollback
   memakai jenis file dan arsitektur yang sama dengan yang terpasang, ke folder yang sama.
6. **Uninstall.** Portable: folder dihapus (hanya folder berpenanda `.winsta`). Installer: lewat winget berdasarkan
   nama yang tercatat di Windows setelah install.

Batas API GitHub tanpa token: 60 permintaan per jam dan 10 pencarian per menit. Permintaan yang hasilnya
tidak berubah (ETag, 304) tidak dihitung. Token pribadi opsional bisa diisi di Pengaturan > GitHub.

## Pengujian

```bash
cd src-tauri
rustc --edition 2021 --test src/winget.rs -o winget_test && ./winget_test   # parser tabel, progres, %VAR%
rustc --edition 2021 --test src/system.rs -o system_test && ./system_test   # drive dan lokasi install
rustc --edition 2021 --test src/github.rs -o github_test && ./github_test   # SHA-256, jenis installer, folder portable
rustc --edition 2021 --test src/cleanup.rs -o cleanup_test && ./cleanup_test # pencocokan nama, folder terlindung
```

---
