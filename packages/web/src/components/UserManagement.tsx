import { useCallback, useEffect, useState } from "react";
import { getAccessToken, useAuth } from "@/contexts/AuthContext";

interface ManagedUser {
  id: string;
  email: string;
  displayName?: string;
  serverRole: "admin" | "user";
}

async function fetchUsers(): Promise<ManagedUser[]> {
  const token = getAccessToken();
  const response = await fetch("/api/admin/users", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Failed to fetch users");
  const data = (await response.json()) as { users: ManagedUser[] };
  return data.users;
}

async function updateRole(userId: string, role: "admin" | "user"): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error("Failed to update role");
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId: string, role: "admin" | "user") => {
    setUpdatingId(userId);
    setRoleError(null);
    try {
      await updateRole(userId, role);
      await loadUsers();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 font-sans text-t-ink-mid">Loading users…</div>;
  }

  if (loadError) {
    return <div className="p-8 font-sans text-t-accent">{loadError}</div>;
  }

  return (
    <div className="font-sans">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold text-t-ink">Users</h2>
        {roleError && <span className="text-[13px] text-t-accent">{roleError}</span>}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-t-hair">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-t-hair bg-t-bg-alt">
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Email
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Display Name
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-[1px] text-t-ink-dim">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u, i) => (
              <tr
                key={u.id}
                className={`bg-t-bg-raised ${users && i < users.length - 1 ? "border-b border-t-hair" : ""}`}
              >
                <td className="px-4 py-2.5 text-t-ink">{u.email}</td>
                <td className="px-4 py-2.5 text-t-ink-mid">{u.displayName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {currentUser?.id === u.id ? (
                    <span className="rounded bg-t-bg-well px-2 py-1 font-mono text-xs uppercase tracking-[1px] text-t-ink-dim">
                      {u.serverRole}
                    </span>
                  ) : (
                    <select
                      value={u.serverRole}
                      disabled={updatingId === u.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as "admin" | "user")}
                      className="cursor-pointer rounded-md border border-t-hair bg-t-bg-well px-2 py-1 font-sans text-[13px] text-t-ink disabled:cursor-default disabled:opacity-70"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {users?.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-t-ink-dim">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
