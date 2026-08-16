'use strict';

// Set environment variables BEFORE any server module is loaded.
// bcrypt cost of 4 makes tests fast; production uses 12.
process.env.NODE_ENV            = 'test';
process.env.PORT                = '3099';
process.env.MONGODB_URI         = 'mongodb://127.0.0.1:27017/swipeledger_test'; // overridden by memory server
process.env.JWT_SECRET          = 'test-jwt-secret-minimum-32-characters-long!!';
process.env.JWT_EXPIRY          = '15m';
process.env.REFRESH_TOKEN_EXPIRY_DAYS = '1';
process.env.CLIENT_ORIGIN       = 'http://localhost:5173';
process.env.BCRYPT_ROUNDS       = '4';
process.env.DEFAULT_DEVICE_LIMIT = '3';
process.env.LOG_LEVEL           = 'error'; // suppress info/http logs during tests
