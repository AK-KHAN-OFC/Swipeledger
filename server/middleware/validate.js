'use strict';

const { ZodError } = require('zod');

/**
 * Validate request body against a Zod schema.
 * Replaces req.body with the parsed (and potentially transformed) output.
 * On failure: returns 400 VALIDATION_ERROR with the first error message.
 *
 * @param {import('zod').ZodSchema} schema
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError
            ? `${firstError.path.join('.') || 'field'}: ${firstError.message}`
            : 'Validation failed.',
          requestId: req.id,
        },
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
