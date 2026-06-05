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

  const panelStyle: React.CSSProperties = {
    background: "var(--t-bgRaised)",
    borderBottom: "1px solid var(--t-hair)",
    padding: "12px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--t-inkDim)",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: 500,
    marginBottom: 3,
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--t-bgWell)",
    border: "1px solid var(--t-hair)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    color: "var(--t-ink)",
    fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical",
    minHeight: 56,
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={fileInfo?.name ?? ""}
            style={inputStyle}
          />
        </div>
        {fileInfo?.type && (
          <div style={{ minWidth: 90 }}>
            <label style={labelStyle}>File Type</label>
            <div
              style={{
                fontSize: 12,
                color: "var(--t-inkMid)",
                padding: "6px 0",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              {fileInfo.type}
            </div>
          </div>
        )}
        {fileInfo?.modifiedAt && (
          <div style={{ minWidth: 80 }}>
            <label style={labelStyle}>Modified</label>
            <div
              style={{
                fontSize: 12,
                color: "var(--t-inkMid)",
                padding: "6px 0",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              {formatRelativeTime(fileInfo.modifiedAt)}
            </div>
          </div>
        )}
      </div>
      <div>
        <label style={labelStyle}>Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line description of this file..."
          style={textareaStyle}
          rows={2}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          style={{
            background: "none",
            border: "1px solid var(--t-hair)",
            borderRadius: 6,
            padding: "5px 14px",
            fontSize: 13,
            color: "var(--t-inkMid)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "var(--t-accent)",
            border: "none",
            borderRadius: 6,
            padding: "5px 14px",
            fontSize: 13,
            color: "var(--t-bgRaised)",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
