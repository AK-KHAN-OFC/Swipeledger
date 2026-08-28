import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customersApi } from '../services/api/customers.api';
import { getApiError } from '../services/api/client';
import { formatINR, balanceLabel, balanceColour } from '../utils/format';
import { Button } from '../components/ui/Button';
import { Input, Alert, Modal, Spinner } from '../components/ui/Spinner';

// ─── Client-side form schema (mirrors server createCustomerSchema) ─────────────

const addSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Include country code, e.g. +919876543210')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

// ─── Add-customer form (inside modal) ────────────────────────────────────────

function AddCustomerForm({ onClose }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(addSchema) });

  const mutation = useMutation({
    mutationFn: (data) =>
      customersApi.create({
        name:         data.name,
        mobileNumber: data.mobileNumber || undefined,
        notes:        data.notes        || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      reset();
      onClose();
    },
    onError: (err) => setServerError(getApiError(err)),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      {serverError && <Alert type="error" message={serverError} />}

      <Input
        id="add-name"
        label="Customer Name *"
        placeholder="e.g. Raj Kumar"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        id="add-mobile"
        label="Mobile Number (optional)"
        placeholder="+919876543210"
        inputMode="tel"
        autoComplete="tel"
        error={errors.mobileNumber?.message}
        {...register('mobileNumber')}
      />
      <p className="text-xs text-gray-400 -mt-2">Include country code, e.g. +91 for India</p>
      <Input
        id="add-notes"
        label="Notes (optional)"
        placeholder="Any notes about this customer"
        error={errors.notes?.message}
        {...register('notes')}
      />

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" className="flex-1" loading={isSubmitting}>
          Add Customer
        </Button>
      </div>
    </form>
  );
}

// ─── Customer card ────────────────────────────────────────────────────────────

function CustomerCard({ customer, onClick }) {
  const { name, mobileNumber, balance } = customer;
  const initials = name.trim().slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      {/* Avatar */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center">
        <span className="text-sm font-semibold text-brand-600">{initials}</span>
      </div>

      {/* Name + mobile */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        {mobileNumber && (
          <p className="text-xs text-gray-500 truncate">{mobileNumber}</p>
        )}
      </div>

      {/* Balance */}
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold ${balanceColour(balance.status)}`}>
          {balance.status === 'clear' ? 'Clear' : formatINR(balance.net)}
        </p>
        {balance.status !== 'clear' && (
          <p className={`text-xs ${balanceColour(balance.status)}`}>
            {balance.status === 'due' ? 'Due' : 'Advance'}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Customers() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // 300 ms debounce on search
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', searchQuery],
    queryFn: () =>
      customersApi
        .list(searchQuery ? { search: searchQuery } : {})
        .then((r) => r.data.data),
    staleTime: 30_000,
  });

  const customers = data ?? [];

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Customers</h1>
        <Button
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="gap-1"
        >
          + Add
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or mobile…"
            className="block w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2.5 text-sm
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
            <p className="text-gray-500 text-sm">Failed to load customers.</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && customers.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3 text-center px-6">
            {searchQuery ? (
              <>
                <p className="text-2xl">🔍</p>
                <p className="text-gray-600 font-medium">No results for "{searchQuery}"</p>
                <p className="text-gray-400 text-sm">Try a different name or mobile number.</p>
              </>
            ) : (
              <>
                <p className="text-4xl">👥</p>
                <p className="text-gray-700 font-semibold text-lg">No customers yet</p>
                <p className="text-gray-400 text-sm">Add your first customer to start tracking credit.</p>
                <Button onClick={() => setShowAddModal(true)} className="mt-2">
                  + Add Customer
                </Button>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && customers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 mx-4 divide-y divide-gray-100">
            {customers.map((c) => (
              <CustomerCard
                key={c.customerId}
                customer={c}
                onClick={() => navigate(`/customers/${c.customerId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add customer modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Customer"
      >
        <AddCustomerForm onClose={() => setShowAddModal(false)} />
      </Modal>

    </div>
  );
}
