import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api/client';
import Spinner from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { useState } from 'react';

export default function Settings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings').then((r) => r.data.data),
  });

  const updateMut = useMutation({
    mutationFn: (updates) => apiClient.patch('/settings', updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const s = data || {};

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            defaultValue={s.timezone}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            onChange={(e) => updateMut.mutate({ timezone: e.target.value })}
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York (EST)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Payment Mode</label>
          <select
            defaultValue={s.defaultPaymentMode}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            onChange={(e) => updateMut.mutate({ defaultPaymentMode: e.target.value })}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        {saved && (
          <p className="text-sm text-green-600 font-medium">✓ Settings saved</p>
        )}
      </div>
    </div>
  );
}
