import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title: string;
  body?: string;
  diagnostics?: string;
  onRetry?: () => void;
}

/** Never surfaces a raw technical error directly; a plain-language message with optional diagnostics behind a toggle. */
export function ErrorState({ title, body, diagnostics, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-danger bg-danger/10 px-6 py-10 text-center shadow-comic-sm">
      <AlertTriangle size={28} className="text-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-muted">{body}</p>}
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
        {diagnostics && (
          <Button size="sm" variant="ghost" onClick={() => setShowDiagnostics((v) => !v)}>
            {showDiagnostics ? t("common.hideDiagnostics") : t("common.showDiagnostics")}
          </Button>
        )}
      </div>
      {showDiagnostics && diagnostics && (
        <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-surface-raised px-3 py-2 text-left font-mono text-xs text-ink-muted">
          {diagnostics}
        </pre>
      )}
    </div>
  );
}
