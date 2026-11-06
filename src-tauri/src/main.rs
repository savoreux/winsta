// Sembunyikan jendela konsol di build rilis Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    winsta_lib::run()
}
