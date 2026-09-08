export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors ${checked ? "bg-accent" : "bg-surface-raised"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-transform duration-150 ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}
