import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Circle } from "lucide-react";
import { QrPartsCollector, parsePairingPayload, type PairingPayload } from "@securetransfer/protocol";
import type { ConnectionKind, FileManifestEntry, TransferManifest } from "@securetransfer/shared";
import { QRScanner } from "../components/QRScanner";
import { Button } from "../components/ui/Button";
import { ActiveTransferView } from "../components/ActiveTransferView";
import { CompletionView } from "../components/CompletionView";
import { ErrorState } from "../components/ui/ErrorState";
import { Card, CardBody } from "../components/ui/Card";
import { useSettings } from "../hooks/useSettings";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { ReceiverPairingSession } from "../features/pairing/receiver-session";
import { FileSystemAccessSink, MemoryDownloadSink, type FileSink } from "../features/transfer/file-sink";
import type { TransferProgress } from "../features/transfer/types";
import { config } from "../config";
import { formatBytes } from "../utils/format";

type Phase = "scanning" | "reconstructing" | "authenticating" | "review" | "transferring" | "complete" | "failed";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function Receive() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { record } = useTransferHistory();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [collector] = useState(() => new QrPartsCollector());
  const [received, setReceived] = useState<number[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PairingPayload | null>(null);
  const [manifest, setManifest] = useState<TransferManifest | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>("unknown");
  const [errorMessage, setErrorMessage] = useState("");
  const sessionRef = useRef<ReceiverPairingSession | null>(null);
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedScanRef = useRef(false);
  const manifestRef = useRef<TransferManifest | null>(null);
  const payloadRef = useRef<PairingPayload | null>(null);

  useEffect(() => () => sessionRef.current?.close(), []);

  const onDetect = useCallback(
    (text: string) => {
      if (pausedScanRef.current) return;
      void collector.addFragmentText(text).then(async (outcome) => {
        if (outcome.status === "accepted") {
          setReceived(collector.receivedIndexes);
          setTotal(collector.totalParts);
          if (collector.isComplete()) {
            pausedScanRef.current = true;
            setPhase("reconstructing");
            try {
              const bytes = await collector.reconstruct();
              const parsed = parsePairingPayload(bytes);
              payloadRef.current = parsed;
              setPayload(parsed);
              await connectToSender(parsed);
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : "Failed to reconstruct pairing session.");
              setPhase("failed");
            }
          }
        } else if (outcome.status === "corrupt-fragment") {
          setScanError("A scanned QR frame looked corrupted — try holding it steadier.");
        } else if (outcome.status === "different-generation") {
          setScanError("This QR sequence was regenerated. Start scanning from part 1 again.");
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collector],
  );

  const connectToSender = useCallback(
    async (parsed: PairingPayload) => {
      setPhase("authenticating");
      startedAtRef.current = Date.now();
      const session = new ReceiverPairingSession(config.signalingUrl, parsed);
      sessionRef.current = session;

      let directoryHandle: FileSystemDirectoryHandle | null = null;
      if (window.showDirectoryPicker) {
        try {
          directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        } catch {
          directoryHandle = null;
        }
      }
      directoryHandleRef.current = directoryHandle;

      const createSink = (entry: FileManifestEntry): FileSink =>
        directoryHandle ? new FileSystemAccessSink(directoryHandle, entry.relativePath) : new MemoryDownloadSink();

      await session.connect(
        {
          onDiagnostics: (d) => setConnectionKind(d.kind),
          onDisconnected: () => {},
          onAuthenticated: () => {},
          onAuthenticationFailed: () => {
            setErrorMessage(t("errors.connectionFailedTitle"));
            setPhase("failed");
          },
          onManifest: (m) => {
            manifestRef.current = m;
            setManifest(m);
            if (settings.askBeforeReceiving) {
              setPhase("review");
            } else {
              session.acceptTransfer(m.transferId);
              setPhase("transferring");
            }
          },
          onProgress: (p) => setProgress(p),
          onFileVerified: () => {},
          onVerificationFailed: (entry, expected, actual) => {
            setErrorMessage(`${entry.name}: ${t("transfer.expected")} ${expected.slice(0, 16)}…, ${t("transfer.received")} ${actual.slice(0, 16)}…`);
          },
          onComplete: () => {
            setPhase("complete");
            const finishedManifest = manifestRef.current;
            if (finishedManifest) {
              void record({
                transferId: finishedManifest.transferId,
                direction: "received",
                label: finishedManifest.label,
                totalSize: finishedManifest.totalSize,
                fileCount: finishedManifest.files.length,
                status: "completed",
                peerLabel: parsed.senderLabel,
                startedAt: startedAtRef.current,
                completedAt: Date.now(),
              });
            }
          },
          onFatalError: (message) => {
            setErrorMessage(message);
            setPhase("failed");
          },
        },
        settings.allowTurnFallback,
        createSink,
      );
    },
    [settings.askBeforeReceiving, settings.allowTurnFallback, t, record],
  );

  if (phase === "scanning") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-lg font-semibold text-ink">{t("receive.title")}</h1>
        <p className="text-sm text-ink-muted">{t("receive.scanInstructions")}</p>
        <QRScanner onDetect={onDetect} />
        <p className="text-xs text-ink-faint">{t("receive.holdSteady")}</p>
        {scanError && <p className="text-xs text-warning">{scanError}</p>}
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">{t("receive.partsScanned")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: total ?? 0 }, (_, i) => i + 1).map((n) => (
              <span key={n} className="flex items-center gap-1 text-xs text-ink-muted">
                {received.includes(n) ? <Check size={12} className="text-success" /> : <Circle size={12} className="text-ink-faint" />}
                {n}
              </span>
            ))}
          </div>
          {total === null && <p className="text-xs text-ink-faint">{t("receive.keepScanning")}</p>}
        </div>
      </div>
    );
  }

  if (phase === "reconstructing" || phase === "authenticating") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold text-ink">{t("receive.startingTransfer")}</h1>
        <ul className="space-y-1 text-sm text-ink-muted">
          <li className="flex items-center justify-center gap-2">
            <Check size={14} className="text-success" /> {t("receive.secureChannel")}
          </li>
        </ul>
      </div>
    );
  }

  if (phase === "review" && manifest && payload) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="text-center text-lg font-semibold text-ink">{t("receive.pairingComplete")}</h1>
        <Card>
          <CardBody className="space-y-2 text-sm">
            <Row label={t("receive.sender")} value={payload.senderLabel} />
            <Row label={t("receive.transfer")} value={manifest.label} />
            <Row label={t("receive.size")} value={formatBytes(manifest.totalSize)} />
            <Row label={t("receive.files")} value={String(manifest.files.length)} />
          </CardBody>
        </Card>
        <div className="flex justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              sessionRef.current?.declineTransfer(manifest.transferId, "Declined by user");
              navigate("/");
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              sessionRef.current?.acceptTransfer(manifest.transferId);
              setPhase("transferring");
            }}
          >
            {t("common.continue")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "transferring" && progress) {
    return (
      <ActiveTransferView
        peerLabel={payload?.senderLabel ?? t("receive.sender")}
        direction="receiving"
        progress={progress}
        connectionKind={connectionKind}
        onCancel={() => {
          if (manifest) sessionRef.current?.cancel(manifest.transferId);
          navigate("/");
        }}
      />
    );
  }

  if (phase === "complete" && manifest) {
    return (
      <CompletionView
        fileCount={manifest.files.length}
        totalSize={manifest.totalSize}
        savedToLabel={directoryHandleRef.current ? directoryHandleRef.current.name : settings.downloadDirectoryLabel}
        onNewTransfer={() => {
          sessionRef.current?.close();
          navigate("/receive");
          window.location.reload();
        }}
      />
    );
  }

  return <ErrorState title={t("errors.connectionFailedTitle")} body={errorMessage || t("errors.connectionFailedBody")} onRetry={() => navigate(0)} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-faint">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
