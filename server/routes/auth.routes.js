'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validateDeviceId = require('../middleware/validateDeviceId');
const validate = require('../middleware/validate');
const { loginRateLimitCheck } = require('../middleware/rateLimiter');
const { loginSchema, changePasswordSchema } = require('../validators/auth.validators');

const router = express.Router();

// POST /api/v1/auth/login
// Public. Rate checked before, failure recorded inside controller.
router.post(
  '/login',
  validateDeviceId,
  loginRateLimitCheck,
  validate(loginSchema),
  authController.login,
);

// POST /api/v1/auth/logout
// Requires valid access token.
router.post(
  '/logout',
  validateDeviceId,
  authenticate,
  authController.logout,
);

// POST /api/v1/auth/refresh
// Uses httpOnly cookie. validateDeviceId still required.
router.post(
  '/refresh',
  validateDeviceId,
  authController.refresh,
);

// POST /api/v1/auth/logout-all
// Revokes all sessions except current.
router.post(
  '/logout-all',
  validateDeviceId,
  authenticate,
  authController.logoutAll,
);

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  validateDeviceId,
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword,
);

module.exports = router;
