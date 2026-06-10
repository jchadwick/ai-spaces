import type { SpaceRole } from "@ai-spaces/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAPI } from "@/hooks/useAPI";
import { cn } from "@/lib/utils";
import GeneralSettingsForm from "./space-settings/GeneralSettingsForm";
import MembersSettings from "./space-settings/MembersSettings";
import {
  type SearchResult,
  type SpaceMember,
  type SpaceSettingsConfig,
  TABS,
  type TabId,
} from "./space-settings/spaceSettingsTypes";

interface SpaceSettingsEditorProps {
  spaceId: string;
  spaceConfig: SpaceSettingsConfig;
  onConfigUpdated: (config: SpaceSettingsConfig) => void;
  initialTab?: TabId;
  allowedTabs?: TabId[];
  showHeader?: boolean;
}

export default function SpaceSettingsEditor({
  spaceId,
  spaceConfig,
  onConfigUpdated,
  initialTab = "general",
  allowedTabs,
  showHeader = true,
}: SpaceSettingsEditorProps) {
  const apiFetch = useAPI();
  const { showToast } = useToast();

  const visibleTabs = TABS.filter((tab) => !allowedTabs || allowedTabs.includes(tab.id));
  const [activeTab, setActiveTab] = useState<TabId>(
    visibleTabs.some((tab) => tab.id === initialTab)
      ? initialTab
      : (visibleTabs[0]?.id ?? "general"),
  );

  // General settings state
  const [name, setName] = useState(spaceConfig.name);
  const [description, setDescription] = useState(spaceConfig.description ?? "");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Dirty checking
  const isDirty = name !== spaceConfig.name || description !== (spaceConfig.description ?? "");

  // Members state
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Add member state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<SpaceRole>("viewer");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load members on mount
  useEffect(() => {
    let mounted = true;
    setLoadingMembers(true);
    apiFetch(`/api/spaces/${spaceId}/members`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load members");
        return res.json();
      })
      .then((data: { members: SpaceMember[] }) => {
        if (mounted) {
          setMembers(data.members);
          setLoadingMembers(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setMembersError(err.message);
          setLoadingMembers(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [spaceId, apiFetch]);

  // Update local state when spaceConfig changes
  useEffect(() => {
    setName(spaceConfig.name);
    setDescription(spaceConfig.description ?? "");
  }, [spaceConfig.name, spaceConfig.description]);

  // Save general settings
  const handleSaveConfig = useCallback(async () => {
    if (!name.trim()) {
      setConfigError("Name is required");
      return;
    }
    setSavingConfig(true);
    setConfigError(null);
    try {
      const res = await apiFetch(`/api/spaces/${spaceId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to save settings (${res.status})`);
      }
      const data = await res.json();
      onConfigUpdated(
        data.space?.config ?? { name: name.trim(), description: description.trim() || undefined },
      );
      showToast("Settings saved", "success", 2000);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingConfig(false);
    }
  }, [spaceId, name, description, apiFetch, onConfigUpdated, showToast]);

  // Search users for typeahead
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(() => {
      apiFetch(`/api/spaces/${spaceId}/user-search?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => {
          if (!res.ok) {
            setSearchResults([]);
            return;
          }
          return res.json();
        })
        .then((data: { users: SearchResult[] }) => {
          const existingUserIds = new Set(members.map((member) => member.userId));
          const filtered = (data?.users ?? []).filter((user) => !existingUserIds.has(user.id));
          setSearchResults(filtered);
          setSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearching(false);
        });
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, spaceId, apiFetch, members]);

  // Add existing user as member
  const handleAddMember = useCallback(
    async (user: SearchResult) => {
      try {
        const res = await apiFetch(`/api/spaces/${spaceId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, role: selectedRole }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to add member");
        }
        const membersRes = await apiFetch(`/api/spaces/${spaceId}/members`);
        const membersData = await membersRes.json();
        setMembers(membersData.members);
        setSearchQuery("");
        setSearchResults([]);
        showToast(`Added ${user.displayName ?? user.email}`, "success", 2000);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to add member", "error", 4000);
      }
    },
    [spaceId, selectedRole, apiFetch, showToast],
  );

  // Create invite link
  const handleCreateInvite = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/spaces/${spaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create invite");
      }
      const data = await res.json();
      setInviteUrl(data.inviteUrl);
      showToast("Invite link created", "success", 2000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create invite", "error", 4000);
    }
  }, [spaceId, selectedRole, apiFetch, showToast]);

  // Change member role
  const handleChangeRole = useCallback(
    async (userId: string, newRole: SpaceRole) => {
      try {
        const res = await apiFetch(`/api/spaces/${spaceId}/members/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to change role");
        }
        setMembers((prev) =>
          prev.map((member) => (member.userId === userId ? { ...member, role: newRole } : member)),
        );
        showToast("Role updated", "success", 2000);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to change role", "error", 4000);
      }
    },
    [spaceId, apiFetch, showToast],
  );

  // Remove member
  const handleRemoveMember = useCallback(
    async (member: SpaceMember) => {
      try {
        const res = await apiFetch(`/api/spaces/${spaceId}/members/${member.userId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to remove member");
        }
        setMembers((prev) => prev.filter((item) => item.userId !== member.userId));
        showToast(`Removed ${member.displayName ?? member.email}`, "success", 2000);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to remove member", "error", 4000);
      }
    },
    [spaceId, apiFetch, showToast],
  );

  // Copy to clipboard
  const handleCopyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-auto bg-t-bg-raised">
      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        {showHeader && (
          <div className="mb-6 flex items-center justify-between">
            <h1 className="m-0 font-sans text-[28px] font-bold text-t-ink">Space Settings</h1>
            {activeTab === "general" && (
              <Button
                onClick={handleSaveConfig}
                disabled={savingConfig || !name.trim() || !isDirty}
                size="sm"
              >
                {savingConfig ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        )}

        {visibleTabs.length > 1 && (
          <div className="mb-6 flex border-b border-t-hair">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 border-l-0 border-r-0 border-t-0 bg-transparent px-4 py-2.5 font-sans text-sm font-medium transition-colors",
                    isActive
                      ? "border-t-accent text-t-accent"
                      : "border-transparent text-t-ink-dim hover:text-t-ink-mid",
                  )}
                >
                  <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "general" && (
          <GeneralSettingsForm
            name={name}
            description={description}
            configError={configError}
            onNameChange={setName}
            onDescriptionChange={setDescription}
          />
        )}

        {activeTab === "users" && (
          <MembersSettings
            members={members}
            loadingMembers={loadingMembers}
            membersError={membersError}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searching={searching}
            selectedRole={selectedRole}
            inviteUrl={inviteUrl}
            copied={copied}
            onSearchQueryChange={setSearchQuery}
            onSelectedRoleChange={setSelectedRole}
            onAddMember={handleAddMember}
            onCreateInvite={handleCreateInvite}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
            onCopyToClipboard={handleCopyToClipboard}
          />
        )}
      </div>
    </div>
  );
}
