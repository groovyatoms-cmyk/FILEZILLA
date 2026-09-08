import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslation } from "react-i18next";
import { CameraOff } from "lucide-react";

export interface QRScannerProps {
  onDetect: (text: string) => void;
  /** Pause scanning briefly (e.g. right after a successful detection) to avoid re-triggering on the same frame. */
  paused?: boolean;
}

export function QRScanner({ onDetect, paused = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const { t } = useTranslation();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        if (!cancelled) setPermissionDenied(true);
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      tick();
    }

    function tick() {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }
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
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (permissionDenied) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-ink bg-surface-raised text-center">
        <CameraOff size={24} className="text-ink-faint" aria-hidden="true" />
        <p className="max-w-xs px-4 text-sm text-ink-muted">{t("receive.cameraDenied")}</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Camera preview" />
      <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" aria-hidden="true" />
    </div>
  );
}
