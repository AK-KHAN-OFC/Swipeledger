'use strict';

const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },

    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },

    // SHA-256 hex digest of the raw refresh token.
    // The raw token is only ever in the httpOnly cookie — never stored.
    // SHA-256 is appropriate here because refresh tokens are cryptographically
    // random (high entropy) and not dictionary-attackable.
    refreshTokenHash: {
      type: String,
      required: true,
      select: false, // Never returned in query results by default
    },

    // Copied from account.passwordChangedAt at session creation.
    // The authenticate middleware compares the JWT pca field against this
    // value WITHOUT loading the Account document (one DB call per request).
    accountPasswordChangedAt: {
      type: Date,
      required: true,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      maxlength: 500,
      default: null,
    },

    isRevoked: {
      type: Boolean,
      default: false,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    // TTL field: MongoDB auto-deletes the document after this date
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Refresh token lookup (unique — one active token per session)
SessionSchema.index({ refreshTokenHash: 1 }, { unique: true, sparse: true });

// Authenticate middleware lookup: { _id, accountId, deviceId }
SessionSchema.index({ _id: 1, accountId: 1, deviceId: 1 });

// Device session management and active session listing
SessionSchema.index({ accountId: 1, deviceId: 1 });
SessionSchema.index({ accountId: 1, isRevoked: 1 });

// TTL index — MongoDB auto-removes documents after expiresAt
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model('Session', SessionSchema);
module.exports = Session;
