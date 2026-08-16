'use strict';

const Account = require('../models/Account');
const Subscription = require('../models/Subscription');
const auditService = require('../services/audit.service');
const createError = require('../utils/createError');

async function getAccount(req, res) {
  const account = await Account.findById(req.accountId)
    .select('-passwordHash')
    .lean();

  if (!account) throw createError(404, 'NOT_FOUND', 'Account not found.');

  const subscription = await Subscription.findOne({ accountId: req.accountId })
    .populate('planId', 'name slug features deviceLimit price')
    .lean();

  return res.json({
    success: true,
    data: {
      accountId: account._id,
      accountCode: account.accountCode,
      username: account.username,
      businessName: account.businessName,
      mobileNumber: account.mobileNumber,
      mobileVerified: account.mobileVerified,
      deviceLimit: account.deviceLimit,
      isActive: account.isActive,
      plan: subscription?.planId || null,
      createdAt: account.createdAt,
    },
  });
}

async function updateAccount(req, res) {
  const allowed = {};
  if (req.body.businessName !== undefined) allowed.businessName = req.body.businessName;
  if (req.body.mobileNumber !== undefined) allowed.mobileNumber = req.body.mobileNumber;

  const updated = await Account.findByIdAndUpdate(
    req.accountId,
    { $set: allowed },
    { new: true, runValidators: true },
  ).select('-passwordHash');

  if (!updated) throw createError(404, 'NOT_FOUND', 'Account not found.');

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'account_updated',
    entityType: 'account',
    entityId: req.accountId,
    metadata: { changedFields: Object.keys(allowed) },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: updated });
}

module.exports = { getAccount, updateAccount };
