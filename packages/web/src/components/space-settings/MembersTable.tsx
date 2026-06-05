import type { SpaceRole } from "@ai-spaces/shared";
import { ROLES, type SpaceMember } from "./spaceSettingsTypes";

interface MembersTableProps {
  members: SpaceMember[];
  onChangeRole: (userId: string, newRole: SpaceRole) => void;
  onRemoveMember: (member: SpaceMember) => void;
}

export default function MembersTable({ members, onChangeRole, onRemoveMember }: MembersTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-t-hair">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-t-bg-well">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.5px] text-t-ink-mid">
              User
            </th>
            <th className="w-[140px] px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.5px] text-t-ink-mid">
              Role
            </th>
            <th className="w-12 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.userId} className="border-t border-t-hair">
              <td className="px-3 py-2">
                <div className="font-medium text-t-ink">{member.displayName || "Unnamed"}</div>
                <div className="text-xs text-t-ink-dim">{member.email}</div>
              </td>
              <td className="px-3 py-2">
                <select
                  value={member.role}
                  onChange={(e) => onChangeRole(member.userId, e.target.value as SpaceRole)}
                  className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 font-sans text-sm text-t-ink"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                {member.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(member)}
                    title="Remove member"
                    className="flex items-center rounded p-1 text-t-ink-faint hover:text-t-accent"
                  >
                    <span className="material-symbols-outlined text-lg">person_remove</span>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
