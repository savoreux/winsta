import { useEffect } from "react";
import { Dialogs } from "./components/Dialogs";
import { Sidebar, TitleBar, Toasts, TopBar } from "./components/Shell";
import { setLang } from "./lib/i18n";
import { useApplyTheme } from "./lib/theme";
import type { View } from "./lib/types";
import { Discover } from "./pages/Discover";
import { History } from "./pages/History";
import { Installed } from "./pages/Installed";
import { Settings } from "./pages/Settings";
import { Updates } from "./pages/Updates";
import { go, startup, useStore } from "./state/store";

const PAGES: Record<View, () => React.JSX.Element> = {
  discover: Discover,
  installed: Installed,
  updates: Updates,
  history: History,
  settings: Settings,
};
const ORDER: View[] = ["discover", "installed", "updates", "history", "settings"];

export function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.settings.theme);
  const mica = useStore((s) => s.settings.mica);
  const lang = useStore((s) => s.settings.lang);
  // Diset sebelum anak-anaknya dirender agar semua t() memakai bahasa yang baru.
  setLang(lang);
  useApplyTheme(theme, mica);

  // Saat dibuka: pindai aplikasi terpasang, lalu cek update sekali. Tidak ada timer latar belakang.
  useEffect(() => {
    void startup();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= ORDER.length) {
        e.preventDefault();
        go(ORDER[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Page = PAGES[view];
  return (
    <div key={lang} className="flex h-full flex-col bg-chrome">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden border-line-soft bg-bg md:rounded-tl-xl md:border-t md:border-l">
          <TopBar />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div key={view} className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
              <Page />
            </div>
          </div>
        </main>
      </div>
      <Dialogs />
      <Toasts />
    </div>
  );
}
