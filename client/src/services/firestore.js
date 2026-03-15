import {
    collection, getDocs, query, orderBy, where, limit, startAfter
} from 'firebase/firestore';
import { db } from '../config/firebase';

const PAGE_SIZE = 20;

// ─── 관리자 갤러리용 sortOrder 정렬 헬퍼 ──────────────────────────────────────
function sortByAdminOrder(list) {
    return [...list].sort((a, b) => {
        const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
        const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
        if (aHas && bHas) return a.sortOrder - b.sortOrder;
        if (aHas) return -1;
        if (bHas) return 1;
        const aT = a.createdAt?.toDate?.() ?? new Date(a.createdAt ?? 0);
        const bT = b.createdAt?.toDate?.() ?? new Date(b.createdAt ?? 0);
        return bT - aT;
    });
}

// ─── 4그룹 표시 순서 정렬 ────────────────────────────────────────────────────
// 1) 좋아요 콘텐츠  2) 관리자 갤러리 상위 5  3) 유저 갤러리  4) 나머지 관리자 갤러리
export function applyDisplayOrder(musicList, likedIds = new Set()) {
    if (!likedIds.size) {
        // 비로그인 또는 좋아요 없음: sortOrder 기본 정렬
        return sortByAdminOrder(musicList);
    }

    const liked    = musicList.filter(m => likedIds.has(m.id));
    const adminAll = sortByAdminOrder(musicList.filter(m => !m.isUserGenerated && !likedIds.has(m.id)));
    const userGen  = musicList.filter(m => m.isUserGenerated && !likedIds.has(m.id));
    const adminTop = adminAll.slice(0, 5);
    const adminRest = adminAll.slice(5);

    return [...liked, ...adminTop, ...userGen, ...adminRest];
}

// ─── 전체 music 로드 (orderBy 없음 — createdAt 없는 레거시 문서 포함) ─────────
export const fetchMusic = async (currentUid = null, likedIds = new Set()) => {
    try {
        const snapshot = await getDocs(collection(db, 'music'));
        const musicList = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            // 타인의 isUserGenerated 항목 제외 — 본인(uploaderId 일치)만 포함
            .filter(item => {
                if (!item.isUserGenerated) return true;       // 공개 음악은 항상 포함
                if (!currentUid) return false;                // 미로그인: userGen 전부 제외
                return item.uploaderId === currentUid;        // 본인 것만 포함
            });

        return applyDisplayOrder(musicList, likedIds);
    } catch (error) {
        console.error('[fetchMusic] Firestore 오류:', error);
        return [];
    }
};

// ─── music 페이지네이션 쿼리 (category 필터 있을 때만 사용) ─────────────────
// category가 지정된 경우 서버쿼리 + 커서 페이지네이션
// category 없으면 fetchMusic() 사용 권장
export const fetchMusicPage = async ({
    categoryId  = null,
    cursor      = null,
    pageSize    = PAGE_SIZE,
    currentUid  = null,
    likedIds    = new Set(),  // 좋아요한 music ID Set
} = {}) => {
    try {
        // category 없으면 전체 fetchMusic으로 위임
        if (!categoryId) {
            const all = await fetchMusic(currentUid, likedIds);
            return { items: all, nextCursor: null, hasMore: false };
        }

        const constraints = [
            where('category', '==', categoryId),
        ];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(pageSize));

        const snapshot = await getDocs(query(collection(db, 'music'), ...constraints));
        const items = snapshot.docs
            .map(d => ({ id: d.id, ...d.data(), _snap: d }))
            // 타인의 isUserGenerated 항목 제외
            .filter(item => {
                if (!item.isUserGenerated) return true;
                if (!currentUid) return false;
                return item.uploaderId === currentUid;
            });
        const nextCursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
        const hasMore    = snapshot.docs.length === pageSize;

        return { items: applyDisplayOrder(items, likedIds), nextCursor, hasMore };
    } catch (error) {
        console.error('[fetchMusicPage] 오류:', error);
        return { items: [], nextCursor: null, hasMore: false };
    }
};

// ─── categories ───────────────────────────────────────────────────────────────
const VALID_SECTIONS = new Set(['visual-mode', 'momentary', 'chronicles']);

export const fetchCategories = async () => {
    try {
        const snapshot = await getDocs(collection(db, 'categories'));
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(cat => VALID_SECTIONS.has(cat.topSection));
    } catch (error) {
        console.error('[fetchCategories] Firestore 오류:', error);
        return [];
    }
};
