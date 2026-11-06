mod cleanup;
mod github;
mod system;
mod winget;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageDto {
    name: String,
    id: String,
    version: String,
    available: String,
    source: String,
}

impl From<winget::Package> for PackageDto {
    fn from(p: winget::Package) -> Self {
        Self { name: p.name, id: p.id, version: p.version, available: p.available, source: p.source }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallArgs {
    id: String,
    version: Option<String>,
    location: Option<String>,
    scope: Option<String>,
    #[serde(default)]
    interactive: bool,
    #[serde(default)]
    force: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    task_id: String,
    line: String,
}

/// Jalankan pekerjaan winget di thread terpisah agar UI tidak membeku.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

fn emitter(app: AppHandle, task_id: String) -> impl FnMut(&str) {
    move |line: &str| {
        let _ = app.emit("winget://log", LogLine { task_id: task_id.clone(), line: line.to_string() });
    }
}

fn packages(v: Vec<winget::Package>) -> Vec<PackageDto> {
    v.into_iter().map(Into::into).collect()
}

#[tauri::command]
async fn winget_version() -> Result<String, String> {
    blocking(winget::version).await
}

fn from_module(v: Vec<system::ModulePackage>) -> Vec<PackageDto> {
    v.into_iter()
        .map(|p| PackageDto { name: p.name, id: p.id, version: p.version, available: p.available, source: p.source })
        .collect()
}

// Daftar, update, dan pencarian memakai modul resmi Microsoft.WinGet.Client bila terpasang
// (data lengkap). Tanpa modul, Winsta membaca output CLI dan memulihkan ID dari `winget export`.

#[tauri::command]
async fn winget_search(query: String) -> Result<Vec<PackageDto>, String> {
    blocking(move || {
        if system::module_ready() {
            if let Ok(v) = system::module_search(&query) {
                return Ok(from_module(v));
            }
        }
        winget::search(&query).map(packages)
    })
    .await
}

#[tauri::command]
async fn winget_list() -> Result<Vec<PackageDto>, String> {
    blocking(|| {
        if system::module_ready() {
            if let Ok(v) = system::module_list() {
                return Ok(from_module(v));
            }
        }
        winget::list_installed_cli().map(packages)
    })
    .await
}

#[tauri::command]
async fn winget_upgrades() -> Result<Vec<PackageDto>, String> {
    blocking(|| {
        if system::module_ready() {
            if let Ok(v) = system::module_list() {
                return Ok(from_module(v.into_iter().filter(|p| !p.available.is_empty()).collect()));
            }
        }
        winget::list_upgrades_cli().map(packages)
    })
    .await
}

/// "module" bila Microsoft.WinGet.Client terpasang, "cli" bila belum.
#[tauri::command]
async fn winget_engine() -> Result<String, String> {
    blocking(|| Ok(if system::module_ready() { "module".to_string() } else { "cli".to_string() })).await
}

#[tauri::command]
async fn winget_install_client() -> Result<(), String> {
    blocking(system::install_module).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhInstallArgs {
    url: String,
    file_name: String,
    #[serde(default)]
    size: u64,
    digest: Option<String>,
    location: Option<String>,
    name: String,
    repo: String,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GhInstallDto {
    kind: String,
    path: String,
    display_name: Option<String>,
    exe: Option<String>,
}

/// Unduh file rilis GitHub, cocokkan SHA-256, lalu pasang (zip/exe portable, MSI, Inno, NSIS, atau installer biasa).
#[tauri::command]
async fn gh_install(app: AppHandle, task_id: String, args: GhInstallArgs) -> Result<GhInstallDto, String> {
    blocking(move || {
        let req = github::InstallReq {
            url: args.url,
            file_name: args.file_name,
            size: args.size,
            digest: args.digest,
            location: args.location.map(|l| winget::expand_env(&l)),
            name: args.name,
            repo: args.repo,
            version: args.version,
        };
        let work = std::env::temp_dir().join("Winsta").join("downloads");
        let entries = || -> Vec<github::Entry> {
            system::uninstall_entries()
                .into_iter()
                .map(|e| github::Entry { name: e.name, version: e.version, location: e.location })
                .collect()
        };
        let r = github::install(&req, &work, &entries, &mut emitter(app, task_id))?;
        Ok(GhInstallDto { kind: r.kind, path: r.path, display_name: r.display_name, exe: r.exe })
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhUninstallArgs {
    kind: String,
    path: String,
    display_name: Option<String>,
    name: String,
}

#[tauri::command]
async fn gh_uninstall(app: AppHandle, task_id: String, args: GhUninstallArgs) -> Result<(), String> {
    blocking(move || {
        let kind = github::Kind::parse(&args.kind).unwrap_or(github::Kind::Exe);
        if kind.is_portable() {
            return github::uninstall_portable(&winget::expand_env(&args.path), &args.name);
        }
        match args.display_name.filter(|n| !n.trim().is_empty()) {
            Some(n) => winget::uninstall_by_name(&n, &mut emitter(app, task_id)),
            None => Err("Nama aplikasi di Windows tidak tercatat. Hapus lewat Settings > Apps di Windows.".into()),
        }
    })
    .await
}

/// Buka situs di browser bawaan (hanya https).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Hanya alamat https yang bisa dibuka.".into());
    }
    // explorer.exe tidak selalu meneruskan alamat ke browser (kadang membuka File Explorer).
    // url.dll FileProtocolHandler selalu membuka browser bawaan.
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct LeftoverDto {
    path: String,
    kind: String,
}

/// Sisa aplikasi setelah uninstall (folder install, data, shortcut) yang masih ada di disk.
#[tauri::command]
async fn find_leftovers(name: String, publisher: String, path: String) -> Result<Vec<LeftoverDto>, String> {
    blocking(move || {
        let bases = cleanup::Bases::from_env();
        Ok(cleanup::find_leftovers(&name, &publisher, &winget::expand_env(&path), &bases)
            .into_iter()
            .map(|l| LeftoverDto { path: l.path, kind: l.kind.to_string() })
            .collect())
    })
    .await
}

#[derive(Serialize)]
struct FailedDto {
    path: String,
    reason: String,
}

/// Hapus sisa yang dipilih. Setiap path diperiksa ulang: hanya sisa milik aplikasi ini yang dihapus.
#[tauri::command]
async fn delete_leftovers(paths: Vec<String>, name: String, publisher: String, path: String) -> Result<Vec<FailedDto>, String> {
    blocking(move || {
        let bases = cleanup::Bases::from_env();
        Ok(cleanup::delete_paths(&paths, &name, &publisher, &winget::expand_env(&path), &bases)
            .into_iter()
            .map(|(path, reason)| FailedDto { path, reason })
            .collect())
    })
    .await
}

#[tauri::command]
async fn winget_versions(id: String) -> Result<Vec<String>, String> {
    blocking(move || winget::versions(&id)).await
}

#[tauri::command]
async fn winget_install(app: AppHandle, task_id: String, args: InstallArgs) -> Result<(), String> {
    let opts = winget::InstallOpts {
        id: args.id,
        version: args.version,
        location: args.location,
        scope: args.scope,
        interactive: args.interactive,
        force: args.force,
    };
    blocking(move || winget::install(&opts, &mut emitter(app, task_id))).await
}

#[tauri::command]
async fn winget_upgrade(app: AppHandle, task_id: String, id: String) -> Result<(), String> {
    blocking(move || winget::upgrade(&id, &mut emitter(app, task_id))).await
}

#[tauri::command]
async fn winget_uninstall(app: AppHandle, task_id: String, id: String, interactive: Option<bool>) -> Result<(), String> {
    blocking(move || winget::uninstall(&id, interactive.unwrap_or(false), &mut emitter(app, task_id))).await
}

/// Arsipkan installer versi aktif sebelum update, agar rollback tetap bisa
/// walau versi itu nanti hilang dari repositori winget.
#[tauri::command]
async fn winget_archive(app: AppHandle, task_id: String, id: String, version: String, dir: String) -> Result<(), String> {
    blocking(move || winget::download(&id, &version, &dir, &mut emitter(app, task_id))).await
}

#[tauri::command]
async fn winget_pin(id: String, pinned: bool) -> Result<(), String> {
    blocking(move || if pinned { winget::pin_add(&id) } else { winget::pin_remove(&id) }).await
}

#[tauri::command]
fn rollback_candidates(versions: Vec<String>, current: String, n: usize) -> Vec<String> {
    winget::rollback_candidates(&versions, &current, n)
}

/// Buka folder di File Explorer.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let path = winget::expand_env(&path);
    std::process::Command::new("explorer").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveDto {
    id: String,
    label: String,
    #[serde(rename = "freeGB")]
    free_gb: f64,
    #[serde(rename = "totalGB")]
    total_gb: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocationDto {
    name: String,
    path: String,
}

/// Drive lokal dan removable beserta ruang kosongnya.
#[tauri::command]
async fn system_drives() -> Result<Vec<DriveDto>, String> {
    blocking(|| {
        Ok(system::drives()?
            .into_iter()
            .map(|d| DriveDto { id: d.id, label: d.label, free_gb: d.free_gb, total_gb: d.total_gb })
            .collect())
    })
    .await
}

/// Lokasi install yang dicatat Windows (registry Uninstall), dicocokkan dengan nama di `winget list`.
#[tauri::command]
async fn install_locations() -> Result<Vec<LocationDto>, String> {
    blocking(|| Ok(system::install_locations()?.into_iter().map(|l| LocationDto { name: l.name, path: l.path }).collect())).await
}

#[tauri::command]
fn local_app_data() -> String {
    std::env::var("LOCALAPPDATA").unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            winget_version,
            winget_search,
            winget_list,
            winget_upgrades,
            winget_versions,
            winget_install,
            winget_upgrade,
            winget_uninstall,
            winget_archive,
            winget_pin,
            rollback_candidates,
            open_path,
            system_drives,
            install_locations,
            local_app_data,
            winget_engine,
            winget_install_client,
            open_url,
            gh_install,
            gh_uninstall,
            find_leftovers,
            delete_leftovers,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan Winsta");
}
