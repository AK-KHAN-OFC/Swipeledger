import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AppShell from '../components/layout/AppShell';
import Spinner from '../components/ui/Spinner';

// Eagerly loaded (small, shown on every page load)
import Login from '../pages/Login';
import Register from '../pages/Register';

// Lazily loaded — split by route for smaller initial bundle
const Account  = lazy(() => import('../pages/Account'));
const Devices  = lazy(() => import('../pages/Devices'));
const Settings = lazy(() => import('../pages/Settings'));

// Stub pages are tiny — loaded eagerly as a single chunk
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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected — authenticated routes */}
          <Route
            path="/"
            element={<AuthenticatedLayout><Stubs.Dashboard /></AuthenticatedLayout>}
          />
          <Route
            path="/customers"
            element={<AuthenticatedLayout><Stubs.Customers /></AuthenticatedLayout>}
          />
          <Route
            path="/transactions"
            element={<AuthenticatedLayout><Stubs.Transactions /></AuthenticatedLayout>}
          />
          <Route
            path="/transactions/new"
            element={<AuthenticatedLayout><Stubs.TransactionNew /></AuthenticatedLayout>}
          />
          <Route
            path="/payment-accounts"
            element={<AuthenticatedLayout><Stubs.PaymentAccounts /></AuthenticatedLayout>}
          />
          <Route
            path="/reports"
            element={<AuthenticatedLayout><Stubs.Reports /></AuthenticatedLayout>}
          />
          <Route
            path="/devices"
            element={<AuthenticatedLayout><Devices /></AuthenticatedLayout>}
          />
          <Route
            path="/account"
            element={<AuthenticatedLayout><Account /></AuthenticatedLayout>}
          />
          <Route
            path="/settings"
            element={<AuthenticatedLayout><Settings /></AuthenticatedLayout>}
          />
          <Route
            path="/audit-log"
            element={<AuthenticatedLayout><Stubs.AuditLog /></AuthenticatedLayout>}
          />

          {/* Fallback */}
          <Route path="*" element={<Stubs.NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
