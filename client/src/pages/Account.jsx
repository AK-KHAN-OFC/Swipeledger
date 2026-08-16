import { useQuery } from '@tanstack/react-query';
import apiClient from '../services/api/client';
import Spinner from '../components/ui/Spinner';

export default function Account() {
  const { data, isLoading } = useQuery({
    queryKey: ['account'],
    queryFn: () => apiClient.get('/account').then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const account = data || {};

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Account</h1>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {[
          { label: 'Account Code', value: account.accountCode, mono: true },
          { label: 'Username', value: account.username },
          { label: 'Business Name', value: account.businessName },
          { label: 'Device Limit', value: account.deviceLimit },
          { label: 'Plan', value: account.plan?.name || 'Free' },
          {
            label: 'Member Since',
            value: account.createdAt
              ? new Date(account.createdAt).toLocaleDateString()
              : '—',
          },
        ].map(({ label, value, mono }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500">{label}</span>
            <span className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>
              {value ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
