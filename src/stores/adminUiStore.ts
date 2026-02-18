import { create } from 'zustand';

export const ADMIN_SIDEBAR_WIDTH = 240;
export const ADMIN_SIDEBAR_COLLAPSED_WIDTH = 64;

interface AdminUiState {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useAdminUiStore = create<AdminUiState>((set) => ({
    sidebarOpen: true,
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
