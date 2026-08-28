'use strict';

const { z } = require('zod');

/**
 * Validator for POST /api/v1/customers/:customerId/transactions
 *
 * Security notes:
 *   - Amount is validated server-side; frontend validation is UI-only.
 *   - accountId and customerId come from JWT + URL params; never from request body.
 *   - Zero and negative amounts are explicitly rejected to prevent ledger corruption.
 *   - z.coerce.number() handles the edge case where a client sends amount as a string.
 */
const createTransactionSchema = z.object({
  type: z.enum(['credit', 'payment'], {
    required_error: 'Transaction type is required',
    invalid_type_error: 'Type must be "credit" or "payment"',
  }),

  amount: z.coerce
    .number({
      required_error: 'Amount is required',
      invalid_type_error: 'Amount must be a number',
    })
    .positive('Amount must be greater than 0')
    .max(10_000_000, 'Amount exceeds maximum allowed value (₹1 crore)'),

  note: z
    .string()
    .trim()
    .max(300, 'Note must be at most 300 characters')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : (v ?? null))),
});

module.exports = { createTransactionSchema };
