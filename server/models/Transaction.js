'use strict';

const mongoose = require('mongoose');

/**
 * Ledger transaction types:
 *   credit  — customer received goods/services on credit (increases debt)
 *   payment — customer paid money to the merchant (decreases debt)
 *
 * Balance = sum(credit.amount) - sum(payment.amount)
 *   > 0  → customer owes merchant   ("Due")
 *   = 0  → account settled          ("Clear")
 *   < 0  → merchant owes customer   ("Advance")
 *
 * Amounts are always stored positive; direction is encoded by type.
 * Calculated balance is NEVER stored — it is always derived on read.
 */
const TransactionSchema = new mongoose.Schema(
  {
    // Denormalised for efficient account-level queries and isolation.
    // Always set server-side from JWT — never from client input.
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },

    type: {
      type: String,
      enum: { values: ['credit', 'payment'], message: 'Type must be credit or payment' },
      required: [true, 'Transaction type is required'],
    },

    // Stored as a positive number. Min enforced at both model and validator level.
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
      max: [10_000_000, 'Amount exceeds maximum allowed value (₹1 crore)'],
    },

    note: {
      type: String,
      trim: true,
      maxlength: [300, 'Note must be at most 300 characters'],
      default: null,
    },
  },
  {
    timestamps: true,
    // Transactions are append-only financial records; make accidental mutation harder.
    // No versionKey needed — we never update these documents.
    versionKey: false,
  },
);

// ─── Indexes — single declaration each ────────────────────────────────────────

// Customer ledger: fetch all txns for one customer, newest first (most common query)
TransactionSchema.index({ accountId: 1, customerId: 1, createdAt: -1 });

// Global ledger / dashboard: all txns for account, newest first
TransactionSchema.index({ accountId: 1, createdAt: -1 });

// Balance aggregation uses accountId + customerId — covered by the first index above.

module.exports = mongoose.model('Transaction', TransactionSchema);
