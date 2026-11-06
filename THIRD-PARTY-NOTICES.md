# Third-party notices

Winsta (© 2026 Savoreux, licensed under GPL-3.0, see [LICENSE](LICENSE)) is built with the open-source components below.
Each one remains under its own license; the full license texts are in each project's repository.

| Component | Used for | License |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) | Windows app shell | MIT or Apache-2.0 |
| [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | Folder picker | MIT or Apache-2.0 |
| [serde](https://github.com/serde-rs/serde), [serde_json](https://github.com/serde-rs/json) | Data exchange between Rust and the UI | MIT or Apache-2.0 |
| [React](https://github.com/facebook/react), React DOM | User interface | MIT |
| [Headless UI](https://github.com/tailwindlabs/headlessui) | Menus, dialogs, lists | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Styling | MIT |
| [React Icons](https://github.com/react-icons/react-icons) with [Lucide](https://github.com/lucide-icons/lucide) icons | Icons | MIT (React Icons), ISC (Lucide) |
| [Geist](https://github.com/vercel/geist-font) | Font | SIL Open Font License 1.1 |

Winsta calls Microsoft's [winget](https://github.com/microsoft/winget-cli) (MIT) and, optionally, the
Microsoft.WinGet.Client PowerShell module that are installed on the user's PC. They are not included in
the Winsta installer.

The MIT, ISC, and Apache-2.0 licenses require their copyright notices to be kept in copies of the
software. Those notices are kept in the bundled code and in the linked repositories.
