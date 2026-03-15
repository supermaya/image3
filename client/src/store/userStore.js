import { create } from 'zustand';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import usePointsStore from './pointsStore';
import { ensureUserMusicGallery } from '../services/comfyService';

const useUserStore = create((set) => ({
    user: null,
    role: 'user',
    loading: true,

    setUser: (user, role = 'user') => set({ user, role }),
    setLoading: (loading) => set({ loading }),

    logout: async () => {
        try {
            await signOut(auth);
            usePointsStore.getState().unsubscribePoints();
            set({ user: null, role: 'user', loading: false });
        } catch (error) {
            console.error('Logout error:', error);
        }
    },

    initAuth: () => {
        return onAuthStateChanged(auth, async (user) => {
            if (user) {
                // 포인트 실시간 리스너 시작
                usePointsStore.getState().subscribePoints(user.uid);
                try {
                    // Firestore users 컬렉션에서 실제 role 읽기
                    const userDocRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userDocRef);

                    let role = 'user';
                    if (userSnap.exists()) {
                        role = userSnap.data().role || 'user';
                    } else {
                        // 최초 로그인 시 users 문서 자동 생성
                        await setDoc(userDocRef, {
                            email: user.email,
                            displayName: user.displayName,
                            photoURL: user.photoURL,
                            role: 'user',
                            createdAt: new Date().toISOString(),
                        });
                        // UserGen 카테고리에 회원 갤러리 자동 생성 (실패해도 로그인 블록 안 함)
                        const userName = user.displayName || user.email?.split('@')[0] || user.uid;
                        ensureUserMusicGallery(user.uid, userName).catch(e =>
                            console.warn('[initAuth] UserGen 갤러리 생성 실패(무시):', e.message)
                        );
                    }

                    set({ user, role, loading: false });
                } catch (error) {
                    console.error('Error fetching user role:', error);
                    set({ user, role: 'user', loading: false });
                }
            } else {
                usePointsStore.getState().unsubscribePoints();
                set({ user: null, role: 'user', loading: false });
            }
        });
    }
}));

export default useUserStore;

