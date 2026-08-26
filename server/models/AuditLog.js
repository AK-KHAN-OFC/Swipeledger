'use strict';

const mongoose = require('mongoose');
const { AUDIT_LOG_TTL_DAYS } = require('../config/constants');

const VALID_ACTIONS = [
  'account_registered',
  'login', 'logout', 'login_failed', 'password_changed', 'token_refreshed',
  'device_registered', 'device_revoked', 'device_limit_reached',
  'customer_created', 'customer_updated', 'customer_archived',
  'transaction_created', 'transaction_updated', 'transaction_voided', 'transaction_cancelled',
  'payment_account_created', 'payment_account_updated', 'payment_account_deactivated',
  'account_updated', 'settings_changed',
];

const VALID_ENTITY_TYPES = [
  'account', 'device', 'session', 'customer', 'transaction', 'payment_account', 'settings',
];

const AuditLogSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },

    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      default: null,
    },

    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },

    action: {
      type: String,
      required: true,
      enum: VALID_ACTIONS,
    },

    entityType: {
      type: String,
      enum: VALID_ENTITY_TYPES,
      default: null,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Structured metadata — shape documented per action type in blueprint Section 7.7.
    // MUST NOT contain passwords, tokens, full card numbers, or other secrets.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: null,
    },

    requestId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // No updatedAt — logs are immutable
    strict: true,
  },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

AuditLogSchema.index({ accountId: 1, createdAt: -1 });
AuditLogSchema.index({ accountId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ accountId: 1, entityType: 1, entityId: 1, createdAt: -1 });

// TTL index: auto-delete audit logs after retention period
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AUDIT_LOG_TTL_DAYS * 24 * 60 * 60 },
);

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
module.exports = AuditLog;
