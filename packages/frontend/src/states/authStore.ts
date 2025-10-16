import { create } from "zustand";

interface AuthState {
  user: Auth.Session | null;
  setUser: (user: Auth.Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));