import { useTranslation } from "react-i18next";
import { Laptop, Trash2 } from "lucide-react";
import { Card, CardBody } from "./ui/Card";
import { Button } from "./ui/Button";
import { formatDeviceIdForDisplay } from "../storage/device";

export interface DeviceCardProps {
  label: string;
  deviceId?: string;
  online?: boolean;
  lastConnectedAt?: number;
  onRemove?: () => void;
}

export function DeviceCard({ label, deviceId, online, lastConnectedAt, onRemove }: DeviceCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-raised text-ink-muted">
            <Laptop size={18} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{label}</p>
            {deviceId && <p className="font-mono text-xs text-ink-faint">{formatDeviceIdForDisplay(deviceId)}</p>}
            {online !== undefined && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-ink-faint"}`} />
                {online ? t("devices.online") : lastConnectedAt ? new Date(lastConnectedAt).toLocaleString() : null}
              </p>
            )}
          </div>
        </div>
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t("common.remove")}>
            <Trash2 size={16} />
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
