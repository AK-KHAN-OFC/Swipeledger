import { format } from 'date-fns';

/**
 * Format a number as Indian Rupees (₹) with Indian comma notation.
 * Always uses the absolute value; direction is communicated by context.
 *
 * Examples:
 *   500        → "₹500"
 *   1500       → "₹1,500"
 *   100000     → "₹1,00,000"
 *   1500.50    → "₹1,500.50"
 */
export function formatINR(amount) {
  return (
    '₹' +
    Math.abs(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Format a date/timestamp in a readable Indian-friendly format.
 * Example: "27 Aug 2026, 2:45 PM"
 */
export function formatDate(dateString) {
  try {
    return format(new Date(dateString), 'd MMM yyyy, h:mm a');
  } catch {
    return '—';
  }
}

/**
 * Format a date as a short string (date only).
 * Example: "27 Aug 2026"
 */
export function formatDateShort(dateString) {
  try {
    return format(new Date(dateString), 'd MMM yyyy');
  } catch {
    return '—';
  }
}

/**
 * Build a balance label string for display.
 * status: 'due' | 'clear' | 'advance'
 */
export function balanceLabel(balance) {
  if (balance.status === 'clear') return 'Clear';
  if (balance.status === 'due')   return `${formatINR(balance.net)} Due`;
  return `${formatINR(Math.abs(balance.net))} Advance`;
}

/** Tailwind colour classes for a balance status. */
export function balanceColour(status) {
  if (status === 'due')     return 'text-red-600';
  if (status === 'advance') return 'text-blue-600';
  return 'text-green-600';
}

export function balanceBgColour(status) {
  if (status === 'due')     return 'bg-red-50 text-red-700 border-red-100';
  if (status === 'advance') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-green-50 text-green-700 border-green-100';
}
