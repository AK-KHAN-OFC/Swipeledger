'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');
const validate = require('../middleware/validate');
const customerController = require('../controllers/customer.controller');
const transactionController = require('../controllers/transaction.controller');
const { createCustomerSchema, updateCustomerSchema } = require('../validators/customer.validators');
const { createTransactionSchema } = require('../validators/transaction.validators');

const router = express.Router();

// All routes require a registered device + authenticated JWT session.
// req.accountId is set by authenticate and used for isolation in every handler.
router.use(validateDeviceId, authenticate);

// ── Customer CRUD ─────────────────────────────────────────────────────────────
router.get   ('/',              customerController.listCustomers);
router.post  ('/', validate(createCustomerSchema), customerController.createCustomer);
router.get   ('/:customerId',   customerController.getCustomer);
router.patch ('/:customerId', validate(updateCustomerSchema), customerController.updateCustomer);
router.delete('/:customerId',   customerController.archiveCustomer);

// ── Customer-scoped transactions ──────────────────────────────────────────────
// Nested under /:customerId so every transaction operation implicitly
// validates customer ownership before any transaction access.
router.get  ('/:customerId/transactions', transactionController.listTransactions);
router.post ('/:customerId/transactions',
  validate(createTransactionSchema),
  transactionController.createTransaction,
);

module.exports = router;
