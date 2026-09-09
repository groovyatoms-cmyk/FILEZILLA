import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Download, Grip, Heart, Plus, QrCode, ShieldCheck } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Badge } from "./ui/Badge";

export function AppLayout() {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="flex h-full min-h-screen bg-canvas">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b-2 border-ink bg-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t("nav.openMenu")}
              aria-expanded={mobileMenuOpen}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border-2 border-ink text-ink"
            >
              <Grip size={16} aria-hidden="true" />
            </button>
            <span className="text-base font-extrabold text-ink">{t("app.name")}</span>
          </div>
          <span className="hidden text-sm text-ink-muted md:block" />
          <Badge tone="success" icon={<ShieldCheck size={12} />}>
            {t("app.protected")}
          </Badge>
        </header>
        <main className="flex flex-1 flex-col overflow-y-auto px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="mx-auto mt-12 flex w-full max-w-3xl shrink-0 flex-col items-center gap-2 border-t-2 border-ink pt-4 text-center text-xs font-medium text-ink-muted">
            <div className="flex items-center gap-1">
              Made with <Heart size={12} className="fill-danger text-danger" aria-label="love" /> in India by Soumitro Haldar
            </div>
            <nav className="flex items-center gap-3" aria-label="Legal">
              <Link to="/legal/terms" className="hover:text-ink hover:underline">
                Terms of Use
              </Link>
              <Link to="/legal/privacy" className="hover:text-ink hover:underline">
                Privacy Policy
              </Link>
              <Link to="/legal/cookies" className="hover:text-ink hover:underline">
                Cookie Policy
              </Link>
            </nav>
          </footer>
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t-2 border-ink bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
          aria-label="Primary"
        >
          <MobileNavItem to="/send" icon={Plus} label={t("nav.newTransfer")} />
          <MobileNavItem to="/receive" icon={Download} label={t("nav.receive")} />
          <MobileNavItem to="/receive?scan=1" icon={QrCode} label={t("send.scanToConnect")} />
        </nav>
      </div>
    </div>
  );
}

function MobileNavItem({ to, icon: Icon, label }: { to: string; icon: typeof Plus; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `focus-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${isActive ? "text-accent" : "text-ink-muted"}`
      }
    >
      <Icon size={20} aria-hidden="true" />
      {label}
    </NavLink>
  );
}
