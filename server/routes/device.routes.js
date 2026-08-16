'use strict';

const express = require('express');
const deviceController = require('../controllers/device.controller');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');

const router = express.Router();

router.use(validateDeviceId, authenticate);

router.get('/', deviceController.listDevices);
router.delete('/:id', deviceController.revokeDevice);
router.post('/logout-others', deviceController.logoutOthers);

module.exports = router;
