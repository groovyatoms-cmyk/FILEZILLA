import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TransferDirection, TransferStatus } from "@securetransfer/shared";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { TransferCard } from "../components/TransferCard";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { History as HistoryIcon } from "lucide-react";

type Filter = "all" | TransferDirection | "completed" | "failed";

export function History() {
  const { t } = useTranslation();
  const { entries } = useTransferHistory();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "sent" || filter === "received") return entries.filter((e) => e.direction === filter);
    return entries.filter((e) => e.status === (filter as TransferStatus));
  }, [entries, filter]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("history.filterAll") },
    { key: "sent", label: t("history.filterSent") },
    { key: "received", label: t("history.filterReceived") },
    { key: "completed", label: t("history.filterCompleted") },
    { key: "failed", label: t("history.filterFailed") },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink">{t("history.title")}</h1>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "primary" : "secondary"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<HistoryIcon size={24} />} title={t("dashboard.noTransfersYet")} hint={t("dashboard.noTransfersHint")} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((entry) => (
            <TransferCard
              key={entry.transferId}
              label={entry.label}
              direction={entry.direction}
              peerLabel={entry.peerLabel}
              totalSize={entry.totalSize}
              fileCount={entry.fileCount}
              status={entry.status}
              timestampMs={entry.startedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
