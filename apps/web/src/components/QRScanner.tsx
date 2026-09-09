import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslation } from "react-i18next";
import { CameraOff, Flashlight, FlashlightOff } from "lucide-react";

export interface QRScannerProps {
  onDetect: (text: string) => void;
  /** Pause scanning briefly (e.g. right after a successful detection) to avoid re-triggering on the same frame. */
  paused?: boolean;
}

type CameraErrorKind = "denied" | "not-found" | "in-use" | "unsupported" | "unknown";

/** jsQR decode is real CPU work; running it on every animation frame (~60fps) can jank the
 * preview on slower devices for no benefit — a QR code doesn't move, so ~10 scans/sec is
 * already far more than enough to catch it quickly while leaving the main thread free. */
const SCAN_INTERVAL_MS = 100;

function classifyGetUserMediaError(error: unknown): CameraErrorKind {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "TrackStartError") return "in-use";
  return "unknown";
}

export function QRScanner({ onDetect, paused = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const { t } = useTranslation();
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKind("unsupported");
      return;
    }

    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;
    let lastScanAt = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch (error) {
        if (!cancelled) setErrorKind(classifyGetUserMediaError(error));
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      setTorchSupported(!!track && "torch" in (track.getCapabilities?.() ?? {}));
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        // Autoplay can be blocked in rare cases; the video element still renders once the
        // browser allows it (muted + playsInline satisfies autoplay policy in practice).
      }
      rafId = requestAnimationFrame(tick);
    }

    function tick(now: number) {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      if (now - lastScanAt < SCAN_INTERVAL_MS) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastScanAt = now;

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code && code.data && !pausedRef.current) {
        onDetectRef.current(code.data);
      }
      rafId = requestAnimationFrame(tick);
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      trackRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Torch control isn't guaranteed even when reported as supported; fail silently.
    }
  };

  if (errorKind) {
    const messages: Record<CameraErrorKind, string> = {
      denied: t("receive.cameraDenied"),
      "not-found": t("receive.cameraNotFound"),
      "in-use": t("receive.cameraInUse"),
      unsupported: t("receive.cameraUnsupported"),
      unknown: t("receive.cameraDenied"),
    };
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-ink bg-surface-raised p-4 text-center">
        <CameraOff size={24} className="text-ink-faint" aria-hidden="true" />
        <p className="max-w-xs text-sm text-ink-muted">{messages[errorKind]}</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-ink bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Camera preview" />
      <ScanFrame />
      {torchSupported && (
        <button
          type="button"
          onClick={() => void toggleTorch()}
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
          aria-pressed={torchOn}
          className={`focus-ring absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 transition-colors ${
            torchOn ? "bg-accent text-accent-ink" : "bg-black/50 text-white"
          }`}
        >
          {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
        </button>
      )}
    </div>
  );
}

/** Corner-bracket scan frame — communicates "point here" without a solid box occluding the QR.
 * A QR code is square, so the guide is kept square (sized off the container's height, the
 * shorter side of the 16:9 preview) rather than stretching to the video's own aspect ratio. */
function ScanFrame() {
  const corner = "absolute h-8 w-8 border-white";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="relative aspect-square h-[70%]">
        <div className={`${corner} left-0 top-0 border-l-4 border-t-4 rounded-tl-lg`} />
        <div className={`${corner} right-0 top-0 border-r-4 border-t-4 rounded-tr-lg`} />
        <div className={`${corner} bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg`} />
        <div className={`${corner} bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg`} />
      </div>
    </div>
  );
}
