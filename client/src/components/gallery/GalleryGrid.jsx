import { useEffect, useState, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import GalleryCard from './GalleryCard';
import { fetchMusicPage, fetchCategories, applyDisplayOrder } from '../../services/firestore';
import {
    deductPointsForGallery,
    hasViewedGalleryToday,
    hasViewedGalleryTodayAsync,
    markGalleryViewedToday,
    GALLERY_COST
} from '../../services/points';
import useUserStore from '../../store/userStore';
import usePointsStore from '../../store/pointsStore';
import AdWatchModal from '../points/AdWatchModal';
import PointsPurchaseModal from '../points/PointsPurchaseModal';

export default function GalleryGrid({ activeMode, activeCategory, currentMusic, onSelect, onShare, onPlaylistReady, onLoginRequired }) {
    const [items, setItems] = useState([]);
    const [catMap, setCatMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [cursor, setCursor] = useState(null);
    const [hasMore, setHasMore] = useState(false);

    // 잠금 모달 상태
    const [adModal, setAdModal] = useState(null);
    const [showPurchase, setShowPurchase] = useState(false);

    const { user, role, loading: authLoading } = useUserStore();
    const { dailyPoints, walletBalance, applyDeduction } = usePointsStore();
    const isProcessing = useRef(false);
    const [viewedItemIds, setViewedItemIds] = useState(() => new Set());
    const [likedIds, setLikedIds] = useState(() => new Set()); // 거지 좋아요 ID Set

    // 카테고리 맵 — 1회 로드 후 서버쿼리 트리거
    useEffect(() => {
        fetchCategories().then(cats => {
            const map = {};
            cats.forEach(c => { map[c.id] = c.topSection; });
            setCatMap(map);
        });
    }, []);

    // My Page에서 User 갤러리 삭제 시 즉시 동기화
    useEffect(() => {
        const onDeleted = (e) => {
            const { musicDocId } = e.detail || {};
            if (musicDocId) {
                setItems(prev => prev.filter(item => item.id !== musicDocId));
            }
        };
        window.addEventListener('user-gallery-deleted', onDeleted);
        return () => window.removeEventListener('user-gallery-deleted', onDeleted);
    }, []);

    // 좋아요 토글 시 likedIds 업데이트 + 즉시 순서 재정렬
    useEffect(() => {
        const onLikeToggled = (e) => {
            const { musicId, liked: nowLiked } = e.detail || {};
            if (!musicId) return;
            setLikedIds(prev => {
                const next = new Set(prev);
                if (nowLiked) next.add(musicId);
                else next.delete(musicId);
                // items도 새 likedIds 기준으로 즉시 재정렬
                setItems(prevItems => applyDisplayOrder(prevItems, next));
                return next;
            });
        };
        window.addEventListener('like-toggled', onLikeToggled);
        return () => window.removeEventListener('like-toggled', onLikeToggled);
    }, []);

    // 서버사이드 쿼리 — category 단일 필터(topSection 필드 없는 레거시 문서 포함)
    // topSection 필터는 catMap 기반 클라이언트 필터로 처리
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCursor(null);
        setItems([]);

        // auth 초기화 완료 전에는 fetch 하지 않음 (비회원에게 isUserGenerated 갤러리 노출 방지)
        if (authLoading) return;

        const catId = activeCategory && activeCategory !== 'all' ? activeCategory : null;

        (async () => {
            // 사용자 좋아요 목록 로드
            let likedIds = new Set();
            if (user?.uid) {
                try {
                    const userSnap = await getDoc(doc(db, 'users', user.uid));
                    const arr = userSnap.data()?.likedItems || [];
                    likedIds = new Set(arr);
                    setLikedIds(likedIds);
                } catch { /* noop */ }
            }

            const { items: data, nextCursor: nc, hasMore: hm } =
                await fetchMusicPage({ categoryId: catId, currentUid: user?.uid, likedIds });
            if (cancelled) return;
            setItems(data);
            setCursor(nc);
            setHasMore(hm);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [activeMode, activeCategory, user?.uid, authLoading]);

    // topSection은 catMap 기반 클라이언트 필터 (기존 방식 유지)
    // catMap이 아직 로드 안 됐으면 topSection 필터 무시 (빈 화면 방지)
    const catMapReady = Object.keys(catMap).length > 0;
    const filtered = items.filter(i => {
        if (activeMode && catMapReady && catMap[i.category] !== activeMode) return false;
        return true;
    });

    // 다음 페이지 로드
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore || !cursor) return;
        setLoadingMore(true);
        const catId = activeCategory && activeCategory !== 'all' ? activeCategory : null;
        const { items: more, nextCursor: nc, hasMore: hm } = await fetchMusicPage({
            categoryId: catId,
            cursor,
            currentUid: user?.uid,
        });
        setItems(prev => {
            const ids = new Set(prev.map(i => i.id));
            return [...prev, ...more.filter(i => !ids.has(i.id))];
        });
        setCursor(nc);
        setHasMore(hm);
        setLoadingMore(false);
    }, [loadingMore, hasMore, cursor, activeCategory]);


    // 필터 결과가 바뀔 때 부모에 플레이리스트 동기화 (items에도 의존 — 좋아요 재정렬 반영)
    useEffect(() => {
        if (!loading) onPlaylistReady?.(filtered);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeMode, activeCategory, loading, items]);

    // 아이템/uid가 바뀔 때 Firestore에서 열람 기록 조회 → viewedItemIds 업데이트
    useEffect(() => {
        if (!user?.uid || loading) return;
        let cancelled = false;
        (async () => {
            const toCheck = filtered.filter((item, idx) =>
                idx !== 0 &&
                item.uploadedBy !== user.uid &&
                item.createdBy !== user.uid
            );
            const results = await Promise.all(
                toCheck.map(item => hasViewedGalleryTodayAsync(item.id, user.uid))
            );
            if (cancelled) return;
            const viewed = new Set();
            toCheck.forEach((item, i) => { if (results[i]) viewed.add(item.id); });
            setViewedItemIds(viewed);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, user?.uid, activeMode, activeCategory]);

    // 인덱스 0 = 해당 카테고리 첫 번째 → 무료
    const shouldCharge = async (item, index) => {
        if (role === 'admin') return false;
        // 본인 소유: uploadedBy / createdBy / uploaderId 중 하나라도 일치하면 무료
        if (
            item.uploadedBy === user.uid ||
            item.createdBy === user.uid ||
            item.uploaderId === user.uid
        ) return false;
        if (index === 0) return false;
        if (await hasViewedGalleryTodayAsync(item.id, user.uid)) return false;
        return true;
    };

    const handleCardSelect = useCallback(async (item, index) => {
        if (isProcessing.current) return;
        isProcessing.current = true;
        try {
            // 비회원: index 0만 무료, 나머지는 로그인 필요
            if (!user) {
                if (index === 0) {
                    markGalleryViewedToday(item.id, '');
                    onSelect(item);
                } else {
                    onLoginRequired?.();
                }
                return;
            }

            // 회원: 무료 항목 확인
            if (!await shouldCharge(item, index)) {
                await markGalleryViewedToday(item.id, user.uid);
                setViewedItemIds(prev => new Set([...prev, item.id]));
                onSelect(item);
                return;
            }

            // 포인트 차감
            const result = await deductPointsForGallery(user.uid);
            if (result.success) {
                applyDeduction(result.from, GALLERY_COST);
                markGalleryViewedToday(item.id, user.uid);
                onSelect(item);
            } else {
                setAdModal({ item });
            }
        } finally {
            isProcessing.current = false;
        }
    }, [shouldCharge, user, applyDeduction, onSelect, onLoginRequired]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
            </div>
        );
    }

    if (filtered.length === 0) {
        return (
            <div className="text-center py-20 text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="text-5xl mb-3">🎵</div>
                <h3 className="text-lg font-medium mb-1">콘텐츠가 없습니다</h3>
                <p className="text-sm">이 카테고리에 표시할 항목이 없습니다.</p>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-3 gap-3 md:gap-4">
                {filtered.map((item, index) => {
                    // 본인 소유(uploadedBy / createdBy / uploaderId) 이면 항상 잠금 해제
                    const isOwn = user && (
                        item.uploadedBy === user.uid ||
                        item.createdBy === user.uid ||
                        item.uploaderId === user.uid
                    );
                    const shouldBlur = isOwn
                        ? false
                        : user
                            ? (index !== 0 && !viewedItemIds.has(item.id))
                            : index !== 0;

                    return (
                        <GalleryCard
                            key={item.id}
                            item={item}
                            isPlaying={currentMusic?.id === item.id}
                            isLiked={likedIds.has(item.id)}
                            onSelect={() => handleCardSelect(item, index)}
                            onShare={onShare}
                            shouldBlur={shouldBlur}
                            costPoints={shouldBlur ? GALLERY_COST : 0}
                        />
                    );
                })}
            </div>

            {/* 광고 시청 모달 */}
            {adModal && (
                <AdWatchModal
                    onClose={() => setAdModal(null)}
                    onUnlock={() => {
                        if (adModal?.item) {
                            markGalleryViewedToday(adModal.item.id, user?.uid);
                            setViewedItemIds(prev => new Set([...prev, adModal.item.id]));
                            onSelect(adModal.item);
                        }
                    }}
                    onOpenPurchase={() => { setAdModal(null); setShowPurchase(true); }}
                />
            )}

            {/* 포인트 구매 모달 */}
            {showPurchase && <PointsPurchaseModal onClose={() => setShowPurchase(false)} />}

            {/* 더보기 버튼 (커서 기반 페이지네이션) */}
            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-6 py-2 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        {loadingMore ? '로딩 중...' : '더 보기'}
                    </button>
                </div>
            )}
        </>
    );
}
