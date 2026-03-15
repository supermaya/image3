import { useState, useEffect } from 'react';
import { doc, updateDoc, increment, arrayUnion, arrayRemove, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import useUserStore from '../../store/userStore';

export default function GalleryCard({ item, onSelect, isPlaying, onShare, onEdit, onDelete, canManage, shouldBlur, costPoints, isLiked = false }) {
    const { user } = useUserStore();
    const [liked, setLiked] = useState(isLiked);
    const [likeCount, setLikeCount] = useState(item.likeCount ?? item.likes ?? 0);

    // isLiked prop 변경 시 동기화 (GalleryGrid 로드 후 업데이트)
    useEffect(() => { setLiked(isLiked); }, [isLiked]);

    // 구버전/신버전 필드 fallback
    const title = item.title || item.name || '제목 없음';

    // 이미지 URL: 다양한 필드 포맷 대응 (imageUrl / images 배열[string|{imageSrc}|{url}] / thumbnailUrl / thumbnail)
    const rawImageUrl =
        item.imageUrl ||
        (Array.isArray(item.images) && item.images.length > 0
            ? (typeof item.images[0] === 'string'
                ? item.images[0]
                : item.images[0]?.imageSrc || item.images[0]?.url || null)
            : null) ||
        item.thumbnailUrl ||
        item.thumbnail ||
        null;
    const [thumbUrl, setThumbUrl] = useState(rawImageUrl);
    const audioUrl = item.audioUrl || item.audioSrc || item.musicUrl || item.music || null;

    // imageUrl이 없으면 images 서브컬렉션에서 최신 이미지 가져오기
    useEffect(() => {
        if (thumbUrl) return; // 이미 있으면 skip
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(
                    query(
                        collection(db, 'music', item.id, 'images'),
                        orderBy('createdAt', 'desc'),
                        limit(1)
                    )
                );
                if (cancelled || snap.empty) return;
                const url = snap.docs[0].data().imageSrc;
                if (url) {
                    setThumbUrl(url);
                    // music 문서의 imageUrl도 동기화 (다음번엔 바로 보임)
                    updateDoc(doc(db, 'music', item.id), { imageUrl: url }).catch(() => {});
                }
            } catch (e) {
                // 서브컬렉션 없거나 권한 없으면 무시
            }
        })();
        return () => { cancelled = true; };
    }, [item.id, thumbUrl]);

    // img 로드 실패 시 대체 이미지 시도
    const handleImgError = () => {
        // 1. item.images 배열에 다른 이미지가 있으면 순서대로 시도
        if (Array.isArray(item.images) && item.images.length > 0) {
            for (const img of item.images) {
                const url = typeof img === 'string' ? img : img?.imageSrc || img?.url || null;
                if (url && url !== thumbUrl) {
                    setThumbUrl(url);
                    return;
                }
            }
        }
        // 2. images 배열 없거나 소진 → null로 리셋 → useEffect가 서브컬렉션 조회
        setThumbUrl(null);
    };

    const handleLike = async (e) => {
        e.stopPropagation();
        if (!user) return; // 비로그인 무시

        const nowLiked = !liked;
        // 낙관적 업데이트
        setLiked(nowLiked);
        setLikeCount(c => nowLiked ? c + 1 : Math.max(0, c - 1));

        try {
            await updateDoc(doc(db, 'music', item.id), {
                likeCount: increment(nowLiked ? 1 : -1)
            });
            if (user?.uid) {
                await updateDoc(doc(db, 'users', user.uid), {
                    likedItems: nowLiked ? arrayUnion(item.id) : arrayRemove(item.id)
                }).catch(() => {});
            }
            // GalleryGrid에 즉시 순서 재정렬 요청
            window.dispatchEvent(new CustomEvent('like-toggled', { detail: { musicId: item.id, liked: nowLiked } }));
        } catch (err) {
            // 실패 시 롤백
            setLiked(!nowLiked);
            setLikeCount(c => nowLiked ? Math.max(0, c - 1) : c + 1);
            console.error('Like toggle error:', err);
        }
    };

    const handleShare = (e) => {
        e.stopPropagation();
        onShare?.(item);
    };

    return (
        <div
            onClick={() => onSelect?.(item)}
            className={`relative group rounded-xl overflow-hidden bg-white shadow-sm transition-all duration-300 cursor-pointer
                ${isPlaying ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-100' : 'hover:shadow-xl hover:-translate-y-1'}
            `}
        >
            {/* Thumbnail */}
            <div className="aspect-[3/4] overflow-hidden relative bg-gray-100">
                {thumbUrl ? (
                    <img
                        src={thumbUrl}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                        onError={handleImgError}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gradient-to-br from-gray-100 to-gray-200">
                        <svg className="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <span className="text-xs">No Image</span>
                    </div>
                )}

                {/* 갤러리명 오버레이 — 좌측 상단 */}
                <div className="absolute top-0 left-0 right-0 px-2 pt-1.5 pb-4
                    bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
                    <span className="text-white text-[10px] font-semibold leading-tight drop-shadow line-clamp-1 uppercase tracking-wide">
                        {title}
                    </span>
                </div>

                {/* Play overlay (hover) */}
                {audioUrl && !isPlaying && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all duration-300 opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 p-4 rounded-full shadow-lg transform scale-75 group-hover:scale-100 transition-all duration-300">
                            <svg className="w-6 h-6 ml-0.5 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </div>
                )}
            </div>


            {/* 좋아요/공유 버튼 — 이미지 아래 항상 표시 */}
            <div className="flex items-center justify-between px-2 py-1.5 bg-white">
                <button
                    onClick={handleLike}
                    className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                >
                    <svg className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span>{likeCount}</span>
                </button>
                <button onClick={handleShare} className="text-gray-400 hover:text-blue-500 transition p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
