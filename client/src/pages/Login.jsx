import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { getApiError, getApiErrorCode } from '../services/api/client';
import { devicesApi } from '../services/api/devices.api';
import { Input, Alert } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

const loginSchema = z.object({
  accountCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Format: XXXX-XXXX-XXXX'),
  username: z.string().trim().min(4, 'At least 4 characters').max(30),
  password: z.string().min(8, 'At least 8 characters').max(128),
});

export default function Login() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const [rateLimitMsg, setRateLimitMsg] = useState('');
  const [deviceLimitData, setDeviceLimitData] = useState(null); // { limit, activeDevices }
  const [revoking, setRevoking] = useState(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, getValues } =
    useForm({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data) {
    setServerError('');
    setRateLimitMsg('');
    setDeviceLimitData(null);

    try {
      await login(data);
    } catch (err) {
      const code = getApiErrorCode(err);
      const msg  = getApiError(err);

      if (code === 'RATE_LIMITED') {
        setRateLimitMsg(msg);
      } else if (code === 'DEVICE_LIMIT_REACHED') {
        setDeviceLimitData(err.response?.data?.data || { limit: 3, activeDevices: [] });
      } else {
        // INVALID_CREDENTIALS or anything else — same generic message
        setServerError('Invalid credentials. Please check your account code, username, and password.');
      }
    }
  }

  async function handleRevoke(deviceId) {
    setRevoking(deviceId);
    try {
      await devicesApi.revoke(deviceId);
      setDeviceLimitData((prev) => ({
        ...prev,
        activeDevices: prev.activeDevices.filter((d) => d._id !== deviceId),
      }));
    } catch {
      setServerError('Failed to revoke device. Please try again.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">SwipeLedger</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your workspace</p>
        </div>

        {/* Device limit reached panel */}
        {deviceLimitData && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-800 text-sm mb-2">
              Device limit reached ({deviceLimitData.limit} devices)
            </h3>
            <p className="text-orange-700 text-xs mb-3">
              Revoke an existing device to allow this one to connect.
            </p>
            <div className="space-y-2">
              {deviceLimitData.activeDevices.map((device) => (
                <div
                  key={device._id}
                  className="flex items-center justify-between bg-white rounded p-2 text-xs"
                >
                  <div>
                    <span className="font-medium text-gray-800">{device.name}</span>
                    <span className="text-gray-400 ml-1">({device.platform})</span>
                    {device.lastActiveAt && (
                      <span className="block text-gray-400">
                        Last active: {new Date(device.lastActiveAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRevoke(device._id)}
                    disabled={revoking === device._id}
                    className="text-red-600 hover:text-red-800 font-medium px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {revoking === device._id ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
            {deviceLimitData.activeDevices.length === 0 && (
              <p className="text-green-700 text-xs mt-2">
                Device revoked! You can now sign in.
              </p>
            )}
          </div>
        )}

        {/* Rate limit message */}
        {rateLimitMsg && (
          <Alert type="warning" message={rateLimitMsg} className="mb-4" />
        )}

        {/* Generic error */}
        {serverError && (
          <Alert type="error" message={serverError} className="mb-4" />
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <Input
            id="accountCode"
            label="Account Code"
            placeholder="XXXX-XXXX-XXXX"
            error={errors.accountCode?.message}
            autoComplete="off"
            style={{ textTransform: 'uppercase' }}
            {...register('accountCode', {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase();
              },
            })}
          />

          <Input
            id="username"
            label="Username"
            placeholder="your username"
            error={errors.username?.message}
            autoComplete="username"
            {...register('username')}
          />

          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            autoComplete="current-password"
            {...register('password')}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            className="w-full"
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
