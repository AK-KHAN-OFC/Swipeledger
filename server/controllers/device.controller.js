'use strict';

const Device = require('../models/Device');
const deviceService = require('../services/device.service');
const auditService = require('../services/audit.service');
const createError = require('../utils/createError');

async function listDevices(req, res) {
  const devices = await Device.find({ accountId: req.accountId, isActive: true })
    .select('_id name platform browser lastActiveAt registeredAt deviceUUID')
    .lean();

  const currentDeviceId = req.deviceId.toString();

  const data = devices.map((d) => ({
    ...d,
    isCurrent: d._id.toString() === currentDeviceId,
  }));

  return res.json({ success: true, data });
}

async function revokeDevice(req, res) {
  const { id } = req.params;

  const device = await deviceService.revokeDevice({
    accountId: req.accountId,
    deviceId: id,
    currentDeviceId: req.deviceId,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'device_revoked',
    entityType: 'device',
    entityId: device._id,
    metadata: {
      deviceName: device.name,
      revokedDeviceId: device._id.toString(),
      revokedBy: 'owner',
    },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: { message: 'Device revoked successfully.' } });
}

async function logoutOthers(req, res) {
  const revoked = await deviceService.logoutOtherSessions({
    accountId: req.accountId,
    currentSessionId: req.sessionId,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'logout',
    entityType: 'account',
    entityId: req.accountId,
    metadata: { reason: 'logout_all_others', sessionsRevoked: revoked },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: { sessionsRevoked: revoked } });
}

module.exports = { listDevices, revokeDevice, logoutOthers };
