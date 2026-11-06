//! Info sistem Windows lewat PowerShell: drive dan lokasi install aplikasi.
//! Hanya std, output PowerShell berformat tab, sehingga parser bisa diuji di mana saja:
//! `rustc --edition 2021 --test src/system.rs -o system_test && ./system_test`

use std::process::{Command, Stdio};

#[derive(Debug, Clone, PartialEq)]
pub struct Drive {
    pub id: String,
    pub label: String,
    pub free_gb: f64,
    pub total_gb: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InstallLocation {
    pub name: String,
    pub path: String,
}

const DRIVES_PS: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2 or DriveType=3" | ForEach-Object { "$($_.DeviceID)`t$($_.VolumeName)`t$($_.FreeSpace)`t$($_.Size)" }"#;

const LOCATIONS_PS: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; $p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'; Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { "$($_.DisplayName)`t$($_.InstallLocation)`t$($_.DisplayIcon)`t$($_.UninstallString)" }"#;

fn powershell(script: &str) -> Result<String, String> {
    powershell_env(script, &[])
}

fn powershell_env(script: &str, env: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    for (k, v) in env {
        cmd.env(k, v);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| format!("PowerShell tidak bisa dijalankan: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub fn parse_drives(text: &str) -> Vec<Drive> {
    let gb = |s: &str| s.trim().parse::<f64>().map(|b| b / 1_073_741_824.0).ok();
    text.lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.trim_end_matches('\r').split('\t').collect();
            if f.len() < 4 {
                return None;
            }
            let id = f[0].trim().trim_end_matches(':').to_string();
            let total = gb(f[3])?;
            if id.is_empty() || total <= 0.0 {
                return None;
            }
            let name = f[1].trim();
            let label = if name.is_empty() { format!("{id}:") } else { format!("{id}: {name}") };
            Some(Drive { id, label, free_gb: gb(f[2]).unwrap_or(0.0), total_gb: total })
        })
        .collect()
}

fn clean_path(p: &str) -> String {
    p.trim().trim_matches('"').trim().trim_end_matches('\\').to_string()
}

/// Path di folder sistem (cache installer, Windows) bukan folder aplikasi.
fn is_system_path(p: &str) -> bool {
    let l = p.to_lowercase();
    l.contains("\\windows\\") || l.contains("\\installer\\") || l.contains("package cache") || l.contains("\\system32")
        || l.starts_with("%systemroot%") || l.starts_with("%windir%")
}

/// Ambil path .exe dari string perintah: `"C:\a b\x.exe" /S` atau `C:\x\unins000.exe /x`.
fn exe_of_command(cmd: &str) -> Option<String> {
    let c = cmd.trim();
    if let Some(rest) = c.strip_prefix('"') {
        return rest.split('"').next().map(|s| s.to_string());
    }
    let l = c.to_lowercase();
    l.find(".exe").map(|i| c[..i + 4].to_string())
}

fn parent_dir(p: &str) -> Option<String> {
    let i = p.rfind('\\')?;
    if i <= 2 {
        return None;
    }
    // Naik dari subfolder biner umum: ...\OBS Studio\bin\64bit → ...\OBS Studio
    let mut d = p[..i].to_string();
    while let Some(j) = d.rfind('\\') {
        let last = d[j + 1..].to_lowercase();
        if j > 2 && ["bin", "64bit", "32bit", "x64", "x86", "app"].contains(&last.as_str()) {
            d.truncate(j);
        } else {
            break;
        }
    }
    Some(d)
}

/// Lokasi aplikasi: InstallLocation, lalu folder ikonnya, lalu folder uninstaller-nya.
pub fn derive_location(install: &str, icon: &str, uninstall: &str) -> Option<String> {
    let install = clean_path(install);
    if !install.is_empty() && !is_system_path(&install) {
        return Some(install);
    }
    // DisplayIcon: "C:\Program Files\7-Zip\7zFM.exe,0"
    let icon = clean_path(icon.rsplit_once(',').filter(|(_, n)| n.trim().parse::<i32>().is_ok()).map(|(p, _)| p).unwrap_or(icon));
    let icon_l = icon.to_lowercase();
    if [".exe", ".ico", ".dll"].iter().any(|e| icon_l.ends_with(e)) && !is_system_path(&icon) {
        if let Some(d) = parent_dir(&icon) {
            return Some(d);
        }
    }
    let u = uninstall.to_lowercase();
    if !u.contains("msiexec") && !u.contains("rundll32") {
        if let Some(exe) = exe_of_command(uninstall).map(|e| clean_path(&e)) {
            if !is_system_path(&exe) {
                return parent_dir(&exe);
            }
        }
    }
    None
}

pub fn parse_locations(text: &str) -> Vec<InstallLocation> {
    let mut out: Vec<InstallLocation> = text
        .lines()
        .filter_map(|l| {
            let mut f = l.trim_end_matches('\r').split('\t');
            let name = f.next()?.trim().to_string();
            let install = f.next().unwrap_or("");
            let icon = f.next().unwrap_or("");
            let uninstall = f.next().unwrap_or("");
            let path = derive_location(install, icon, uninstall)?;
            (!name.is_empty()).then_some(InstallLocation { name, path })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out.dedup_by(|a, b| a.name == b.name);
    out
}

const ENTRIES_PS: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; $p='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'; Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object { "$($_.DisplayName)`t$($_.DisplayVersion)`t$($_.InstallLocation)" }"#;

/// Semua aplikasi yang tercatat di Windows: (nama, versi, lokasi).
#[derive(Debug, Clone, PartialEq)]
pub struct UninstallEntry {
    pub name: String,
    pub version: String,
    pub location: String,
}

pub fn parse_entries(text: &str) -> Vec<UninstallEntry> {
    text.lines()
        .filter_map(|l| {
            let mut f = l.trim_end_matches('\r').split('\t');
            let name = f.next()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let version = f.next().unwrap_or("").trim().to_string();
            let location = f.next().unwrap_or("").trim().trim_matches('"').trim_end_matches('\\').to_string();
            Some(UninstallEntry { name, version, location })
        })
        .collect()
}

pub fn uninstall_entries() -> Vec<UninstallEntry> {
    powershell(ENTRIES_PS).map(|t| parse_entries(&t)).unwrap_or_default()
}

pub fn drives() -> Result<Vec<Drive>, String> {
    Ok(parse_drives(&powershell(DRIVES_PS)?))
}

pub fn install_locations() -> Result<Vec<InstallLocation>, String> {
    Ok(parse_locations(&powershell(LOCATIONS_PS)?))
}

// ---------------------------------------------------------------------------
// Modul resmi Microsoft.WinGet.Client: data lengkap tanpa kolom terpotong.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ModulePackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub available: String,
    pub source: String,
}

const MODULE_HEAD: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; try { Import-Module Microsoft.WinGet.Client -ErrorAction Stop } catch { "ERR`t$($_.Exception.Message)"; exit 0 }; "#;

const MODULE_LIST: &str = r#"try { Get-WinGetPackage -ErrorAction Stop | ForEach-Object { $a = ''; if ($_.IsUpdateAvailable) { $a = @($_.AvailableVersions)[0] }; "PKG`t$($_.Id)`t$($_.Name)`t$($_.InstalledVersion)`t$a`t$($_.Source)" } } catch { "ERR`t$($_.Exception.Message)" }"#;

const MODULE_SEARCH: &str = r#"try { Find-WinGetPackage -Query $env:WINSTA_QUERY -Source winget -Count 60 -ErrorAction Stop | ForEach-Object { "PKG`t$($_.Id)`t$($_.Name)`t$($_.Version)`t`t$($_.Source)" } } catch { "ERR`t$($_.Exception.Message)" }"#;

const MODULE_CHECK: &str = r#"if (Get-Module -ListAvailable -Name Microsoft.WinGet.Client) { 'yes' } else { 'no' }"#;

const MODULE_INSTALL: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; if (-not (Get-PackageProvider -ListAvailable -Name NuGet -ErrorAction SilentlyContinue)) { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force | Out-Null }; Install-Module -Name Microsoft.WinGet.Client -Repository PSGallery -Scope CurrentUser -Force; Import-Module Microsoft.WinGet.Client; 'OK' } catch { "ERR`t$($_.Exception.Message)" }"#;

/// Baca output berformat `PKG<tab>id<tab>name<tab>versi<tab>tersedia<tab>sumber`.
pub fn parse_module_output(text: &str) -> Result<Vec<ModulePackage>, String> {
    let mut out = Vec::new();
    for line in text.lines().map(|l| l.trim_end_matches('\r')) {
        if let Some(err) = line.strip_prefix("ERR\t") {
            return Err(format!("Microsoft.WinGet.Client: {}", err.trim()));
        }
        let Some(rest) = line.strip_prefix("PKG\t") else { continue };
        let f: Vec<&str> = rest.split('\t').collect();
        let get = |i: usize| f.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
        let id = get(0);
        if id.is_empty() {
            continue;
        }
        out.push(ModulePackage { id, name: get(1), version: get(2), available: get(3), source: get(4) });
    }
    Ok(out)
}

use std::sync::atomic::{AtomicU8, Ordering};
/// 0 = belum dicek, 1 = modul ada, 2 = tidak ada.
static MODULE_STATE: AtomicU8 = AtomicU8::new(0);

pub fn module_ready() -> bool {
    match MODULE_STATE.load(Ordering::Relaxed) {
        1 => true,
        2 => false,
        _ => {
            let ok = powershell(MODULE_CHECK).map(|s| s.trim() == "yes").unwrap_or(false);
            MODULE_STATE.store(if ok { 1 } else { 2 }, Ordering::Relaxed);
            ok
        }
    }
}

/// Pasang modul untuk pengguna ini saja (tanpa admin) dari PowerShell Gallery.
pub fn install_module() -> Result<(), String> {
    let out = powershell(MODULE_INSTALL)?;
    if let Some(err) = out.lines().find_map(|l| l.strip_prefix("ERR\t")) {
        return Err(format!("Modul tidak bisa dipasang: {}", err.trim()));
    }
    if !out.lines().any(|l| l.trim() == "OK") {
        return Err("Modul tidak bisa dipasang. Periksa koneksi internet, lalu coba lagi.".into());
    }
    MODULE_STATE.store(1, Ordering::Relaxed);
    Ok(())
}

pub fn module_list() -> Result<Vec<ModulePackage>, String> {
    parse_module_output(&powershell(&format!("{MODULE_HEAD}{MODULE_LIST}"))?)
}

pub fn module_search(query: &str) -> Result<Vec<ModulePackage>, String> {
    // Kata kunci lewat variabel lingkungan, jadi tidak pernah ditafsirkan sebagai kode PowerShell.
    parse_module_output(&powershell_env(&format!("{MODULE_HEAD}{MODULE_SEARCH}"), &[("WINSTA_QUERY", query)])?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_uninstall_entries() {
        let e = parse_entries("Flow Launcher\t2.0.1\tC:\\Users\\a\\AppData\\Local\\FlowLauncher\\\r\nNo Version\t\t\r\n\t1.0\tX\r\n");
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].location, "C:\\Users\\a\\AppData\\Local\\FlowLauncher");
        assert_eq!(e[1], UninstallEntry { name: "No Version".into(), version: "".into(), location: "".into() });
    }

    #[test]
    fn parses_module_output() {
        let t = "PKG\tBlenderFoundation.Blender\tBlender\t4.5.3\t4.5.4\twinget\r\n\
PKG\tARP\\Machine\\X64\\Steam App 12345\tSome Game\t1.0\t\t\r\n\
WARNING: noise\r\n\
PKG\tTheDocumentFoundation.LibreOffice\tLibreOffice 25.8.3.2\t25.8.3.2\t\twinget\r\n";
        let p = parse_module_output(t).unwrap();
        assert_eq!(p.len(), 3);
        assert_eq!(p[0], ModulePackage { id: "BlenderFoundation.Blender".into(), name: "Blender".into(), version: "4.5.3".into(), available: "4.5.4".into(), source: "winget".into() });
        assert_eq!(p[1].source, "");
        assert_eq!(p[2].id, "TheDocumentFoundation.LibreOffice");
        assert!(parse_module_output("ERR\tThe term 'Get-WinGetPackage' is not recognized\r\n").is_err());
    }

    #[test]
    fn parses_drive_lines() {
        let t = "C:\tWindows\t51756539904\t511101108224\r\nD:\t\t335544320000\t1000202039296\r\nE:\tUSB\t\t\r\n";
        let d = parse_drives(t);
        assert_eq!(d.len(), 2, "drive tanpa ukuran (kartu kosong) dilewati");
        assert_eq!(d[0].label, "C: Windows");
        assert_eq!(d[1].label, "D:");
        assert!((d[0].free_gb - 48.2).abs() < 0.1);
    }

    #[test]
    fn parses_locations_and_cleans_paths() {
        let t = "Audacity 3.7.5\tC:\\Program Files\\Audacity\\\t\t\r\nNotepad++ (64-bit x64)\t\"C:\\Program Files\\Notepad++\"\t\t\r\nBroken\t\t\t\r\nAudacity 3.7.5\tC:\\Program Files\\Audacity\t\t\r\n";
        let l = parse_locations(t);
        assert_eq!(l.len(), 2);
        assert_eq!(l[0], InstallLocation { name: "Audacity 3.7.5".into(), path: "C:\\Program Files\\Audacity".into() });
        assert_eq!(l[1].path, "C:\\Program Files\\Notepad++");
    }

    #[test]
    fn derives_location_from_icon_or_uninstaller() {
        // Tanpa InstallLocation: ambil dari ikon.
        assert_eq!(derive_location("", "C:\\Program Files\\7-Zip\\7zFM.exe,0", "").as_deref(), Some("C:\\Program Files\\7-Zip"));
        assert_eq!(derive_location("", "\"C:\\Program Files\\OBS Studio\\bin\\64bit\\obs64.exe\"", "").as_deref(), Some("C:\\Program Files\\OBS Studio"));
        // Ikon di cache installer Windows diabaikan; pakai folder uninstaller.
        assert_eq!(
            derive_location("", "C:\\Windows\\Installer\\{GUID}\\icon.exe", "\"F:\\Apps\\iPhone Link\\Uninstall iPhone Link.exe\" /currentuser").as_deref(),
            Some("F:\\Apps\\iPhone Link")
        );
        assert_eq!(derive_location("", "", "C:\\Games\\Foo\\unins000.exe /SILENT").as_deref(), Some("C:\\Games\\Foo"));
        // MSI tanpa petunjuk lain: tidak diketahui.
        assert_eq!(derive_location("", "", "MsiExec.exe /X{1234}"), None);
        assert_eq!(derive_location("", "", "C:\\ProgramData\\Package Cache\\{x}\\setup.exe /uninstall"), None);
    }
}
