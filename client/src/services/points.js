import {
    doc, getDoc, updateDoc, addDoc,
    collection, query, where, orderBy,
    getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const GALLERY_COST = 17;        // 갤러리 1회 접근 비용 (P)
const DAILY_BONUS = 100;        // 일일 로그인 보너스 (P)
const DAILY_POINTS_MAX = 1000;  // 일일 포인트 최대치

// ────────────────────────────────────────────────
// 사용자 포인트 조회
// ────────────────────────────────────────────────
export async function getUserPoints(uid) {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return { dailyPoints: 0, walletBalance: 0 };
        const data = snap.data();
        return {
            dailyPoints: data.dailyPoints || 0,
            walletBalance: data.walletBalance || 0,
        };
    } catch (e) {
        console.error('[getUserPoints]', e);
        return { dailyPoints: 0, walletBalance: 0 };
    }
}

// ────────────────────────────────────────────────
// 일일 로그인 보너스 지급 + 자정 리셋
// - 날짜가 바뀌면 dailyPoints를 0으로 리셋 후 100P 지급
// - 같은 날은 중복 지급 없음 (Firestore 기준 — LocalStorage 무관)
// 반환값: { granted, newDaily }
// ────────────────────────────────────────────────
export async function checkAndGrantDailyBonus(uid) {
    try {
        const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};

        const lastGranted = data.dailyBonusLastGranted || ''; // 'YYYY-MM-DD' 또는 빈 문자열

        // ── 이미 오늘 받은 경우 → 변경 없이 현재 값 반환 ──
        if (lastGranted === today) {
            return { granted: 0, newDaily: data.dailyPoints || 0 };
        }

        // ── 날짜가 바뀌었거나 처음 → dailyPoints 리셋 후 100P 지급 ──
        const newDaily = DAILY_BONUS; // 리셋 후 100P만
        await updateDoc(userRef, {
            dailyPoints: newDaily,
            dailyBonusLastGranted: today,
        });

        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid,
            type: 'daily_bonus',
            amount: DAILY_BONUS,
            description: '일일 로그인 보너스',
            createdAt: serverTimestamp(),
        });

        return { granted: DAILY_BONUS, newDaily };
    } catch (e) {
        console.error('[checkAndGrantDailyBonus]', e);
        return null;
    }
}

// ────────────────────────────────────────────────
// AI 생성 이미지 → 포인트 변환 (15P 일일 포인트 적립)
// 반환값: { success, newDaily }
// ────────────────────────────────────────────────
const IMAGE_REDEEM_POINTS = 10;

export async function redeemImageForPoints(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        const current = data.walletBalance || 0;
        const newWallet = current + IMAGE_REDEEM_POINTS;

        await updateDoc(userRef, { walletBalance: newWallet });

        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid,
            type: 'image_redeem',
            amount: IMAGE_REDEEM_POINTS,
            description: 'AI 생성 이미지 → 포인트 환전',
            createdAt: serverTimestamp(),
        });

        return { success: true, newWallet };
    } catch (e) {
        console.error('[redeemImageForPoints]', e);
        return { success: false };
    }
}

// ────────────────────────────────────────────────
// 갤러리 접근 포인트 차감
// dailyPoints 먼저 사용 → 부족하면 walletBalance에서
// 반환값: { success, deducted, from, newDaily, newWallet }
// ────────────────────────────────────────────────
export async function deductPointsForGallery(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return { success: false };

        const data = snap.data();
        let daily = data.dailyPoints || 0;
        let wallet = data.walletBalance || 0;

        let from = '';
        if (daily >= GALLERY_COST) {
            daily -= GALLERY_COST;
            from = 'daily';
        } else if (wallet >= GALLERY_COST) {
            wallet -= GALLERY_COST;
            from = 'wallet';
        } else {
            return { success: false, dailyPoints: daily, walletBalance: wallet };
        }

        // ★ 핵심: 포인트 차감 먼저 (이 성공이 access 허용 기준)
        await updateDoc(userRef, { dailyPoints: daily, walletBalance: wallet });

        // 거래 내역은 별도 try — 실패해도 access는 허용
        try {
            await addDoc(collection(db, 'pointTransactions'), {
                userId: uid,
                type: 'gallery_access',
                amount: -GALLERY_COST,
                description: '갤러리 접근',
                createdAt: serverTimestamp(),
            });
        } catch (logErr) {
            console.warn('[deductPointsForGallery] 거래 내역 기록 실패 (무시):', logErr);
        }

        return { success: true, deducted: GALLERY_COST, from, newDaily: daily, newWallet: wallet };
    } catch (e) {
        console.error('[deductPointsForGallery]', e);
        return { success: false };
    }
}

// ────────────────────────────────────────────────
// 포인트 충전 (구매 또는 광고 시청 보상)
// ────────────────────────────────────────────────
export async function addWalletPoints(uid, amount, description = '포인트 충전', type = 'purchase') {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        const current = snap.exists() ? (snap.data().walletBalance || 0) : 0;

        await updateDoc(userRef, { walletBalance: current + amount });

        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid,
            type,
            amount,
            description,
            createdAt: serverTimestamp(),
        });

        return { success: true, newWallet: current + amount };
    } catch (e) {
        console.error('[addWalletPoints]', e);
        return { success: false };
    }
}

// ────────────────────────────────────────────────
// 거래 내역 조회
// ────────────────────────────────────────────────
export async function getTransactionHistory(uid, limitCount = 20) {
    try {
        const q = query(
            collection(db, 'pointTransactions'),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        return snap.docs.slice(0, limitCount).map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('[getTransactionHistory]', e);
        return [];
    }
}

// ────────────────────────────────────────────────
// 본 갤러리 목록 관리 (localStorage 캐시 + Firestore 동기화)
// localStorage: 빠른 로컬 캐시 (네트워크 요청 최소화)
// Firestore:    기기 간 동기화 (users/{uid}.viewedGalleries)
// 저장 형식: { "[musicId]_[YYYYMMDD]": timestamp }
// ────────────────────────────────────────────────
const VIEWED_KEY = 'galleryViewedAt';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24시간

function _today() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, ''); // 'YYYYMMDD'
}

function _viewedKey(musicId) {
    return `${musicId}_${_today()}`;
}

function _getViewedMap() {
    try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || '{}'); }
    catch { return {}; }
}

/** 로컬 캐시 기준 빠른 확인 (동기) */
export function hasViewedGalleryToday(musicId, uid = '') {
    try {
        const map = _getViewedMap();
        const key = _viewedKey(musicId);
        const ts = map[`${uid}_${key}`] || map[key] || map[`${uid}_${musicId}`] || map[musicId];
        return ts && (Date.now() - ts) < WINDOW_MS;
    } catch { return false; }
}

/**
 * Firestore까지 확인하는 비동기 버전 (기기 간 동기화)
 * 1) 로컬 캐시 확인 → 있으면 즉시 true 반환
 * 2) 없으면 Firestore 조회 → 있으면 로컬 캐시에도 기록
 */
export async function hasViewedGalleryTodayAsync(musicId, uid = '') {
    // 1. 로컬 캐시 먼저
    if (hasViewedGalleryToday(musicId, uid)) return true;

    // 2. 비로그인이면 로컬만
    if (!uid) return false;

    // 3. Firestore 조회
    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!userSnap.exists()) return false;
        const viewedMap = userSnap.data().viewedGalleries || {};
        const key = _viewedKey(musicId);
        if (viewedMap[key]) {
            // Firestore에 있으면 로컬 캐시에도 기록
            const map = _getViewedMap();
            map[`${uid}_${key}`] = Date.now();
            localStorage.setItem(VIEWED_KEY, JSON.stringify(map));
            return true;
        }
        return false;
    } catch (e) {
        console.warn('[hasViewedGalleryTodayAsync]', e);
        return false;
    }
}

/** 열람 기록 저장: localStorage + Firestore */
export async function markGalleryViewedToday(musicId, uid = '') {
    const key = _viewedKey(musicId);

    // 1. 로컬 캐시 저장 (즉시, 동기)
    try {
        const map = _getViewedMap();
        map[`${uid}_${key}`] = Date.now();
        // 24시간 지난 항목 정리
        const now = Date.now();
        for (const k of Object.keys(map)) {
            if (now - map[k] > WINDOW_MS) delete map[k];
        }
        localStorage.setItem(VIEWED_KEY, JSON.stringify(map));
    } catch { /* noop */ }

    // 2. Firestore 동기화 (비동기, 기기 간 공유)
    if (uid) {
        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                [`viewedGalleries.${key}`]: true,
            });
        } catch (e) {
            console.warn('[markGalleryViewedToday] Firestore 저장 실패 (무시):', e);
        }
    }
}


// ────────────────────────────────────────────────
// 개발/검증용 헬퍼
// ────────────────────────────────────────────────

/** 특정 갤러리의 남은 잠금 시간(ms) 반환. 0이면 만료 또는 미기록 */
export function getViewedGalleryRemainingMs(musicId, uid = '') {
    try {
        const map = _getViewedMap();
        const ts = map[`${uid}_${musicId}`] || map[musicId];
        if (!ts) return 0;
        const remaining = WINDOW_MS - (Date.now() - ts);
        return remaining > 0 ? remaining : 0;
    } catch { return 0; }
}

/** [Dev] 모든 갤러리 잠금 기록 초기화 */
export function clearViewedGalleries() {
    localStorage.removeItem(VIEWED_KEY);
    console.info('[Dev] galleryViewedAt cleared');
}

/** [Dev] 특정 갤러리를 25시간 전에 결제한 것처럼 시뮬레이션 (만료 테스트용) */
export function simulateExpiry(musicId, uid = '') {
    const map = _getViewedMap();
    map[`${uid}_${musicId}`] = Date.now() - (WINDOW_MS + 60_000); // 25h 전
    localStorage.setItem(VIEWED_KEY, JSON.stringify(map));
    console.info(`[Dev] ${musicId} 만료 시뮬레이션 완료`);
}

export { GALLERY_COST, DAILY_BONUS };

// ────────────────────────────────────────────────
// ComfyUI 이미지 생성 포인트 차감 (50P)
// ────────────────────────────────────────────────
export const COMFY_COST = 20;

export async function deductPointsForComfy(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return { success: false };

        const data = snap.data();
        let daily = data.dailyPoints || 0;
        let wallet = data.walletBalance || 0;

        let from = '';
        if (daily >= COMFY_COST) { daily -= COMFY_COST; from = 'daily'; }
        else if (wallet >= COMFY_COST) { wallet -= COMFY_COST; from = 'wallet'; }
        else return { success: false, dailyPoints: daily, walletBalance: wallet };

        await updateDoc(userRef, { dailyPoints: daily, walletBalance: wallet });

        try {
            await addDoc(collection(db, 'pointTransactions'), {
                userId: uid, type: 'comfy_generate', amount: -COMFY_COST,
                description: 'AI 이미지 생성', createdAt: serverTimestamp(),
            });
        } catch { /* noop */ }

        return { success: true, from, newDaily: daily, newWallet: wallet };
    } catch (e) {
        console.error('[deductPointsForComfy]', e);
        return { success: false };
    }
}

// ────────────────────────────────────────────────
// 갤러리 생성 포인트 차감
// - 3개까지 무료 (FREE_LIMIT)
// - 4번째부터 300P 차감 (walletBalance에서만 차감)
// ────────────────────────────────────────────────
export const GALLERY_CREATE_COST = 300;
export const GALLERY_CREATE_FREE_LIMIT = 3;

export async function deductPointsForGalleryCreate(uid) {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return { success: false };

        const data = snap.data();
        let daily = data.dailyPoints || 0;
        let wallet = data.walletBalance || 0;
        const total = daily + wallet;

        if (total < GALLERY_CREATE_COST) {
            return { success: false, dailyPoints: daily, walletBalance: wallet };
        }

        // dailyPoints 먼저 차감
        let from = '';
        if (daily >= GALLERY_CREATE_COST) {
            daily -= GALLERY_CREATE_COST; from = 'daily';
        } else {
            // daily 일부 + wallet 나머지
            const fromWallet = GALLERY_CREATE_COST - daily;
            wallet -= fromWallet;
            daily = 0;
            from = 'both';
        }

        await updateDoc(userRef, { dailyPoints: daily, walletBalance: wallet });

        try {
            await addDoc(collection(db, 'pointTransactions'), {
                userId: uid, type: 'gallery_create', amount: -GALLERY_CREATE_COST,
                description: '갤러리 생성', createdAt: serverTimestamp(),
            });
        } catch { /* noop */ }

        return { success: true, from, newDaily: daily, newWallet: wallet };
    } catch (e) {
        console.error('[deductPointsForGalleryCreate]', e);
        return { success: false };
    }
}
