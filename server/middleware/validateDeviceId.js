'use strict';

const { DEVICE_UUID_REGEX } = require('../config/constants');

/**
 * Validate the X-Device-ID request header.
 * - Missing or non-UUID-v4 values → 400 INVALID_DEVICE_ID
 * - Valid value → attached to req.deviceUUID
 *
 * Applied on every route that requires device identification
 * (login, refresh, and all authenticated routes).
 */
module.exports = function validateDeviceId(req, res, next) {
  const raw = req.headers['x-device-id'];

  if (!raw || !DEVICE_UUID_REGEX.test(raw)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_DEVICE_ID',
        message: 'A valid device ID (UUID v4) is required in the X-Device-ID header.',
        requestId: req.id,
      },
    });
  }

  req.deviceUUID = raw.toLowerCase();
  next();
};
