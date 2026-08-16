// Stub page used for all Phase 2+ routes.
// Replace with real implementation in future phases.
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
export function Customers()       { return <StubPage title="Customers"        phase="Phase 2" />; }
export function Transactions()    { return <StubPage title="Transactions"     phase="Phase 2" />; }
export function TransactionNew()  { return <StubPage title="New Transaction"  phase="Phase 2" />; }
export function Reports()         { return <StubPage title="Reports"          phase="Phase 3" />; }
export function PaymentAccounts() { return <StubPage title="Payment Accounts" phase="Phase 2" />; }
export function AuditLog()        { return <StubPage title="Audit Log"        phase="Phase 4" />; }
export function NotFound()        {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-6xl mb-4">404</div>
      <h2 className="text-xl font-semibold text-gray-700">Page Not Found</h2>
    </div>
  );
}
