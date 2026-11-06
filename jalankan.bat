@echo off
setlocal
cd /d "%~dp0"
title Winsta

rem Menjalankan Winsta sebagai aplikasi Windows tanpa Node.js.
rem Tampilan sudah dibangun di folder dist; yang dibutuhkan hanya Rust.
rem   jalankan.bat         buka Winsta (mode pengembangan)
rem   jalankan.bat build   buat installer .msi

where cargo >nul 2>nul
if errorlevel 1 goto :no_rust

cargo tauri --version >nul 2>nul
if errorlevel 1 goto :install_cli

:run
if /i "%~1"=="build" goto :build
echo Membuka Winsta... Kompilasi pertama bisa makan waktu 5-10 menit.
cargo tauri dev
goto :end

:build
echo Membuat installer .msi... Hasilnya ada di src-tauri\target\release\bundle\msi
cargo tauri build
if not errorlevel 1 explorer "src-tauri\target\release\bundle\msi"
goto :end

:install_cli
echo Memasang Tauri CLI. Ini hanya sekali dan butuh beberapa menit.
cargo install tauri-cli --version "^2" --locked
if errorlevel 1 (
  echo.
  echo Gagal memasang Tauri CLI. Pastikan Visual Studio Build Tools sudah terpasang, lihat README.
  goto :end
)
goto :run

:no_rust
echo Rust belum terpasang.
echo.
echo Jalankan dua perintah ini di PowerShell, lalu buka ulang jendela ini:
echo.
echo   winget install --id Rustlang.Rustup -e
echo   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
echo.

:end
pause
