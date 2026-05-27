import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const accessToken = searchParams.get('accessToken');
      const refreshToken = searchParams.get('refreshToken');

      if (!accessToken || !refreshToken) {
        setError('Invalid authentication response');
        setTimeout(() => navigate('/login?error=Invalid authentication response'), 2000);
        return;
      }

      // Store tokens in localStorage
      localStorage.setItem('auth_access_token', accessToken);
      localStorage.setItem('auth_refresh_token', refreshToken);

      try {
        // Fetch user info to validate tokens
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info');
        }

        const user = await response.json();
        localStorage.setItem('auth_user', JSON.stringify(user));

        // Clear any pending invite token and redirect to spaces
        const pendingToken = sessionStorage.getItem('pendingInviteToken');
        if (pendingToken) {
          sessionStorage.removeItem('pendingInviteToken');
          await fetch('/api/invites/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: pendingToken }),
          });
        }

        navigate('/spaces');
      } catch (err) {
        console.error('[AuthCallback] Error:', err);
        setError('Authentication failed');
        localStorage.removeItem('auth_access_token');
        localStorage.removeItem('auth_refresh_token');
        setTimeout(() => navigate('/login?error=Authentication failed'), 2000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-surface font-ui text-on-surface flex flex-col items-center justify-center">
      <header className="bg-surface-container-lowest border-b border-outline-variant/20 px-xl py-lg absolute top-0 left-0 right-0">
        <div className="max-w-6xl mx-auto flex items-center gap-md">
          <span className="material-symbols-outlined text-primary text-2xl">
            workspaces
          </span>
          <h1 className="font-display text-title-lg text-on-surface">
            AI Spaces
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-lg py-xl">
        <div className="bg-surface-container-lowest rounded-2xl p-2xl shadow-ambient text-center">
          {error ? (
            <div className="space-y-md">
              <span className="material-symbols-outlined text-error text-4xl">
                error
              </span>
              <p className="text-body-md text-on-surface-variant">{error}</p>
              <p className="text-body-sm text-on-surface-variant">
                Redirecting to login...
              </p>
            </div>
          ) : (
            <div className="space-y-md">
              <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent mx-auto"></div>
              <p className="text-body-md text-on-surface-variant">
                Completing sign-in...
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AuthCallbackPage;
