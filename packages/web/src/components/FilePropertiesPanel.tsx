import { useEffect, useState } from "react";
import { useFileMetadata } from "../contexts/FileMetadataContext";
import type { FileInfo } from "../hooks/useFileContent";
import { useFileContent } from "../hooks/useFileContent";

interface FilePropertiesPanelProps {
  spaceId: string;
  filePath: string;
  fileInfo: FileInfo | null;
  onClose: () => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function extractTitle(content: string | null): string | null {
  if (!content?.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = content.slice(3, end);
  const m = fm.match(/^title:\s*(.+)$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
}

export function FilePropertiesPanel({
  spaceId,
  filePath,
  fileInfo,
  onClose,
}: FilePropertiesPanelProps) {
  const { getEntry, updateEntry } = useFileMetadata();
  const { content } = useFileContent(spaceId, filePath);
  const entry = getEntry(filePath) ?? {};

  const frontmatterTitle = extractTitle(content);
  const initialDisplayName = entry.displayName ?? frontmatterTitle ?? "";
  const initialSummary = entry.summary ?? "";

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [summary, setSummary] = useState(initialSummary);
  const [saving, setSaving] = useState(false);

  // Re-initialize when entry or frontmatter changes (e.g. on file switch)
  useEffect(() => {
    setDisplayName(entry.displayName ?? frontmatterTitle ?? "");
    setSummary(entry.summary ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontmatterTitle, entry.summary, entry.displayName]);

  const handleSave = async () => {
    setSaving(true);
    await updateEntry(filePath, {
      displayName: displayName.trim() || undefined,
      summary: summary.trim() || undefined,
    });
    setSaving(false);
    onClose();
  };

  const labelClass =
    "mb-[3px] block font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-t-ink-dim";
  const inputClass =
    "box-border w-full rounded-md border border-t-hair bg-t-bg-well px-2.5 py-1.5 font-sans text-[13px] text-t-ink outline-none";

  return (
    <div className="flex flex-col gap-2.5 border-b border-t-hair bg-t-bg-raised px-6 py-3">
      <div className="flex gap-4">
        <div className="flex-1">
          <label className={labelClass}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={fileInfo?.name ?? ""}
            className={inputClass}
          />
        </div>
        {fileInfo?.type && (
          <div className="min-w-[90px]">
            <label className={labelClass}>File Type</label>
            <div className="py-1.5 font-mono text-xs text-t-ink-mid">{fileInfo.type}</div>
          </div>
        )}
        {fileInfo?.modifiedAt && (
          <div className="min-w-20">
            <label className={labelClass}>Modified</label>
            <div className="py-1.5 font-mono text-xs text-t-ink-mid">
              {formatRelativeTime(fileInfo.modifiedAt)}
            </div>
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line description of this file..."
          className={`${inputClass} min-h-14 resize-y`}
          rows={2}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="cursor-pointer rounded-md border border-t-hair bg-transparent px-3.5 py-[5px] text-[13px] text-t-ink-mid disabled:cursor-default disabled:opacity-70"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer rounded-md border-0 bg-t-accent px-3.5 py-[5px] text-[13px] font-medium text-t-bg-raised disabled:cursor-default disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
