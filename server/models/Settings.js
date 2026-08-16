'use strict';

const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      unique: true,
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
      trim: true,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    dateFormat: {
      type: String,
      default: 'DD/MM/YYYY',
      trim: true,
    },
    defaultPaymentMode: {
      type: String,
      enum: ['cash', 'upi', 'bank_transfer', 'other'],
      default: 'cash',
    },
    // NOTE: sessionTimeoutMinutes intentionally excluded.
    // JWT expiry is a server-level config (JWT_EXPIRY env var), not per-account.
  },
  {
    timestamps: true,
    strict: true,
  },
);

SettingsSchema.index({ accountId: 1 }, { unique: true });

const Settings = mongoose.model('Settings', SettingsSchema);
module.exports = Settings;
