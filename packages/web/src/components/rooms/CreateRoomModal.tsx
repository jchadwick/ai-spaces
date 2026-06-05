import type { CSSProperties } from "react";
import { useState } from "react";
import { Check, Plus, Shield } from "lucide-react";

import {
  createSpaceDirectory,
  createSpaceFile,
  patchFileMetadata,
  promoteSpaceTopic,
} from "@/api/spaceFiles";
import { RoomsButton } from "@/components/rooms/controls/RoomsButton";
import { RoomsField } from "@/components/rooms/controls/RoomsField";
import { RoomsModal } from "@/components/rooms/controls/RoomsModal";
import type { SpaceSummary } from "@/components/rooms/types";
import { roleIsOwner, spaceColor } from "@/components/rooms/roomsUtils";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export function CreateRoomModal({
  spaces,
  onClose,
  onCreated,
}: {
  spaces: SpaceSummary[];
  onClose: () => void;
  onCreated: (spaceId: string, roomId: string) => void;
}) {
  const ownerSpaces = spaces.filter((space) => roleIsOwner(space.userRole));
  const [name, setName] = useState("");
  const [spaceId, setSpaceId] = useState(ownerSpaces[0]?.id ?? "");
  const [folder, setFolder] = useState("");
  const [summary, setSummary] = useState("");
  const { showToast } = useToast();
  const selectedSpace = ownerSpaces.find((space) => space.id === spaceId);
  const canCreate = Boolean(name.trim() && folder.trim() && spaceId);

  async function createRoom() {
    if (!canCreate) return;
    const normalizedPath = folder
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("/");
    try {
      await createSpaceDirectory(spaceId, normalizedPath);
      await createSpaceFile(
        spaceId,
        `${normalizedPath}/overview.md`,
        `# ${name.trim()}\n\n${summary.trim() || "Start here."}\n`,
      );
      await patchFileMetadata(spaceId, normalizedPath, {
        displayName: name.trim(),
        summary: summary.trim() || undefined,
      });
      const room = await promoteSpaceTopic(spaceId, `/${normalizedPath}`, "directory");
      showToast("Room created", "success");
      onCreated(spaceId, room.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create room", "error");
    }
  }

  return (
    <RoomsModal
      title="New room"
      subtitle="Create a folder inside a Space and promote it into a room collaborators can open."
      onClose={onClose}
      footer={
        <>
          <RoomsButton variant="ghost" onClick={onClose}>
            Cancel
          </RoomsButton>
          <RoomsButton
            variant="primary"
            icon={<Plus size={17} />}
            disabled={!canCreate}
            onClick={createRoom}
          >
            Create room
          </RoomsButton>
        </>
      }
    >
      <div className="flex flex-col gap-[18px]">
        <RoomsField
          label="Room name"
          placeholder="Yellowstone vacation"
          value={name}
          onChange={setName}
        />
        <div>
          <div className="mb-[9px] text-[13px] font-semibold text-rooms-ink-soft">Space</div>
          <div className="flex flex-wrap gap-2">
            {ownerSpaces.map((space) => (
              <button
                key={space.id}
                type="button"
                onClick={() => setSpaceId(space.id)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-3.5 py-[9px] text-[13.5px] font-medium",
                  spaceId === space.id
                    ? "border-rooms-ink bg-rooms-paper-3"
                    : "border-rooms-line-strong bg-rooms-paper",
                )}
              >
                <span
                  className="size-[9px] rounded-full"
                  style={
                    {
                      backgroundColor: spaceColor(spaces, space.id),
                    } satisfies CSSProperties
                  }
                />
                {space.config.name}
                {spaceId === space.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
        <RoomsField
          label="Folder path"
          prefix={selectedSpace ? `${selectedSpace.config.name} /` : undefined}
          placeholder="Vacations / Yellowstone"
          value={folder}
          onChange={setFolder}
        />
        <RoomsField
          label="Summary"
          textarea
          placeholder="Plans, budget, lodging, and chat for the Yellowstone trip."
          value={summary}
          onChange={setSummary}
        />
        <div className="flex gap-2.5 rounded-xl border border-rooms-line bg-rooms-paper-2 px-3.5 py-3">
          <Shield size={17} className="text-rooms-muted" />
          <span className="text-[12.5px] leading-normal text-rooms-ink-soft">
            This adds a folder inside the Space and promotes that one path. The rest of the Space
            stays private.
          </span>
        </div>
      </div>
    </RoomsModal>
  );
}
