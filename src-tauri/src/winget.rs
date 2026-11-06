//! Lapisan tipis di atas winget CLI. Hanya memakai std, sehingga bisa diuji
//! tanpa Tauri: `rustc --edition 2021 --test src/winget.rs -o winget_test && ./winget_test`

use std::process::{Command, Stdio};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Package {
    pub name: String,
    pub id: String,
    pub version: String,
    pub available: String,
    pub source: String,
}

#[derive(Debug, Clone, Default)]
pub struct InstallOpts {
    pub id: String,
    pub version: Option<String>,
    pub location: Option<String>,
    /// "user" atau "machine"
    pub scope: Option<String>,
    pub interactive: bool,
    pub force: bool,
}

const COMMON: [&str; 2] = ["--accept-source-agreements", "--disable-interactivity"];
const NO_PACKAGE_FOUND: u32 = 0x8A15_0014;
const NO_APPLICABLE_UPDATE: u32 = 0x8A15_002B;
const NO_APPLICABLE_INSTALLER: u32 = 0x8A15_0010;

// ---------------------------------------------------------------------------
// Membersihkan output terminal (spinner, \r, \b, kode ANSI)
// ---------------------------------------------------------------------------

/// Simulasikan kursor terminal sehingga hasilnya sama dengan yang terlihat di layar.
pub fn render_line(text: &str) -> String {
    let mut buf: Vec<char> = Vec::new();
    let mut pos = 0usize;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\r' => pos = 0,
            '\u{8}' => pos = pos.saturating_sub(1),
            '\u{1b}' if chars.get(i + 1) == Some(&'[') => {
                let mut j = i + 2;
                while j < chars.len() && !chars[j].is_ascii_alphabetic() {
                    j += 1;
                }
                if j < chars.len() {
                    let arg: String = chars[i + 2..j].iter().collect();
                    match chars[j] {
                        'G' => pos = arg.parse::<usize>().unwrap_or(1).saturating_sub(1),
                        'K' if arg.is_empty() || arg == "0" => buf.truncate(pos),
                        'K' => {
                            let keep = pos.min(buf.len());
                            buf = vec![' '; keep];
                        }
                        _ => {}
                    }
                }
                i = j;
            }
            _ => {
                if pos < buf.len() {
                    buf[pos] = c;
                } else {
                    while buf.len() < pos {
                        buf.push(' ');
                    }
                    buf.push(c);
                }
                pos += 1;
            }
        }
        i += 1;
    }
    buf.into_iter().collect::<String>().trim_end().to_string()
}

fn lines_of(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes).split('\n').map(render_line).collect()
}

// ---------------------------------------------------------------------------
// Parsing tabel winget (kolom ditentukan dari posisi judul kolom)
// ---------------------------------------------------------------------------

fn char_width(c: char) -> usize {
    // Perkiraan lebar tampilan untuk karakter CJK/full-width.
    let u = c as u32;
    let wide = (0x1100..=0x115F).contains(&u)
        || (0x2E80..=0xA4CF).contains(&u)
        || (0xAC00..=0xD7A3).contains(&u)
        || (0xF900..=0xFAFF).contains(&u)
        || (0xFE30..=0xFE4F).contains(&u)
        || (0xFF00..=0xFF60).contains(&u)
        || (0xFFE0..=0xFFE6).contains(&u);
    if wide { 2 } else { 1 }
}

/// Potong baris berdasarkan kolom tampilan; kembalikan sel dan lebar total.
fn cells(line: &str, starts: &[usize]) -> (Vec<String>, usize) {
    let mut positions = Vec::new();
    let mut col = 0;
    for c in line.chars() {
        positions.push(col);
        col += char_width(c);
    }
    let chars: Vec<char> = line.chars().collect();
    let idx = |dcol: usize| positions.iter().position(|&p| p >= dcol).unwrap_or(chars.len());
    let mut bounds: Vec<usize> = starts.iter().map(|&s| idx(s)).collect();
    bounds.push(chars.len());
    let out = bounds
        .windows(2)
        .map(|w| chars[w[0]..w[1].max(w[0])].iter().collect::<String>().trim().to_string())
        .collect();
    (out, col)
}

pub fn parse_table(lines: &[String]) -> Vec<Package> {
    let sep = lines.iter().enumerate().position(|(i, l)| {
        let t = l.trim();
        i > 0 && t.len() >= 8 && t.chars().all(|c| c == '-')
    });
    let Some(sep) = sep else { return vec![] };
    let header = &lines[sep - 1];

    let mut starts = Vec::new();
    let mut names = Vec::new();
    let mut prev_space = true;
    let mut word = String::new();
    for (i, c) in header.chars().enumerate() {
        if c.is_whitespace() {
            if !word.is_empty() {
                names.push(word.to_lowercase());
                word.clear();
            }
            prev_space = true;
        } else {
            if prev_space {
                starts.push(i);
            }
            word.push(c);
            prev_space = false;
        }
    }
    if !word.is_empty() {
        names.push(word.to_lowercase());
    }
    if starts.len() < 3 {
        return vec![];
    }
    if !names.iter().any(|n| n == "id") {
        // winget berbahasa lain: pakai urutan kolom.
        let mut n = vec!["name".to_string(), "id".into(), "version".into()];
        while n.len() + 1 < starts.len() {
            n.push("available".into());
        }
        n.push("source".into());
        names = n;
    }

    // Baris yang tidak cocok dilewati, BUKAN menghentikan pembacaan: satu baris aneh
    // (mis. ID ARP berisi spasi) tidak boleh membuat sisa daftar hilang.
    let mut out = Vec::new();
    for line in &lines[sep + 1..] {
        let t = line.trim();
        if t.is_empty() || t.chars().all(|c| c == '-') {
            continue;
        }
        let (c, width) = cells(line, &starts);
        if width < starts[2] {
            continue; // footer pendek, mis. "3 upgrades available."
        }
        let id = c.get(1).cloned().unwrap_or_default();
        if id.is_empty() || id.eq_ignore_ascii_case("id") {
            continue; // header tabel kedua
        }
        let system_id = id.starts_with("ARP\\") || id.starts_with("MSIX\\");
        if id.contains(' ') && !system_id {
            continue; // kalimat penjelasan, mis. "The following packages have an upgrade..."
        }
        let get = |k: &str| names.iter().position(|n| n == k).and_then(|i| c.get(i).cloned()).unwrap_or_default();
        out.push(Package {
            name: get("name"),
            id,
            version: get("version"),
            available: get("available"),
            source: get("source"),
        });
    }
    out
}

/// ID yang terpotong winget diakhiri "…".
pub fn is_truncated(id: &str) -> bool {
    id.ends_with('…')
}

fn id_matches(row_id: &str, full: &str) -> bool {
    if is_truncated(row_id) {
        let prefix = row_id.trim_end_matches('…');
        !prefix.is_empty() && full.to_lowercase().starts_with(&prefix.to_lowercase())
    } else {
        row_id.eq_ignore_ascii_case(full)
    }
}

/// Isi `winget export`: paket terpasang yang dikenal sumber winget/msstore, dengan ID lengkap.
pub fn parse_export(text: &str) -> Vec<Package> {
    let Some(root) = json::parse(text) else { return vec![] };
    let mut out = Vec::new();
    for src in root.get("Sources").map(json::V::as_arr).unwrap_or(&[]) {
        let source = src.get("SourceDetails").and_then(|d| d.get("Name")).and_then(json::V::as_str).unwrap_or("winget");
        for p in src.get("Packages").map(json::V::as_arr).unwrap_or(&[]) {
            if let Some(id) = p.get("PackageIdentifier").and_then(json::V::as_str) {
                out.push(Package {
                    id: id.to_string(),
                    version: p.get("Version").and_then(json::V::as_str).unwrap_or("").to_string(),
                    source: source.to_string(),
                    ..Default::default()
                });
            }
        }
    }
    out
}

/// Gabungkan tabel `winget list` (nama, mungkin terpotong) dengan `winget export` (ID lengkap).
pub fn merge_list(rows: Vec<Package>, exported: &[Package]) -> Vec<Package> {
    let mut used = vec![false; rows.len()];
    let mut out = Vec::new();
    for e in exported {
        let idx = (0..rows.len()).find(|&i| !used[i] && id_matches(&rows[i].id, &e.id));
        let (name, version, available) = match idx {
            Some(i) => {
                used[i] = true;
                (rows[i].name.clone(), rows[i].version.clone(), rows[i].available.clone())
            }
            None => (String::new(), String::new(), String::new()),
        };
        out.push(Package {
            name: if name.is_empty() { e.id.clone() } else { name },
            id: e.id.clone(),
            version: if e.version.is_empty() { version } else { e.version.clone() },
            available,
            source: e.source.clone(),
        });
    }
    for (i, r) in rows.into_iter().enumerate() {
        if !used[i] {
            // Tidak ada di export = tidak dikelola sumber mana pun.
            let source = if is_truncated(&r.id) { String::new() } else { r.source.clone() };
            out.push(Package { source, ..r });
        }
    }
    out
}

/// Ganti ID terpotong di daftar update dengan ID lengkap dari daftar terpasang.
pub fn resolve_ids(rows: Vec<Package>, full: &[Package]) -> Vec<Package> {
    rows.into_iter()
        .map(|mut r| {
            if is_truncated(&r.id) {
                if let Some(f) = full.iter().find(|f| id_matches(&r.id, &f.id)) {
                    r.id = f.id.clone();
                }
            }
            r
        })
        .collect()
}

/// Pembaca JSON kecil (std saja) untuk file `winget export`.
pub mod json {
    #[derive(Debug, Clone, PartialEq)]
    pub enum V {
        Null,
        Bool(bool),
        Num(f64),
        Str(String),
        Arr(Vec<V>),
        Obj(Vec<(String, V)>),
    }

    impl V {
        pub fn get(&self, key: &str) -> Option<&V> {
            match self {
                V::Obj(m) => m.iter().find(|(k, _)| k == key).map(|(_, v)| v),
                _ => None,
            }
        }
        pub fn as_str(&self) -> Option<&str> {
            match self {
                V::Str(s) => Some(s),
                _ => None,
            }
        }
        pub fn as_arr(&self) -> &[V] {
            match self {
                V::Arr(a) => a,
                _ => &[],
            }
        }
    }

    pub fn parse(text: &str) -> Option<V> {
        let b: Vec<char> = text.trim_start_matches('\u{feff}').chars().collect();
        let mut i = 0;
        value(&b, &mut i)
    }

    fn ws(b: &[char], i: &mut usize) {
        while *i < b.len() && b[*i].is_whitespace() {
            *i += 1;
        }
    }

    fn value(b: &[char], i: &mut usize) -> Option<V> {
        ws(b, i);
        match *b.get(*i)? {
            '{' => {
                *i += 1;
                let mut m = Vec::new();
                ws(b, i);
                if *b.get(*i)? == '}' {
                    *i += 1;
                    return Some(V::Obj(m));
                }
                loop {
                    let V::Str(k) = value(b, i)? else { return None };
                    ws(b, i);
                    if *b.get(*i)? != ':' {
                        return None;
                    }
                    *i += 1;
                    m.push((k, value(b, i)?));
                    ws(b, i);
                    match *b.get(*i)? {
                        ',' => *i += 1,
                        '}' => {
                            *i += 1;
                            return Some(V::Obj(m));
                        }
                        _ => return None,
                    }
                }
            }
            '[' => {
                *i += 1;
                let mut a = Vec::new();
                ws(b, i);
                if *b.get(*i)? == ']' {
                    *i += 1;
                    return Some(V::Arr(a));
                }
                loop {
                    a.push(value(b, i)?);
                    ws(b, i);
                    match *b.get(*i)? {
                        ',' => *i += 1,
                        ']' => {
                            *i += 1;
                            return Some(V::Arr(a));
                        }
                        _ => return None,
                    }
                }
            }
            '"' => {
                *i += 1;
                let mut s = String::new();
                loop {
                    let c = *b.get(*i)?;
                    *i += 1;
                    match c {
                        '"' => return Some(V::Str(s)),
                        '\\' => {
                            let e = *b.get(*i)?;
                            *i += 1;
                            match e {
                                'n' => s.push('\n'),
                                't' => s.push('\t'),
                                'r' => s.push('\r'),
                                'b' => s.push('\u{8}'),
                                'f' => s.push('\u{c}'),
                                'u' => {
                                    let hex: String = b.get(*i..*i + 4)?.iter().collect();
                                    *i += 4;
                                    let cp = u32::from_str_radix(&hex, 16).ok()?;
                                    s.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
                                }
                                other => s.push(other),
                            }
                        }
                        c => s.push(c),
                    }
                }
            }
            't' => {
                *i += 4;
                Some(V::Bool(true))
            }
            'f' => {
                *i += 5;
                Some(V::Bool(false))
            }
            'n' => {
                *i += 4;
                Some(V::Null)
            }
            _ => {
                let start = *i;
                while *i < b.len() && "+-0123456789.eE".contains(b[*i]) {
                    *i += 1;
                }
                let n: String = b[start..*i].iter().collect();
                n.parse().ok().map(V::Num)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Versi
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Part {
    Text(String),
    Num(u64),
}

pub fn version_key(v: &str) -> Vec<(u8, u64, String)> {
    let v = v.trim().trim_start_matches(|c: char| c == '<' || c == '>' || c == '=' || c.is_whitespace());
    let v = v.trim_start_matches(['v', 'V']);
    let mut key = Vec::new();
    let mut cur = String::new();
    let flush = |cur: &mut String, key: &mut Vec<(u8, u64, String)>| {
        if cur.is_empty() {
            return;
        }
        let p = if cur.chars().all(|c| c.is_ascii_digit()) {
            Part::Num(cur.parse().unwrap_or(0))
        } else {
            Part::Text(cur.to_lowercase())
        };
        key.push(match p {
            Part::Num(n) => (1, n, String::new()),
            Part::Text(t) => (0, 0, t),
        });
        cur.clear();
    };
    let mut last_digit: Option<bool> = None;
    for c in v.chars() {
        if c.is_ascii_alphanumeric() {
            let d = c.is_ascii_digit();
            if last_digit.is_some_and(|ld| ld != d) {
                flush(&mut cur, &mut key);
            }
            cur.push(c);
            last_digit = Some(d);
        } else {
            flush(&mut cur, &mut key);
            last_digit = None;
        }
    }
    flush(&mut cur, &mut key);
    key
}

/// Hingga `n` versi yang lebih lama dari versi terpasang, terbaru dulu.
pub fn rollback_candidates(versions: &[String], current: &str, n: usize) -> Vec<String> {
    let mut v: Vec<String> = versions.to_vec();
    v.sort_by_key(|x| std::cmp::Reverse(version_key(x)));
    v.dedup();
    let cur = version_key(current);
    if cur.is_empty() {
        return v.into_iter().skip(1).take(n).collect();
    }
    v.into_iter().filter(|x| version_key(x) < cur).take(n).collect()
}

// ---------------------------------------------------------------------------
// Menjalankan winget
// ---------------------------------------------------------------------------

fn command(args: &[&str]) -> Command {
    let mut cmd = Command::new("winget");
    cmd.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

fn explain(code: u32, lines: &[String]) -> String {
    let head = match code {
        NO_PACKAGE_FOUND => "Paket tidak ditemukan di sumber winget.".to_string(),
        NO_APPLICABLE_UPDATE => "Tidak ada update yang berlaku untuk paket ini.".to_string(),
        NO_APPLICABLE_INSTALLER => "Tidak ada installer yang cocok dengan pilihan ini (misalnya cakupan atau arsitektur). Coba lagi dengan cakupan Otomatis.".to_string(),
        _ => format!("winget gagal (kode 0x{code:08X})."),
    };
    let tail: Vec<&str> = lines.iter().map(|s| s.as_str()).filter(|s| !s.trim().is_empty()).collect();
    let start = tail.len().saturating_sub(12);
    if tail.is_empty() { head } else { format!("{head}\n\n{}", tail[start..].join("\n")) }
}

fn exit_code(status: std::process::ExitStatus) -> u32 {
    status.code().map(|c| c as u32).unwrap_or(1)
}

/// Perintah baca (search/list/show): kembalikan baris output.
fn query(args: &[&str]) -> Result<Vec<String>, String> {
    let out = command(args).output().map_err(not_found)?;
    let lines = lines_of(&out.stdout);
    let code = exit_code(out.status);
    if code != 0 && code != NO_PACKAGE_FOUND && code != NO_APPLICABLE_UPDATE {
        return Err(explain(code, &lines));
    }
    Ok(lines)
}

/// Pecah output menjadi segmen di `\n` dan `\r`, supaya bilah progres winget
/// (yang menimpa barisnya sendiri dengan `\r`) terkirim selagi berjalan.
/// Mengembalikan baris final (yang diakhiri `\n`) untuk pesan error.
pub fn stream_segments(reader: &mut dyn std::io::Read, on_line: &mut dyn FnMut(&str)) -> Vec<String> {
    let mut lines = Vec::new();
    let mut seg: Vec<u8> = Vec::new();
    let mut last = String::new();
    // Segmen terakhir yang ditutup `\r`. Pada akhir baris `\r\n` (Windows),
    // segmen inilah baris finalnya.
    let mut pending: Option<String> = None;
    let mut buf = [0u8; 4096];
    let mut flush = |seg: &mut Vec<u8>, newline: bool, lines: &mut Vec<String>, last: &mut String, pending: &mut Option<String>| {
        let line = render_line(&String::from_utf8_lossy(seg));
        seg.clear();
        if line.chars().all(|c| c.is_whitespace() || "-\\|/".contains(c)) {
            if newline {
                if let Some(p) = pending.take() {
                    lines.push(p);
                }
            }
            return;
        }
        if line != *last {
            on_line(&line);
            *last = line.clone();
        }
        if newline {
            pending.take();
            lines.push(line);
        } else {
            *pending = Some(line);
        }
    };
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &b in &buf[..n] {
            match b {
                b'\n' => flush(&mut seg, true, &mut lines, &mut last, &mut pending),
                b'\r' => flush(&mut seg, false, &mut lines, &mut last, &mut pending),
                _ => seg.push(b),
            }
        }
    }
    flush(&mut seg, true, &mut lines, &mut last, &mut pending);
    lines
}

/// Perintah yang mengubah sistem: `on_line` menerima output selagi berjalan.
fn execute(args: &[&str], on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    let mut child = command(args).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(not_found)?;
    let lines = match child.stdout.take() {
        Some(mut out) => stream_segments(&mut out, on_line),
        None => Vec::new(),
    };
    let status = child.wait().map_err(|e| e.to_string())?;
    match exit_code(status) {
        0 => Ok(()),
        code => Err(explain(code, &lines)),
    }
}

/// Ganti %VARIABEL% dengan nilainya, mis. %LOCALAPPDATA%\Winsta\apps.
pub fn expand_env(p: &str) -> String {
    let mut out = String::new();
    let mut rest = p;
    while let Some(s) = rest.find('%') {
        out.push_str(&rest[..s]);
        let after = &rest[s + 1..];
        match after.find('%') {
            Some(e) => {
                let name = &after[..e];
                match std::env::var(name) {
                    Ok(v) if !name.is_empty() => out.push_str(&v),
                    _ => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[e + 1..];
            }
            None => {
                out.push_str(&rest[s..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn not_found(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        "winget tidak ditemukan. Install atau update 'App Installer' dari Microsoft Store.".into()
    } else {
        e.to_string()
    }
}

fn with_common<'a>(mut a: Vec<&'a str>) -> Vec<&'a str> {
    a.extend(COMMON);
    a
}

pub fn version() -> Result<String, String> {
    Ok(query(&["--version"])?.into_iter().find(|l| !l.trim().is_empty()).unwrap_or_default().trim().to_string())
}

pub fn search(q: &str) -> Result<Vec<Package>, String> {
    Ok(parse_table(&query(&with_common(vec!["search", "--query", q, "--source", "winget"]))?))
}

pub fn list_installed() -> Result<Vec<Package>, String> {
    Ok(parse_table(&query(&with_common(vec!["list"]))?))
}

pub fn list_upgrades() -> Result<Vec<Package>, String> {
    Ok(parse_table(&query(&with_common(vec!["upgrade"]))?))
}

/// Paket terpasang yang dikenal sumber winget/msstore, lewat `winget export` (ID tidak terpotong).
pub fn export_installed() -> Result<Vec<Package>, String> {
    let path = std::env::temp_dir().join(format!("winsta-export-{}.json", std::process::id()));
    let file = path.to_string_lossy().to_string();
    // export bisa selesai dengan kode bukan nol bila ada paket yang tak bisa diekspor; yang penting filenya.
    let _ = command(&with_common(vec!["export", "--output", &file, "--include-versions"])).output().map_err(not_found)?;
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Hasil winget export tidak terbaca: {e}"))?;
    let _ = std::fs::remove_file(&path);
    Ok(parse_export(&text))
}

/// Daftar lengkap tanpa modul PowerShell: tabel `winget list` + ID lengkap dari `winget export`.
pub fn list_installed_cli() -> Result<Vec<Package>, String> {
    let rows = list_installed()?;
    match export_installed() {
        Ok(exported) if !exported.is_empty() => Ok(merge_list(rows, &exported)),
        _ => Ok(rows),
    }
}

/// Daftar update tanpa modul PowerShell, dengan ID terpotong dipulihkan.
pub fn list_upgrades_cli() -> Result<Vec<Package>, String> {
    let rows = list_upgrades()?;
    if rows.iter().any(|r| is_truncated(&r.id)) {
        if let Ok(full) = export_installed() {
            return Ok(resolve_ids(rows, &full));
        }
    }
    Ok(rows)
}

pub fn versions(id: &str) -> Result<Vec<String>, String> {
    let lines = query(&with_common(vec!["show", "--id", id, "--exact", "--versions"]))?;
    let sep = lines.iter().position(|l| {
        let t = l.trim();
        t.len() >= 3 && t.chars().all(|c| c == '-')
    });
    Ok(match sep {
        Some(s) => lines[s + 1..].iter().map(|l| l.trim().to_string()).filter(|l| !l.is_empty() && !l.contains(' ')).collect(),
        None => vec![],
    })
}

pub fn install(o: &InstallOpts, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    let location = o.location.as_deref().map(expand_env);
    // ID terpotong dari hasil cari CLI: cocokkan sebagai awalan, tanpa --exact.
    let id = o.id.trim_end_matches('…');
    let mut a = with_common(vec!["install", "--id", id, "--source", "winget", "--accept-package-agreements"]);
    if !is_truncated(&o.id) {
        a.push("--exact");
    }
    if let Some(v) = &o.version { a.extend(["--version", v]); }
    if let Some(l) = &location { a.extend(["--location", l]); }
    if let Some(s) = &o.scope { a.extend(["--scope", s]); }
    a.push(if o.interactive { "--interactive" } else { "--silent" });
    if o.force { a.push("--force"); }
    execute(&a, on_line)
}

pub fn upgrade(id: &str, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    execute(&with_common(vec!["upgrade", "--id", id, "--exact", "--silent", "--accept-package-agreements"]), on_line)
}

/// Uninstall aplikasi yang hanya tercatat di Windows (mis. dipasang dari GitHub), berdasarkan nama tampilannya.
pub fn uninstall_by_name(name: &str, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    execute(&with_common(vec!["uninstall", "--name", name, "--exact", "--silent"]), on_line)
}

/// `interactive` = tampilkan jendela uninstaller (untuk aplikasi yang tidak terhapus lewat mode senyap).
pub fn uninstall(id: &str, interactive: bool, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    let mode = if interactive { "--interactive" } else { "--silent" };
    execute(&with_common(vec!["uninstall", "--id", id, "--exact", mode]), on_line)
}

/// Simpan installer versi tertentu ke folder arsip (dipakai sebelum update).
pub fn download(id: &str, version: &str, dir: &str, on_line: &mut dyn FnMut(&str)) -> Result<(), String> {
    let dir = expand_env(dir);
    execute(
        &with_common(vec!["download", "--id", id, "--exact", "--version", version, "--download-directory", &dir, "--accept-package-agreements"]),
        on_line,
    )
}

pub fn pin_add(id: &str) -> Result<(), String> {
    execute(&["pin", "add", "--id", id, "--exact", "--force", "--accept-source-agreements"], &mut |_| {})
}

pub fn pin_remove(id: &str) -> Result<(), String> {
    // Gagal berarti memang belum di-pin.
    let _ = execute(&["pin", "remove", "--id", id, "--exact", "--accept-source-agreements"], &mut |_| {});
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(s: &str) -> Vec<String> {
        s.split('\n').map(render_line).collect()
    }

    #[test]
    fn parses_upgrade_table_with_spinner_cjk_and_footer() {
        let raw = "   - \r   \\ \r\x1b[0G\x1b[2KName                 Id                         Version   Available Source\r\n\
---------------------------------------------------------------------------\r\n\
Visual Studio Code   Microsoft.VisualStudioCode 1.94.0    1.95.1    winget\r\n\
\u{5fae}\u{4fe1} WeChat          Tencent.WeChat             3.9.0     3.9.12    winget\r\n\
7-Zip 23.01 (x64)    7zip.7zip                  23.01     24.08     winget\r\n\
3 upgrades available.\r\n";
        let p = parse_table(&lines(raw));
        assert_eq!(p.len(), 3);
        assert_eq!(p[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(p[0].available, "1.95.1");
        assert_eq!(p[1].id, "Tencent.WeChat");
        assert_eq!(p[1].version, "3.9.0");
        assert_eq!(p[2].name, "7-Zip 23.01 (x64)");
        assert_eq!(p[2].source, "winget");
    }

    #[test]
    fn does_not_stop_at_odd_rows_and_keeps_arp_rows() {
        // Kolom dihitung dari 50 baris pertama, jadi nama dan ID bisa terpotong "…".
        let raw = "Name                       Id                               Version     Available Source\r\n\
--------------------------------------------------------------------------------------------\r\n\
7-Zip 24.08 (x64)          7zip.7zip                        24.08       25.01     winget\r\n\
Mozilla Firefox (x64 en-US ARP\\Machine\\X64\\Mozilla Firefox 1 145.0.1\r\n\
Blender                    BlenderFoundation.Blender        4.5.4                 winget\r\n\
TheDocumentFoundation Lib… TheDocumentFoundation.LibreOffi… 25.8.3                winget\r\n\
VLC media player           VideoLAN.VLC                     3.0.21      3.0.22    winget\r\n\
The following packages have an upgrade available, but require explicit targeting for upgrade:\r\n\
Name                       Id                               Version     Available Source\r\n\
--------------------------------------------------------------------------------------------\r\n\
OBS Studio                 OBSProject.OBSStudio             31.0.0      32.0.2    winget\r\n\
2 upgrades available.\r\n";
        let p = parse_table(&lines(raw));
        let ids: Vec<&str> = p.iter().map(|x| x.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "7zip.7zip",
                "ARP\\Machine\\X64\\Mozilla Firefox 1",
                "BlenderFoundation.Blender",
                "TheDocumentFoundation.LibreOffi…",
                "VideoLAN.VLC",
                "OBSProject.OBSStudio",
            ]
        );
        assert_eq!(p[1].source, "");
    }

    #[test]
    fn export_restores_full_ids() {
        let export = "\u{feff}{\"$schema\":\"https://aka.ms/winget-packages.schema.2.0.json\",\"Sources\":[{\"Packages\":[\
{\"PackageIdentifier\":\"TheDocumentFoundation.LibreOffice\",\"Version\":\"25.8.3\"},\
{\"PackageIdentifier\":\"BlenderFoundation.Blender\",\"Version\":\"4.5.4\"},\
{\"PackageIdentifier\":\"Audacity.Audacity\",\"Version\":\"3.7.5\"}],\
\"SourceDetails\":{\"Argument\":\"https://cdn.winget.microsoft.com/cache\",\"Identifier\":\"Microsoft.Winget.Source_8wekyb3d8bbwe\",\"Name\":\"winget\",\"Type\":\"Microsoft.PreIndexed.Package\"}}],\
\"WinGetVersion\":\"1.12.440\"}";
        let exported = parse_export(export);
        assert_eq!(exported.len(), 3);
        let rows = vec![
            Package { name: "TheDocumentFoundation Lib…".into(), id: "TheDocumentFoundation.LibreOffi…".into(), version: "25.8.3".into(), source: "winget".into(), ..Default::default() },
            Package { name: "Blender".into(), id: "BlenderFoundation.Blender".into(), version: "4.5.4".into(), source: "winget".into(), ..Default::default() },
            Package { name: "NVIDIA Graphics Driver".into(), id: "ARP\\Machine\\X64\\{B2FE}_Display.Driver".into(), version: "581.57".into(), ..Default::default() },
        ];
        let merged = merge_list(rows, &exported);
        let lo = merged.iter().find(|p| p.id == "TheDocumentFoundation.LibreOffice").unwrap();
        assert_eq!(lo.source, "winget");
        // Audacity tidak ada di tabel list (mis. terlewat), tapi tetap muncul dari export.
        assert!(merged.iter().any(|p| p.id == "Audacity.Audacity" && p.source == "winget"));
        assert!(merged.iter().any(|p| p.id.starts_with("ARP\\") && p.source.is_empty()));
        assert_eq!(merged.len(), 4);

        let ups = resolve_ids(vec![Package { id: "TheDocumentFoundation.LibreOffi…".into(), ..Default::default() }], &exported);
        assert_eq!(ups[0].id, "TheDocumentFoundation.LibreOffice");
    }

    #[test]
    fn picks_five_older_versions() {
        let v: Vec<String> = ["1.95.1", "1.95.0", "1.94.2", "1.94.0", "1.93.1", "1.93.0", "1.92.2"].iter().map(|s| s.to_string()).collect();
        assert_eq!(rollback_candidates(&v, "1.95.1", 5), vec!["1.95.0", "1.94.2", "1.94.0", "1.93.1", "1.93.0"]);
        assert_eq!(rollback_candidates(&v, "< 1.94.0", 5), vec!["1.93.1", "1.93.0", "1.92.2"]);
        assert!(version_key("1.10.0") > version_key("1.9.9"));
    }

    #[test]
    fn streams_progress_segments_live() {
        let raw = b"Found Audacity [Audacity.Audacity] Version 3.7.5\r\nDownloading https://example/audacity.exe\r\n  \xe2\x96\x88\xe2\x96\x88  10.0 MB / 40.0 MB\r  \xe2\x96\x88\xe2\x96\x88\xe2\x96\x88\xe2\x96\x88  40.0 MB / 40.0 MB\r\nSuccessfully verified installer hash\r\n-\r\\\r|\rSuccessfully installed\r\n";
        let mut seen = Vec::new();
        let finals = stream_segments(&mut &raw[..], &mut |l| seen.push(l.to_string()));
        assert!(seen.iter().any(|l| l.contains("10.0 MB / 40.0 MB")), "progress sementara terkirim: {seen:?}");
        assert!(seen.iter().any(|l| l.contains("40.0 MB / 40.0 MB")));
        assert!(!seen.iter().any(|l| l == "-" || l == "|"), "spinner tidak dikirim");
        assert_eq!(finals.last().map(String::as_str), Some("Successfully installed"));
    }

    #[test]
    fn expands_env_vars() {
        std::env::set_var("WINSTA_TEST_DIR", r"C:\Users\kamu\AppData\Local");
        assert_eq!(expand_env(r"%WINSTA_TEST_DIR%\Winsta\apps"), r"C:\Users\kamu\AppData\Local\Winsta\apps");
        assert_eq!(expand_env(r"D:\Apps\%NOPE_UNSET_X%\a"), r"D:\Apps\%NOPE_UNSET_X%\a");
        assert_eq!(expand_env("100% siap"), "100% siap");
    }

    #[test]
    fn renders_backspace_and_cursor() {
        assert_eq!(render_line("abc\u{8}\u{8}XY"), "aXY");
        assert_eq!(render_line("progress 10%\rdone"), "doneress 10%");
    }
}
