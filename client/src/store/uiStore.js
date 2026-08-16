import { create } from 'zustand';

const useUiStore = create((set) => ({
  sidebarOpen: false,
  theme: 'light',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setTheme: (theme) => set({ theme }),
}));

export default useUiStore;
