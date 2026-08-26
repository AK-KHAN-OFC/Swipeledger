'use strict';

const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      // unique: true removed — the explicit SubscriptionSchema.index() below is
      // the single declaration. Duplicate caused startup index warnings on Render.
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'trial'],
      default: 'active',
    },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    strict: true,
  },
);

SubscriptionSchema.index({ accountId: 1 }, { unique: true });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

const Subscription = mongoose.model('Subscription', SubscriptionSchema);
module.exports = Subscription;
