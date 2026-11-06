//! Sumber GitHub: unduh file rilis, verifikasi SHA-256, lalu pasang sesuai jenisnya.
//! Hanya std (alat bawaan Windows: curl.exe, tar.exe, msiexec, PowerShell), sehingga
//! bagian logikanya bisa diuji di mana saja:
//! `rustc --edition 2021 --test src/github.rs -o github_test && ./github_test`

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// .zip diekstrak ke folder pilihan.
    Portable,
    /// .exe tunggal yang langsung dijalankan (bukan installer).
    PortableExe,
    Msi,
    Inno,
    Nsis,
    /// Installer .exe yang jenisnya tidak dikenali: dijalankan dengan jendelanya sendiri.
    Exe,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Portable => "portable",
            Kind::PortableExe => "portable-exe",
            Kind::Msi => "msi",
            Kind::Inno => "inno",
            Kind::Nsis => "nsis",
            Kind::Exe => "exe",
        }
    }

    pub fn parse(s: &str) -> Option<Kind> {
        Some(match s {
            "portable" => Kind::Portable,
            "portable-exe" => Kind::PortableExe,
            "msi" => Kind::Msi,
            "inno" => Kind::Inno,
            "nsis" => Kind::Nsis,
            "exe" => Kind::Exe,
            _ => return None,
        })
    }

    pub fn is_portable(self) -> bool {
        matches!(self, Kind::Portable | Kind::PortableExe)
    }
}

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4)
// ---------------------------------------------------------------------------

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

pub struct Sha256 {
    h: [u32; 8],
    buf: [u8; 64],
    buf_len: usize,
    total: u64,
}

impl Sha256 {
    pub fn new() -> Self {
        Self {
            h: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19],
            buf: [0; 64],
            buf_len: 0,
            total: 0,
        }
    }

    fn block(&mut self, b: &[u8; 64]) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let [mut a, mut b2, mut c, mut d, mut e, mut f, mut g, mut h] = self.h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b2) ^ (a & c) ^ (b2 & c);
            let t2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b2;
            b2 = a;
            a = t1.wrapping_add(t2);
        }
        for (x, y) in self.h.iter_mut().zip([a, b2, c, d, e, f, g, h]) {
            *x = x.wrapping_add(y);
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        self.total += data.len() as u64;
        if self.buf_len > 0 {
            let take = (64 - self.buf_len).min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len == 64 {
                let b = self.buf;
                self.block(&b);
                self.buf_len = 0;
            }
        }
        while data.len() >= 64 {
            let mut b = [0u8; 64];
            b.copy_from_slice(&data[..64]);
            self.block(&b);
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buf[..data.len()].copy_from_slice(data);
            self.buf_len = data.len();
        }
    }

    pub fn finish(mut self) -> String {
        let bits = self.total.wrapping_mul(8);
        let mut pad = vec![0x80u8];
        while (self.buf_len + pad.len()) % 64 != 56 {
            pad.push(0);
        }
        pad.extend_from_slice(&bits.to_be_bytes());
        let total = self.total;
        self.update(&pad);
        self.total = total;
        self.h.iter().map(|x| format!("{x:08x}")).collect()
    }
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finish())
}

/// GitHub mencatat hash sebagai "sha256:<hex>".
pub fn expected_sha(digest: &str) -> Option<String> {
    let hex = digest.trim().strip_prefix("sha256:").unwrap_or(digest.trim()).to_lowercase();
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit())).then_some(hex)
}

// ---------------------------------------------------------------------------
// Deteksi jenis file
// ---------------------------------------------------------------------------

/// Cari salah satu pola byte di dalam file, dibaca per potongan.
fn file_contains_any(path: &Path, needles: &[&[u8]]) -> std::io::Result<Option<usize>> {
    let mut f = fs::File::open(path)?;
    let overlap = needles.iter().map(|n| n.len()).max().unwrap_or(1);
    let mut carry: Vec<u8> = Vec::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            return Ok(None);
        }
        carry.extend_from_slice(&buf[..n]);
        for (i, needle) in needles.iter().enumerate() {
            if carry.windows(needle.len()).any(|w| w == *needle) {
                return Ok(Some(i));
            }
        }
        let keep = carry.len().saturating_sub(overlap);
        carry.drain(..keep);
    }
}

pub fn detect_kind(path: &Path, file_name: &str) -> Kind {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".msi") {
        return Kind::Msi;
    }
    if lower.ends_with(".zip") {
        return Kind::Portable;
    }
    match file_contains_any(path, &[b"Inno Setup", b"Nullsoft", b"NSIS Error"]) {
        Ok(Some(0)) => return Kind::Inno,
        Ok(Some(_)) => return Kind::Nsis,
        _ => {}
    }
    if ["setup", "install", "installer"].iter().any(|w| lower.contains(w)) {
        Kind::Exe
    } else {
        Kind::PortableExe
    }
}

// ---------------------------------------------------------------------------
// Folder aplikasi portable
// ---------------------------------------------------------------------------

pub const MARKER: &str = ".winsta";

fn with_suffix(p: &Path, suffix: &str) -> PathBuf {
    let mut s = p.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

/// Bila isi arsip hanya satu folder, pakai isi folder itu (umum pada zip rilis).
pub fn content_root(dir: &Path) -> PathBuf {
    let entries: Vec<_> = match fs::read_dir(dir) {
        Ok(r) => r.filter_map(Result::ok).collect(),
        Err(_) => return dir.to_path_buf(),
    };
    if entries.len() == 1 && entries[0].path().is_dir() {
        entries[0].path()
    } else {
        dir.to_path_buf()
    }
}

fn dir_is_empty(p: &Path) -> bool {
    fs::read_dir(p).map(|mut r| r.next().is_none()).unwrap_or(true)
}

/// Folder tujuan boleh dipakai bila belum ada, kosong, atau milik Winsta (ada file penanda).
pub fn check_target(target: &Path) -> Result<(), String> {
    if target.parent().is_none() || target.components().count() < 2 {
        return Err("Pilih folder di dalam drive, bukan akar drive.".into());
    }
    if target.exists() && !dir_is_empty(target) && !target.join(MARKER).exists() {
        return Err(format!(
            "Folder {} sudah berisi file lain. Pilih folder kosong atau folder baru.",
            target.display()
        ));
    }
    Ok(())
}

/// Ganti isi `target` dengan `src` secara aman: versi lama dihapus hanya setelah yang baru siap.
pub fn swap_into(src: &Path, target: &Path, note: &str) -> Result<(), String> {
    check_target(target)?;
    let old = with_suffix(target, ".winsta-old");
    let _ = fs::remove_dir_all(&old);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Folder {} tidak bisa dibuat: {e}", parent.display()))?;
    }
    let had_old = target.exists();
    if had_old {
        fs::rename(target, &old).map_err(|e| format!("Folder lama sedang dipakai. Tutup aplikasinya dulu. ({e})"))?;
    }
    if let Err(e) = fs::rename(src, target) {
        if had_old {
            let _ = fs::rename(&old, target);
        }
        return Err(format!("File baru tidak bisa dipindahkan ke {}: {e}", target.display()));
    }
    let _ = fs::write(target.join(MARKER), note);
    let _ = fs::remove_dir_all(&old);
    Ok(())
}

/// Tebak .exe utama: yang namanya mirip aplikasi, kalau tidak ada yang terbesar.
pub fn find_main_exe(dir: &Path, app_name: &str) -> Option<PathBuf> {
    let want: String = app_name.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect();
    let mut exes = Vec::new();
    let mut stack = vec![(dir.to_path_buf(), 0)];
    while let Some((d, depth)) = stack.pop() {
        for e in fs::read_dir(&d).into_iter().flatten().flatten() {
            let p = e.path();
            if p.is_dir() {
                if depth < 2 {
                    stack.push((p, depth + 1));
                }
            } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe")) {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                exes.push((p, size, depth));
            }
        }
    }
    let stem = |p: &Path| -> String {
        p.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default().chars().filter(|c| c.is_alphanumeric()).collect()
    };
    let helper = |s: &str| ["unins", "uninstall", "update", "crash", "helper", "elevate", "setup"].iter().any(|h| s.contains(h));
    exes.retain(|(p, _, _)| !helper(&stem(p)));
    if !want.is_empty() {
        if let Some((p, _, _)) = exes.iter().filter(|(p, _, _)| stem(p) == want).min_by_key(|(_, _, d)| *d) {
            return Some(p.clone());
        }
        if let Some((p, _, _)) = exes.iter().filter(|(p, _, _)| {
            let s = stem(p);
            !s.is_empty() && (s.contains(&want) || want.contains(&s))
        }).min_by_key(|(_, _, d)| *d) {
            return Some(p.clone());
        }
    }
    exes.into_iter().max_by_key(|(_, size, d)| (u64::MAX - *d as u64, *size)).map(|(p, _, _)| p)
}

pub fn safe_file_name(s: &str) -> String {
    let t: String = s.chars().map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c }).collect();
    let t = t.trim().trim_matches('.').to_string();
    if t.is_empty() { "app".into() } else { t }
}

// ---------------------------------------------------------------------------
// Menjalankan alat Windows
// ---------------------------------------------------------------------------

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

fn powershell(script: &str, env: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = hidden(&mut cmd).output().map_err(|e| format!("PowerShell tidak bisa dijalankan: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Unduh dengan curl.exe bawaan Windows; progres dibaca dari ukuran file yang sudah tertulis.
pub fn download(url: &str, dest: &Path, size: u64, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Alamat unduhan harus https.".into());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(dest);
    let mut cmd = Command::new("curl.exe");
    cmd.args(["-L", "--fail", "--silent", "--show-error", "--retry", "2", "-A", "Winsta", "-o"])
        .arg(dest)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = hidden(&mut cmd).spawn().map_err(|e| format!("curl.exe tidak bisa dijalankan: {e}"))?;
    let mb = |b: u64| b as f64 / 1_048_576.0;
    let mut last = u64::MAX;
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        let got = fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
        if got != last && size > 0 {
            on_line(&format!("Mengunduh {:.1} MB / {:.1} MB", mb(got), mb(size)));
            last = got;
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    };
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() {
        let _ = e.read_to_string(&mut err);
    }
    if !status.success() {
        let _ = fs::remove_file(dest);
        let msg = err.trim();
        return Err(if msg.is_empty() { "Unduhan gagal. Periksa koneksi internet.".into() } else { format!("Unduhan gagal: {msg}") });
    }
    if size > 0 {
        on_line(&format!("Mengunduh {:.1} MB / {:.1} MB", mb(size), mb(size)));
    }
    Ok(())
}

fn extract_zip(file: &Path, into: &Path) -> Result<(), String> {
    fs::create_dir_all(into).map_err(|e| e.to_string())?;
    let mut cmd = Command::new("tar.exe");
    cmd.arg("-xf").arg(file).arg("-C").arg(into).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    let out = hidden(&mut cmd).output().map_err(|e| format!("tar.exe tidak bisa dijalankan: {e}"))?;
    if !out.status.success() {
        return Err(format!("Arsip zip tidak bisa diekstrak: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(())
}

/// Jalankan installer lewat PowerShell Start-Process, agar jendela UAC muncul bila perlu.
fn run_installer(file: &str, args: &str) -> Result<i64, String> {
    const PS: &str = r#"try { $p = Start-Process -FilePath $env:WINSTA_FILE -ArgumentList $env:WINSTA_ARGS -Wait -PassThru -ErrorAction Stop; "EXIT`t$($p.ExitCode)" } catch { "ERR`t$($_.Exception.Message)" }"#;
    const PS_NOARGS: &str = r#"try { $p = Start-Process -FilePath $env:WINSTA_FILE -Wait -PassThru -ErrorAction Stop; "EXIT`t$($p.ExitCode)" } catch { "ERR`t$($_.Exception.Message)" }"#;
    let out = powershell(if args.is_empty() { PS_NOARGS } else { PS }, &[("WINSTA_FILE", file), ("WINSTA_ARGS", args)])?;
    parse_exit(&out)
}

pub fn parse_exit(out: &str) -> Result<i64, String> {
    for line in out.lines().map(|l| l.trim_end_matches('\r')) {
        if let Some(code) = line.strip_prefix("EXIT\t") {
            return Ok(code.trim().parse().unwrap_or(0));
        }
        if let Some(err) = line.strip_prefix("ERR\t") {
            let e = err.trim();
            if e.to_lowercase().contains("canceled by the user") || e.to_lowercase().contains("dibatalkan") {
                return Err("Izin admin (UAC) ditolak, jadi installer tidak dijalankan.".into());
            }
            return Err(format!("Installer tidak bisa dijalankan: {e}"));
        }
    }
    Err("Installer tidak memberi hasil.".into())
}

fn explain_exit(kind: Kind, code: i64) -> Result<(), String> {
    match (kind, code) {
        (_, 0) | (Kind::Msi, 3010) | (Kind::Msi, 1641) => Ok(()),
        (Kind::Msi, 1602) | (Kind::Inno, 5) => Err("Pemasangan dibatalkan.".into()),
        (Kind::Msi, 1603) => Err("Installer MSI gagal (kode 1603). Biasanya karena butuh izin admin atau versi lain masih terpasang.".into()),
        (Kind::Msi, 1638) => Err("Versi lain aplikasi ini sudah terpasang. Uninstall dulu, lalu coba lagi.".into()),
        (_, c) => Err(format!("Installer selesai dengan kode {c}.")),
    }
}

fn shortcuts_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn create_shortcut(name: &str, exe: &Path) {
    const PS: &str = r#"try { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:WINSTA_LNK); $s.TargetPath = $env:WINSTA_EXE; $s.WorkingDirectory = Split-Path $env:WINSTA_EXE; $s.Save(); 'OK' } catch { "ERR`t$($_.Exception.Message)" }"#;
    if let Some(dir) = shortcuts_dir() {
        let lnk = dir.join(format!("{}.lnk", safe_file_name(name)));
        let _ = powershell(PS, &[("WINSTA_LNK", &lnk.to_string_lossy()), ("WINSTA_EXE", &exe.to_string_lossy())]);
    }
}

fn remove_shortcut(name: &str) {
    if let Some(dir) = shortcuts_dir() {
        let _ = fs::remove_file(dir.join(format!("{}.lnk", safe_file_name(name))));
    }
}

// ---------------------------------------------------------------------------
// Install dan uninstall
// ---------------------------------------------------------------------------

pub struct InstallReq {
    pub url: String,
    pub file_name: String,
    pub size: u64,
    pub digest: Option<String>,
    /// Folder tujuan (sudah termasuk subfolder aplikasi). Kosong = biarkan installer memilih.
    pub location: Option<String>,
    /// Nama tampilan aplikasi, untuk shortcut dan pencocokan entri Windows.
    pub name: String,
    pub repo: String,
    pub version: String,
}

#[derive(Debug, Default)]
pub struct InstallResult {
    pub kind: String,
    pub path: String,
    pub display_name: Option<String>,
    pub exe: Option<String>,
}

pub struct Entry {
    pub name: String,
    pub version: String,
    pub location: String,
}

/// Entri Windows yang baru muncul atau berubah versinya setelah install.
pub fn pick_new_entry<'a>(before: &[Entry], after: &'a [Entry], app_name: &str) -> Option<&'a Entry> {
    let fresh: Vec<&Entry> = after
        .iter()
        .filter(|a| !before.iter().any(|b| b.name == a.name && b.version == a.version))
        .collect();
    let want = app_name.to_lowercase();
    fresh.iter().find(|e| e.name.to_lowercase().contains(&want)).copied().or_else(|| fresh.first().copied())
}

pub fn install(
    req: &InstallReq,
    work_dir: &Path,
    entries: &dyn Fn() -> Vec<Entry>,
    on_line: &mut dyn FnMut(&str),
) -> Result<InstallResult, String> {
    let file = work_dir.join(safe_file_name(&req.file_name));
    on_line(&format!("Mengunduh {} dari GitHub", req.file_name));
    download(&req.url, &file, req.size, on_line)?;

    match req.digest.as_deref().and_then(expected_sha) {
        Some(want) => {
            on_line("Memverifikasi SHA-256…");
            let got = sha256_file(&file).map_err(|e| e.to_string())?;
            if got != want {
                let _ = fs::remove_file(&file);
                return Err("Hash SHA-256 file tidak cocok dengan yang dicatat GitHub, jadi file tidak dipasang.".into());
            }
            on_line("Hash SHA-256 cocok");
        }
        None => on_line("GitHub tidak mencatat hash untuk file ini; verifikasi dilewati"),
    }

    let kind = detect_kind(&file, &req.file_name);
    let location = req.location.as_deref().filter(|l| !l.trim().is_empty()).map(PathBuf::from);
    let note = format!("{}\n{}\n", req.repo, req.version);
    let result = match kind {
        Kind::Portable | Kind::PortableExe => {
            let target = location.ok_or("Aplikasi portable butuh folder tujuan.")?;
            check_target(&target)?;
            on_line("Memasang (mengekstrak file)");
            let staging = with_suffix(&target, ".winsta-new");
            let _ = fs::remove_dir_all(&staging);
            if kind == Kind::Portable {
                extract_zip(&file, &staging)?;
            } else {
                fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
                fs::copy(&file, staging.join(safe_file_name(&req.file_name))).map_err(|e| e.to_string())?;
            }
            let src = content_root(&staging);
            let res = swap_into(&src, &target, &note);
            let _ = fs::remove_dir_all(&staging);
            res?;
            let exe = find_main_exe(&target, &req.name);
            if let Some(e) = &exe {
                create_shortcut(&req.name, e);
            }
            InstallResult {
                kind: kind.as_str().into(),
                path: target.to_string_lossy().into(),
                display_name: None,
                exe: exe.map(|e| e.to_string_lossy().into()),
            }
        }
        _ => {
            let loc = location.as_ref().map(|l| l.to_string_lossy().to_string());
            let args = match (kind, &loc) {
                (Kind::Msi, l) => {
                    let mut a = format!("/i \"{}\" /passive /norestart", file.display());
                    if let Some(l) = l {
                        a.push_str(&format!(" INSTALLDIR=\"{l}\" INSTALLFOLDER=\"{l}\" APPLICATIONFOLDER=\"{l}\""));
                    }
                    a
                }
                (Kind::Inno, l) => {
                    let mut a = "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-".to_string();
                    if let Some(l) = l {
                        a.push_str(&format!(" /DIR=\"{l}\""));
                    }
                    a
                }
                // NSIS: /D harus terakhir dan tanpa tanda kutip.
                (Kind::Nsis, l) => match l {
                    Some(l) => format!("/S /D={l}"),
                    None => "/S".into(),
                },
                _ => String::new(),
            };
            on_line(match kind {
                Kind::Exe => "Memasang (ikuti jendela installer)",
                _ => "Memasang",
            });
            let before = entries();
            let exe_path = if kind == Kind::Msi { "msiexec.exe".to_string() } else { file.to_string_lossy().to_string() };
            let code = run_installer(&exe_path, &args)?;
            explain_exit(kind, code)?;
            let after = entries();
            let found = pick_new_entry(&before, &after, &req.name);
            InstallResult {
                kind: kind.as_str().into(),
                path: found.map(|e| e.location.clone()).filter(|l| !l.is_empty()).or(loc).unwrap_or_default(),
                display_name: found.map(|e| e.name.clone()),
                exe: None,
            }
        }
    };
    let _ = fs::remove_file(&file);
    on_line("Selesai");
    Ok(result)
}

/// Hapus aplikasi portable: hanya folder yang berisi penanda Winsta.
pub fn uninstall_portable(path: &str, name: &str) -> Result<(), String> {
    let p = Path::new(path);
    if path.trim().is_empty() || !p.join(MARKER).exists() {
        return Err("Folder ini tidak dipasang oleh Winsta, jadi tidak dihapus otomatis.".into());
    }
    fs::remove_dir_all(p).map_err(|e| format!("Folder tidak bisa dihapus. Tutup aplikasinya dulu. ({e})"))?;
    remove_shortcut(name);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sha(s: &[u8]) -> String {
        let mut h = Sha256::new();
        h.update(s);
        h.finish()
    }

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(sha(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(
            sha(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        // Diumpan sepotong-sepotong harus sama dengan sekaligus.
        let data: Vec<u8> = (0..1000u32).map(|i| (i * 7 % 251) as u8).collect();
        let mut h = Sha256::new();
        for c in data.chunks(37) {
            h.update(c);
        }
        assert_eq!(h.finish(), sha(&data));
        assert_eq!(expected_sha("sha256:E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855").as_deref(), Some("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
        assert_eq!(expected_sha("md5:abc"), None);
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("winsta-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn detects_installer_types() {
        let d = tmp("detect");
        let mut big = vec![0u8; (1 << 20) - 3];
        big.extend_from_slice(b"Inno Setup Setup Data");
        fs::write(d.join("a.exe"), &big).unwrap();
        fs::write(d.join("b.exe"), b"MZ....Nullsoft.NSIS.exehead").unwrap();
        fs::write(d.join("c.exe"), b"MZ plain program").unwrap();
        fs::write(d.join("d.exe"), b"MZ plain program").unwrap();
        assert_eq!(detect_kind(&d.join("a.exe"), "App-Setup-1.0.exe"), Kind::Inno, "pola yang terpotong batas potongan tetap ketemu");
        assert_eq!(detect_kind(&d.join("b.exe"), "app.exe"), Kind::Nsis);
        assert_eq!(detect_kind(&d.join("c.exe"), "app-installer-x64.exe"), Kind::Exe);
        assert_eq!(detect_kind(&d.join("d.exe"), "tool.exe"), Kind::PortableExe);
        assert_eq!(detect_kind(&d.join("d.exe"), "tool-win64.zip"), Kind::Portable);
        assert_eq!(detect_kind(&d.join("d.exe"), "Tool.MSI"), Kind::Msi);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn swaps_portable_folder_safely() {
        let d = tmp("swap");
        let target = d.join("Apps").join("Flow");
        // Versi pertama, dari zip yang berisi satu folder.
        let staging = d.join("stage1");
        fs::create_dir_all(staging.join("Flow-1.0").join("bin")).unwrap();
        fs::write(staging.join("Flow-1.0").join("Flow.exe"), vec![0u8; 50]).unwrap();
        fs::write(staging.join("Flow-1.0").join("bin").join("Updater.exe"), vec![0u8; 500]).unwrap();
        let src = content_root(&staging);
        swap_into(&src, &target, "a/b\n1.0\n").unwrap();
        assert!(target.join(MARKER).exists());
        assert_eq!(find_main_exe(&target, "Flow").unwrap().file_name().unwrap(), "Flow.exe");

        // Versi kedua menimpa folder milik Winsta.
        let staging2 = d.join("stage2");
        fs::create_dir_all(&staging2).unwrap();
        fs::write(staging2.join("Flow.exe"), b"v2").unwrap();
        fs::write(staging2.join("notes.txt"), b"x").unwrap();
        swap_into(&content_root(&staging2), &target, "a/b\n2.0\n").unwrap();
        assert_eq!(fs::read(target.join("Flow.exe")).unwrap(), b"v2");
        assert!(!target.join("bin").exists(), "isi versi lama diganti");
        assert!(!with_suffix(&target, ".winsta-old").exists());

        // Folder orang lain yang berisi file tidak boleh ditimpa.
        let foreign = d.join("Docs");
        fs::create_dir_all(&foreign).unwrap();
        fs::write(foreign.join("skripsi.docx"), b"penting").unwrap();
        assert!(check_target(&foreign).is_err());
        assert!(uninstall_portable(&foreign.to_string_lossy(), "x").is_err());
        assert!(foreign.join("skripsi.docx").exists());

        uninstall_portable(&target.to_string_lossy(), "Flow").unwrap();
        assert!(!target.exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn picks_new_windows_entry_and_parses_exit() {
        let e = |n: &str, v: &str, l: &str| Entry { name: n.into(), version: v.into(), location: l.into() };
        let before = vec![e("Git", "2.50.1", "C:\\Program Files\\Git"), e("Flow Launcher", "1.0", "")];
        let after = vec![
            e("Git", "2.50.1", "C:\\Program Files\\Git"),
            e("Microsoft Visual C++ 2022 Redistributable", "14.4", ""),
            e("Flow Launcher", "2.0", "C:\\Users\\a\\AppData\\Local\\FlowLauncher"),
        ];
        let got = pick_new_entry(&before, &after, "Flow Launcher").unwrap();
        assert_eq!(got.version, "2.0");
        assert!(pick_new_entry(&after, &after, "Flow Launcher").is_none());
        assert_eq!(parse_exit("EXIT\t3010\r\n"), Ok(3010));
        assert!(parse_exit("ERR\tThe operation was canceled by the user.\r\n").unwrap_err().contains("UAC"));
        assert!(explain_exit(Kind::Msi, 3010).is_ok());
        assert!(explain_exit(Kind::Msi, 1603).is_err());
        assert_eq!(safe_file_name("a/b:c?.exe"), "a_b_c_.exe");
    }
}
