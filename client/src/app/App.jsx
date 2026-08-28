import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AppShell from '../components/layout/AppShell';
import Spinner from '../components/ui/Spinner';

// Eagerly loaded (small, shown on every page load)
import Login from '../pages/Login';
import Register from '../pages/Register';

// Phase 2 core pages — lazily loaded for bundle splitting
const Account        = lazy(() => import('../pages/Account'));
const Devices        = lazy(() => import('../pages/Devices'));
const Settings       = lazy(() => import('../pages/Settings'));
const Customers      = lazy(() => import('../pages/Customers'));
const CustomerDetail = lazy(() => import('../pages/CustomerDetail'));
const Transactions   = lazy(() => import('../pages/Transactions'));

// Remaining stubs (Phase 3+) — one small chunk
import * as Stubs from '../pages/stubs.jsx';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
}

function AuthenticatedLayout({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected */}
          <Route path="/"
            element={<AuthenticatedLayout><Stubs.Dashboard /></AuthenticatedLayout>} />

          {/* Phase 2: Customers & Ledger */}
          <Route path="/customers"
            element={<AuthenticatedLayout><Customers /></AuthenticatedLayout>} />
          <Route path="/customers/:customerId"
            element={<AuthenticatedLayout><CustomerDetail /></AuthenticatedLayout>} />
          <Route path="/transactions"
            element={<AuthenticatedLayout><Transactions /></AuthenticatedLayout>} />

          {/* Phase 3+ stubs */}
          <Route path="/payment-accounts"
            element={<AuthenticatedLayout><Stubs.PaymentAccounts /></AuthenticatedLayout>} />
          <Route path="/reports"
            element={<AuthenticatedLayout><Stubs.Reports /></AuthenticatedLayout>} />
          <Route path="/devices"
            element={<AuthenticatedLayout><Devices /></AuthenticatedLayout>} />
          <Route path="/account"
            element={<AuthenticatedLayout><Account /></AuthenticatedLayout>} />
          <Route path="/settings"
            element={<AuthenticatedLayout><Settings /></AuthenticatedLayout>} />
          <Route path="/audit-log"
            element={<AuthenticatedLayout><Stubs.AuditLog /></AuthenticatedLayout>} />

          {/* Fallback */}
          <Route path="*" element={<Stubs.NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
