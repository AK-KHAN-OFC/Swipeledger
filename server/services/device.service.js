'use strict';

const mongoose = require('mongoose');
const Account = require('../models/Account');
const Device = require('../models/Device');
const Session = require('../models/Session');
const createError = require('../utils/createError');
const logger = require('../utils/logger');

/**
 * Parse platform and browser from User-Agent string.
 */
function parseUserAgent(userAgent) {
  if (!userAgent) return { platform: 'Unknown', browser: 'Unknown' };
  const ua = userAgent.toLowerCase();

  let platform = 'Unknown';
  if (/iphone|ipad/.test(ua)) platform = 'iOS';
  else if (/android/.test(ua)) platform = 'Android';
  else if (/windows/.test(ua)) platform = 'Windows';
  else if (/mac os x/.test(ua)) platform = 'macOS';
  else if (/linux/.test(ua)) platform = 'Linux';

  let browser = 'Unknown';
  if (/chrome/.test(ua) && !/edge|opr/.test(ua)) browser = 'Chrome';
  else if (/firefox/.test(ua)) browser = 'Firefox';
  else if (/safari/.test(ua) && !/chrome/.test(ua)) browser = 'Safari';
  else if (/edge/.test(ua)) browser = 'Edge';

  return { platform, browser };
}

/**
 * Register a new device or return an existing active one.
 * The count check + insert is wrapped in a MongoDB transaction to prevent
 * concurrent requests from bypassing the device limit.
 *
 * Atomicity note: MongoDB transactions use snapshot isolation, not serializable.
 * Two concurrent transactions for the same account can both snapshot count=N,
 * both pass the limit check, and both commit — because distinct deviceUUIDs
 * produce no write-write conflict on the Device collection. To serialize them,
 * we write to the Account document inside the transaction before counting.
 * Any two concurrent transactions for the same account now conflict on the
 * Account document write, causing one to block until the other commits, then
 * re-evaluate with an updated snapshot that reflects the committed insert.
 *
 * @param {object} opts
 * @param {ObjectId} opts.accountId
 * @param {number}   opts.deviceLimit  — from account document
 * @param {string}   opts.deviceUUID   — validated UUID v4
 * @param {string}   [opts.deviceName]
 * @param {string}   [opts.userAgent]
 * @returns {{ device: Document, isNewDevice: boolean }}
 * @throws 403 DEVICE_LIMIT_REACHED with activeDevices list
 */
async function registerOrFindDevice({ accountId, deviceLimit, deviceUUID, deviceName, userAgent }) {
  const { platform, browser } = parseUserAgent(userAgent);

  // MongoDB throws WriteConflict (code 112, labelled TransientTransactionError) when two
  // concurrent transactions write to the same document (the Account sentinel write below).
  // It does NOT block and retry automatically — the application must retry the whole
  // transaction from scratch.  On retry the fresh snapshot includes the winning
  // transaction's committed device insert, so countDocuments naturally returns count >=
  // deviceLimit and the DEVICE_LIMIT_REACHED path is taken.
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const dbSession = await mongoose.startSession();

    try {
      dbSession.startTransaction();

      // Step 1: Is this a returning device?
      const existing = await Device.findOne(
        { accountId, deviceUUID, isActive: true },
        null,
        { session: dbSession },
      );

      if (existing) {
        await dbSession.commitTransaction();
        return { device: existing, isNewDevice: false };
      }

      // Step 2: Serialize concurrent registrations for the same account.
      //
      // Writing to the Account document creates a write-write conflict between any two
      // concurrent transactions for the same account.  The losing transaction receives a
      // WriteConflict error (code 112, TransientTransactionError).  The retry loop above
      // catches that, ends the aborted session, and starts a fresh transaction whose
      // snapshot includes the winning transaction's committed device.  The re-count in
      // Step 3 then correctly sees count >= limit.
      //
      // _deviceLimitCheckAt is a lightweight sentinel field; it has no effect on
      // application logic and is ignored by all queries.
      await Account.findByIdAndUpdate(
        accountId,
        { $set: { _deviceLimitCheckAt: new Date() } },
        { session: dbSession },
      );

      // Step 3: Count currently active devices (serialized by the Account write above)
      const count = await Device.countDocuments(
        { accountId, isActive: true },
        { session: dbSession },
      );

      if (count >= deviceLimit) {
        await dbSession.abortTransaction();

        // Fetch active devices for the 403 response (outside the aborted transaction)
        const activeDevices = await Device.find({ accountId, isActive: true })
          .select('_id name platform browser lastActiveAt registeredAt')
          .lean();

        const err = createError(
          403,
          'DEVICE_LIMIT_REACHED',
          `Maximum active devices (${deviceLimit}) reached. Revoke an existing device before logging in from a new one.`,
        );
        err.activeDevices = activeDevices;
        err.limit = deviceLimit;
        throw err;
      }

      // Step 4: Register the new device
      const [device] = await Device.create(
        [
          {
            accountId,
            deviceUUID,
            name: deviceName || `${platform} — ${browser}`,
            platform,
            browser,
            isActive: true,
            registeredAt: new Date(),
            lastActiveAt: new Date(),
          },
        ],
        { session: dbSession },
      );

      await dbSession.commitTransaction();
      logger.info('Device registered', { accountId: accountId.toString(), platform, browser });
      return { device, isNewDevice: true };

    } catch (err) {
      if (dbSession.inTransaction()) {
        await dbSession.abortTransaction();
      }

      // TransientTransactionError (WriteConflict, code 112): MongoDB aborted the losing
      // concurrent transaction.  Retry from scratch — the fresh snapshot will reflect the
      // winning transaction's committed writes and the count check will work correctly.
      const isTransient =
        err.errorLabels?.includes('TransientTransactionError') ||
        err.code === 112;

      if (isTransient && attempt < MAX_RETRIES) {
        logger.info('TransientTransactionError on device registration — retrying', {
          attempt,
          accountId: accountId.toString(),
        });
        // fall through to next loop iteration (finally closes this session first)
      } else {
        throw err;
      }
    } finally {
      await dbSession.endSession();
    }
  }
}

/**
 * Revoke a device and all its sessions for a given account.
 * Validates that the device belongs to the account and is not the current device.
 */
async function revokeDevice({ accountId, deviceId, currentDeviceId }) {
  if (String(deviceId) === String(currentDeviceId)) {
    throw createError(400, 'VALIDATION_ERROR', 'Cannot revoke the current device. Use logout instead.');
  }

  const device = await Device.findOne({ _id: deviceId, accountId, isActive: true });
  if (!device) {
    throw createError(404, 'NOT_FOUND', 'Device not found.');
  }

  // Revoke all sessions for this device
  await Session.updateMany({ accountId, deviceId }, { $set: { isRevoked: true } });

  // Mark device inactive
  device.isActive = false;
  device.revokedAt = new Date();
  await device.save();

  return device;
}

/**
 * Revoke all sessions for all devices EXCEPT the current one.
 * Devices remain registered — only their sessions are revoked.
 */
async function logoutOtherSessions({ accountId, currentSessionId }) {
  const result = await Session.updateMany(
    { accountId, _id: { $ne: currentSessionId }, isRevoked: false },
    { $set: { isRevoked: true } },
  );
  return result.modifiedCount;
}

module.exports = { registerOrFindDevice, revokeDevice, logoutOtherSessions, parseUserAgent };
