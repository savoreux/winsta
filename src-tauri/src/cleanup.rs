//! Sisa aplikasi setelah uninstall: folder install, data di AppData/ProgramData, dan shortcut.
//! Hanya std, sehingga bisa diuji di mana saja:
//! `rustc --edition 2021 --test src/cleanup.rs -o cleanup_test && ./cleanup_test`
//!
//! Prinsip keamanan:
//! - Nama dicocokkan secara utuh (setelah versi dan arsitektur dibuang), bukan sekadar "mengandung".
//! - Folder sistem dan folder induk (Program Files, AppData, profil pengguna, akar drive) tidak pernah dihapus.
//! - Penghapusan memeriksa ulang setiap path; daftar dari UI tidak dipercaya begitu saja.

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct Bases {
    pub app_data: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
    pub program_data: Option<PathBuf>,
    pub program_files: Vec<PathBuf>,
    pub start_menus: Vec<PathBuf>,
    pub desktops: Vec<PathBuf>,
    /// Folder yang tidak boleh dihapus walau cocok (Windows, profil pengguna, dll.).
    pub protected: Vec<PathBuf>,
}

impl Bases {
    pub fn from_env() -> Self {
        let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
        let app_data = env("APPDATA");
        let local = env("LOCALAPPDATA");
        let program_data = env("PROGRAMDATA");
        let profile = env("USERPROFILE");
        let public = env("PUBLIC");
        let program_files: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| env(k)).collect();
        let start = |b: &Option<PathBuf>| b.as_ref().map(|p| p.join(r"Microsoft\Windows\Start Menu\Programs"));
        let start_menus: Vec<PathBuf> = [start(&app_data), start(&program_data)].into_iter().flatten().collect();
        let desktops: Vec<PathBuf> = [profile.as_ref().map(|p| p.join("Desktop")), public.as_ref().map(|p| p.join("Desktop"))].into_iter().flatten().collect();
        let mut protected: Vec<PathBuf> = [env("SystemRoot"), env("windir"), profile.clone(), public.clone(), local.as_ref().map(|l| l.join("Programs"))]
            .into_iter()
            .flatten()
            .collect();
        protected.extend(app_data.iter().cloned());
        protected.extend(local.iter().cloned());
        protected.extend(program_data.iter().cloned());
        protected.extend(program_files.iter().cloned());
        protected.extend(start_menus.iter().cloned());
        protected.extend(desktops.iter().cloned());
        Self { app_data, local_app_data: local, program_data, program_files, start_menus, desktops, protected }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Leftover {
    pub path: String,
    /// "install" (folder aplikasi), "data" (AppData/ProgramData), "shortcut".
    pub kind: &'static str,
}

/// Kunci pembanding nama: huruf kecil, tanpa tanda kurung, nomor versi, arsitektur, dan tanda baca.
/// "Audacity 3.7.5 (x64)" → "audacity", "Notepad++ (64-bit x64)" → "notepad++", "OBS-Studio" → "obsstudio".
pub fn name_key(s: &str) -> String {
    let mut t = String::new();
    let mut depth = 0;
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth = (depth - 1i32).max(0),
            _ if depth == 0 => t.push(c),
            _ => {}
        }
    }
    let t = t.to_lowercase().replace(".lnk", "");
    let words: Vec<String> = t
        .split(|c: char| c.is_whitespace() || c == '_' || c == '-')
        .filter(|w| !w.is_empty())
        .filter(|w| {
            let v = w.trim_start_matches('v');
            let is_version = !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.') && v.chars().any(|c| c.is_ascii_digit()) && (v.contains('.') || w.starts_with('v') || v.len() >= 4);
            let is_arch = ["x64", "x86", "64-bit", "32-bit", "64bit", "32bit", "amd64", "arm64", "win64", "win32"].contains(&w.as_ref());
            !is_version && !is_arch
        })
        .map(|w| w.to_string())
        .collect();
    words.concat().chars().filter(|c| c.is_alphanumeric() || *c == '+').collect()
}

fn same_or_inside(p: &Path, base: &Path) -> bool {
    let lp = p.to_string_lossy().to_lowercase();
    let lb = base.to_string_lossy().to_lowercase();
    lp == lb || lp.starts_with(&format!("{}{}", lb.trim_end_matches(['\\', '/']), std::path::MAIN_SEPARATOR))
        || lp.starts_with(&format!("{}\\", lb.trim_end_matches(['\\', '/'])))
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().trim_end_matches(['\\', '/']).eq_ignore_ascii_case(b.to_string_lossy().trim_end_matches(['\\', '/']))
}

/// Path terlarang: akar drive, folder induk penting, atau sesuatu di atasnya.
pub fn is_protected(p: &Path, bases: &Bases) -> bool {
    if p.parent().is_none() || p.components().count() < 2 {
        return true;
    }
    let s = p.to_string_lossy();
    if s.len() <= 3 {
        return true; // "C:\"
    }
    bases.protected.iter().any(|b| same_path(p, b) || same_or_inside(b, p))
}

fn entries(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default()
}

fn key_of(p: &Path) -> String {
    name_key(&p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())
}

/// Cari sisa aplikasi. `install_path` = lokasi yang diketahui (boleh kosong).
pub fn find_leftovers(name: &str, publisher: &str, install_path: &str, bases: &Bases) -> Vec<Leftover> {
    let key = name_key(name);
    let pkey = name_key(publisher);
    let mut out: Vec<Leftover> = Vec::new();
    let push = |path: PathBuf, kind: &'static str, out: &mut Vec<Leftover>| {
        if path.exists() && !is_protected(&path, bases) && !out.iter().any(|l| same_path(Path::new(&l.path), &path)) {
            out.push(Leftover { path: path.to_string_lossy().to_string(), kind });
        }
    };
    if !install_path.trim().is_empty() {
        // Folder install hanya bila namanya cocok dengan aplikasi (mencegah folder bersama seperti "Common Files").
        let p = PathBuf::from(install_path.trim());
        let k = key_of(&p);
        if k.len() >= 3 && key.len() >= 3 && (k.contains(&key) || key.contains(&k)) {
            push(p, "install", &mut out);
        }
    }
    if key.len() < 3 {
        return out; // nama terlalu pendek untuk dicocokkan dengan aman
    }

    // Folder bernama aplikasi (atau Penerbit\Aplikasi) di lokasi data dan Program Files.
    let mut data_bases: Vec<(&PathBuf, &'static str)> = Vec::new();
    for b in [&bases.app_data, &bases.local_app_data, &bases.program_data].into_iter().flatten() {
        data_bases.push((b, "data"));
    }
    let local_programs = bases.local_app_data.as_ref().map(|l| l.join("Programs"));
    if let Some(lp) = &local_programs {
        data_bases.push((lp, "install"));
    }
    for b in &bases.program_files {
        data_bases.push((b, "install"));
    }
    for (base, kind) in data_bases {
        for e in entries(base) {
            if !e.is_dir() {
                continue;
            }
            let k = key_of(&e);
            if k == key {
                push(e.clone(), kind, &mut out);
            } else if !pkey.is_empty() && pkey.len() >= 3 && k == pkey {
                for sub in entries(&e) {
                    if sub.is_dir() && key_of(&sub) == key {
                        push(sub, kind, &mut out);
                    }
                }
            }
        }
    }

    // Shortcut (.lnk) dan folder Start Menu bernama aplikasi.
    for base in bases.start_menus.iter().chain(bases.desktops.iter()) {
        let mut stack = vec![(base.clone(), 0)];
        while let Some((dir, depth)) = stack.pop() {
            for e in entries(&dir) {
                let k = key_of(&e);
                if e.is_dir() {
                    if k == key {
                        push(e.clone(), "shortcut", &mut out);
                    } else if depth < 1 {
                        stack.push((e, depth + 1));
                    }
                } else if e.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")) && k == key {
                    push(e, "shortcut", &mut out);
                }
            }
        }
    }
    out
}

/// Hapus path yang dipilih, dengan pemeriksaan ulang. Mengembalikan daftar yang gagal beserta alasannya.
pub fn delete_paths(paths: &[String], name: &str, publisher: &str, install_path: &str, bases: &Bases) -> Vec<(String, String)> {
    let allowed = find_leftovers(name, publisher, install_path, bases);
    let mut failed = Vec::new();
    for p in paths {
        let path = Path::new(p);
        if !allowed.iter().any(|l| same_path(Path::new(&l.path), path)) {
            failed.push((p.clone(), "bukan sisa aplikasi ini".to_string()));
            continue;
        }
        let r = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
        if let Err(e) = r {
            failed.push((p.clone(), e.to_string()));
        }
    }
    failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_keys_ignore_versions_and_arch() {
        assert_eq!(name_key("Audacity 3.7.5 (x64)"), "audacity");
        assert_eq!(name_key("Audacity"), "audacity");
        assert_eq!(name_key("Notepad++ (64-bit x64)"), "notepad++");
        assert_eq!(name_key("OBS-Studio"), name_key("OBS Studio"));
        assert_eq!(name_key("7-Zip 24.09 (x64)"), "7zip");
        assert_eq!(name_key("iPhone Link v1.2.0.lnk"), "iphonelink");
        assert_ne!(name_key("Audacity"), name_key("Audacity Nightly"));
        assert_eq!(name_key("Cinema 4D 2025"), "cinema4d", "tahun 4 digit dianggap versi");
    }

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("winsta-clean-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn finds_only_matching_leftovers_and_deletes_safely() {
        let root = tmp();
        let mk = |p: &str| {
            let p = root.join(p);
            fs::create_dir_all(&p).unwrap();
            p
        };
        let roaming = mk("Users/a/AppData/Roaming");
        let local = mk("Users/a/AppData/Local");
        let pdata = mk("ProgramData");
        let pf = mk("Program Files");
        let start = mk("Users/a/AppData/Roaming/Microsoft/Windows/Start Menu/Programs");
        let desktop = mk("Users/a/Desktop");
        let install = mk("Apps/Audacity");
        fs::write(install.join("Audacity.exe"), b"x").unwrap();
        mk("Users/a/AppData/Roaming/audacity");
        mk("Users/a/AppData/Local/Audacity Nightly"); // aplikasi lain: jangan disentuh
        mk("Users/a/AppData/Local/Programs/Audacity");
        mk("ProgramData/Muse Group/Audacity");
        mk("ProgramData/Muse Group/MuseScore");
        mk("Program Files/Audacity 3.7");
        fs::write(start.join("Audacity.lnk"), b"").unwrap();
        fs::write(start.join("Audacity Nightly.lnk"), b"").unwrap();
        mk("Users/a/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Audacity");
        fs::write(desktop.join("Audacity 3.7.5.lnk"), b"").unwrap();

        let bases = Bases {
            app_data: Some(roaming.clone()),
            local_app_data: Some(local.clone()),
            program_data: Some(pdata.clone()),
            program_files: vec![pf.clone()],
            start_menus: vec![start.clone()],
            desktops: vec![desktop.clone()],
            protected: vec![roaming.clone(), local.clone(), pdata.clone(), pf.clone(), start.clone(), desktop.clone(), root.join("Users/a"), local.join("Programs")],
        };
        let found = find_leftovers("Audacity", "Muse Group", &install.to_string_lossy(), &bases);
        let names: Vec<String> = found.iter().map(|l| l.path.replace(&root.to_string_lossy().to_string(), "")).collect();
        assert!(names.iter().any(|n| n.ends_with("Apps/Audacity")), "folder install: {names:?}");
        assert!(names.iter().any(|n| n.ends_with("Roaming/audacity")));
        assert!(names.iter().any(|n| n.ends_with("Local/Programs/Audacity")));
        assert!(names.iter().any(|n| n.ends_with("Muse Group/Audacity")));
        assert!(names.iter().any(|n| n.ends_with("Program Files/Audacity 3.7")));
        assert!(names.iter().any(|n| n.ends_with("Programs/Audacity.lnk")));
        assert!(names.iter().any(|n| n.ends_with("Desktop/Audacity 3.7.5.lnk")));
        assert!(!names.iter().any(|n| n.contains("Nightly") || n.contains("MuseScore")), "aplikasi lain tidak ikut: {names:?}");
        assert!(!names.iter().any(|n| n.ends_with("ProgramData/Muse Group")), "folder penerbit tidak dihapus");

        // Folder induk dan path asing ditolak walau dikirim.
        let mut req: Vec<String> = found.iter().map(|l| l.path.clone()).collect();
        req.push(roaming.to_string_lossy().to_string());
        req.push(root.join("Users/a/AppData/Local/Audacity Nightly").to_string_lossy().to_string());
        let failed = delete_paths(&req, "Audacity", "Muse Group", &install.to_string_lossy(), &bases);
        assert_eq!(failed.len(), 2, "{failed:?}");
        assert!(!install.exists() && !start.join("Audacity.lnk").exists() && !desktop.join("Audacity 3.7.5.lnk").exists());
        assert!(roaming.exists() && local.join("Audacity Nightly").exists() && start.join("Audacity Nightly.lnk").exists());
        assert!(pdata.join("Muse Group/MuseScore").exists());

        // Folder install yang namanya tidak cocok (folder bersama) tidak ditawarkan.
        let shared = root.join("Program Files/Common Files/Vendor");
        fs::create_dir_all(&shared).unwrap();
        assert!(find_leftovers("CPUID CPU-Z 2.15", "CPUID", &shared.to_string_lossy(), &bases).iter().all(|l| l.kind != "install"));
        let cpuz = root.join("Program Files/CPUID/CPU-Z");
        fs::create_dir_all(&cpuz).unwrap();
        assert!(find_leftovers("CPUID CPU-Z 2.15", "CPUID", &cpuz.to_string_lossy(), &bases).iter().any(|l| l.kind == "install"));

        // Akar drive dan folder terlindung.
        assert!(is_protected(Path::new("C:\\"), &bases) || is_protected(Path::new("/"), &bases));
        assert!(is_protected(&roaming, &bases));
        assert!(is_protected(&root.join("Users"), &bases), "folder di atas folder terlindung");
        let _ = fs::remove_dir_all(&root);
    }
}
