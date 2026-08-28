import apiClient from './client';

export const customersApi = {
  /** List customers. Optional { search } filters by name or mobile. */
  list: (params = {}) =>
    apiClient.get('/customers', { params }),

  /** Create a new customer. */
  create: (data) =>
    apiClient.post('/customers', data),

  /** Get a single customer with balance summary. */
  get: (customerId) =>
    apiClient.get(`/customers/${customerId}`),

  /** Update customer fields (name, mobileNumber, notes). */
  update: (customerId, data) =>
    apiClient.patch(`/customers/${customerId}`, data),

  /** Soft-delete (archive) a customer. */
  archive: (customerId) =>
    apiClient.delete(`/customers/${customerId}`),
};
