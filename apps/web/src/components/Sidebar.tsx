import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Download, Laptop2, History, Settings, ShieldCheck, X } from "lucide-react";

const NAV_ITEMS = [
  { to: "/send", icon: Plus, key: "nav.newTransfer" },
  { to: "/receive", icon: Download, key: "nav.receive" },
  { to: "/devices", icon: Laptop2, key: "nav.devices" },
  { to: "/history", icon: History, key: "nav.history" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
] as const;

function Brand() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-accent text-accent-ink">
        <ShieldCheck size={16} aria-hidden="true" />
      </span>
      <span className="text-base font-extrabold tracking-tight text-ink">{t("app.name")}</span>
    </div>
  );
}

function NavItems({ onNavigate, ariaLabel = "Primary" }: { onNavigate?: () => void; ariaLabel?: string }) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-1" aria-label={ariaLabel}>
      {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `focus-ring flex items-center gap-2.5 rounded-md border-2 px-3 py-2 text-sm font-semibold transition-all ${
              isActive
                ? "border-ink bg-accent text-accent-ink shadow-comic-sm"
                : "border-transparent text-ink-muted hover:border-ink hover:bg-surface-raised hover:text-ink"
            }`
          }
        >
          <Icon size={16} aria-hidden="true" />
          {t(key)}
        </NavLink>
      ))}
    </nav>
  );
}

interface SidebarProps {
  /** Whether the mobile drawer is open. Ignored above the `md` breakpoint, where the sidebar is always visible. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r-2 border-ink bg-surface px-3 py-4 md:flex">
        <div className="mb-6">
          <Brand />
        </div>
        <NavItems />
      </aside>

      {/* Mobile drawer: kept mounted so the slide/fade is animated in both directions, hidden from
          interaction (and the accessibility tree) via pointer-events + inert when closed. */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-ink/50 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onMobileClose}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r-2 border-ink bg-surface px-3 py-4 shadow-comic transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <div className="mb-6 flex items-center justify-between">
            <Brand />
            <button
              type="button"
              onClick={onMobileClose}
              aria-label={t("nav.closeMenu")}
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-ink text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <NavItems onNavigate={onMobileClose} ariaLabel={t("nav.menu")} />
        </aside>
      </div>
    </>
  );
}
