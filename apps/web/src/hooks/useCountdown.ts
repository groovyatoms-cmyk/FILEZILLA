import { useEffect, useState } from "react";
import { formatDuration } from "../utils/format";

export function useCountdown(expiresAt: number | null): { secondsLeft: number; label: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return { secondsLeft: 0, label: "--:--", expired: false };
  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));
  return { secondsLeft, label: formatDuration(secondsLeft), expired: secondsLeft <= 0 };
}
