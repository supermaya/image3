import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import useUserStore from '../../store/userStore';

export default function MobileGalleryPlayer({
    music, audioRef, playlist, currentIndex, onIndexChange,
    autoPlay, setAutoPlay, onClose
}) {
    const { user } = useUserStore();
    const [subImages, setSubImages] = useState([]);

    useEffect(() => {
        if (!music?.id || !music?.isUserGenerated) { setSubImages([]); return; }

        const load = async () => {
            // 소유자: users/{uid}/galleries에서 직접 로드 (항상 최신)
            if (user?.uid && music.uploaderId === user.uid && music.userGalleryId) {
                try {
                    const q = query(
                        collection(db, 'users', user.uid, 'galleries'),
                        where('galleryId', '==', music.userGalleryId),
                        orderBy('createdAt', 'desc')
                    );
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        setSubImages(snap.docs.map(d => d.data().url).filter(Boolean));
                        return;
                    }
                } catch (e) {
                    console.warn('[MobileGalleryPlayer] 소유자 직접 로드 실패, 서브컬렉션 폴백:', e.message);
                }
            }
            // 비소유자 또는 폴백: music/{id}/images 서브컬렉션
            const q = query(collection(db, 'music', music.id, 'images'), orderBy('createdAt', 'desc'));
            getDocs(q).then(snap => {
                setSubImages(snap.docs.map(d => d.data().imageSrc).filter(Boolean));
            }).catch(() => setSubImages([]));
        };
        load();
    }, [music?.id, music?.isUserGenerated, music?.uploaderId, music?.userGalleryId, user?.uid]);

    const getImages = (item) => {
        if (!item) return [];
        // isUserGenerated: 서브컬렉션 우선 (로드된 경우)
        if (item.isUserGenerated && subImages.length > 0) return subImages;
        if (Array.isArray(item.images) && item.images.length > 0)
            return item.images.map(img => img.imageSrc || img.url || img).filter(Boolean);
        if (item.imageUrl) return [item.imageUrl];
        if (item.imageSrc) return [item.imageSrc];
        return [];
    };

    const images = getImages(music);
    const [imgIdx, setImgIdx] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [showVolume, setShowVolume] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const intervalMs = Number(localStorage.getItem('slideInterval') || 5000);

    useEffect(() => { setImgIdx(0); }, [music?.id]);

    // 자동 슬라이드
    useEffect(() => {
        if (!autoPlay || images.length <= 1) return;
        const t = setInterval(() => setImgIdx(i => (i + 1) % images.length), intervalMs);
        return () => clearInterval(t);
    }, [autoPlay, images.length, music?.id, intervalMs]);

    // 오디오 이벤트 동기화
    useEffect(() => {
        const audio = audioRef?.current;
        if (!audio) return;
        const onPlay  = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); onIndexChange(currentIndex + 1); };
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, [audioRef, currentIndex]);

    // 볼륨 동기화
    useEffect(() => {
        if (audioRef?.current) audioRef.current.volume = volume;
    }, [volume]);

    // body 스크롤 잠금
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // 키보드
    useEffect(() => {
        const h = (e) => {
            if (e.key === 'ArrowLeft')  setImgIdx(i => (i - 1 + images.length) % images.length);
            if (e.key === 'ArrowRight') setImgIdx(i => (i + 1) % images.length);
            if (e.key === 'Escape')     handleClose();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [images.length, onClose]);

    const togglePlay = () => {
        const audio = audioRef?.current;
        if (!audio) return;
        if (isPlaying) audio.pause(); else audio.play().catch(console.warn);
    };

    // 닫기: 음원 정지 후 좌측 패널로 복귀
    const handleClose = () => {
        const audio = audioRef?.current;
        if (audio) { audio.pause(); }
        onClose();
    };

    const prevImg   = () => setImgIdx(i => (i - 1 + images.length) % images.length);
    const nextImg   = () => setImgIdx(i => (i + 1) % images.length);
    const prevTrack = () => onIndexChange(Math.max(0, currentIndex - 1));
    const nextTrack = () => onIndexChange(currentIndex + 1);

    const title    = music?.title || music?.name || '';
    const category = music?.category || '';

    return (
        <div
            className="fixed inset-0 z-[200] bg-black overflow-hidden"
            onClick={() => { if (isHidden) setIsHidden(false); }}
        >

            {/* ── 이미지: Vertical Fix 전체화면 (object-cover) ── */}
            <div className="absolute inset-0">
                {images.length > 0 ? (
                    <img
                        key={images[imgIdx]}
                        src={images[imgIdx]}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-7xl mb-4">🎵</div>
                            <p className="text-white text-xl font-bold">{title}</p>
                        </div>
                    </div>
                )}
                {/* 전체 어두운 레이어 (컨트롤 가독성) */}
                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
            </div>

            {/* ── 상단 오버레이: 닫기 · 자동/수동 + 숨김 버튼 ── */}
            {!isHidden && (
            <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                <button
                    onClick={e => { e.stopPropagation(); handleClose(); }}
                    className="w-9 h-9 flex items-center justify-center bg-white/20 rounded-full text-white flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 12H5M12 5l-7 7 7 7"/>
                    </svg>
                </button>
                <div className="flex flex-col items-end gap-1.5">
                    <button
                        onClick={e => { e.stopPropagation(); setAutoPlay(a => !a); }}
                        className="px-3 py-1 rounded-full text-xs font-bold border flex-shrink-0 transition bg-indigo-500/70 border-indigo-400 text-white">
                        {autoPlay ? '자동' : '수동'}
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); setIsHidden(true); }}
                        className="px-3 py-1 rounded-full text-xs font-bold border flex-shrink-0 transition bg-black/40 border-white/30 text-white/70">
                        숨김
                    </button>
                </div>
            </div>
            )}

            {/* ── 이미지 이전/다음 화젬표 (수동 모드 + 비숨김) ── */}
            {!isHidden && !autoPlay && images.length > 1 && (<>
                <button
                    onClick={prevImg}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/>
                    </svg>
                </button>
                <button
                    onClick={nextImg}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/>
                    </svg>
                </button>
            </>)}

            {/* ── 하단 오버레이: 볼륨 슬라이더(토글) + 컨트롤 4개 ── */}
            {!isHidden && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-1/2 px-4 py-3 rounded-2xl">

                {/* 볼륨 슬라이더 (토글) */}
                {showVolume && (
                    <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-white/70 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 9v6h4l5 5V4L7 9H3z"/>
                        </svg>
                        <input
                            type="range" min={0} max={1} step={0.02} value={volume}
                            onChange={e => setVolume(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 accent-white cursor-pointer"
                        />
                        <svg className="w-5 h-5 text-white/70 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </div>
                )}

                <div className="flex items-center justify-center gap-10">

                    {/* 이전 곡 */}
                    <button
                        onClick={prevTrack}
                        disabled={currentIndex === 0}
                        className="w-14 h-14 aspect-square flex-shrink-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-full text-white disabled:opacity-30">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
                        </svg>
                    </button>

                    {/* 재생 / 일시정지 */}
                    <button
                        onClick={togglePlay}
                        className="w-16 h-16 aspect-square flex-shrink-0 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white shadow-xl">
                        {isPlaying ? (
                            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        ) : (
                            <svg className="w-7 h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        )}
                    </button>

                    {/* 다음 곡 */}
                    <button
                        onClick={nextTrack}
                        disabled={currentIndex >= playlist.length - 1}
                        className="w-14 h-14 aspect-square flex-shrink-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-full text-white disabled:opacity-30">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/>
                        </svg>
                    </button>

                    {/* 음량 버튼 → 슬라이더 토글 */}
                    <button
                        onClick={() => setShowVolume(v => !v)}
                        className={`w-10 h-10 aspect-square flex-shrink-0 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-full transition ${volume === 0 ? 'text-white/40' : 'text-white'}`}>
                        {volume === 0 ? (
                            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l3.5 3.5V13.27l2.93 2.93c-.46.28-.96.5-1.43.64V19c.85-.21 1.64-.59 2.33-1.09l2.95 2.95L18 19.5 5.77 3.27 4.27 3zM10.5 4.5l-1.42 1.42L12 8.35V7.5l-.02-.02"/>
                            </svg>
                        ) : volume < 0.5 ? (
                            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M7 9v6h4l5 5V4l-5 5H7zm13.5 3A4.5 4.5 0 0 0 18 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                            </svg>
                        ) : (
                            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                        )}
                    </button>
                </div>
            </div>
            )}
        </div>
    );
}
