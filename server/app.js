'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const accountRoutes = require('./routes/account.routes');
const deviceRoutes = require('./routes/device.routes');
const settingsRoutes = require('./routes/settings.routes');
const auditRoutes = require('./routes/audit.routes');

const app = express();

// ─── Trust proxy ──────────────────────────────────────────────────────────────
// MUST be the first app configuration.
// Render (and most cloud hosts) sit behind a reverse proxy.
// Without this, req.ip returns the proxy's internal IP, breaking IP rate limiting.
app.set('trust proxy', 1);

// ─── Correlation ID ───────────────────────────────────────────────────────────
app.use(requestId);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow PWA install prompts
  }),
);

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,          // Required: allows httpOnly cookie to be sent
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-ID',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Request-ID'],
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Cookie parsing ───────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── NoSQL injection protection ───────────────────────────────────────────────
// Strips MongoDB operators ($, .) from req.body, req.query, req.params
app.use(mongoSanitize({ replaceWith: '_' }));

// ─── HTTP request logging ─────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/audit', auditRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
      requestId: req.id,
    },
  });
});

// ─── Centralized error handler ────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
