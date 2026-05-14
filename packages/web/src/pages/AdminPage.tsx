import UserManagement from "@/components/UserManagement";

function AdminPage() {
  return (
    <main style={{ flex: 1, overflow: 'auto', padding: '32px', maxWidth: 900, margin: '0 auto', width: '100%', background: 'var(--t-bg)' }}>
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
  );
}

export default AdminPage;