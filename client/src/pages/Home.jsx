import Header from '../components/common/Header';
import CategoryTabs from '../components/gallery/CategoryTabs';
import GalleryGrid from '../components/gallery/GalleryGrid';
import ImageGallery from '../components/gallery/ImageGallery';
import ShareModal from '../components/gallery/ShareModal';
import MobileGalleryPlayer from '../components/gallery/MobileGalleryPlayer';
import LoginModal from '../components/common/LoginModal';
import useUserStore from '../store/userStore';
import usePointsStore from '../store/pointsStore';
import useUserMusicStore from '../store/userMusicStore';
import { checkAndGrantDailyBonus } from '../services/points';
import ComfyGeneratorModal from '../components/gallery/ComfyGeneratorModal';
import UserInventoryModal from '../components/points/UserInventoryModal';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
    const [activeMode, setActiveMode] = useState('visual-mode');
    const [activeCategory, setActiveCategory] = useState('all');
    const [showLogin, setShowLogin] = useState(false);
    const [showMyPage, setShowMyPage] = useState(false);

    const [playlist, setPlaylist] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [shareTarget, setShareTarget] = useState(null);

    const [autoPlay, setAutoPlay] = useState(true); // 이미지 슬라이드쇼 자동 전환용
    const [showComfy, setShowComfy] = useState(false);

    // 모바일 세로 모드 감지
    const [isMobilePortrait, setIsMobilePortrait] = useState(() =>
        window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches
    );
    const [isMobileLandscape, setIsMobileLandscape] = useState(() =>
        window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches
    );
    const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false);
    const [isControlsHidden, setIsControlsHidden] = useState(false);

    useEffect(() => {
        const mqP = window.matchMedia('(orientation: portrait) and (max-width: 768px)');
        const mqL = window.matchMedia('(orientation: landscape) and (max-height: 600px)');
        const hP = (e) => setIsMobilePortrait(e.matches);
        const hL = (e) => setIsMobileLandscape(e.matches);
        mqP.addEventListener('change', hP);
        mqL.addEventListener('change', hL);
        return () => { mqP.removeEventListener('change', hP); mqL.removeEventListener('change', hL); };
    }, []);

    // 회전 전환 여부 추적 (가로 전환 시 pause 방지)
    const rotatingToLandscape = useRef(false);

    // 모바일 플레이어 닫힐 때 음원 정지 (회전 전환 제외)
    useEffect(() => {
        if (!mobilePlayerOpen && audioRef.current && !rotatingToLandscape.current) {
            audioRef.current.pause();
        }
        rotatingToLandscape.current = false;
    }, [mobilePlayerOpen]);

    // 세로 → 가로 전환 시 MobileGalleryPlayer 닫고 우측 패널로 전환 (음원 유지)
    useEffect(() => {
        if (!isMobilePortrait && mobilePlayerOpen) {
            rotatingToLandscape.current = true;
            setMobilePlayerOpen(false);
        }
    }, [isMobilePortrait]);

    const { user } = useUserStore();
    const { subscribePoints, unsubscribePoints, updateDaily } = usePointsStore();
    const { selectedTrack } = useUserMusicStore();

    const audioRef = useRef(null);
    const galleryRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [showVolume, setShowVolume] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // 전체화면 토글 (native + iOS CSS 폴백)
    const toggleFullscreen = () => {
        const el = galleryRef.current;
        if (!el) return;
        if (isFullscreen) {
            if (document.fullscreenElement) document.exitFullscreen?.();
            else setIsFullscreen(false);
        } else {
            if (el.requestFullscreen) {
                el.requestFullscreen().catch(() => setIsFullscreen(true));
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            } else {
                setIsFullscreen(true);
            }
        }
    };

    useEffect(() => {
        const fn = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        document.addEventListener('fullscreenchange', fn);
        document.addEventListener('webkitfullscreenchange', fn);
        return () => { document.removeEventListener('fullscreenchange', fn); document.removeEventListener('webkitfullscreenchange', fn); };
    }, []);

    useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, []);


    const currentMusic = playlist[currentIndex] || null;

    // 오디오 이벤트 동기화
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onPlay  = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); handleIndexChange(currentIndex + 1); };
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, [currentIndex]);

    // 볼륨 동기화
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    // MyPage에서 선택한 트랙 → UserGen 갤러리 오디오 즉시 교체
    useEffect(() => {
        if (!selectedTrack?.url || !audioRef.current) return;
        const current = playlist[currentIndex];
        if (!current?.isUserGenerated) return;
        audioRef.current.src = selectedTrack.url;
        audioRef.current.load();
        if (isPlaying) audioRef.current.play().catch(console.warn);
    }, [selectedTrack]);



    // 로그인 시 포인트 실시간 구독 + 일일 보너스
    useEffect(() => {
        if (!user?.uid) return;

        // 1. 실시간 구독 시작 (onSnapshot)
        subscribePoints(user.uid);

        // 2. 일일 보너스 지급 (자정 리셋)
        (async () => {
            const result = await checkAndGrantDailyBonus(user.uid);
            if (result?.newDaily !== undefined) {
                updateDaily(result.newDaily);
            }
        })();

        return () => unsubscribePoints();
    }, [user?.uid]);

    // 카드 클릭 → 즉시 재생 (유저 제스처 컨텍스트 안에서 직접 play())
    const handleSelect = (item) => {
        // UserGen 갤러리: musicUrl 필드(갤러리에 배정한 음원) 우선 사용
        const audioUrl = item.musicUrl || item.audioUrl || item.audioSrc || item.music || '';

        const idx = playlist.findIndex(p => p.id === item.id);
        if (idx !== -1) {
            setCurrentIndex(idx);
        } else {
            setPlaylist(prev => {
                const next = [item, ...prev.filter(p => p.id !== item.id)];
                return next;
            });
            setCurrentIndex(0);
        }

        // ★ 유저 클릭 컨텍스트에서 직접 재생 → 브라우저 autoplay 정책 통과
        if (audioRef.current && audioUrl) {
            audioRef.current.src = audioUrl;
            audioRef.current.load();
            audioRef.current.play().catch(err => console.warn('Autoplay blocked:', err));
        }

        // 모바일 세로 모드면 전체화면 플레이어 열기
        if (isMobilePortrait) setMobilePlayerOpen(true);
    };

    // 이전/다음 곡 이동 (AudioPlayer 내부 버튼)
    const handleIndexChange = (newIdx) => {
        const item = playlist[newIdx];
        if (!item) return;
        setCurrentIndex(newIdx);
        const audioUrl = item.audioUrl || item.audioSrc || item.musicUrl || item.music || '';
        if (audioRef.current && audioUrl) {
            audioRef.current.src = audioUrl;
            audioRef.current.load();
            audioRef.current.play().catch(console.warn);
        }
    };

    const handlePlaylistUpdate = (items) => {
        // 현재 재생 중인 갤러리 ID 기억 (좋아요 재정렬 후에도 같은 갤러리 유지)
        const currentId = playlist[currentIndex]?.id;
        setPlaylist(items);
        if (currentId) {
            const newIdx = items.findIndex(i => i.id === currentId);
            if (newIdx !== -1) setCurrentIndex(newIdx);
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-gray-900">
            {/* audio는 항상 DOM에 마운트 — hidden 부모 안에 있으면 pause()가 무시될 수 있음 */}
            <audio ref={audioRef} className="hidden" />
            <Header
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                    onToggleMyPage={() => setShowMyPage(v => !v)}
                    myPageOpen={showMyPage}
                />

            <div className="flex flex-1 overflow-hidden">
                {/* ── 좌측: My Page 또는 갤러리 목록 ── */}
                <div className={`flex-shrink-0 flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden ${
                    isMobilePortrait ? 'w-full' : 'w-[380px] xl:w-[420px]'
                }`}>
                    {showMyPage && user ? (
                        <UserInventoryModal asPanel onClose={() => setShowMyPage(false)} />
                    ) : (
                        <>
                            <div className="px-3 pt-3 pb-2 bg-white border-b border-gray-100 sticky top-0 z-10">
                                <CategoryTabs
                                    activeMode={activeMode}
                                    activeCategory={activeCategory}
                                    setActiveCategory={setActiveCategory}
                                />
                                <button
                                    onClick={() => user ? setShowComfy(true) : setShowLogin(true)}
                                    className="mt-2 w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 transition flex items-center justify-center gap-1.5"
                                >
                                    <span>✨</span> AI 이미지 생성
                                    {!user && <span className="opacity-70 text-[10px] ml-1">(로그인 필요)</span>}
                                </button>
                            </div>
                            <div className="flex-1 px-3 py-3 overflow-y-auto" style={{ paddingBottom: currentMusic ? '80px' : '12px' }}>
                                <GalleryGrid
                                    activeMode={activeMode}
                                    activeCategory={activeCategory}
                                    currentMusic={currentMusic}
                                    onSelect={handleSelect}
                                    onShare={setShareTarget}
                                    onPlaylistReady={handlePlaylistUpdate}
                                    onLoginRequired={() => setShowLogin(true)}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* ── 우측: 이미지 갤러리 + 오버레이 컨트롤 ── */}
                <div
                    ref={galleryRef}
                    className={`relative overflow-hidden bg-black transition-all ${
                        isMobilePortrait ? 'hidden' : isFullscreen ? 'fixed inset-0 z-[9999]' : 'flex-1'
                    }`}
                >

                    {/* 전체화면 모드에서 클릭 시 해제 / 숨김 해제 */}
                    <div
                        className={`absolute inset-0 z-10 ${isFullscreen ? 'cursor-pointer' : isControlsHidden ? 'cursor-pointer' : 'pointer-events-none'}`}
                        onClick={() => {
                            if (isFullscreen) { if (document.fullscreenElement) document.exitFullscreen?.(); else setIsFullscreen(false); }
                            if (isControlsHidden) setIsControlsHidden(false);
                        }}
                    />

                    <ImageGallery music={currentMusic} autoPlay={autoPlay} />

                    {/* 오버레이 컨트롤 (전체화면/숨김 시 숨김) */}
                    {currentMusic && !isFullscreen && !isControlsHidden && (
                        <>
                            {/* 우상단: 자동/수동 버튼 + 전체 or 숨김 */}
                            <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
                                <button
                                    onClick={() => setAutoPlay(a => !a)}
                                    className="px-3 py-1 rounded-full text-xs font-bold border transition bg-indigo-500/50 border-indigo-400/50 text-white backdrop-blur-sm">
                                    {autoPlay ? '자동' : '수동'}
                                </button>
                                {isMobileLandscape ? (
                                    <button
                                        onClick={() => setIsControlsHidden(true)}
                                        className="px-3 py-1 rounded-full text-xs font-bold border transition bg-black/40 border-white/30 text-white/70 backdrop-blur-sm">
                                        숨김
                                    </button>
                                ) : (
                                    <button
                                        onClick={toggleFullscreen}
                                        className="px-3 py-1 rounded-full text-xs font-bold border transition bg-black/40 border-white/30 text-white backdrop-blur-sm">
                                        전체
                                    </button>
                                )}
                            </div>

                            {/* 하단 중앙: 컨트롤 버튼들 */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">

                                {/* 버튼 행 */}
                                <div className="flex items-center gap-5">
                                    {/* 이전 곡 */}
                                    <button onClick={() => handleIndexChange(Math.max(0, currentIndex - 1))}
                                        disabled={currentIndex === 0}
                                        className="w-11 h-11 aspect-square flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white disabled:opacity-30">
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                                    </button>

                                    {/* 재생/정지 */}
                                    <button onClick={() => {
                                        if (!audioRef.current) return;
                                        if (isPlaying) audioRef.current.pause();
                                        else audioRef.current.play().catch(console.warn);
                                    }}
                                        className="w-14 h-14 aspect-square flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white">
                                        {isPlaying
                                            ? <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                            : <svg className="w-7 h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                        }
                                    </button>

                                    {/* 다음 곡 */}
                                    <button onClick={() => handleIndexChange(currentIndex + 1)}
                                        disabled={currentIndex >= playlist.length - 1}
                                        className="w-11 h-11 aspect-square flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white disabled:opacity-30">
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
                                    </button>

                                    {/* 음량 버튼 + 슬라이더 (항상 표시) */}
                                    <div className="flex items-center gap-2">
                                        <button className={`w-11 h-11 aspect-square flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full transition ${volume === 0 ? 'text-white/40' : 'text-white'}`}
                                            onClick={() => setVolume(v => v === 0 ? 0.8 : 0)}>
                                            {volume === 0
                                                ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l3.5 3.5V13.27l2.93 2.93c-.46.28-.96.5-1.43.64V19c.85-.21 1.64-.59 2.33-1.09l2.95 2.95L18 19.5 5.77 3.27 4.27 3z"/></svg>
                                                : volume < 0.5
                                                    ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M7 9v6h4l5 5V4l-5 5H7zm13.5 3A4.5 4.5 0 0 0 18 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                                                    : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                                            }
                                        </button>
                                        <input type="range" min={0} max={1} step={0.02} value={volume}
                                            onChange={e => setVolume(parseFloat(e.target.value))}
                                            className="w-20 h-1 accent-white cursor-pointer" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>


            {shareTarget && (
                <ShareModal item={shareTarget} onClose={() => setShareTarget(null)} />
            )}

            {/* AI \uc774\ubbf8\uc9c0 \uc0dd\uc131 \ubaa8\ub2ec */}
            {showComfy && (
                <ComfyGeneratorModal
                    onClose={() => setShowComfy(false)}
                    onSaved={() => setShowComfy(false)}
                />
            )}

            {/* 모바일 세로 전체화면 갤러리 플레이어 */}
            {mobilePlayerOpen && currentMusic && (
                <MobileGalleryPlayer
                    music={currentMusic}
                    audioRef={audioRef}
                    playlist={playlist}
                    currentIndex={currentIndex}
                    onIndexChange={(idx) => { handleIndexChange(idx); }}
                    autoPlay={autoPlay}
                    setAutoPlay={setAutoPlay}
                    onClose={() => {
                        if (audioRef.current) audioRef.current.pause();
                        setMobilePlayerOpen(false);
                    }}
                />
            )}

            {/* 비회원 갤러리 접근 시 로그인 모달 */}
            {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        </div>
    );
}
