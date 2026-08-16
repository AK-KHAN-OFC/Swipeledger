'use strict';

const express = require('express');
const Settings = require('../models/Settings');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');
const auditService = require('../services/audit.service');
const createError = require('../utils/createError');

async function getSettings(req, res) {
  const settings = await Settings.findOne({ accountId: req.accountId }).lean();
  if (!settings) throw createError(404, 'NOT_FOUND', 'Settings not found.');
  return res.json({ success: true, data: settings });
}

async function updateSettings(req, res) {
  const allowed = ['timezone', 'currency', 'dateFormat', 'defaultPaymentMode'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const settings = await Settings.findOneAndUpdate(
    { accountId: req.accountId },
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!settings) throw createError(404, 'NOT_FOUND', 'Settings not found.');

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'settings_changed',
    entityType: 'settings',
    entityId: settings._id,
    metadata: { changedFields: Object.keys(updates) },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: settings });
}

const router = express.Router();
router.use(validateDeviceId, authenticate);
router.get('/', getSettings);
router.patch('/', updateSettings);

module.exports = router;
