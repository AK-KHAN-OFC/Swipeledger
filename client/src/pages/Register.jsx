import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../services/api/auth.api';
import { getApiError } from '../services/api/client';
import { Input, Alert } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

// ─── Validation schema (mirrors server-side registerSchema) ───────────────────

const registerSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(100, 'At most 100 characters'),
  mobileNumber: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      'Include country code, e.g. +919876543210',
    )
    .optional()
    .or(z.literal('')),
});

// ─── Copy-to-clipboard helper ────────────────────────────────────────────────

function CopyableField({ label, value, copiedField, onCopy, fieldKey }) {
  const isCopied = copiedField === fieldKey;
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900 break-all">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onCopy(value, fieldKey)}
          className="shrink-0 text-xs font-medium px-2 py-1 rounded bg-brand-50 text-brand-700
                     hover:bg-brand-100 transition-colors min-h-0 min-w-0"
        >
          {isCopied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [credentials, setCredentials] = useState(null); // { accountCode, username, temporaryPassword, businessName }
  const [copiedField, setCopiedField] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  // ── Form submit ─────────────────────────────────────────────────────────────
  async function onSubmit(data) {
    setServerError('');
    try {
      const res = await authApi.register({
        businessName: data.businessName,
        mobileNumber: data.mobileNumber || undefined,
      });
      setCredentials(res.data.data);
    } catch (err) {
      setServerError(getApiError(err) || 'Account creation failed. Please try again.');
    }
  }

  // ── Clipboard ───────────────────────────────────────────────────────────────
  async function copyToClipboard(text, field) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API unavailable — silent fail (user can manually copy)
    }
  }

  async function copyAll() {
    if (!credentials) return;
    const text = [
      `Account Code:       ${credentials.accountCode}`,
      `Username:           ${credentials.username}`,
      `Temporary Password: ${credentials.temporaryPassword}`,
    ].join('\n');
    await copyToClipboard(text, 'all');
  }

  // ── Credential display ──────────────────────────────────────────────────────
  if (credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✓</div>
            <h1 className="text-2xl font-bold text-gray-900">Account Created</h1>
            <p className="text-gray-500 text-sm mt-1">{credentials.businessName}</p>
          </div>

          {/* Warning */}
          <Alert
            type="warning"
            message="Save these credentials securely — your password will not be shown again."
            className="mb-4"
          />

          {/* Credentials */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3 mb-4">
            <CopyableField
              label="Account Code"
              value={credentials.accountCode}
              fieldKey="accountCode"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
            <CopyableField
              label="Username"
              value={credentials.username}
              fieldKey="username"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
            <CopyableField
              label="Temporary Password"
              value={credentials.temporaryPassword}
              fieldKey="password"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />

            <button
              type="button"
              onClick={copyAll}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 min-h-0 min-w-0"
            >
              {copiedField === 'all' ? '✓ All copied' : 'Copy all'}
            </button>
          </div>

          {/* Continue to Sign In */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => navigate('/login')}
          >
            Continue to Sign In
          </Button>

        </div>
      </div>
    );
  }

  // ── Registration form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">SwipeLedger</h1>
          <p className="text-gray-500 text-sm mt-1">Create your workspace</p>
        </div>

        {serverError && (
          <Alert type="error" message={serverError} className="mb-4" />
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4"
        >
          <Input
            id="businessName"
            label="Business / Shop Name"
            placeholder="e.g. Kumar Electronics"
            error={errors.businessName?.message}
            autoComplete="organization"
            {...register('businessName')}
          />

          <Input
            id="mobileNumber"
            label="Mobile Number (optional)"
            placeholder="+919876543210"
            error={errors.mobileNumber?.message}
            autoComplete="tel"
            inputMode="tel"
            {...register('mobileNumber')}
          />
          <p className="text-xs text-gray-400 -mt-2">
            Include country code, e.g. +91 for India
          </p>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            className="w-full"
          >
            Create Account
          </Button>
        </form>

        {/* Back to Sign In */}
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
