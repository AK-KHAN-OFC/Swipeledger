'use strict';

const { z } = require('zod');
const { ACCOUNT_CODE_REGEX } = require('../config/constants');

const loginSchema = z.object({
  accountCode: z
    .string({ required_error: 'Account code is required' })
    .trim()
    .regex(ACCOUNT_CODE_REGEX, 'Account code must match format XXXX-XXXX-XXXX'),
  username: z
    .string({ required_error: 'Username is required' })
    .trim()
    .min(4, 'Username must be at least 4 characters')
    .max(30, 'Username must be at most 30 characters')
    .transform((v) => v.toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  deviceName: z.string().trim().max(100).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Current password is required' })
    .min(8).max(128),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be at most 128 characters'),
});

// ─── Registration ──────────────────────────────────────────────────────────────

/**
 * Validator for POST /api/v1/auth/register.
 * Only collects what the Account model requires from the merchant.
 * accountCode, username, and password are all server-generated.
 */
const registerSchema = z.object({
  businessName: z
    .string({ required_error: 'Business name is required' })
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must be at most 100 characters'),

  // Optional — must be E.164 if provided (matches Account model validator)
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Mobile number must be in E.164 format (e.g. +919876543210)')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v ?? null)),
});

module.exports = { loginSchema, changePasswordSchema, registerSchema };
