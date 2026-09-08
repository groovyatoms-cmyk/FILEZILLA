import { useTranslation } from "react-i18next";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, XCircle } from "lucide-react";
import type { TransferDirection, TransferStatus } from "@securetransfer/shared";
import { Card, CardBody } from "./ui/Card";
import { Badge, type BadgeTone } from "./ui/Badge";
import { formatBytes, formatClockTime } from "../utils/format";

const STATUS_TONE: Record<TransferStatus, BadgeTone> = {
  queued: "neutral",
  preparing: "active",
  hashing: "active",
  encrypting: "active",
  transferring: "active",
  paused: "warning",
  verifying: "active",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export interface TransferCardProps {
  label: string;
  direction: TransferDirection;
  peerLabel: string;
  totalSize: number;
  fileCount: number;
  status: TransferStatus;
  timestampMs: number;
}

export function TransferCard({ label, direction, peerLabel, totalSize, fileCount, status, timestampMs }: TransferCardProps) {
  const { t } = useTranslation();
  const DirectionIcon = direction === "sent" ? ArrowUpFromLine : ArrowDownToLine;
  const StatusIcon = status === "failed" ? XCircle : status === "completed" ? CheckCircle2 : null;
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-raised text-ink-muted">
            <DirectionIcon size={16} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{label}</p>
            <p className="text-xs text-ink-muted">
              {formatBytes(totalSize)} · {t(`common.files_${fileCount === 1 ? "one" : "other"}`, { count: fileCount })} ·{" "}
              {direction === "sent" ? t("history.sent") : t("history.received")} · {peerLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-faint">{formatClockTime(timestampMs)}</span>
          <Badge tone={STATUS_TONE[status]} icon={StatusIcon ? <StatusIcon size={12} /> : undefined}>
            {status}
          </Badge>
        </div>
      </CardBody>
    </Card>
  );
}
