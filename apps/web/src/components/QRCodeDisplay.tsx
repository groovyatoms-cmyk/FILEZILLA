import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle } from "lucide-react";

export function QRCodeDisplay({ text, size = 320 }: { text: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    setFailed(false);
    QRCode.toCanvas(canvasRef.current, text, {
      width: size,
      margin: 3,
      errorCorrectionLevel: "M",
      color: { dark: "#000814", light: "#ffffff" },
    }).catch(() => setFailed(true));
  }, [text, size]);

  if (failed) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-danger bg-danger/10 p-6 text-center"
        style={{ width: size, height: size }}
      >
        <AlertTriangle size={24} className="text-danger" aria-hidden="true" />
        <p className="text-xs font-medium text-danger">Couldn't render this QR code. Try a smaller transfer.</p>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center justify-center rounded-lg border-2 border-ink bg-white p-4 shadow-comic">
      <canvas ref={canvasRef} width={size} height={size} role="img" aria-label="Pairing QR code" />
    </div>
  );
}
