import type { RefObject } from "react";
import type { SpaceRole } from "@ai-spaces/shared";
import AddMemberPanel from "./AddMemberPanel";
import MembersTable from "./MembersTable";
import type { SearchResult, SpaceMember } from "./spaceSettingsTypes";

interface MembersSettingsProps {
  members: SpaceMember[];
  loadingMembers: boolean;
  membersError: string | null;
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
  onChangeRole: (userId: string, newRole: SpaceRole) => void;
  onRemoveMember: (member: SpaceMember) => void;
  onCopyToClipboard: (text: string) => void;
}

export default function MembersSettings({
  members,
  loadingMembers,
  membersError,
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
  onChangeRole,
  onRemoveMember,
  onCopyToClipboard,
}: MembersSettingsProps) {
  if (loadingMembers) {
    return (
      <section>
        <div className="py-3 text-sm italic text-t-ink-dim">Loading members...</div>
      </section>
    );
  }

  if (membersError) {
    return (
      <section>
        <div className="py-3 text-[13px] text-t-accent">{membersError}</div>
      </section>
    );
  }

  return (
    <section>
      <MembersTable members={members} onChangeRole={onChangeRole} onRemoveMember={onRemoveMember} />
      <AddMemberPanel
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searching={searching}
        selectedRole={selectedRole}
        inviteUrl={inviteUrl}
        copied={copied}
        onSearchQueryChange={onSearchQueryChange}
        onSelectedRoleChange={onSelectedRoleChange}
        onAddMember={onAddMember}
        onCreateInvite={onCreateInvite}
        onCopyToClipboard={onCopyToClipboard}
      />
    </section>
  );
}
