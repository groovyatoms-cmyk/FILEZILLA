import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QRCodeDisplay({ text, size = 260 }: { text: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#18181b", light: "#ffffff" },
    });
  }, [text, size]);

  return (
    <div className="inline-flex items-center justify-center rounded-lg border-2 border-ink bg-white p-4 shadow-comic">
      <canvas ref={canvasRef} width={size} height={size} role="img" aria-label="Pairing QR code" />
    </div>
  );
}
