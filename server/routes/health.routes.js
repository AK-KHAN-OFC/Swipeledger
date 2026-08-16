'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 1 = connected, 2 = connecting
  const dbConnected = dbState === 1 || dbState === 2;

  if (!dbConnected) {
    return res.status(503).json({
      status: 'error',
      db: 'disconnected',
      uptime: process.uptime(),
    });
  }

  return res.status(200).json({
    status: 'ok',
    db: 'connected',
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;
