'use strict';

const express = require('express');
const accountController = require('../controllers/account.controller');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');

const router = express.Router();

router.use(validateDeviceId, authenticate);

router.get('/', accountController.getAccount);
router.patch('/', accountController.updateAccount);

module.exports = router;
