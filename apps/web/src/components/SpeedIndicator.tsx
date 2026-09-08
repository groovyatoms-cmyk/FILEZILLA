import { Gauge } from "lucide-react";
import { formatSpeed } from "../utils/format";

export function SpeedIndicator({ bytesPerSecond }: { bytesPerSecond: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
      <Gauge size={14} aria-hidden="true" />
      {formatSpeed(bytesPerSecond)}
    </span>
  );
}
