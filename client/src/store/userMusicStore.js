import { create } from 'zustand';

/**
 * UserGen 갤러리에서 선택한 음원을 공유 상태로 관리
 * MyGalleryTab(MyPage) ↔ Home.jsx 간 트랙 공유용
 */
const useUserMusicStore = create((set) => ({
    selectedTrack: null, // { url: string, name: string } | null
    setSelectedTrack: (track) => set({ selectedTrack: track }),
    clearSelectedTrack: () => set({ selectedTrack: null }),
}));

export default useUserMusicStore;
