// Stub pages for routes not yet implemented (Phase 3+).
// Customers, Transactions, and CustomerDetail are now real pages — removed from stubs.
function StubPage({ title, phase }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-5xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-gray-700">{title}</h2>
      <p className="text-gray-400 text-sm mt-1">Coming in {phase}</p>
    </div>
  );
}

export function Dashboard()       { return <StubPage title="Dashboard"        phase="Phase 3" />; }
export function Reports()         { return <StubPage title="Reports"          phase="Phase 3" />; }
export function PaymentAccounts() { return <StubPage title="Payment Accounts" phase="Phase 3" />; }
export function AuditLog()        { return <StubPage title="Audit Log"        phase="Phase 4" />; }
export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-6xl mb-4">404</div>
      <h2 className="text-xl font-semibold text-gray-700">Page Not Found</h2>
    </div>
  );
}
