import { create } from 'zustand';

export interface ScreenPickerState {
  isOpen: boolean;
  sources: ElectronScreenSource[];
}

export const useScreenPickerStore = create<ScreenPickerState>(() => ({
  isOpen: false,
  sources: [],
}));