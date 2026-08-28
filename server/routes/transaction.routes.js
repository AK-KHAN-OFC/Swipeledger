'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');
const transactionController = require('../controllers/transaction.controller');

const router = express.Router();

router.use(validateDeviceId, authenticate);

// Global ledger — all transactions for the authenticated account, newest first.
// Customer name is populated. Supports ?page= and ?limit= query params.
router.get('/', transactionController.listAllTransactions);

module.exports = router;
