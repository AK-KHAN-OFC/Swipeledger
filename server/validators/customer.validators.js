'use strict';

const { z } = require('zod');

// ─── Reusable field definitions ────────────────────────────────────────────────

const nameField = z
  .string({ required_error: 'Customer name is required' })
  .trim()
  .min(1, 'Name must not be empty')
  .max(100, 'Name must be at most 100 characters');

const mobileField = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Mobile number must be in E.164 format (e.g. +919876543210)')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? null : (v ?? null)));

const notesField = z
  .string()
  .trim()
  .max(500, 'Notes must be at most 500 characters')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? null : (v ?? null)));

// ─── Schemas ───────────────────────────────────────────────────────────────────

/** POST /api/v1/customers */
const createCustomerSchema = z.object({
  name:         nameField,
  mobileNumber: mobileField,
  notes:        notesField,
});

/** PATCH /api/v1/customers/:id — all fields optional, at least one required */
const updateCustomerSchema = z
  .object({
    name:         nameField.optional(),
    mobileNumber: mobileField,
    notes:        notesField,
  })
  .refine(
    (d) => d.name !== undefined || d.mobileNumber !== undefined || d.notes !== undefined,
    { message: 'At least one field (name, mobileNumber, notes) must be provided.' },
  );

module.exports = { createCustomerSchema, updateCustomerSchema };
