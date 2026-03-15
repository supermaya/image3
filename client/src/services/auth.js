import { signInWithPopup, signInWithCustomToken, OAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider } from '../config/firebase';
import useUserStore from '../store/userStore';

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// ── 공통: 로그인 후 Firestore role 조회 및 store 업데이트 ───────────────────
async function afterLogin(user) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    let role = 'user';
    if (snap.exists()) {
        role = snap.data().role || 'user';
    } else {
        await setDoc(userRef, {
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            role: 'user',
            createdAt: new Date().toISOString(),
            dailyPoints: 0,
            walletBalance: 0,
        });
    }

    useUserStore.getState().setUser(user, role);
    return { user, role };
}

// ── Google ────────────────────────────────────────────────────────────────────
export const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    return afterLogin(result.user);
};

// ── Facebook ──────────────────────────────────────────────────────────────────
export const loginWithFacebook = async () => {
    const result = await signInWithPopup(auth, facebookProvider);
    return afterLogin(result.user);
};

// ── Apple ─────────────────────────────────────────────────────────────────────
export const loginWithApple = async () => {
    const result = await signInWithPopup(auth, appleProvider);
    return afterLogin(result.user);
};

// ── 팝업 창 방식 (Discord / Line): postMessage로 customToken 수신 ─────────────
function openOAuthPopup(url) {
    return new Promise((resolve, reject) => {
        const w = 520, h = 700;
        const left = window.screenX + (window.innerWidth - w) / 2;
        const top = window.screenY + (window.innerHeight - h) / 2;
        const popup = window.open(url, 'oauth_popup', `width=${w},height=${h},left=${left},top=${top}`);

        if (!popup) { reject(new Error('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.')); return; }

        const timer = setTimeout(() => reject(new Error('로그인 시간 초과')), 120_000);

        const handler = (e) => {
            if (e.origin !== 'http://localhost:3001') return;
            if (e.data?.type === 'social_auth' && e.data?.customToken) {
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                resolve(e.data.customToken);
            }
        };
        window.addEventListener('message', handler);

        // 팝업이 닫히면 reject
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                reject(new Error('로그인 창이 닫혔습니다.'));
            }
        }, 500);
    });
}

// ── Discord ───────────────────────────────────────────────────────────────────
export const loginWithDiscord = async () => {
    const customToken = await openOAuthPopup(`${BACKEND}/api/auth/social/discord`);
    const credential = await signInWithCustomToken(auth, customToken);
    return afterLogin(credential.user);
};

// ── Line ──────────────────────────────────────────────────────────────────────
export const loginWithLine = async () => {
    const customToken = await openOAuthPopup(`${BACKEND}/api/auth/social/line`);
    const credential = await signInWithCustomToken(auth, customToken);
    return afterLogin(credential.user);
};

// ── Kakao ─────────────────────────────────────────────────────────────────────
// Kakao JS SDK를 동적으로 로드한 뒤 로그인 처리
export const loginWithKakao = () => {
    return new Promise((resolve, reject) => {
        const jsKey = import.meta.env.VITE_KAKAO_JS_KEY;
        if (!jsKey || jsKey === 'your_kakao_javascript_key') {
            reject(new Error('카카오 JS Key가 설정되지 않았습니다.'));
            return;
        }

        // SDK 동적 로드 (이미 있으면 스킵)
        const loadSdk = () => new Promise((res) => {
            if (window.Kakao) { res(); return; }
            const script = document.createElement('script');
            script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
            script.onload = res;
            document.head.appendChild(script);
        });

        loadSdk().then(() => {
            if (!window.Kakao.isInitialized()) window.Kakao.init(jsKey);

            window.Kakao.Auth.login({
                success: async (authObj) => {
                    try {
                        const res = await fetch(`${BACKEND}/api/auth/social/kakao`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accessToken: authObj.access_token }),
                        });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.message);

                        const credential = await signInWithCustomToken(auth, data.customToken);
                        resolve(await afterLogin(credential.user));
                    } catch (e) {
                        reject(e);
                    }
                },
                fail: (err) => reject(new Error(`카카오 로그인 실패: ${err.error_description || err}`)),
            });
        });
    });
};

// ── 로그아웃 ───────────────────────────────────────────────────────────────────
export const logoutUser = async () => {
    try {
        await auth.signOut();
        useUserStore.getState().setUser(null, 'user');
    } catch (error) {
        console.error('Logout error:', error);
        throw error;
    }
};
