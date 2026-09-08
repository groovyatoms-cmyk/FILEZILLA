import { useTranslation } from "react-i18next";
import { Laptop, Pencil, Trash2 } from "lucide-react";
import { Card, CardBody } from "./ui/Card";
import { Button } from "./ui/Button";
import { formatDeviceIdForDisplay } from "../storage/device";

export interface DeviceCardProps {
  label: string;
  deviceId?: string;
  online?: boolean;
  lastConnectedAt?: number;
  onRemove?: () => void;
  onRename?: () => void;
}

export function DeviceCard({ label, deviceId, online, lastConnectedAt, onRemove, onRename }: DeviceCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-surface-raised text-ink">
            <Laptop size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{label}</p>
            {deviceId && <p className="font-mono text-xs text-ink-faint">{formatDeviceIdForDisplay(deviceId)}</p>}
            {online !== undefined && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-ink-faint"}`} />
                {online ? t("devices.online") : lastConnectedAt ? `${t("devices.lastConnected")}: ${new Date(lastConnectedAt).toLocaleString()}` : null}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onRename && (
            <Button variant="ghost" size="sm" onClick={onRename} aria-label={t("devices.rename")}>
              <Pencil size={16} />
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t("common.remove")}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
