import apiClient from './client';

export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  logout: () => apiClient.post('/auth/logout'),
  refresh: () => apiClient.post('/auth/refresh'),
  logoutAll: () => apiClient.post('/auth/logout-all'),
  changePassword: (data) => apiClient.post('/auth/change-password', data),
  register: (data) => apiClient.post('/auth/register', data),
};
