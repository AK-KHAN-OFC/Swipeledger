'use strict';

const mongoose = require('mongoose');

// Each document represents one sequence per account per entity type.
// _id format: "<accountId>_<type>"  e.g. "507f1f77bcf86cd799439011_customer"
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  {
    // No timestamps — this is a utility collection
    versionKey: false,
  },
);

const Counter = mongoose.model('Counter', CounterSchema);
module.exports = Counter;
