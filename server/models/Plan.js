'use strict';

const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    deviceLimit: { type: Number, required: true, min: 1 },
    transactionLimit: { type: Number, default: -1 }, // -1 = unlimited
    features: [{ type: String }], // Feature flag keys
    price: { type: Number, default: 0 }, // Monthly price, 0 = free
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    strict: true,
  },
);

PlanSchema.index({ slug: 1 }, { unique: true });
PlanSchema.index({ isActive: 1 });

const Plan = mongoose.model('Plan', PlanSchema);
module.exports = Plan;
