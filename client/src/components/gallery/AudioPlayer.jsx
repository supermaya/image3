import { useEffect, useRef, useState } from 'react';

export default function AudioPlayer({ audioRef: externalRef, playlist, currentIndex, onIndexChange, autoPlay, setAutoPlay }) {
    // 외부에서 audioRef를 받으면 그것을 사용, 없으면 내부 생성
    const internalRef = useRef(null);
    const audioRef = externalRef || internalRef;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);

    const current = playlist?.[currentIndex];

    // 볼륨 변경만 effect로 처리 (재생은 Home.jsx에서 직접 제어)
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    // 재생 상태 동기화 (외부에서 재생이 시작되면 isPlaying 갱신)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); onIndexChange(currentIndex + 1); };
        const onTime = () => setCurrentTime(audio.currentTime);
        const onMeta = () => setDuration(audio.duration);

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('loadedmetadata', onMeta);
        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('loadedmetadata', onMeta);
        };
    }, [currentIndex]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.warn);
        }
    };

    const handleSeek = (e) => {
        const t = parseFloat(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = t;
        setCurrentTime(t);
    };

    const formatTime = (sec) => {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const imageUrl = current?.imageUrl || current?.images?.[0]?.imageSrc || null;

    if (!current) return null;

    return (
        <>
            {/* ★ 실제 audio 엘리먼트 — audioRef 연결 */}
            <audio ref={audioRef} />

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-50 px-4 py-3">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    {/* 썸네일 + 곡 정보 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {imageUrl ? (
                            <img src={imageUrl} alt={current.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center text-xl flex-shrink-0">🎵</div>
                        )}
                        <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-sm truncate">{current.title || current.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {current.artist && (
                                    <span className="text-xs text-gray-500 truncate">{current.artist}</span>
                                )}
                                {current.category && (
                                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full shrink-0">
                                        {current.category}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 컨트롤 */}
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                        <div className="flex items-center gap-4">
                            {/* 이전 */}
                            <button onClick={() => onIndexChange(currentIndex - 1)} disabled={currentIndex === 0}
                                className="text-gray-500 hover:text-gray-900 disabled:opacity-30 transition">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                                </svg>
                            </button>

                            {/* 재생/정지 */}
                            <button onClick={togglePlay}
                                className="w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition shadow-md">
                                {isPlaying ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </button>

                            {/* 다음 */}
                            <button onClick={() => onIndexChange(currentIndex + 1)}
                                disabled={!playlist || currentIndex >= playlist.length - 1}
                                className="text-gray-500 hover:text-gray-900 disabled:opacity-30 transition">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
                                </svg>
                            </button>
                        </div>

                        {/* 진행 바 */}
                        <div className="flex items-center gap-2 w-full max-w-xs">
                            <span className="text-xs text-gray-400 w-8 text-right">{formatTime(currentTime)}</span>
                            <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek}
                                className="flex-1 h-1 accent-gray-900 cursor-pointer" />
                            <span className="text-xs text-gray-400 w-8">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* 볼륨 + 슬라이드 자동/수동 */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                        <input type="range" min={0} max={1} step={0.05} value={volume}
                            onChange={e => setVolume(parseFloat(e.target.value))}
                            className="w-20 h-1 accent-gray-900 cursor-pointer" />

                        {/* 갤러리 자동/수동 슬라이드 토글 */}
                        {setAutoPlay && (
                            <button
                                onClick={() => setAutoPlay(a => !a)}
                                title={autoPlay ? '갤러리 자동 켜짐' : '갤러리 자동 꺼짐'}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${autoPlay
                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                    }`}
                            >
                                {autoPlay ? (
                                    <>
                                        {/* 슬라이드쇼 자동 재생 — 이미지 스택 + 재생 화살표 */}
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="2" y="5" width="14" height="11" rx="1.5" opacity="0.35"/>
                                            <rect x="4" y="3" width="14" height="11" rx="1.5" opacity="0.6"/>
                                            <rect x="6" y="1" width="14" height="11" rx="1.5"/>
                                            <polygon points="23,19 17,15 17,23" fill="currentColor"/>
                                        </svg>
                                        자동
                                    </>
                                ) : (
                                    <>
                                        {/* 슬라이드쇼 정지 — 이미지 + 일시정지 */}
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="2" y="4" width="16" height="13" rx="1.5" opacity="0.4"/>
                                            <rect x="4" y="2" width="16" height="13" rx="1.5"/>
                                            <rect x="19" y="14" width="2.2" height="8" rx="1" fill="currentColor"/>
                                            <rect x="22.8" y="14" width="2.2" height="8" rx="1" fill="currentColor"/>
                                        </svg>
                                        수동
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
