import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

let _unsubscribe = null; // Firestore 리스너 제거 함수

const usePointsStore = create((set, get) => ({
    dailyPoints: 0,
    walletBalance: 0,
    loaded: false,

    // Firestore onSnapshot으로 실시간 동기화 (로그인 시 호출)
    subscribePoints: (uid) => {
        if (!uid) return;
        // 기존 리스너 제거
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

        _unsubscribe = onSnapshot(
            doc(db, 'users', uid),
            (snap) => {
                if (!snap.exists()) return;
                const data = snap.data();
                set({
                    dailyPoints: data.dailyPoints || 0,
                    walletBalance: data.walletBalance || 0,
                    loaded: true,
                });
            },
            (err) => console.error('[pointsStore] onSnapshot 오류:', err)
        );
    },

    // 리스너 해제 (로그아웃 시 호출)
    unsubscribePoints: () => {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        set({ dailyPoints: 0, walletBalance: 0, loaded: false });
    },

    // 로컬 상태만 즉시 업데이트 (UI 즉각 반응용 — onSnapshot 전 선제 적용)
    setPoints: (dailyPoints, walletBalance) => set({ dailyPoints, walletBalance }),
    updateDaily: (dailyPoints) => set({ dailyPoints }),
    updateWallet: (walletBalance) => set({ walletBalance }),

    // 포인트 차감 결과({ from, newDaily, newWallet }) 반영
    applyDeduction: (result) => {
        if (!result) return;
        // newDaily/newWallet이 있으면 즉시 적용 (onSnapshot 갱신 전 선제)
        if (result.newDaily != null || result.newWallet != null) {
            set({
                ...(result.newDaily != null && { dailyPoints: result.newDaily }),
                ...(result.newWallet != null && { walletBalance: result.newWallet }),
            });
        } else if (result.from && result.amount != null) {
            // 호환: (from, amount) 방식
            const { dailyPoints, walletBalance } = get();
            if (result.from === 'daily') set({ dailyPoints: dailyPoints - result.amount });
            else set({ walletBalance: walletBalance - result.amount });
        }
    },

    applyAddition: (amount) => {
        const { walletBalance } = get();
        set({ walletBalance: walletBalance + amount });
    },

    reset: () => {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        set({ dailyPoints: 0, walletBalance: 0, loaded: false });
    },
}));

export default usePointsStore;
