import { useTranslation } from "react-i18next";
import type { ConnectionKind } from "@securetransfer/shared";

export function ConnectionStatus({ kind }: { kind: ConnectionKind }) {
  const { t } = useTranslation();
  const dotClass = kind === "direct" ? "bg-success" : kind === "relay" ? "bg-warning" : "bg-ink-faint";
  const label = kind === "direct" ? t("transfer.direct") : kind === "relay" ? t("transfer.relay") : t("common.loading");
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}
