import { forwardRef } from 'react';

// Input — must use forwardRef so that react-hook-form's register() ref callback
// reaches the underlying <input> DOM element.
//
// Without forwardRef, React 18 intercepts the ref prop on a plain function
// component and never calls the RHF refCallback. _fields[name]._f.ref stays as
// the placeholder object { name }, whose .value is always undefined. Every
// onChange call then writes undefined into _formValues, so the zodResolver
// receives undefined on submit and throws "Required" even when the user has
// typed a value. forwardRef makes the ref land on the real <input>, so
// _f.ref.value returns the actual DOM value and validation passes.
export const Input = forwardRef(function Input(
  { label, id, error, className = '', type = 'text', ...props },
  ref,
) {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        ref={ref}
        className={`
          block w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm
          placeholder:text-gray-400 focus:outline-none focus:ring-2
          ${error
            ? 'border-red-400 focus:ring-red-400 bg-red-50'
            : 'border-gray-300 focus:ring-brand-500 bg-white'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});

// Alert
export function Alert({ type = 'info', message, className = '' }) {
  const styles = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error:   'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]} ${className}`}>
      {message}
    </div>
  );
}

// Spinner
export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <svg
      className={`animate-spin text-brand-600 ${sizes[size]} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default Spinner;

/**
 * Modal — bottom sheet on mobile, centered dialog on larger screens.
 *
 * On narrow viewports (Android app) this slides up from the bottom edge,
 * giving a native-feeling sheet interaction without any JS animation library.
 * On wider viewports it behaves as a standard centered modal.
 */
export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop — tap outside to dismiss */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet / dialog */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
