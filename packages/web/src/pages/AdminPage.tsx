import AdminServerManagement from "@/components/AdminServerManagement";
import UserManagement from "@/components/UserManagement";

function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-225 flex-1 overflow-auto bg-t-bg p-8">
      <h1 className="mb-6 font-sans text-[28px] font-bold text-t-ink">Admin</h1>
      <div className="space-y-10">
        <UserManagement />
        <AdminServerManagement />
      </div>
    </main>
  );
}

export default AdminPage;
