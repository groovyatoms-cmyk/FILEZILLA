import { File as FileIcon, X } from "lucide-react";
import { formatBytes } from "../utils/format";

export interface FileListItem {
  id: string;
  name: string;
  size: number;
}

export function FileList({ files, onRemove }: { files: FileListItem[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
          <FileIcon size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />
          <span className="flex-1 truncate text-sm text-ink">{file.name}</span>
          <span className="shrink-0 text-xs text-ink-muted">{formatBytes(file.size)}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              aria-label={`Remove ${file.name}`}
              className="focus-ring shrink-0 rounded p-1 text-ink-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
