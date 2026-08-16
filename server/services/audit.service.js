'use strict';

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Write an audit log entry. Fire-and-forget — errors are logged but
 * never propagated to the caller. No secret data in metadata.
 *
 * @param {object} data
 * @param {ObjectId|string} data.accountId
 * @param {ObjectId|string} [data.deviceId]
 * @param {ObjectId|string} [data.sessionId]
 * @param {string} data.action
 * @param {string} [data.entityType]
 * @param {ObjectId|string} [data.entityId]
 * @param {object} [data.metadata]
 * @param {string} [data.ipAddress]
 * @param {string} [data.requestId]
 */
async function logAction(data) {
  try {
    await AuditLog.create({
      accountId: data.accountId,
      deviceId: data.deviceId || null,
      sessionId: data.sessionId || null,
      action: data.action,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      metadata: data.metadata || {},
      ipAddress: data.ipAddress || null,
      requestId: data.requestId || null,
    });
  } catch (err) {
    // Audit failure must never crash the application
    logger.error('Failed to write audit log', {
      error: err.message,
      action: data.action,
      accountId: String(data.accountId),
    });
  }
}

module.exports = { logAction };
