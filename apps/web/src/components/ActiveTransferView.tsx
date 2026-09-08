import { useTranslation } from "react-i18next";
import type { ConnectionKind } from "@securetransfer/shared";
import type { TransferProgress } from "../features/transfer/types";
import { ProgressBar } from "./ui/ProgressBar";
import { Button } from "./ui/Button";
import { ConnectionStatus } from "./ConnectionStatus";
import { EncryptionBadge } from "./EncryptionBadge";
import { SpeedIndicator } from "./SpeedIndicator";
import { formatBytes, formatDuration } from "../utils/format";

export interface ActiveTransferViewProps {
  peerLabel: string;
  direction: "sending" | "receiving";
  progress: TransferProgress;
  connectionKind: ConnectionKind;
  onPause?: () => void;
  onResume?: () => void;
  onCancel: () => void;
}

export function ActiveTransferView({ peerLabel, direction, progress, connectionKind, onPause, onResume, onCancel }: ActiveTransferViewProps) {
  const { t } = useTranslation();
  const pct = progress.totalBytes > 0 ? (progress.bytesTransferred / progress.totalBytes) * 100 : 0;
  const isPaused = progress.status === "paused";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-ink">{t("transfer.inProgress")}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {direction === "sending" ? `${t("app.name")} → ${peerLabel}` : `${peerLabel} → ${t("app.name")}`}
        </p>
      </div>

      <div>
        <ProgressBar value={pct} label={t("transfer.inProgress")} />
        <div className="mt-2 flex items-center justify-between text-sm text-ink-muted">
          <span>{Math.round(pct)}%</span>
          <span>
            {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <div>
          <p className="text-ink-faint">{t("common.loading")}</p>
          <SpeedIndicator bytesPerSecond={progress.bytesPerSecond} />
        </div>
        <div>
          <p className="text-ink-faint">ETA</p>
          <p className="text-ink">{progress.etaSeconds !== null ? formatDuration(progress.etaSeconds) : "--:--"}</p>
        </div>
        <div>
          <p className="text-ink-faint">{t("transfer.currentFile")}</p>
          <p className="truncate text-ink">{progress.currentFileName ?? "—"}</p>
        </div>
        <div>
          <p className="text-ink-faint">{t("receive.files")}</p>
          <p className="text-ink">
            {progress.filesCompleted} / {progress.totalFiles}
          </p>
        </div>
        <div>
          <p className="text-ink-faint">{t("transfer.encryption")}</p>
          <EncryptionBadge />
        </div>
        <div>
          <p className="text-ink-faint">{t("transfer.connection")}</p>
          <ConnectionStatus kind={connectionKind} />
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {isPaused ? (
          <Button variant="secondary" onClick={onResume}>
            {t("transfer.resume")}
          </Button>
        ) : (
          onPause && (
            <Button variant="secondary" onClick={onPause}>
              {t("transfer.pause")}
            </Button>
          )
        )}
        <Button variant="danger" onClick={onCancel}>
          {t("transfer.cancel")}
        </Button>
      </div>
    </div>
  );
}
