import TopNavBar from "@/components/TopNavBar";
import UserManagement from "@/components/UserManagement";

function AdminPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--t-bg)' }}>
      <TopNavBar />
      <main style={{ flex: 1, padding: '32px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <h1 style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 32,
          fontStyle: 'italic',
          fontWeight: 400,
          color: 'var(--t-ink)',
          marginBottom: 24,
        }}>
          Admin
        </h1>
        <UserManagement />
      </main>
    </div>
  );
}

export default AdminPage;
