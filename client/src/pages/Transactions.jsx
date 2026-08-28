import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../services/api/transactions.api';
import { formatINR, formatDate } from '../utils/format';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx, onClick }) {
  const isCredit = tx.type === 'credit';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start justify-between px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isCredit ? 'bg-red-400' : 'bg-green-500'}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{tx.customer.name}</p>
          <p className={`text-xs font-semibold uppercase tracking-wide ${isCredit ? 'text-red-500' : 'text-green-600'}`}>
            {isCredit ? 'Credit' : 'Payment'}
          </p>
          {tx.note && (
            <p className="text-xs text-gray-500 truncate">"{tx.note}"</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.createdAt)}</p>
        </div>
      </div>
      <p className={`text-sm font-semibold shrink-0 ml-3 ${isCredit ? 'text-red-600' : 'text-green-600'}`}>
        {isCredit ? '+' : '−'}{formatINR(tx.amount)}
      </p>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Transactions() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['transactions', 'global'],
    queryFn:  () => transactionsApi.listAll({ limit: 100 }).then((r) => r.data),
    staleTime: 15_000,
  });

  const transactions = data?.data ?? [];
  const total        = data?.meta?.total ?? 0;

  return (
    <div className="flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ledger</h1>
          {total > 0 && (
            <p className="text-xs text-gray-400">{total} transaction{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate('/customers')}>
          Customers →
        </Button>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
          <p className="text-gray-500 text-sm">Failed to load transactions.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !isError && transactions.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
          <p className="text-4xl">📒</p>
          <p className="text-gray-700 font-semibold text-lg">No transactions yet</p>
          <p className="text-gray-400 text-sm">
            Open a customer to add credit or record a payment.
          </p>
          <Button className="mt-2" onClick={() => navigate('/customers')}>
            Go to Customers
          </Button>
        </div>
      )}

      {!isLoading && !isError && transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mx-4 divide-y divide-gray-100 mb-6">
          {transactions.map((tx) => (
            <TxRow
              key={tx.transactionId}
              tx={tx}
              onClick={() => navigate(`/customers/${tx.customer.customerId}`)}
            />
          ))}
        </div>
      )}

      {total > 100 && (
        <p className="text-center text-xs text-gray-400 pb-4">
          Showing 100 most recent. Open a customer to see their full history.
        </p>
      )}

    </div>
  );
}
