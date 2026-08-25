'use strict';

const mongoose = require('mongoose');
const { ACCOUNT_CODE_REGEX } = require('../config/constants');

const AccountSchema = new mongoose.Schema(
  {
    accountCode: {
      type: String,
      required: [true, 'Account code is required'],
      unique: true,
      immutable: true,
      trim: true,
      validate: {
        validator: (v) => ACCOUNT_CODE_REGEX.test(v),
        message: 'Account code must match format XXXX-XXXX-XXXX (uppercase alphanumeric)',
      },
    },

    // Login name for this workspace. NOT globally unique.
    // Different workspaces may independently use the same username.
    // Uniqueness enforced by the compound index { accountCode, username }.
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      lowercase: true,
      minlength: [4, 'Username must be at least 4 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
      validate: {
        validator: (v) => /^[a-z0-9_]{4,30}$/.test(v),
        message: 'Username may only contain lowercase letters, digits, and underscores',
      },
    },

    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never returned in queries unless explicitly selected with +passwordHash
    },

    mobileNumber: {
      type: String,
      trim: true,
      sparse: true,
      default: null,
      validate: {
        validator: (v) => v === null || /^\+[1-9]\d{7,14}$/.test(v),
        message: 'Mobile number must be in E.164 format (e.g. +919876543210)',
      },
    },

    mobileVerified: {
      type: Boolean,
      default: false,
    },

    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: [100, 'Business name must be at most 100 characters'],
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },

    deviceLimit: {
      type: Number,
      required: true,
      default: parseInt(process.env.DEFAULT_DEVICE_LIMIT || '3', 10),
      min: [1, 'Device limit must be at least 1'],
      max: [50, 'Device limit must be at most 50'],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Embedded timestamp of the last password change.
    // The JWT pca field carries this value; authenticate middleware
    // compares JWT pca against session.accountPasswordChangedAt without
    // loading this document on every request.
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },

    // Sentinel field written inside device-registration transactions to create a
    // write-write conflict between concurrent transactions for the same account.
    // This serializes concurrent device registrations and enforces the device limit
    // atomically under MongoDB snapshot isolation. Not used by application logic.
    _deviceLimitCheckAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    strict: true,
  },
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// accountCode globally unique — one workspace per code
AccountSchema.index({ accountCode: 1 }, { unique: true });

// Compound index: enforces unique (accountCode, username) pair.
// Also serves as the covering index for the login query:
//   Account.findOne({ accountCode, username, isActive })
// Do NOT add a separate global { username: 1 } unique index.
AccountSchema.index({ accountCode: 1, username: 1 }, { unique: true });

// Sparse index on mobileNumber (not all accounts have one)
AccountSchema.index({ mobileNumber: 1 }, { sparse: true });

const Account = mongoose.model('Account', AccountSchema);
module.exports = Account;
