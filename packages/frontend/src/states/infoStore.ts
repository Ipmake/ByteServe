import { create } from "zustand";
import { apiService } from "../api";

interface InfoState {
    info: Info.AppInfo | null;  
    fetchInfo: () => Promise<void>;
}

const useInfoStore = create<InfoState>((set) => ({
    info: null,
    fetchInfo: async () => {
        try {
            const response = await apiService.getInfo();
            set({ info: response });
        } catch (error) {
            console.error("Failed to fetch app info:", error);
        }
    },
}));

export default useInfoStore;
