'use strict';

const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const auditService = require('../services/audit.service');
const createError = require('../utils/createError');
const logger = require('../utils/logger');

// ─── Account isolation helper ──────────────────────────────────────────────────

/**
 * Load a customer that MUST belong to req.accountId.
 *
 * Security contract: accountId is ALWAYS taken from req.accountId (set by the
 * authenticate middleware from the verified JWT). It is NEVER read from
 * req.body or req.params. A merchant cannot access another merchant's customer
 * by supplying an arbitrary customerId — the accountId filter prevents it.
 *
 * @param {object} req
 * @param {boolean} includeArchived - if true, returns archived customers too
 */
async function requireOwnedCustomer(req, includeArchived = false) {
  const { customerId } = req.params;

  if (!mongoose.isValidObjectId(customerId)) {
    throw createError(400, 'INVALID_ID', 'Invalid customer ID.');
  }

  const filter = {
    _id:       new mongoose.Types.ObjectId(customerId),
    accountId: req.accountId,   // ← from JWT; never from client
  };
  if (!includeArchived) filter.isArchived = false;

  const customer = await Customer.findOne(filter).lean();
  if (!customer) throw createError(404, 'NOT_FOUND', 'Customer not found.');

  return customer;
}

// ─── Balance helpers ───────────────────────────────────────────────────────────

/**
 * Aggregate credit/payment totals for an array of customerIds within one account.
 * Executes a single aggregation regardless of how many customer IDs are given.
 *
 * @returns {Map<string, { totalCredit, totalPayment, transactionCount }>}
 */
async function buildBalanceMap(accountId, customerIds) {
  if (customerIds.length === 0) return new Map();

  const rows = await Transaction.aggregate([
    { $match: { accountId, customerId: { $in: customerIds } } },
    {
      $group: {
        _id: '$customerId',
        totalCredit:      { $sum: { $cond: [{ $eq: ['$type', 'credit']  }, '$amount', 0] } },
        totalPayment:     { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(row._id.toString(), {
      totalCredit:      row.totalCredit,
      totalPayment:     row.totalPayment,
      transactionCount: row.transactionCount,
    });
  }
  return map;
}

/**
 * Derive a balance summary from raw totals.
 * status:
 *   "due"     — customer owes merchant  (net > 0)
 *   "clear"   — no outstanding balance  (net ≈ 0)
 *   "advance" — merchant owes customer  (net < 0)
 */
function deriveBalance(totalCredit, totalPayment, transactionCount) {
  const net = Math.round((totalCredit - totalPayment) * 100) / 100;
  let status;
  if      (net >  0.005) status = 'due';
  else if (net < -0.005) status = 'advance';
  else                   status = 'clear';

  return {
    net,
    totalCredit:      Math.round(totalCredit  * 100) / 100,
    totalPayment:     Math.round(totalPayment * 100) / 100,
    transactionCount,
    status,
  };
}

// ─── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/customers
 * List all active (non-archived) customers for the authenticated account.
 * Optional query param: ?search= (matches name or mobile number, case-insensitive)
 */
async function listCustomers(req, res) {
  const { search } = req.query;

  const filter = {
    accountId:  req.accountId,
    isArchived: false,
  };

  if (search && typeof search === 'string' && search.trim()) {
    // Escape regex special characters to prevent ReDoS
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name:         { $regex: safe, $options: 'i' } },
      { mobileNumber: { $regex: safe, $options: 'i' } },
    ];
  }

  const customers = await Customer.find(filter)
    .sort({ name: 1 })
    .limit(500)   // practical cap; pagination can be added when needed
    .lean();

  // Single aggregation for all balance totals — avoids N+1 query pattern
  const ids       = customers.map((c) => c._id);
  const balanceMap = await buildBalanceMap(req.accountId, ids);

  const data = customers.map((c) => {
    const b = balanceMap.get(c._id.toString()) ?? { totalCredit: 0, totalPayment: 0, transactionCount: 0 };
    return {
      customerId:   c._id,
      name:         c.name,
      mobileNumber: c.mobileNumber,
      notes:        c.notes,
      balance:      deriveBalance(b.totalCredit, b.totalPayment, b.transactionCount),
      createdAt:    c.createdAt,
    };
  });

  return res.json({ success: true, data });
}

/**
 * POST /api/v1/customers
 * Create a new customer for the authenticated account.
 * accountId is ALWAYS set from req.accountId — never from request body.
 */
async function createCustomer(req, res) {
  const { name, mobileNumber, notes } = req.body;

  const customer = await Customer.create({
    accountId:    req.accountId,   // ← JWT; never from body
    name,
    mobileNumber: mobileNumber ?? null,
    notes:        notes        ?? null,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId:  req.deviceId,
    sessionId: req.sessionId,
    action:    'customer_created',
    entityType: 'customer',
    entityId:  customer._id,
    metadata:  { name: customer.name, hasPhone: !!mobileNumber },
    ipAddress: req.ip,
    requestId: req.id,
  });

  logger.info('Customer created', {
    accountId:  req.accountId.toString(),
    customerId: customer._id.toString(),
  });

  return res.status(201).json({
    success: true,
    data: {
      customerId:   customer._id,
      name:         customer.name,
      mobileNumber: customer.mobileNumber,
      notes:        customer.notes,
      balance:      deriveBalance(0, 0, 0),
      createdAt:    customer.createdAt,
    },
  });
}

/**
 * GET /api/v1/customers/:customerId
 * Return a single customer with their computed balance summary.
 */
async function getCustomer(req, res) {
  const customer  = await requireOwnedCustomer(req);
  const balanceMap = await buildBalanceMap(req.accountId, [customer._id]);
  const b = balanceMap.get(customer._id.toString()) ?? { totalCredit: 0, totalPayment: 0, transactionCount: 0 };

  return res.json({
    success: true,
    data: {
      customerId:   customer._id,
      name:         customer.name,
      mobileNumber: customer.mobileNumber,
      notes:        customer.notes,
      balance:      deriveBalance(b.totalCredit, b.totalPayment, b.transactionCount),
      createdAt:    customer.createdAt,
      updatedAt:    customer.updatedAt,
    },
  });
}

/**
 * PATCH /api/v1/customers/:customerId
 * Update editable customer fields. Only updates supplied fields.
 */
async function updateCustomer(req, res) {
  const customer = await requireOwnedCustomer(req);

  // Build $set from only the fields that were explicitly provided
  const allowed = {};
  if (req.body.name         !== undefined) allowed.name         = req.body.name;
  if (req.body.mobileNumber !== undefined) allowed.mobileNumber = req.body.mobileNumber;
  if (req.body.notes        !== undefined) allowed.notes        = req.body.notes;

  const updated = await Customer.findByIdAndUpdate(
    customer._id,
    { $set: allowed },
    { new: true, runValidators: true },
  ).lean();

  auditService.logAction({
    accountId: req.accountId,
    deviceId:  req.deviceId,
    sessionId: req.sessionId,
    action:    'customer_updated',
    entityType: 'customer',
    entityId:  customer._id,
    metadata:  { changedFields: Object.keys(allowed) },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({
    success: true,
    data: {
      customerId:   updated._id,
      name:         updated.name,
      mobileNumber: updated.mobileNumber,
      notes:        updated.notes,
      updatedAt:    updated.updatedAt,
    },
  });
}

/**
 * DELETE /api/v1/customers/:customerId
 * Soft-delete (archive) a customer. Transactions are preserved.
 *
 * Hard delete is intentionally not implemented: deleting a customer with
 * existing transactions would corrupt the historical ledger.
 */
async function archiveCustomer(req, res) {
  const customer = await requireOwnedCustomer(req);

  await Customer.findByIdAndUpdate(customer._id, { $set: { isArchived: true } });

  auditService.logAction({
    accountId: req.accountId,
    deviceId:  req.deviceId,
    sessionId: req.sessionId,
    action:    'customer_archived',
    entityType: 'customer',
    entityId:  customer._id,
    metadata:  { name: customer.name },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: { message: 'Customer archived successfully.' } });
}

module.exports = { listCustomers, createCustomer, getCustomer, updateCustomer, archiveCustomer };
