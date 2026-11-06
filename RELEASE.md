# Merilis Winsta di GitHub (panduan pertama kali)

Hasil akhirnya: halaman **Releases** di GitHub berisi `Winsta_0.1.0_x64_en-US.msi`. Installer itu
menampilkan halaman **Destination Folder** dengan tombol **Change…**, jadi pengguna bisa memasang Winsta
di drive mana saja (default `C:\Program Files\Winsta`).

Kamu tidak perlu membuat `.msi` sendiri: GitHub Actions membuatnya di server Windows milik GitHub setiap
kali kamu membuat tag versi.

---

## Bagian A — Persiapan (sekali saja)

### A1. Akun GitHub
1. Daftar di <https://github.com/signup> bila belum punya akun. Nama akunmu akan jadi bagian alamat repo:
   `github.com/savoreux/winsta`.
2. Supaya email pribadimu tidak ikut tercatat di riwayat kode: buka **Settings → Emails**, centang
   **Keep my email addresses private**. Catat alamat yang berakhiran `@users.noreply.github.com`.

### A2. Pasang Git
Buka PowerShell, lalu jalankan:
```powershell
winget install --id Git.Git -e
```
Tutup dan buka lagi PowerShell, cek dengan `git --version`. Lalu kenalkan dirimu ke Git
(nama ini terlihat publik di setiap commit):
```powershell
git config --global user.name "Savoreux"
git config --global user.email "62581068+savoreux@users.noreply.github.com"
git config --global init.defaultBranch main
```

### A3. Siapkan folder Winsta
1. Ekstrak `winsta.zip` ke folder tetap, misalnya `D:\Projects\winsta`.
2. Pastikan di dalamnya ada `LICENSE`, `README.md`, `src`, `src-tauri`, `dist`, dan `.github`.
   (Folder `.github` tersembunyi di Explorer bila "Hidden items" tidak dicentang; itu normal.)
3. **Sangat disarankan:** coba dulu di PC-mu. Dobel-klik `jalankan.bat` untuk membuka Winsta, lalu
   `buat-installer.bat` untuk memastikan `.msi` bisa dibuat. Pasang `.msi` itu, coba pilih folder di
   drive D:, buka Winsta, lalu uninstall lewat Settings > Apps. Lebih baik masalah ketahuan sekarang
   daripada setelah dirilis.

### A4. Buat repositori di GitHub
1. Buka <https://github.com/new>.
2. **Repository name:** `winsta`. **Description:** misalnya *Install, update, and roll back Windows apps
   with winget and GitHub*.
3. Pilih **Public** (Releases di repo private tidak bisa diunduh orang lain).
4. **Jangan** centang *Add a README*, *.gitignore*, atau *license*: semuanya sudah ada di folder Winsta.
   Kalau dicentang, push pertama akan ditolak karena riwayatnya berbeda.
5. Klik **Create repository**. Biarkan halaman itu terbuka; alamat repo-nya dipakai di langkah berikut.

### A5. Unggah kode pertama kali
Di PowerShell:
```powershell
cd D:\Projects\winsta
git init
git add .
git status
```
Periksa daftar dari `git status`: **tidak boleh** ada `node_modules`, `dist-standalone`, atau
`src-tauri\target` (sudah diabaikan oleh `.gitignore`). Kalau aman:
```powershell
git commit -m "Winsta 0.1.0"
git remote add origin https://github.com/savoreux/winsta.git
git push -u origin main
```
Saat push pertama, jendela **Git Credential Manager** muncul. Pilih **Sign in with your browser**,
login ke GitHub, klik **Authorize**. Setelah itu push berikutnya tidak perlu login lagi.

Muat ulang halaman repo di browser: kode, README, dan LICENSE sekarang tampil.

### A6. Atur repo
1. **Settings → Actions → General**: pastikan *Allow all actions and reusable workflows* dipilih.
   Di bagian **Workflow permissions**, pilih **Read and write permissions**, lalu **Save**.
2. Di halaman utama repo, klik ikon ⚙ di kotak **About** (kanan): isi deskripsi, centang
   *Releases*, tambahkan topics seperti `winget`, `windows`, `package-manager`, `tauri`.
3. Opsional: **Settings → General → Features**, matikan *Wikis* dan *Projects* bila tidak dipakai.
   Biarkan *Issues* aktif agar pengguna bisa melaporkan masalah.

---

## Bagian B — Merilis versi (setiap kali ada versi baru)

### B1. Naikkan nomor versi
Ubah versi di tiga file ini agar sama, misalnya `0.1.0`:
- `src-tauri/tauri.conf.json` → `"version": "0.1.0"`
- `src-tauri/Cargo.toml` → `version = "0.1.0"`
- `package.json` → `"version": "0.1.0"`

Untuk rilis pertama semuanya sudah `0.1.0`, jadi langkah ini bisa dilewati.
Aturan nomor: perbaikan kecil `0.1.1`, fitur baru `0.2.0`, perubahan besar `1.0.0`.

### B2. Commit dan buat tag
```powershell
git add .
git commit -m "Winsta 0.1.0"
git push
git tag v0.1.0
git push origin v0.1.0
```
Tag harus diawali `v` dan angkanya sama persis dengan versi di `tauri.conf.json`. Kalau berbeda,
workflow sengaja berhenti dengan pesan error.

### B3. Tunggu GitHub Actions
1. Buka tab **Actions** di repo. Ada workflow **Release** yang berjalan (lingkaran kuning).
2. Pertama kali butuh sekitar 10–15 menit; berikutnya lebih cepat karena ada cache.
3. Centang hijau = berhasil. Silang merah = gagal: klik workflow-nya, klik langkah yang merah, dan
   salin pesan error-nya untuk diperbaiki.

### B4. Terbitkan rilis
1. Buka **Releases** (kanan halaman repo, atau `github.com/savoreux/winsta/releases`).
2. Ada rilis **Draft** bernama `v0.1.0` berisi `Winsta_0.1.0_x64_en-US.msi` dan `SHA256SUMS.txt`.
3. Klik ikon pensil (**Edit**). Isi judul, misalnya *Winsta 0.1.0*, lalu tulis catatan rilis.
   Contoh untuk rilis pertama:
   ```markdown
   Rilis pertama Winsta.

   - Install aplikasi dari winget dan GitHub ke folder pilihan sendiri
   - Cek update saat Winsta dibuka, update satu per satu atau sekaligus
   - Rollback hingga 5 versi sebelumnya
   - Uninstall bersih: sisa folder, data, dan shortcut bisa ikut dihapus
   - Bahasa Indonesia dan English

   **Cara pasang:** unduh file `.msi`, jalankan, lalu pilih folder di halaman Destination Folder.
   Bila muncul "Windows protected your PC", klik **More info → Run anyway** (installer belum
   ditandatangani).
   ```
4. Centang **Set as the latest release**, lalu klik **Publish release**.

Selesai. Bagikan tautan `github.com/savoreux/winsta/releases/latest` ke pengguna.

### Kalau tag perlu diulang
Misalnya workflow gagal dan kamu sudah memperbaiki kodenya:
```powershell
git push origin :refs/tags/v0.1.0    # hapus tag di GitHub
git tag -d v0.1.0                    # hapus tag di PC
git add . ; git commit -m "Perbaiki build" ; git push
git tag v0.1.0 ; git push origin v0.1.0
```
Hapus juga rilis draft lama di halaman Releases bila ada.

---

## Peringatan SmartScreen

Installer yang belum ditandatangani (code signing) memunculkan "Windows protected your PC" saat pertama
dibuka. Pengguna bisa klik **More info → Run anyway**. Peringatan ini hilang bila installer ditandatangani
dengan sertifikat code signing (berbayar), atau lewat program gratis untuk proyek open-source seperti
SignPath Foundation (hanya untuk proyek berlisensi open-source).

## Lisensi

Winsta memakai lisensi **GPL-3.0** (file `LICENSE`, teks resmi dari Free Software Foundation, jangan diubah).
Hak ciptanya tercatat di README sebagai **© 2026 Savoreux**.

- Semua orang boleh memakai Winsta gratis, untuk pribadi maupun pekerjaan.
- Semua orang boleh membaca, mengubah, dan membagikan kodenya.
- Siapa pun yang membagikan versi turunannya **wajib** memakai GPL-3.0, membuka kode sumbernya, dan
  tetap mencantumkan hak cipta Savoreux. Jadi orang tidak bisa mengambil Winsta lalu menjualnya sebagai
  aplikasi tertutup.
- Nama "Winsta" dan ikonnya tetap milikmu. Bila ada yang merilis ulang tanpa mencantumkan hak cipta,
  laporkan lewat formulir DMCA GitHub: <https://github.com/contact/dmca>.

Saat membuat repo di GitHub (langkah A4), tetap jangan centang *Add a license*: file `LICENSE` sudah ada
dan GitHub akan otomatis menampilkan label **GPL-3.0** di halaman repo.

Karena Winsta sekarang open-source, Winsta bisa mendaftar code signing gratis di SignPath Foundation
(<https://signpath.org>) agar peringatan SmartScreen hilang.

Komponen open-source yang dipakai Winsta tercatat di `THIRD-PARTY-NOTICES.md`.
