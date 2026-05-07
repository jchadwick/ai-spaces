import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function InvitePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'requiresAuth'>('loading');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Read fragment THEN IMMEDIATELY strip it — security fix
    const fragment = window.location.hash;
    history.replaceState(null, '', window.location.pathname);

    const token = fragment.startsWith('#token=') ? fragment.slice(7) : null;

    const run = async () => {
      if (!token) {
        setStatus('error');
        setError('Invalid invite link — no token found.');
        return;
      }

      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      if (res.status === 401) {
        // Store for post-login redemption — sessionStorage is tab-scoped
        sessionStorage.setItem('pendingInviteToken', token);
        setStatus('requiresAuth');
        return;
      }

      const data = await res.json() as { error?: string; spaceId?: string; role?: string };
      if (!res.ok) throw new Error(data.error ?? 'Redemption failed');
      setStatus('success');
      setTimeout(() => navigate('/'), 2000);
    };

    run().catch((err: unknown) => {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    });
  }, [navigate]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 16, color: 'var(--t-inkMid)' }}>Validating invite...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 16, color: 'var(--t-agent)' }}>You have joined the space! Redirecting...</p>
      </div>
    );
  }

  if (status === 'requiresAuth') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontSize: 16, color: 'var(--t-inkMid)' }}>Please log in to accept your invitation.</p>
        <a href="/login" style={{ fontSize: 14, color: 'var(--t-accent)', textDecoration: 'underline' }}>Go to login</a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-ink)', fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 16, color: 'var(--t-accent)' }}>{error}</p>
    </div>
  );
}
