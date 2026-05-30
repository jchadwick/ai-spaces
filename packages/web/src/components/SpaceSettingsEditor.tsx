import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useAPI } from "@/hooks/useAPI";
import type { SpaceRole } from "@ai-spaces/shared";

interface SpaceSettingsEditorProps {
  spaceId: string;
  spaceConfig: {
    name: string;
    description?: string;
  };
  onConfigUpdated: (config: { name: string; description?: string }) => void;
}

interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  email: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  id: string;
  email: string;
  displayName?: string;
}

const ROLES: { value: SpaceRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

type TabId = "general" | "users";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "users", label: "Users", icon: "group" },
];

export default function SpaceSettingsEditor({
  spaceId,
  spaceConfig,
  onConfigUpdated,
}: SpaceSettingsEditorProps) {
  const apiFetch = useAPI();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("general");

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
      onConfigUpdated(data.space?.config ?? { name: name.trim(), description: description.trim() || undefined });
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
          const existingUserIds = new Set(members.map((m) => m.userId));
          const filtered = (data?.users ?? []).filter((u) => !existingUserIds.has(u.id));
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
  const handleAddMember = useCallback(async (user: SearchResult) => {
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
  }, [spaceId, selectedRole, apiFetch, showToast]);

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
  const handleChangeRole = useCallback(async (userId: string, newRole: SpaceRole) => {
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
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
      showToast("Role updated", "success", 2000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to change role", "error", 4000);
    }
  }, [spaceId, apiFetch, showToast]);

  // Remove member
  const handleRemoveMember = useCallback(async (member: SpaceMember) => {
    try {
      const res = await apiFetch(`/api/spaces/${spaceId}/members/${member.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      showToast(`Removed ${member.displayName ?? member.email}`, "success", 2000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove member", "error", 4000);
    }
  }, [spaceId, apiFetch, showToast]);

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
    <div className="flex flex-col h-full overflow-auto" style={{ background: "var(--t-bgRaised)" }}>
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: "italic",
              fontSize: 28,
              color: "var(--t-ink)",
              margin: 0,
            }}
          >
            Space Settings
          </h1>
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

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6"
          style={{ borderBottom: "1px solid var(--t-hair)" }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  color: isActive ? "var(--t-accent)" : "var(--t-inkDim)",
                  borderBottom: isActive ? "2px solid var(--t-accent)" : "2px solid transparent",
                  marginBottom: "-1px",
                  background: "transparent",
                  borderLeft: "none",
                  borderRight: "none",
                  borderTop: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--t-inkMid)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--t-inkDim)";
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "general" && (
          <section>
            <div className="space-y-4">
              <div>
                <label
                  style={{ fontSize: 13, color: "var(--t-inkMid)", fontWeight: 500, display: "block", marginBottom: 6 }}
                >
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Space name"
                  style={{ fontFamily: "'Inter Tight', sans-serif" }}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 13, color: "var(--t-inkMid)", fontWeight: 500, display: "block", marginBottom: 6 }}
                >
                  Description
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this space..."
                  rows={3}
                  style={{ fontFamily: "'Inter Tight', sans-serif", resize: "vertical" }}
                />
              </div>
              {configError && (
                <div style={{ fontSize: 13, color: "var(--t-accent)" }}>{configError}</div>
              )}
            </div>
          </section>
        )}

        {activeTab === "users" && (
          <section>
            {loadingMembers ? (
              <div style={{ fontSize: 14, color: "var(--t-inkDim)", fontStyle: "italic", padding: "12px 0" }}>
                Loading members...
              </div>
            ) : membersError ? (
              <div style={{ fontSize: 13, color: "var(--t-accent)", padding: "12px 0" }}>{membersError}</div>
            ) : (
              <>
                {/* Members table */}
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: "1px solid var(--t-hair)" }}
                >
                  <table className="w-full" style={{ fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "var(--t-bgWell)" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            fontWeight: 500,
                            color: "var(--t-inkMid)",
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          User
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            fontWeight: 500,
                            color: "var(--t-inkMid)",
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            width: 140,
                          }}
                        >
                          Role
                        </th>
                        <th style={{ width: 48, padding: "8px 12px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr
                          key={member.userId}
                          style={{ borderTop: "1px solid var(--t-hair)" }}
                        >
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ fontWeight: 500, color: "var(--t-ink)" }}>
                              {member.displayName || "Unnamed"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--t-inkDim)" }}>
                              {member.email}
                            </div>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleChangeRole(member.userId, e.target.value as SpaceRole)
                              }
                              className="rounded-md border border-input bg-background text-sm"
                              style={{
                                padding: "4px 8px",
                                fontFamily: "'Inter Tight', sans-serif",
                                color: "var(--t-ink)",
                                cursor: "pointer",
                              }}
                            >
                              {ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            {member.role !== "owner" && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member)}
                                title="Remove member"
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--t-inkFaint)",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: 4,
                                  borderRadius: 4,
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.color = "var(--t-accent)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.color = "var(--t-inkFaint)")
                                }
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                  person_remove
                                </span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add member section */}
                <div
                  className="mt-4 p-4 rounded-lg"
                  style={{ background: "var(--t-bgWell)", border: "1px solid var(--t-hair)" }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t-inkMid)", marginBottom: 12 }}>
                    Add member
                  </div>

                  {/* Role selector */}
                  <div className="flex items-center gap-3 mb-3">
                    <label style={{ fontSize: 12, color: "var(--t-inkDim)" }}>Role:</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as SpaceRole)}
                      className="rounded-md border border-input bg-background text-sm"
                      style={{
                        padding: "4px 8px",
                        fontFamily: "'Inter Tight', sans-serif",
                        color: "var(--t-ink)",
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search input with typeahead */}
                  <div className="relative">
                    <Input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or email..."
                      style={{ fontFamily: "'Inter Tight', sans-serif", paddingRight: 32 }}
                    />
                    {searching && (
                      <div
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--t-inkFaint)" }}
                      >
                        <div
                          className="animate-spin rounded-full w-4 h-4 border-2 border-t-transparent"
                          style={{ borderColor: "var(--t-accent)", borderTopColor: "transparent" }}
                        />
                      </div>
                    )}

                    {/* Typeahead results */}
                    {searchResults.length > 0 && (
                      <div
                        className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-hidden"
                        style={{
                          background: "var(--t-bgRaised)",
                          border: "1px solid var(--t-hair)",
                          maxHeight: 240,
                          overflowY: "auto",
                        }}
                      >
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAddMember(user)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-t-bgWell transition-colors"
                            style={{ fontSize: 14 }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 18, color: "var(--t-inkDim)" }}
                            >
                              person
                            </span>
                            <div>
                              <div style={{ fontWeight: 500, color: "var(--t-ink)" }}>
                                {user.displayName || "Unnamed"}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--t-inkDim)" }}>
                                {user.email}
                              </div>
                            </div>
                            <span
                              className="material-symbols-outlined ml-auto"
                              style={{ fontSize: 16, color: "var(--t-inkFaint)" }}
                            >
                              add
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Invite link section */}
                  <div className="mt-3 flex items-center gap-2">
                    <span style={{ fontSize: 12, color: "var(--t-inkDim)" }}>or</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCreateInvite}
                      style={{ fontSize: 12 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>
                        link
                      </span>
                      Create invite link
                    </Button>
                  </div>

                  {/* Invite URL display */}
                  {inviteUrl && (
                    <div
                      className="mt-3 flex items-center gap-2 p-2 rounded"
                      style={{ background: "var(--t-bgAlt)", border: "1px solid var(--t-hair)" }}
                    >
                      <input
                        type="text"
                        value={inviteUrl}
                        readOnly
                        className="flex-1 text-sm font-mono truncate"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--t-inkMid)",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyToClipboard(inviteUrl)}
                        title={copied ? "Copied!" : "Copy link"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: copied ? "var(--t-agent)" : "var(--t-inkDim)",
                          display: "flex",
                          alignItems: "center",
                          padding: 4,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {copied ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
