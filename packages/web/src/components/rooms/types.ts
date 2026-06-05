import type { SpaceRole } from "@ai-spaces/shared";

import type { SpaceMember } from "@/api/spaceFiles";

export interface SpaceSummary {
  id: string;
  path: string;
  config: {
    name: string;
    description?: string;
  };
  userRole: SpaceRole;
}

export interface RoomSummary {
  id: string;
  spaceId: string;
  topicPath: string;
  targetType: "file" | "directory";
  name: string;
  summary: string;
  pathParts: string[];
  members: SpaceMember[];
  updatedAt?: string;
}
