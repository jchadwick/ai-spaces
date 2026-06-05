import type { SpaceRole } from "@ai-spaces/shared";

export type TabId = "general" | "users";

export interface SpaceSettingsConfig {
  name: string;
  description?: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  email: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  id: string;
  email: string;
  displayName?: string;
}

export const ROLES: { value: SpaceRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "users", label: "Users", icon: "group" },
];
