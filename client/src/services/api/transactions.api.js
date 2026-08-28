import apiClient from './client';

export const transactionsApi = {
  /** List all transactions for a specific customer (newest first). */
  listForCustomer: (customerId) =>
    apiClient.get(`/customers/${customerId}/transactions`),

  /** Record a credit or payment transaction for a customer. */
  create: (customerId, data) =>
    apiClient.post(`/customers/${customerId}/transactions`, data),

  /** Global ledger — all transactions across all customers. Supports { page, limit }. */
  listAll: (params = {}) =>
    apiClient.get('/transactions', { params }),
};
