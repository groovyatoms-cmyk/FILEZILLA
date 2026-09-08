import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UploadCloud, FolderOpen, QrCode, FilePlus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { TransferCard } from "../components/TransferCard";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { useToast } from "../components/ui/Toast";
import { filterAllowedFiles } from "../utils/file-filter";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { entries } = useTransferHistory();
  const { show } = useToast();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const goToSendWithFiles = useCallback(
    (rawFiles: File[]) => {
      const { allowed, blocked } = filterAllowedFiles(rawFiles);
      if (blocked.length > 0) {
        show(t("send.blockedFormat", { names: blocked.map((f) => f.name).join(", ") }), "warning");
      }
      if (allowed.length === 0) return;
      navigate("/send", { state: { files: allowed } });
    },
    [navigate, show, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      goToSendWithFiles(Array.from(e.dataTransfer.files));
    },
    [goToSendWithFiles],
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col items-center gap-1 pb-5 pt-6 text-center">
            <FilePlus size={20} className="text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink">{t("nav.newTransfer")}</h2>
            <p className="text-xs text-ink-muted">{t("dashboard.sendHint")}</p>
          </CardBody>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mx-4 mb-4 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-all ${
              dragging ? "border-accent bg-accent/10 shadow-comic-accent" : "border-ink bg-canvas"
            }`}
          >
            <UploadCloud size={26} className="text-ink-faint" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">{t("dashboard.dropHere")}</p>
            <p className="text-xs text-ink-faint">{t("dashboard.or")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => inputRef.current?.click()}>
                {t("dashboard.selectFiles")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => folderInputRef.current?.click()}>
                <FolderOpen size={14} /> {t("dashboard.selectFolder")}
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => goToSendWithFiles(Array.from(e.target.files ?? []))}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error -- non-standard attributes for directory selection, supported in Chromium/Firefox
              webkitdirectory=""
              directory=""
              className="hidden"
              onChange={(e) => goToSendWithFiles(Array.from(e.target.files ?? []))}
            />
          </div>
        </Card>

        <Card>
          <CardBody className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-accent text-accent-ink">
              <QrCode size={26} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">{t("nav.receive")}</h2>
              <p className="mt-1 text-xs text-ink-muted">{t("dashboard.receiveHint")}</p>
            </div>
            <Button onClick={() => navigate("/receive")}>{t("dashboard.startReceiving")}</Button>
          </CardBody>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">{t("dashboard.recentTransfers")}</h2>
        {entries.length === 0 ? (
          <EmptyState title={t("dashboard.noTransfersYet")} hint={t("dashboard.noTransfersHint")} />
        ) : (
          <div className="flex flex-col gap-2">
            {entries.slice(0, 6).map((entry) => (
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
      </section>
    </div>
  );
}
