'use strict';

const mongoose = require('mongoose');
const { DEVICE_UUID_REGEX } = require('../config/constants');

const DeviceSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },

    // UUID v4 from the client-side cookie (primary) or localStorage (fallback).
    // Validated as UUID v4 format before reaching device lookup logic.
    // NOT a secret — identifies the device, does not authenticate it.
    deviceUUID: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => DEVICE_UUID_REGEX.test(v),
        message: 'deviceUUID must be a valid UUID v4',
      },
    },

    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Unknown Device',
    },

    platform: {
      type: String,
      enum: ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Unknown'],
      default: 'Unknown',
    },

    browser: {
      type: String,
      trim: true,
      maxlength: 50,
      default: 'Unknown',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    registeredAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    strict: true,
    // No timestamps — we manage registeredAt and lastActiveAt manually
  },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Compound unique: one UUID per account
DeviceSchema.index({ accountId: 1, deviceUUID: 1 }, { unique: true });

// Active device listing and count (used in device limit enforcement)
DeviceSchema.index({ accountId: 1, isActive: 1 });

const Device = mongoose.model('Device', DeviceSchema);
module.exports = Device;
