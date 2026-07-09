// Also outside (dashboard) -- reached when authenticated but lacking the
// baseline staff permission (src/lib/staff-guard.ts).
export default function StaffForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <div className="max-w-sm text-center">
        <p className="mb-2 text-xs font-semibold tracking-survey text-amber">POLCO TOURS · STAFF</p>
        <h1 className="mb-2 text-2xl font-bold">Not authorized</h1>
        <p className="text-mist">Your account doesn&apos;t have access to the staff dashboard.</p>
      </div>
    </main>
  );
}
