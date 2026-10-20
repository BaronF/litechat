import { create } from 'zustand';
import { User } from '../types';
import api from '../utils/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: (() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  })(),
  token: localStorage.getItem('token'),
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { username, password });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (username, password, nickname) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/register', { username, password, nickname });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },

  updateUser: (updates) => {
    set((state) => {
      const newUser = state.user ? { ...state.user, ...updates } : null;
      if (newUser) localStorage.setItem('user', JSON.stringify(newUser));
      return { user: newUser };
    });
  }
}));
