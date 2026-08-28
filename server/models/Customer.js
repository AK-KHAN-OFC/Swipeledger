'use strict';

const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    // Owner — always set server-side from JWT; never trusted from client.
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },

    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [1, 'Name must not be empty'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },

    mobileNumber: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) => v === null || /^\+[1-9]\d{7,14}$/.test(v),
        message: 'Mobile number must be in E.164 format (e.g. +919876543210)',
      },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes must be at most 500 characters'],
      default: null,
    },

    // Soft delete — archived customers are hidden from normal views but their
    // transactions are kept for ledger integrity. Hard delete is never performed
    // on records that may have associated financial history.
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// ─── Indexes — single declaration each, no field-level duplicates ──────────────

// Main list + search query: filter by account + archived, sort by name
CustomerSchema.index({ accountId: 1, isArchived: 1, name: 1 });

// Mobile number search (sparse: not all customers have a mobile)
CustomerSchema.index({ accountId: 1, mobileNumber: 1 }, { sparse: true });

module.exports = mongoose.model('Customer', CustomerSchema);
