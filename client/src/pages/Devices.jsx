import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '../services/api/devices.api';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Spinner';
import Spinner from '../components/ui/Spinner';

export default function Devices() {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data.data),
  });

  const revokeMut = useMutation({
    mutationFn: (id) => devicesApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
    onError: () => setError('Failed to revoke device. Please try again.'),
  });

  const logoutOthersMut = useMutation({
    mutationFn: () => devicesApi.logoutOthers(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
    onError: () => setError('Failed to logout other sessions.'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const devices = data || [];
  const others = devices.filter((d) => !d.isCurrent);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage devices that have access to your account.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      {others.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="danger"
            size="sm"
            loading={logoutOthersMut.isPending}
            onClick={() => {
              setError('');
              logoutOthersMut.mutate();
            }}
          >
            Logout all other sessions
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device._id}
            className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{device.name}</span>
                {device.isCurrent && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                    This device
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {device.platform} · {device.browser}
              </p>
              {device.lastActiveAt && (
                <p className="text-xs text-gray-400">
                  Last active: {new Date(device.lastActiveAt).toLocaleString()}
                </p>
              )}
            </div>

            {!device.isCurrent && (
              <Button
                variant="danger"
                size="sm"
                loading={revokeMut.isPending && revokeMut.variables === device._id}
                onClick={() => {
                  setError('');
                  revokeMut.mutate(device._id);
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}

        {devices.length === 0 && (
          <p className="text-center text-gray-400 py-8">No active devices found.</p>
        )}
      </div>
    </div>
  );
}
