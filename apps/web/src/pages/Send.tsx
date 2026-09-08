import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, RotateCw, ChevronLeft, ChevronRight, UploadCloud } from "lucide-react";
import type { QrFragment } from "@securetransfer/protocol";
import type { ConnectionKind } from "@securetransfer/shared";
import { Button } from "../components/ui/Button";
import { FileList } from "../components/FileList";
import { QRCodeDisplay } from "../components/QRCodeDisplay";
import { ActiveTransferView } from "../components/ActiveTransferView";
import { CompletionView } from "../components/CompletionView";
import { ErrorState } from "../components/ui/ErrorState";
import { useToast } from "../components/ui/Toast";
import { filterAllowedFiles } from "../utils/file-filter";
import { useDeviceIdentity } from "../hooks/useDeviceIdentity";
import { useSettings } from "../hooks/useSettings";
import { useCountdown } from "../hooks/useCountdown";
import { useTransferHistory } from "../hooks/useTransferHistory";
import { SenderPairingSession } from "../features/pairing/sender-session";
import type { SelectedFile } from "../features/transfer/manifest";
import type { TransferProgress } from "../features/transfer/types";
import { config } from "../config";
import { formatBytes } from "../utils/format";

type Phase = "select" | "preparing" | "qr" | "authenticating" | "transferring" | "complete" | "failed" | "expired";

const ROTATE_INTERVAL_MS = 4000;

export function Send() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const device = useDeviceIdentity();
  const { settings } = useSettings();
  const { record } = useTransferHistory();
  const { show } = useToast();

  const [phase, setPhase] = useState<Phase>("select");
  const [files, setFiles] = useState<File[]>(() => filterAllowedFiles((location.state as { files?: File[] } | null)?.files ?? []).allowed);

  const setFilesFiltered = useCallback(
    (rawFiles: File[]) => {
      const { allowed, blocked } = filterAllowedFiles(rawFiles);
      if (blocked.length > 0) {
        show(t("send.blockedFormat", { names: blocked.map((f) => f.name).join(", ") }), "warning");
      }
      setFiles((prev) => [...prev, ...allowed]);
    },
    [show, t],
  );
  const [prepSteps, setPrepSteps] = useState<string[]>([]);
  const [fragments, setFragments] = useState<QrFragment[]>([]);
  const [fragmentIndex, setFragmentIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>("unknown");
  const [peerLabel, setPeerLabel] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const sessionRef = useRef<SenderPairingSession | null>(null);
  const startedAtRef = useRef<number>(0);

  const countdown = useCountdown(expiresAt);
  useEffect(() => {
    if (countdown.expired && phase === "qr") setPhase("expired");
  }, [countdown.expired, phase]);

  useEffect(() => {
    if (!autoRotate || fragments.length < 2 || phase !== "qr") return;
    const interval = setInterval(() => {
      setFragmentIndex((i) => (i + 1) % fragments.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRotate, fragments.length, phase]);

  useEffect(() => () => sessionRef.current?.close(), []);

  const label = useMemo(() => (files.length === 1 ? files[0]!.name : `${files.length} files`), [files]);
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const startPreparing = useCallback(async () => {
    if (!device || files.length === 0) return;
    setPhase("preparing");
    setPrepSteps([]);
    const selected: SelectedFile[] = files.map((file) => ({ file, relativePath: file.name }));
    const session = new SenderPairingSession(config.signalingUrl, device.id, device.label, settings.sessionTtlMs);
    sessionRef.current = session;

    let qrFragments: QrFragment[];
    let exp: number;
    try {
      ({ fragments: qrFragments, expiresAt: exp } = await session.prepare(selected, label, settings.chunkSize, (fileName, index, total) => {
        setPrepSteps((prev) => [...prev, `${t("send.hashesGenerated")}: ${fileName} (${index}/${total})`]);
      }));
    } catch {
      setErrorMessage(t("errors.connectionFailedBody"));
      setPhase("failed");
      return;
    }
    setPrepSteps((prev) => [...prev, t("send.filesIndexed"), t("send.metadataPrepared"), t("send.sessionCreated")]);
    setFragments(qrFragments);
    setExpiresAt(exp);
    setPhase("qr");
    startedAtRef.current = Date.now();

    session.connect(
      {
        onDiagnostics: (d) => setConnectionKind(d.kind),
        onDisconnected: () => {},
        onAuthenticated: () => {
          setPeerLabel(t("receive.sender"));
          setPhase("authenticating");
        },
        onAuthenticationFailed: () => {
          setErrorMessage(t("errors.connectionFailedTitle"));
          setPhase("failed");
        },
        onManifestAccepted: () => setPhase("transferring"),
        onManifestDeclined: () => {
          setErrorMessage(t("errors.connectionFailedTitle"));
          setPhase("failed");
        },
        onProgress: (p) => {
          setPhase("transferring");
          setProgress(p);
        },
        onFileVerified: () => {},
        onVerificationFailed: (_fileId, expected, actual) => {
          setErrorMessage(`${t("transfer.expected")}: ${expected.slice(0, 16)}… ${t("transfer.received")}: ${actual.slice(0, 16)}…`);
        },
        onComplete: () => {
          setPhase("complete");
          void record({
            transferId: `t-${session.id}`,
            direction: "sent",
            label,
            totalSize,
            fileCount: files.length,
            status: "completed",
            peerLabel: t("receive.sender"),
            startedAt: startedAtRef.current,
            completedAt: Date.now(),
          });
        },
      },
      settings.allowTurnFallback,
    );
  }, [device, files, label, settings.sessionTtlMs, settings.chunkSize, settings.allowTurnFallback, t, record, totalSize]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setFilesFiltered(Array.from(e.dataTransfer.files));
    },
    [setFilesFiltered],
  );

  if (phase === "select") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-lg font-semibold text-ink">{t("send.title")}</h1>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-ink bg-surface px-6 py-14 text-center"
        >
          <UploadCloud size={28} className="text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">{t("send.dropTitle")}</p>
          <input type="file" multiple onChange={(e) => setFilesFiltered(Array.from(e.target.files ?? []))} className="text-sm" />
        </div>
        {files.length > 0 && (
          <>
            <FileList files={files.map((f, i) => ({ id: `${i}-${f.name}`, name: f.name, size: f.size }))} />
            <p className="text-sm text-ink-muted">
              {t(`common.files_${files.length === 1 ? "one" : "other"}`, { count: files.length })} · {formatBytes(totalSize)}
            </p>
            <Button onClick={() => void startPreparing()} className="self-start">
              {t("common.continue")}
            </Button>
          </>
        )}
      </div>
    );
  }

  if (phase === "preparing") {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold text-ink">{t("send.preparing")}</h1>
        <ul className="space-y-1 text-left text-sm text-ink-muted">
          {prepSteps.map((step, i) => (
            <li key={i} className="flex items-center gap-2">
              <Check size={14} className="text-success" /> {step}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase === "qr") {
    const fragment = fragments[fragmentIndex];
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-lg font-semibold text-ink">{t("send.scanToConnect")}</h1>
        <p className="text-sm text-ink-muted">{t("send.scanInstructions")}</p>
        {fragment && <QRCodeDisplay text={JSON.stringify(fragment)} />}
        <p className="font-mono text-sm text-ink-muted">{t("send.part", { index: fragmentIndex + 1, total: fragments.length })}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFragmentIndex((i) => (i - 1 + fragments.length) % fragments.length)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant={autoRotate ? "secondary" : "ghost"} size="sm" onClick={() => setAutoRotate((v) => !v)}>
            <RotateCw size={14} /> {t("send.autoRotate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFragmentIndex((i) => (i + 1) % fragments.length)}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <p className="text-xs text-ink-faint">{t("send.sessionExpiresIn", { time: countdown.label })}</p>
      </div>
    );
  }

  if (phase === "authenticating") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold text-ink">{t("receive.startingTransfer")}</h1>
        <ul className="space-y-1 text-sm text-ink-muted">
          <li className="flex items-center gap-2 justify-center">
            <Check size={14} className="text-success" /> {t("receive.secureChannel")}: {t("receive.established")}
          </li>
        </ul>
      </div>
    );
  }

  if (phase === "transferring" && progress) {
    return (
      <ActiveTransferView
        peerLabel={peerLabel || t("receive.sender")}
        direction="sending"
        progress={progress}
        connectionKind={connectionKind}
        onPause={() => sessionRef.current?.pause()}
        onResume={() => sessionRef.current?.resume()}
        onCancel={() => {
          sessionRef.current?.cancel();
          navigate("/");
        }}
      />
    );
  }

  if (phase === "complete") {
    return (
      <CompletionView
        fileCount={files.length}
        totalSize={totalSize}
        onNewTransfer={() => {
          sessionRef.current?.close();
          setPhase("select");
          setFiles([]);
        }}
      />
    );
  }

  if (phase === "expired") {
    return <ErrorState title={t("errors.sessionExpiredTitle")} body={t("errors.sessionExpiredBody")} onRetry={() => setPhase("select")} />;
  }

  return <ErrorState title={t("errors.connectionFailedTitle")} body={errorMessage || t("errors.connectionFailedBody")} onRetry={() => setPhase("select")} />;
}
