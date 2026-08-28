'use strict';

const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const auditService = require('../services/audit.service');
const createError = require('../utils/createError');
const logger = require('../utils/logger');

// ─── Isolation helper ─────────────────────────────────────────────────────────

/**
 * Load a customer that belongs to req.accountId.
 * Used for all transaction operations to ensure cross-account isolation.
 */
async function requireOwnedCustomer(req) {
  const { customerId } = req.params;

  if (!mongoose.isValidObjectId(customerId)) {
    throw createError(400, 'INVALID_ID', 'Invalid customer ID.');
  }

  const customer = await Customer.findOne({
    _id:        new mongoose.Types.ObjectId(customerId),
    accountId:  req.accountId,   // ← always from JWT
    isArchived: false,
  }).lean();

  if (!customer) throw createError(404, 'NOT_FOUND', 'Customer not found.');
  return customer;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/customers/:customerId/transactions
 * Return all transactions for a customer (newest first).
 * Both accountId and customerId are validated — a merchant cannot read another
 * merchant's transactions even if they know the transaction or customer ID.
 */
async function listTransactions(req, res) {
  const customer = await requireOwnedCustomer(req);

  const transactions = await Transaction.find({
    accountId:  req.accountId,
    customerId: customer._id,
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const data = transactions.map((t) => ({
    transactionId: t._id,
    customerId:    t.customerId,
    type:          t.type,
    amount:        t.amount,
    note:          t.note,
    createdAt:     t.createdAt,
  }));

  return res.json({ success: true, data });
}

/**
 * POST /api/v1/customers/:customerId/transactions
 * Record a new credit or payment transaction for a customer.
 *
 * Security:
 *   - accountId set from JWT (req.accountId)
 *   - customerId verified to belong to that account via requireOwnedCustomer
 *   - Amount validated by Zod (positive, ≤ 1 crore) before reaching here
 *   - Calculated balance is NEVER accepted from the client
 */
async function createTransaction(req, res) {
  const customer = await requireOwnedCustomer(req);
  const { type, amount, note } = req.body;

  const tx = await Transaction.create({
    accountId:  req.accountId,   // ← JWT; never from body
    customerId: customer._id,
    type,
    amount,
    note: note ?? null,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId:  req.deviceId,
    sessionId: req.sessionId,
    action:    'transaction_created',
    entityType: 'transaction',
    entityId:  tx._id,
    metadata:  { customerId: customer._id.toString(), type, amount },
    ipAddress: req.ip,
    requestId: req.id,
  });

  logger.info('Transaction created', {
    accountId:  req.accountId.toString(),
    customerId: customer._id.toString(),
    type,
    amount,
  });

  return res.status(201).json({
    success: true,
    data: {
      transactionId: tx._id,
      customerId:    tx.customerId,
      type:          tx.type,
      amount:        tx.amount,
      note:          tx.note,
      createdAt:     tx.createdAt,
    },
  });
}

/**
 * GET /api/v1/transactions
 * Global ledger: all transactions across all customers for the account.
 * Newest first. Supports ?page= and ?limit= (max 200).
 * Customer name is populated for display.
 */
async function listAllTransactions(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const page  = Math.max(parseInt(req.query.page  || '1',  10), 1);
  const skip  = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find({ accountId: req.accountId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'name mobileNumber')
      .lean(),
    Transaction.countDocuments({ accountId: req.accountId }),
  ]);

  const data = transactions.map((t) => ({
    transactionId: t._id,
    customer: {
      customerId: t.customerId?._id,
      name:       t.customerId?.name || 'Unknown',
    },
    type:      t.type,
    amount:    t.amount,
    note:      t.note,
    createdAt: t.createdAt,
  }));

  return res.json({
    success: true,
    data,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

module.exports = { listTransactions, createTransaction, listAllTransactions };
