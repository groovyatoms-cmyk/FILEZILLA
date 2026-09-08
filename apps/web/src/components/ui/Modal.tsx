import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border-2 border-ink bg-surface shadow-comic animate-slide-up"
      >
        <div className="flex items-center justify-between border-b-2 border-ink px-5 py-4">
          <h2 id="modal-title" className="text-sm font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring rounded-md p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-ink-muted">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t-2 border-ink px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
