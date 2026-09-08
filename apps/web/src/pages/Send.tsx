import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, RotateCw, ChevronLeft, ChevronRight, UploadCloud, FolderOpen, FilePlus, ShieldCheck, Radio } from "lucide-react";
import type { QrFragment } from "@securetransfer/protocol";
import type { ConnectionKind } from "@securetransfer/shared";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
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

interface PrepStep {
  key: "indexed" | "metadata" | "hashing" | "session";
  label: string;
  done: boolean;
}

const ROTATE_INTERVAL_MS = 4000;

/** A File selected via a directory input carries this non-standard property with its path inside the chosen folder. */
function relativePathOf(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

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
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const setFilesFiltered = useCallback(
    (rawFiles: File[]) => {
      const { allowed, blocked } = filterAllowedFiles(rawFiles);
      if (blocked.length > 0) {
        show(t("send.blockedFormat", { names: blocked.map((f) => f.name).join(", ") }), "warning");
      }
      if (allowed.length > 0) setFiles((prev) => [...prev, ...allowed]);
    },
    [show, t],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f, i) => `${i}-${f.name}` !== id));
  }, []);

  const [prepSteps, setPrepSteps] = useState<PrepStep[]>([]);
  const [hashingProgress, setHashingProgress] = useState<{ index: number; total: number } | null>(null);
  const [fragments, setFragments] = useState<QrFragment[]>([]);
  const [fragmentIndex, setFragmentIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>("unknown");
  const [peerLabel, setPeerLabel] = useState<string>("");
  const [authStep, setAuthStep] = useState(0);
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
    setHashingProgress(null);
    setPrepSteps([
      { key: "indexed", label: t("send.filesIndexed"), done: true },
      { key: "metadata", label: t("send.metadataPrepared"), done: true },
      { key: "hashing", label: t("send.hashesGenerated"), done: false },
      { key: "session", label: t("send.sessionCreated"), done: false },
    ]);
    const selected: SelectedFile[] = files.map((file) => ({ file, relativePath: relativePathOf(file) }));
    const session = new SenderPairingSession(config.signalingUrl, device.id, device.label, settings.sessionTtlMs);
    sessionRef.current = session;

    let qrFragments: QrFragment[];
    let exp: number;
    try {
      ({ fragments: qrFragments, expiresAt: exp } = await session.prepare(selected, label, settings.chunkSize, (_fileName, index, total) => {
        setHashingProgress({ index, total });
      }));
    } catch {
      setErrorMessage(t("errors.connectionFailedBody"));
      setPhase("failed");
      return;
    }
    setPrepSteps((prev) => prev.map((s) => (s.key === "hashing" || s.key === "session" ? { ...s, done: true } : s)));
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
          setAuthStep(1);
          setPhase("authenticating");
          setTimeout(() => setAuthStep(2), 500);
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
      setDragging(false);
      setFilesFiltered(Array.from(e.dataTransfer.files));
    },
    [setFilesFiltered],
  );

  const resetToSelect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setFiles([]);
    setFragments([]);
    setFragmentIndex(0);
    setExpiresAt(null);
    setProgress(null);
    setAuthStep(0);
    setPhase("select");
  }, []);

  if (phase === "select") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 animate-slide-up">
        <div>
          <h1 className="text-xl font-bold text-ink">{t("send.title")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("send.subtitle")}</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-all ${
            dragging ? "border-accent bg-accent/10 shadow-comic-accent" : "border-ink bg-surface"
          }`}
        >
          <UploadCloud size={30} className="text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">{t("send.dropTitle")}</p>
          <p className="text-xs text-ink-faint">{t("dashboard.or")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => fileInputRef.current?.click()}>
              <FilePlus size={16} /> {t("dashboard.selectFiles")}
            </Button>
            <Button variant="secondary" onClick={() => folderInputRef.current?.click()}>
              <FolderOpen size={16} /> {t("dashboard.selectFolder")}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFilesFiltered(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error -- non-standard attributes for directory selection, supported in Chromium/Firefox
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={(e) => {
              setFilesFiltered(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <Card className="animate-slide-up">
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  {t(`common.files_${files.length === 1 ? "one" : "other"}`, { count: files.length })}
                </p>
                <p className="text-sm font-semibold text-ink">{formatBytes(totalSize)}</p>
              </div>
              <FileList files={files.map((f, i) => ({ id: `${i}-${f.name}`, name: relativePathOf(f), size: f.size }))} onRemove={removeFile} />
              <Button onClick={() => void startPreparing()} className="self-start">
                {t("common.continue")}
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  if (phase === "preparing") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center animate-slide-up">
        <h1 className="text-lg font-bold text-ink">{t("send.preparing")}</h1>
        <Card className="w-full">
          <CardBody>
            <ul className="space-y-3 text-left text-sm">
              {prepSteps.map((step) => (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors ${
                      step.done ? "bg-success text-white" : "bg-surface-raised text-transparent"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className={step.done ? "font-medium text-ink" : "text-ink-muted"}>
                    {step.label}
                    {step.key === "hashing" && !step.done && hashingProgress && (
                      <span className="ml-1 font-mono text-xs text-ink-faint">
                        ({hashingProgress.index}/{hashingProgress.total})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (phase === "qr") {
    const fragment = fragments[fragmentIndex];
    const urgent = countdown.secondsLeft <= 60;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center animate-slide-up">
        <div>
          <h1 className="text-xl font-bold text-ink">{t("send.scanToConnect")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("send.scanInstructions")}</p>
        </div>

        <div className="flex w-full items-center justify-between rounded-md border-2 border-ink bg-surface-raised px-4 py-2.5 text-left text-sm">
          <span className="truncate font-semibold text-ink">{label}</span>
          <span className="shrink-0 text-ink-muted">{formatBytes(totalSize)}</span>
        </div>

        {fragment && <QRCodeDisplay text={JSON.stringify(fragment)} />}

        <div className="flex items-center gap-3">
          <span className="rounded-full border-2 border-ink bg-accent px-3 py-1 font-mono text-sm font-bold text-accent-ink">
            {t("send.part", { index: fragmentIndex + 1, total: fragments.length })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFragmentIndex((i) => (i - 1 + fragments.length) % fragments.length)}
            aria-label={t("common.previous")}
            disabled={fragments.length < 2}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button variant={autoRotate ? "secondary" : "ghost"} size="sm" onClick={() => setAutoRotate((v) => !v)} disabled={fragments.length < 2}>
            <RotateCw size={14} /> {t("send.autoRotate")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFragmentIndex((i) => (i + 1) % fragments.length)}
            aria-label={t("common.next")}
            disabled={fragments.length < 2}
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        <p className={`text-xs font-medium ${urgent ? "text-danger" : "text-ink-faint"}`}>
          {t("send.sessionExpiresIn", { time: countdown.label })}
        </p>
      </div>
    );
  }

  if (phase === "authenticating") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center animate-slide-up">
        <h1 className="text-lg font-bold text-ink">{t("receive.startingTransfer")}</h1>
        <Card className="w-full">
          <CardBody>
            <ul className="space-y-3 text-left text-sm">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-success text-white">
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <ShieldCheck size={14} /> {t("receive.pairingComplete")}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors ${
                    authStep >= 2 ? "bg-success text-white" : "bg-surface-raised text-transparent"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className={`flex items-center gap-1.5 ${authStep >= 2 ? "font-medium text-ink" : "text-ink-muted"}`}>
                  <Radio size={14} /> {t("receive.secureChannel")}: {t("receive.established")}
                </span>
              </li>
            </ul>
          </CardBody>
        </Card>
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
    return <CompletionView fileCount={files.length} totalSize={totalSize} onNewTransfer={resetToSelect} />;
  }

  if (phase === "expired") {
    return <ErrorState title={t("errors.sessionExpiredTitle")} body={t("errors.sessionExpiredBody")} onRetry={resetToSelect} />;
  }

  return <ErrorState title={t("errors.connectionFailedTitle")} body={errorMessage || t("errors.connectionFailedBody")} onRetry={resetToSelect} />;
}
