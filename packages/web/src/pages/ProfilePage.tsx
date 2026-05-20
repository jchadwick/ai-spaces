import { useEffect, useState } from 'react'
import { useAPI } from '@/hooks/useAPI'
import { useToast } from '@/components/ui/use-toast'

type Profile = {
  id: string
  email: string
  displayName?: string
  serverRole: 'admin' | 'user'
}

function ProfilePage() {
  const apiFetch = useAPI()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      try {
        const response = await apiFetch('/api/auth/me')
        if (!response.ok) {
          const data = await response.json().catch(() => ({} as { error?: string }))
          throw new Error(data.error ?? 'Failed to load profile')
        }

        const data = (await response.json()) as Profile
        if (!cancelled) {
          setProfile(data)
          setDisplayName(data.displayName ?? '')
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Failed to load profile', 'error', 4000)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiFetch, showToast])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingProfile(true)

    try {
      const response = await apiFetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error ?? 'Failed to update profile')
      }

      const data = (await response.json()) as Profile
      setProfile(data)
      setDisplayName(data.displayName ?? '')
      showToast('Profile updated', 'success', 3000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error', 4000)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      showToast('New password and confirm password do not match', 'error', 4000)
      return
    }

    setIsChangingPassword(true)

    try {
      const response = await apiFetch('/api/auth/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error ?? 'Failed to change password')
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast('Password changed', 'success', 3000)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error', 4000)
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <main style={{ flex: 1, overflow: 'auto', padding: 32, maxWidth: 760, margin: '0 auto', width: '100%', background: 'var(--t-bg)' }}>
        <div style={{ paddingTop: 8, color: 'var(--t-inkMid)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>Loading profile…</div>
      </main>
    )
  }

  return (
    <main style={{ flex: 1, overflow: 'auto', padding: 32, maxWidth: 760, margin: '0 auto', width: '100%', background: 'var(--t-bg)' }}>
      <h1 style={{
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontSize: 32,
        fontStyle: 'italic',
        fontWeight: 400,
        color: 'var(--t-ink)',
        marginBottom: 24,
      }}>
        Profile
      </h1>

      <section style={{ border: '1px solid var(--t-hair)', borderRadius: 10, background: 'var(--t-bgRaised)', padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', color: 'var(--t-ink)', fontSize: 18, fontWeight: 600, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>Account</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 10, columnGap: 12, marginBottom: 16 }}>
          <div style={{ color: 'var(--t-inkDim)', fontSize: 13 }}>Email</div>
          <div style={{ color: 'var(--t-ink)', fontSize: 14 }}>{profile?.email ?? '—'}</div>
          <div style={{ color: 'var(--t-inkDim)', fontSize: 13 }}>Role</div>
          <div style={{ color: 'var(--t-ink)', fontSize: 14, textTransform: 'capitalize' }}>{profile?.serverRole ?? 'user'}</div>
        </div>

        <form onSubmit={handleSaveProfile}>
          <label htmlFor="display-name" style={{ display: 'block', color: 'var(--t-inkDim)', fontSize: 13, marginBottom: 6 }}>Display Name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            style={{
              width: '100%',
              maxWidth: 360,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--t-hair)',
              background: 'var(--t-bgWell)',
              color: 'var(--t-ink)',
              marginBottom: 14,
            }}
          />
          <div>
            <button
              type="submit"
              disabled={isSavingProfile}
              style={{
                border: '1px solid var(--t-hair)',
                background: 'var(--t-ink)',
                color: 'var(--t-bg)',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 500,
                cursor: isSavingProfile ? 'default' : 'pointer',
                opacity: isSavingProfile ? 0.7 : 1,
              }}
            >
              {isSavingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

      <section style={{ border: '1px solid var(--t-hair)', borderRadius: 10, background: 'var(--t-bgRaised)', padding: 20 }}>
        <h2 style={{ margin: '0 0 16px', color: 'var(--t-ink)', fontSize: 18, fontWeight: 600, fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" }}>Change Password</h2>
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              required
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-hair)', background: 'var(--t-bgWell)', color: 'var(--t-ink)' }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              minLength={8}
              required
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-hair)', background: 'var(--t-bgWell)', color: 'var(--t-ink)' }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              minLength={8}
              required
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-hair)', background: 'var(--t-bgWell)', color: 'var(--t-ink)' }}
            />
          </div>
          <button
            type="submit"
            disabled={isChangingPassword}
            style={{
              marginTop: 14,
              border: '1px solid var(--t-hair)',
              background: 'var(--t-ink)',
              color: 'var(--t-bg)',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: isChangingPassword ? 'default' : 'pointer',
              opacity: isChangingPassword ? 0.7 : 1,
            }}
          >
            {isChangingPassword ? 'Updating…' : 'Change Password'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default ProfilePage
