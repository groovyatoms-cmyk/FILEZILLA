import { useCallback, useEffect, useState } from "react";
import type { TransferHistoryEntry } from "@securetransfer/shared";
import { clearHistory, listHistory, upsertHistoryEntry } from "../storage/history";

export function useTransferHistory(): {
  entries: TransferHistoryEntry[];
  record: (entry: TransferHistoryEntry) => Promise<void>;
  clear: () => Promise<void>;
} {
  const [entries, setEntries] = useState<TransferHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    setEntries(await listHistory());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const record = useCallback(
    async (entry: TransferHistoryEntry) => {
      await upsertHistoryEntry(entry);
      await refresh();
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    await clearHistory();
    await refresh();
  }, [refresh]);

  return { entries, record, clear };
}
