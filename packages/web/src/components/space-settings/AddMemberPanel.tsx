import type { RefObject } from "react";
import type { SpaceRole } from "@ai-spaces/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES, type SearchResult } from "./spaceSettingsTypes";

interface AddMemberPanelProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  searchResults: SearchResult[];
  searching: boolean;
  selectedRole: SpaceRole;
  inviteUrl: string | null;
  copied: boolean;
  onSearchQueryChange: (value: string) => void;
  onSelectedRoleChange: (role: SpaceRole) => void;
  onAddMember: (user: SearchResult) => void;
  onCreateInvite: () => void;
  onCopyToClipboard: (text: string) => void;
}

export default function AddMemberPanel({
  searchInputRef,
  searchQuery,
  searchResults,
  searching,
  selectedRole,
  inviteUrl,
  copied,
  onSearchQueryChange,
  onSelectedRoleChange,
  onAddMember,
  onCreateInvite,
  onCopyToClipboard,
}: AddMemberPanelProps) {
  return (
    <div className="mt-4 rounded-lg border border-t-hair bg-t-bg-well p-4">
      <div className="mb-3 text-[13px] font-medium text-t-ink-mid">Add member</div>

      <div className="mb-3 flex items-center gap-3">
        <label className="text-xs text-t-ink-dim">Role:</label>
        <select
          value={selectedRole}
          onChange={(e) => onSelectedRoleChange(e.target.value as SpaceRole)}
          className="rounded-md border border-input bg-background px-2 py-1 font-sans text-sm text-t-ink"
        >
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search by name or email..."
          className="pr-8 font-sans"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-t-ink-faint">
            <div className="size-4 animate-spin rounded-full border-2 [border-color:var(--t-accent)] [border-top-color:transparent]" />
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-[240px] w-full overflow-y-auto overflow-x-hidden rounded-lg border border-t-hair bg-t-bg-raised shadow-lg">
            {searchResults.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onAddMember(user)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-t-bg-well"
              >
                <span className="material-symbols-outlined text-lg text-t-ink-dim">person</span>
                <div>
                  <div className="font-medium text-t-ink">{user.displayName || "Unnamed"}</div>
                  <div className="text-xs text-t-ink-dim">{user.email}</div>
                </div>
                <span className="material-symbols-outlined ml-auto text-base text-t-ink-faint">
                  add
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-t-ink-dim">or</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreateInvite}
          className="text-xs"
        >
          <span className="material-symbols-outlined mr-1 text-sm">link</span>
          Create invite link
        </Button>
      </div>

      {inviteUrl && (
        <div className="mt-3 flex items-center gap-2 rounded border border-t-hair bg-t-bg-alt p-2">
          <input
            type="text"
            value={inviteUrl}
            readOnly
            className="flex-1 truncate border-0 bg-transparent font-mono text-sm text-t-ink-mid outline-none"
          />
          <button
            type="button"
            onClick={() => onCopyToClipboard(inviteUrl)}
            title={copied ? "Copied!" : "Copy link"}
            className={`flex items-center p-1 ${copied ? "text-t-agent" : "text-t-ink-dim"}`}
          >
            <span className="material-symbols-outlined text-base">
              {copied ? "check" : "content_copy"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
