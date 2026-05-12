import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAccessToken } from "@/contexts/AuthContext";

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
    return (
      <div style={{ padding: 32, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", color: 'var(--t-inkMid)' }}>
        Loading users…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 32, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", color: 'var(--t-accent)' }}>
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t-ink)', margin: 0 }}>Users</h2>
        {roleError && (
          <span style={{ fontSize: 13, color: 'var(--t-accent)' }}>{roleError}</span>
        )}
      </div>

      <div style={{ border: '1px solid var(--t-hair)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--t-bgAlt)', borderBottom: '1px solid var(--t-hair)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--t-inkDim)', fontWeight: 500, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Email</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--t-inkDim)', fontWeight: 500, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Display Name</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--t-inkDim)', fontWeight: 500, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: users && i < (users.length - 1) ? '1px solid var(--t-hair)' : undefined,
                  background: 'var(--t-bgRaised)',
                }}
              >
                <td style={{ padding: '10px 16px', color: 'var(--t-ink)' }}>{u.email}</td>
                <td style={{ padding: '10px 16px', color: 'var(--t-inkMid)' }}>{u.displayName ?? '—'}</td>
                <td style={{ padding: '10px 16px' }}>
                  {currentUser?.id === u.id ? (
                    <span style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: 'var(--t-inkDim)',
                      padding: '3px 8px',
                      background: 'var(--t-bgWell)',
                      borderRadius: 4,
                    }}>
                      {u.serverRole}
                    </span>
                  ) : (
                    <select
                      value={u.serverRole}
                      disabled={updatingId === u.id}
                      onChange={(e) =>
                        handleRoleChange(u.id, e.target.value as 'admin' | 'user')
                      }
                      style={{
                        fontSize: 13,
                        fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--t-hair)',
                        background: 'var(--t-bgWell)',
                        color: 'var(--t-ink)',
                        cursor: 'pointer',
                      }}
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
                <td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: 'var(--t-inkDim)' }}>
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
