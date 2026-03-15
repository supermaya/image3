import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import useUserStore from '../../store/userStore';

// autoPlay / setAutoPlay는 Home.jsx에서 관리 — 플레이바 버튼과 상태 공유
export default function ImageGallery({ music, autoPlay }) {
    const { user } = useUserStore();
    const [subImages, setSubImages] = useState([]);

    const loadSubImages = useCallback(async () => {
        if (!music?.id) { setSubImages([]); return; }
        const isUserGen = !!music.isUserGenerated;
        const hasImages = Array.isArray(music.images) && music.images.some(i => i?.imageSrc || i?.url || typeof i === 'string');
        const hasImageUrl = !!music.imageUrl;
        if (!isUserGen && (hasImages || hasImageUrl)) { setSubImages([]); return; }

        // ─── 소유자: users/{uid}/galleries에서 직접 로드 (항상 최신, 동기화 불필요) ───
        if (isUserGen && user?.uid && music.uploaderId === user.uid && music.userGalleryId) {
            try {
                const q = query(
                    collection(db, 'users', user.uid, 'galleries'),
                    where('galleryId', '==', music.userGalleryId),
                    orderBy('createdAt', 'desc')
                );
                const snap = await getDocs(q);
                if (!snap.empty) {
                    setSubImages(snap.docs.map(d => ({ id: d.id, imageSrc: d.data().url })).filter(d => d.imageSrc));
                    return;
                }
            } catch (e) {
                console.warn('[ImageGallery] 소유자 직접 로드 실패, 서브컬렉션 폴백:', e.message);
            }
        }

        // ─── 비소유자 또는 폴백: music/{id}/images 서브컬렉션 사용 ───
        const q = query(collection(db, 'music', music.id, 'images'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q).catch(() => null);
        if (!snap) return;
        setSubImages(snap.docs.map(d => ({ id: d.id, imageSrc: d.data().imageSrc })).filter(d => d.imageSrc));
    }, [music?.id, music?.isUserGenerated, music?.imageUrl, music?.images, music?.uploaderId, music?.userGalleryId, user?.uid]);

    useEffect(() => { loadSubImages(); }, [loadSubImages]);

    const getImages = (item) => {
        if (!item) return [];
        // isUserGenerated: 서브컬렉션만 사용 — imageUrl 폴백 없음 (삭제된 URL 방지)
        if (item.isUserGenerated) return subImages.map(s => s.imageSrc);
        // 비-UserGen: images 배열 우선, 없으면 imageUrl, 없으면 서브컬렉션 폴백
        if (Array.isArray(item.images) && item.images.length > 0) {
            return item.images.map(img => img.imageSrc || img.url || img).filter(Boolean);
        }
        if (item.imageUrl) return [item.imageUrl];
        if (item.imageSrc) return [item.imageSrc];
        // 마지막 폴백: 서브컬렉션에서 가져온 것
        return subImages.map(s => s.imageSrc);
    };

    const images = getImages(music);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [intervalMs, setIntervalMs] = useState(
        () => Number(localStorage.getItem('slideInterval') || 5000)
    );
    const [timerKey, setTimerKey] = useState(0); // 수동 전환 시 타이머 리셋용

    // localStorage 변경 감지 (My Page 설정 변경 시 즉시 반영)
    // storage 이벤트는 다른 탭에서만 발화 — slideIntervalChanged 커스텀 이벤트로 같은 탭도 대응
    useEffect(() => {
        const handler = () => setIntervalMs(Number(localStorage.getItem('slideInterval') || 5000));
        window.addEventListener('storage', handler);
        window.addEventListener('slideIntervalChanged', handler);
        return () => {
            window.removeEventListener('storage', handler);
            window.removeEventListener('slideIntervalChanged', handler);
        };
    }, []);

    // music이 바뀌면 인덱스 초기화
    useEffect(() => {
        setCurrentIdx(0);
    }, [music?.id]);

    // 자동 슬라이드 — timerKey 변경 시 타이머 완전 리셋 (수동 클릭 후 즉시 재시작 방지)
    useEffect(() => {
        if (!autoPlay || images.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentIdx(i => (i + 1) % images.length);
        }, intervalMs);
        return () => clearInterval(timer);
    }, [autoPlay, images.length, music?.id, intervalMs, timerKey]);

    const prev = useCallback(() => {
        setCurrentIdx(i => (i - 1 + images.length) % images.length);
        setTimerKey(k => k + 1); // 타이머 리셋
    }, [images.length]);
    const next = useCallback(() => {
        setCurrentIdx(i => (i + 1) % images.length);
        setTimerKey(k => k + 1); // 타이머 리셋
    }, [images.length]);

    // 키보드 컨트롤
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowLeft') prev();
            if (e.key === 'ArrowRight') next();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [prev, next]);

    if (!music) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-500">
                <svg className="w-20 h-20 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-lg font-medium opacity-40">음악을 선택하면</p>
                <p className="text-sm opacity-30 mt-1">이미지가 표시됩니다</p>
            </div>
        );
    }

    if (images.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-500">
                <div className="text-7xl mb-6">🎵</div>
                <p className="text-white text-xl font-bold mb-1">{music.title || music.name}</p>
                <p className="text-gray-400">{music.artist}</p>
                <p className="text-gray-600 text-sm mt-4">이미지가 없습니다</p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-black overflow-hidden group">
            {/* 이미지 슬라이드 */}
            <img
                key={images[currentIdx]}
                src={images[currentIdx]}
                alt={`${music.title} - ${currentIdx + 1}`}
                className="w-full h-full object-contain transition-opacity duration-700"
            />

            {/* 하단 페이드용 그라데이션만 유지 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

            {/* 이전 버튼 */}
            {images.length > 1 && (
                <button
                    onClick={prev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            )}

            {/* 다음 버튼 */}
            {images.length > 1 && (
                <button
                    onClick={next}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            )}

            {/* 하단: 프리미엄 배지 */}
            {music.premium && (
                <div className="absolute bottom-4 right-4">
                    <span className="bg-yellow-500/90 text-black text-xs font-bold px-3 py-1 rounded-full">🔒 프리미엄</span>
                </div>
            )}
        </div>
    );
}
