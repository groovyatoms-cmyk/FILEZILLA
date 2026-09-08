import { File as FileIcon, X } from "lucide-react";
import { formatBytes } from "../utils/format";

export interface FileListItem {
  id: string;
  name: string;
  size: number;
}

export function FileList({ files, onRemove }: { files: FileListItem[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="divide-y-2 divide-ink overflow-hidden rounded-md border-2 border-ink bg-surface">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-raised">
            <FileIcon size={15} className="text-ink-muted" aria-hidden="true" />
          </span>
          <span className="flex-1 truncate text-sm font-medium text-ink">{file.name}</span>
          <span className="shrink-0 text-xs font-medium text-ink-muted">{formatBytes(file.size)}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              aria-label={`Remove ${file.name}`}
              className="focus-ring shrink-0 rounded-full p-1 text-ink-faint hover:bg-danger/10 hover:text-danger"
            >
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
