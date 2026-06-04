import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/errors'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { HeaderProvider } from './contexts/HeaderContext'
import { ToastProvider } from './components/ui/toast'
import { ThemeProvider } from './contexts/ThemeContext'
import AdminRoute from './components/AdminRoute'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import SpacePage from './pages/SpacePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import InvitePage from './pages/InvitePage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import AuthCallbackPage from './pages/AuthCallbackPage'

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full w-8 h-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const workspaceShell =
    location.pathname === '/' ||
    location.pathname === '/spaces' ||
    location.pathname.startsWith('/spaces/') ||
    location.pathname.startsWith('/space/') ||
    location.pathname.startsWith('/room/')

  return (
    <div className="h-screen flex flex-col bg-t-bg">
      {!workspaceShell && <Header />}
      <Outlet />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
    <ErrorBoundary>
      <AuthProvider>
        <HeaderProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/invite" element={<InvitePage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route element={<AuthenticatedLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/spaces" element={<HomePage />} />
                  <Route path="/spaces/:spaceId" element={<SpacePage />} />
                  <Route path="/spaces/:spaceId/*" element={<SpacePage />} />
                  <Route path="/spaces/:spaceId/rooms/:roomId" element={<SpacePage />} />
                  <Route path="/spaces/:spaceId/rooms/:roomId/*" element={<SpacePage />} />
                  <Route path="/room/:spaceId" element={<SpacePage />} />
                  <Route path="/room/:spaceId/*" element={<SpacePage />} />
                  <Route path="/space/:spaceId" element={<SpacePage />} />
                  <Route path="/space/:spaceId/*" element={<SpacePage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </HeaderProvider>
      </AuthProvider>
    </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
