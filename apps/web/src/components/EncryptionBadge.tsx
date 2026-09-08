import { ShieldCheck } from "lucide-react";

export function EncryptionBadge({ algorithm = "AES-256-GCM" }: { algorithm?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <ShieldCheck size={14} className="text-success" aria-hidden="true" />
      {algorithm}
    </span>
  );
}
