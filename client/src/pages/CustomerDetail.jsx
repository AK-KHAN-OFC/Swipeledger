import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customersApi } from '../services/api/customers.api';
import { transactionsApi } from '../services/api/transactions.api';
import { getApiError } from '../services/api/client';
import { formatINR, formatDate, balanceLabel, balanceBgColour, balanceColour } from '../utils/format';
import { Button } from '../components/ui/Button';
import { Input, Alert, Modal, Spinner } from '../components/ui/Spinner';

// ─── Amount input with ₹ prefix ───────────────────────────────────────────────

import { forwardRef } from 'react';

const AmountInput = forwardRef(function AmountInput({ label, error, ...props }, ref) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium select-none">
          ₹
        </span>
        <input
          ref={ref}
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          className={`block w-full rounded-lg border pl-8 pr-3 py-2.5 text-sm shadow-sm
            placeholder:text-gray-400 focus:outline-none focus:ring-2
            ${error
              ? 'border-red-400 focus:ring-red-400 bg-red-50'
              : 'border-gray-300 focus:ring-brand-500 bg-white'}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});

// ─── Add-transaction form ─────────────────────────────────────────────────────

const txSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Enter a valid amount' })
    .positive('Amount must be greater than 0')
    .max(10_000_000, 'Amount too large'),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

function AddTransactionModal({ isOpen, type, customerId, onClose }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(txSchema) });

  const mutation = useMutation({
    mutationFn: (data) =>
      transactionsApi.create(customerId, {
        type,
        amount: data.amount,
        note:   data.note || undefined,
      }),
    onSuccess: () => {
      // Refresh customer balance, customer transactions, customer list balances, global ledger
      queryClient.invalidateQueries({ queryKey: ['customer',      customerId] });
      queryClient.invalidateQueries({ queryKey: ['transactions',  customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['transactions',  'global'] });
      reset();
      setServerError('');
      onClose();
    },
    onError: (err) => setServerError(getApiError(err)),
  });

  function handleClose() {
    reset();
    setServerError('');
    onClose();
  }

  const isCredit  = type === 'credit';
  const title     = isCredit ? '+ Add Credit' : 'Receive Payment';
  const btnLabel  = isCredit ? 'Save Credit' : 'Save Payment';
  const btnVariant = isCredit ? 'danger' : 'primary'; // red for credit owed, brand for payment

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {serverError && <Alert type="error" message={serverError} />}

        <AmountInput
          label={isCredit ? 'Credit Amount' : 'Payment Amount'}
          placeholder="0"
          error={errors.amount?.message}
          {...register('amount')}
        />
        <Input
          id="tx-note"
          label="Note (optional)"
          placeholder={isCredit ? 'e.g. Groceries, Medicines…' : 'e.g. Cash payment'}
          error={errors.note?.message}
          {...register('note')}
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={btnVariant}
            className="flex-1"
            loading={isSubmitting}
          >
            {btnLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit-customer form ───────────────────────────────────────────────────────

const editSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Include country code, e.g. +919876543210')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

function EditCustomerModal({ isOpen, customer, onClose }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name:         customer?.name || '',
      mobileNumber: customer?.mobileNumber || '',
      notes:        customer?.notes || '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      customersApi.update(customer.customerId, {
        name:         data.name,
        mobileNumber: data.mobileNumber || null,
        notes:        data.notes        || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer',  customer.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setServerError('');
      onClose();
    },
    onError: (err) => setServerError(getApiError(err)),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Customer">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {serverError && <Alert type="error" message={serverError} />}
        <Input
          id="edit-name"
          label="Customer Name *"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          id="edit-mobile"
          label="Mobile Number (optional)"
          placeholder="+919876543210"
          inputMode="tel"
          error={errors.mobileNumber?.message}
          {...register('mobileNumber')}
        />
        <Input
          id="edit-notes"
          label="Notes (optional)"
          error={errors.notes?.message}
          {...register('notes')}
        />
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" loading={isSubmitting}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx }) {
  const isCredit = tx.type === 'credit';
  return (
    <div className="flex items-start justify-between px-4 py-3.5">
      <div className="flex items-start gap-3 min-w-0">
        {/* Type indicator dot */}
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isCredit ? 'bg-red-400' : 'bg-green-500'}`} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${isCredit ? 'text-red-600' : 'text-green-600'}`}>
            {isCredit ? 'Credit' : 'Payment'}
          </p>
          {tx.note && (
            <p className="text-sm text-gray-600 truncate">"{tx.note}"</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.createdAt)}</p>
        </div>
      </div>
      <p className={`text-sm font-semibold shrink-0 ml-3 ${isCredit ? 'text-red-600' : 'text-green-600'}`}>
        {isCredit ? '+' : '−'}{formatINR(tx.amount)}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [txModal, setTxModal] = useState(null);   // null | 'credit' | 'payment'
  const [showEdit, setShowEdit] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const {
    data: customer,
    isLoading: customerLoading,
    isError: customerError,
  } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersApi.get(customerId).then((r) => r.data.data),
    enabled: !!customerId,
    staleTime: 30_000,
  });

  const {
    data: transactions,
    isLoading: txLoading,
  } = useQuery({
    queryKey: ['transactions', customerId],
    queryFn: () => transactionsApi.listForCustomer(customerId).then((r) => r.data.data),
    enabled: !!customerId,
    staleTime: 15_000,
  });

  const archiveMutation = useMutation({
    mutationFn: () => customersApi.archive(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers', { replace: true });
    },
  });

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (customerLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Error / not found ───────────────────────────────────────────────────────
  if (customerError || !customer) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 px-6 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="text-gray-600 font-medium">Customer not found.</p>
        <Button size="sm" variant="secondary" onClick={() => navigate('/customers')}>
          Back to Customers
        </Button>
      </div>
    );
  }

  const { balance, name, mobileNumber } = customer;
  const txList = transactions ?? [];

  return (
    <div className="flex flex-col">

      {/* Back nav + actions */}
      <div className="flex items-center justify-between px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="flex items-center gap-1.5 text-brand-600 text-sm font-medium"
        >
          ← Customers
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowEdit(true)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowArchiveConfirm(true)}
            className="text-red-500 hover:bg-red-50">Archive</Button>
        </div>
      </div>

      {/* Customer header */}
      <div className="px-4 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
        {mobileNumber && (
          <p className="text-sm text-gray-500 mt-0.5">{mobileNumber}</p>
        )}
      </div>

      {/* Balance card */}
      <div className={`mx-4 rounded-xl border p-4 mb-4 ${balanceBgColour(balance.status)}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">
          Outstanding Balance
        </p>
        <p className="text-3xl font-bold">
          {balance.status === 'clear'
            ? 'Clear ✓'
            : `${formatINR(Math.abs(balance.net))} ${balance.status === 'due' ? 'Due' : 'Advance'}`}
        </p>
        {balance.transactionCount > 0 && (
          <p className="text-xs opacity-70 mt-1">
            {formatINR(balance.totalCredit)} credited · {formatINR(balance.totalPayment)} received
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 px-4 mb-5">
        <Button
          variant="danger"
          className="flex-1"
          onClick={() => setTxModal('credit')}
        >
          + Add Credit
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => setTxModal('payment')}
        >
          Receive Payment
        </Button>
      </div>

      {/* Transaction history */}
      <div className="px-4 mb-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Transaction History
        </h2>
      </div>

      {txLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {!txLoading && txList.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm px-6">
          No transactions yet. Add a credit or record a payment above.
        </div>
      )}

      {!txLoading && txList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mx-4 divide-y divide-gray-100 mb-6">
          {txList.map((tx) => (
            <TxRow key={tx.transactionId} tx={tx} />
          ))}
        </div>
      )}

      {/* Transaction modals */}
      <AddTransactionModal
        isOpen={txModal === 'credit'}
        type="credit"
        customerId={customerId}
        onClose={() => setTxModal(null)}
      />
      <AddTransactionModal
        isOpen={txModal === 'payment'}
        type="payment"
        customerId={customerId}
        onClose={() => setTxModal(null)}
      />

      {/* Edit customer modal */}
      {showEdit && (
        <EditCustomerModal
          isOpen={showEdit}
          customer={customer}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Archive confirm modal */}
      <Modal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        title="Archive Customer"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Archive <strong>{name}</strong>? They will be hidden from your customer list.
            Existing transactions and balance history are preserved.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowArchiveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate()}
            >
              Archive
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
