import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { RoomsButton } from "@/components/rooms/controls/RoomsButton";
import { cn } from "@/lib/utils";

export function InlineEditableText({
  value,
  placeholder,
  ariaLabel,
  canEdit,
  multiline,
  required,
  className,
  inputClassName,
  emptyClassName,
  onSave,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  canEdit: boolean;
  multiline?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  emptyClassName?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedValue = value.trim();
  const displayValue = normalizedValue || placeholder;
  const canSave = !required || draft.trim().length > 0;
  const displayClassName = cn(className, !normalizedValue && emptyClassName);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function save() {
    if (!canSave) {
      setError("Required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return <span className={displayClassName}>{displayValue}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${ariaLabel}: edit`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
          setError(null);
        }}
        className={cn(
          "flex w-full max-w-full rounded-lg border-[1.5px] border-transparent bg-transparent px-1 py-0.5 -mx-1 -my-0.5 text-left text-inherit enabled:cursor-pointer",
          multiline ? "items-start" : "items-center",
          displayClassName,
        )}
      >
        <span
          className={cn(
            "min-w-0",
            multiline ? "whitespace-pre-wrap" : "overflow-hidden text-ellipsis",
          )}
        >
          {displayValue}
        </span>
      </button>
    );
  }

  const sharedInputClassName = cn(
    "min-w-0 flex-1 rounded-[10px] border-[1.5px] border-rooms-line-strong bg-rooms-paper text-rooms-ink outline-none",
    multiline ? "resize-none px-3 py-2" : "px-2.5 py-1.5",
    className,
    inputClassName,
  );

  return (
    <div className={cn("flex w-full max-w-full gap-2", multiline ? "items-start" : "items-center")}>
      {multiline ? (
        <textarea
          aria-label={ariaLabel}
          rows={3}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void save();
          }}
          className={sharedInputClassName}
        />
      ) : (
        <input
          aria-label={ariaLabel}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            if (event.key === "Enter") void save();
          }}
          className={sharedInputClassName}
        />
      )}
      <div className="flex shrink-0 items-center gap-1.5">
        <RoomsButton
          variant="primary"
          size="sm"
          icon={<Check size={16} />}
          title={saving ? "Saving" : "Save"}
          ariaLabel={saving ? "Saving" : `Save ${ariaLabel.toLowerCase()}`}
          disabled={!canSave || saving}
          onClick={() => void save()}
          className="size-[34px] rounded-[9px] p-0"
        />
        <RoomsButton
          variant="ghost"
          size="sm"
          icon={<X size={16} />}
          title="Cancel"
          ariaLabel={`Cancel editing ${ariaLabel.toLowerCase()}`}
          disabled={saving}
          onClick={() => setEditing(false)}
          className="size-[34px] rounded-[9px] p-0"
        />
        {error && <span className="text-[12.5px] text-rooms-error">{error}</span>}
      </div>
    </div>
  );
}
