import { create } from 'zustand';

export interface Transfer {
  id: string;
  type: 'upload' | 'download';
  filename: string;
  size: number;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'error';
  error?: string;
  startTime: number;
}

interface TransferStore {
  transfers: Transfer[];
  isOpen: boolean;
  addTransfer: (transfer: Omit<Transfer, 'id' | 'startTime'>) => string;
  updateTransfer: (id: string, updates: Partial<Transfer>) => void;
  removeTransfer: (id: string) => void;
  clearCompleted: () => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
}

export const useTransferStore = create<TransferStore>((set) => ({
  transfers: [],
  isOpen: false,
  
  addTransfer: (transfer) => {
    const id = `${transfer.type}-${Date.now()}-${Math.random()}`;
    set((state) => ({
      transfers: [
        ...state.transfers,
        {
          ...transfer,
          id,
          startTime: Date.now(),
        },
      ],
    }));
    return id;
  },
  
  updateTransfer: (id, updates) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },
  
  removeTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id),
    }));
  },
  
  clearCompleted: () => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.status !== 'completed'),
    }));
  },
  
  toggleOpen: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },
  
  setOpen: (open) => {
    set({ isOpen: open });
  },
}));
