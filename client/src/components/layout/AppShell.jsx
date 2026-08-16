import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import OnlineStatus from '../shared/OnlineStatus';

const NAV_ITEMS = [
  { to: '/',                label: 'Dashboard',       icon: '📊' },
  { to: '/transactions',    label: 'Transactions',     icon: '💳' },
  { to: '/customers',       label: 'Customers',        icon: '👤' },
  { to: '/payment-accounts',label: 'Payment Accounts', icon: '🏦' },
  { to: '/reports',         label: 'Reports',          icon: '📈' },
  { to: '/devices',         label: 'Devices',          icon: '📱' },
  { to: '/account',         label: 'Account',          icon: '⚙️'  },
  { to: '/settings',        label: 'Settings',         icon: '🔧' },
  { to: '/audit-log',       label: 'Audit Log',        icon: '📋' },
];

// Bottom nav shows only the most-used items on mobile
const BOTTOM_NAV = [
  { to: '/',             label: 'Dashboard', icon: '📊' },
  { to: '/transactions', label: 'Ledger',    icon: '💳' },
  { to: '/customers',    label: 'Customers', icon: '👤' },
  { to: '/account',      label: 'Account',   icon: '⚙️'  },
];

function NavLink({ to, label, icon, onClick }) {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== '/' && pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-select
        ${active
          ? 'bg-brand-50 text-brand-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}

export default function AppShell({ children }) {
  const { logout, businessName } = useAuth();
  // useLocation() is reactive — re-renders when React Router navigates.
  // window.location is NOT reactive and must not be used inside render functions.
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <OnlineStatus />

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-white border-r border-gray-200">
        <div className="flex flex-col h-full">
          <div className="px-4 py-5 border-b border-gray-100">
            <h1 className="text-lg font-bold text-brand-700">SwipeLedger</h1>
            {businessName && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{businessName}</p>
            )}
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-gray-100">
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom">
        <div className="flex">
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center py-2 text-xs font-medium no-select
                  ${active ? 'text-brand-600' : 'text-gray-500'}`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="mt-0.5">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
