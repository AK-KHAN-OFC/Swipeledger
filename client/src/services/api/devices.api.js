import apiClient from './client';

export const devicesApi = {
  list: () => apiClient.get('/devices'),
  revoke: (id) => apiClient.delete(`/devices/${id}`),
  logoutOthers: () => apiClient.post('/devices/logout-others'),
};
