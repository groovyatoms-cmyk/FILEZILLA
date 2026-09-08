import { useTranslation } from "react-i18next";
import { CheckCircle2, FolderOpen } from "lucide-react";
import { Button } from "./ui/Button";
import { formatBytes } from "../utils/format";

export interface CompletionViewProps {
  fileCount: number;
  totalSize: number;
  savedToLabel?: string;
  onNewTransfer: () => void;
  onViewTransfer?: () => void;
}

export function CompletionView({ fileCount, totalSize, savedToLabel, onNewTransfer, onViewTransfer }: CompletionViewProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center animate-slide-up">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 size={28} className="text-success" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-ink">{t("transfer.completeTitle")}</h1>
      <ul className="space-y-1 text-sm text-ink-muted">
        <li>
          ✓ {t(`common.files_${fileCount === 1 ? "one" : "other"}`, { count: fileCount })}
        </li>
        <li>✓ {formatBytes(totalSize)}</li>
        <li>✓ {t("transfer.integrityVerified")}</li>
      </ul>
      {savedToLabel && (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <FolderOpen size={14} /> {t("transfer.savedTo")}: {savedToLabel}
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {onViewTransfer && (
          <Button variant="secondary" onClick={onViewTransfer}>
            {t("transfer.viewTransfer")}
          </Button>
        )}
        <Button onClick={onNewTransfer}>{t("transfer.newTransfer")}</Button>
      </div>
    </div>
  );
}
