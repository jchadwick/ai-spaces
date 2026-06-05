import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAPI } from "@/hooks/useAPI";

interface SpaceSettingsDialogProps {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPatterns: string[];
  onPatternsUpdated: (patterns: string[]) => void;
}

const DEFAULT_PATTERNS = [".space/chat-history.json", ".space/history.json", ".space/spaces.json"];

export default function SpaceSettingsDialog({
  spaceId,
  open,
  onOpenChange,
  initialPatterns,
  onPatternsUpdated,
}: SpaceSettingsDialogProps) {
  const [patterns, setPatterns] = useState<string[]>(initialPatterns);
  const [newPattern, setNewPattern] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiFetch = useAPI();

  useEffect(() => {
    // Don't store default patterns in user patterns since they're always applied
    setPatterns(initialPatterns.filter((p) => !DEFAULT_PATTERNS.includes(p)));
  }, [initialPatterns]);

  const handleAddPattern = useCallback(() => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    if (patterns.includes(trimmed)) {
      setNewPattern("");
      return;
    }
    setPatterns((prev) => [...prev, trimmed]);
    setNewPattern("");
  }, [newPattern, patterns]);

  const handleRemovePattern = useCallback((pattern: string) => {
    setPatterns((prev) => prev.filter((p) => p !== pattern));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/spaces/${spaceId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIgnorePatterns: patterns }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to save settings (${res.status})`);
      }
      onPatternsUpdated(patterns);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [apiFetch, spaceId, patterns, onPatternsUpdated, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
          <DialogDescription>
            Manage which file paths should be excluded from notifications. Patterns support exact
            paths, prefix matches (ending with /), and * wildcards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-sm font-medium text-t-ink">Ignore patterns</div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {DEFAULT_PATTERNS.map((pattern) => (
              <div
                key={pattern}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-t-bg-well text-sm font-mono text-t-ink-mid"
              >
                <span className="material-symbols-outlined text-sm text-t-ink-faint">lock</span>
                <span className="flex-1">{pattern}</span>
                <span className="text-t-ink-faint text-xs">default</span>
              </div>
            ))}
            {patterns
              .filter((p) => !DEFAULT_PATTERNS.includes(p))
              .map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-t-bg-well text-sm font-mono text-t-ink-mid"
                >
                  <span className="flex-1">{pattern}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePattern(pattern)}
                    className="text-t-ink-faint hover:text-t-accent transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPattern();
            }}
            className="flex gap-2"
          >
            <Input
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder='e.g. "*.log" or "dist/"'
              className="font-mono text-sm flex-1"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!newPattern.trim()}>
              Add
            </Button>
          </form>
        </div>

        {error && <div className="text-sm text-t-accent">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
