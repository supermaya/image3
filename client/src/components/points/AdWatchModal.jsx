import { useState, useEffect, useRef, useCallback } from 'react';
import useUserStore from '../../store/userStore';
import usePointsStore from '../../store/pointsStore';
import { addWalletPoints } from '../../services/points';
import { loadAndShowRewardedAd, AD_USING_DEMO } from '../../services/adService';

const AD_REWARD = 30;
const SIM_SECONDS = 5;

export default function AdWatchModal({ onClose, onUnlock, onOpenPurchase }) {
    const { user } = useUserStore();
    const { applyAddition } = usePointsStore();

    const [phase, setPhase] = useState('confirm');
    // confirm | loading | watching | done
    const [countdown, setCountdown] = useState(SIM_SECONDS);
    const [isSimMode, setIsSimMode] = useState(false);
    const [adError, setAdError] = useState('');

    const timerRef = useRef(null);
    const rewardedRef = useRef(false);   // 중복 보상 방지
    const watchCompletedRef = useRef(false); // 광고 끝까지 시청 여부

    // interval 정리 — 언마운트 시에만 실행 (phase 변경 시 실행 금지)
    useEffect(() => {
        return () => clearInterval(timerRef.current);
    }, []); // ← 빈 배열: 언마운트 시에만

    // 광고 시청 중 이탈 방지 (beforeunload)
    useEffect(() => {
        const guard = (e) => {
            if (phase === 'watching') {
                e.preventDefault();
                e.returnValue = '광고를 시청 중입니다. 나가면 포인트가 지급되지 않습니다.';
            }
        };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [phase]); // phase 변경 시 guard만 갱신


    // ── 보상 지급: watchCompletedRef=true 일 때만 실행 ─────────────────
    const handleAdComplete = useCallback(async () => {
        // 유효성 검사: 끝까지 시청했는지 확인
        if (!watchCompletedRef.current) {
            console.warn('[AdModal] 광고 미완료 상태에서 보상 시도 차단');
            return;
        }
        if (rewardedRef.current) return; // 중복 방지
        rewardedRef.current = true;

        // 1. Zustand 즉시 반영
        applyAddition(AD_REWARD);

        // 2. Firestore 동기화
        if (user) {
            await addWalletPoints(
                user.uid,
                AD_REWARD,
                `광고 시청 보상 (+${AD_REWARD}P)`,
                'ad_reward'
            );
        }

        setPhase('done');
    }, [applyAddition, user]);

    // ── 시뮬레이션 카운트다운 ─────────────────────────────────────────────
    const startSimulation = useCallback(() => {
        setIsSimMode(true);
        setPhase('watching');
        setCountdown(SIM_SECONDS);
        watchCompletedRef.current = false;

        timerRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    watchCompletedRef.current = true; // ★ 완료 플래그 설정
                    handleAdComplete();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [handleAdComplete]);

    // ── 광고 보기 버튼 ────────────────────────────────────────────────────
    const handleStartAd = () => {
        setPhase('loading');
        setAdError('');
        watchCompletedRef.current = false;
        rewardedRef.current = false;

        loadAndShowRewardedAd({
            onStart: ({ simulation }) => {
                if (simulation) {
                    startSimulation();
                } else {
                    setIsSimMode(false);
                    setPhase('watching');
                }
            },
            onRewarded: () => {
                // GPT: rewardedSlotGranted → 완료 확인됨
                watchCompletedRef.current = true;
                handleAdComplete();
            },
            onFailed: (reason) => {
                clearInterval(timerRef.current);
                watchCompletedRef.current = false;

                if (reason === 'closed') {
                    // 사용자가 광고를 중간에 닫음 → 보상 없음
                    setAdError('광고를 끝까지 시청해야 포인트를 받을 수 있습니다.');
                    setPhase('confirm');
                } else {
                    // timeout / empty / 네트워크 오류 → 시뮬레이션 폴백
                    console.info('[AdModal] 광고 로드 실패, 시뮬레이션으로 대체:', reason);
                    startSimulation();
                }
            },
        });
    };

    // ── 닫기: watching 중에는 차단 ────────────────────────────────────────
    const canClose = phase !== 'watching' && phase !== 'loading';

    const handleClose = () => {
        if (!canClose) {
            setAdError('광고 시청 중에는 닫을 수 없습니다.');
            return;
        }
        onClose();
    };

    const handleUnlock = () => { onUnlock(); onClose(); };

    return (
        // 배경 클릭으로 닫기 차단 (watching/loading 중)
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

                {/* 헤더 */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">💰 포인트 채우기</h2>
                        <p className="text-xs opacity-80 mt-0.5">접근하려면 포인트가 필요합니다</p>
                    </div>
                    {/* watching/loading 중에는 X 버튼 숨김 */}
                    {canClose && (
                        <button onClick={handleClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
                    )}
                </div>

                <div className="p-6 text-center">

                    {/* ── CONFIRM / LOADING ── */}
                    {(phase === 'confirm' || phase === 'loading') && (
                        <>
                            <div className="text-5xl mb-4">📺</div>
                            <p className="text-gray-800 font-semibold mb-1">포인트가 부족합니다</p>
                            <p className="text-sm text-gray-500 mb-1">
                                광고({SIM_SECONDS}초)를 끝까지 시청하고&nbsp;
                                <span className="text-indigo-600 font-bold">{AD_REWARD}P</span>를 받아보세요
                            </p>
                            {AD_USING_DEMO && (
                                <p className="text-[10px] text-gray-400 mb-2">(Google 테스트 광고 모드)</p>
                            )}
                            {adError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                                    <p className="text-xs text-red-600">⚠️ {adError}</p>
                                </div>
                            )}

                            <div className="flex flex-col gap-3 mt-4">
                                <button
                                    onClick={handleStartAd}
                                    disabled={phase === 'loading'}
                                    className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {phase === 'loading'
                                        ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />광고 로딩 중...</>
                                        : <>📺 광고 보기 ({SIM_SECONDS}초)</>}
                                </button>
                                <button
                                    onClick={() => { onClose(); onOpenPurchase(); }}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all"
                                >
                                    💎 포인트 구매하기
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── WATCHING (시뮬레이션) ── */}
                    {phase === 'watching' && isSimMode && (
                        <>
                            <div className="relative w-24 h-24 mx-auto mb-4">
                                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="44" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                                    <circle
                                        cx="50" cy="50" r="44" fill="none"
                                        stroke="#7c3aed" strokeWidth="8"
                                        strokeDasharray={`${2 * Math.PI * 44}`}
                                        strokeDashoffset={`${2 * Math.PI * 44 * (countdown / SIM_SECONDS)}`}
                                        className="transition-all duration-1000 ease-linear"
                                    />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-3xl font-black text-violet-700">
                                    {countdown}
                                </span>
                            </div>
                            <p className="text-gray-700 font-semibold mb-1">광고 시청 중...</p>
                            <p className="text-xs text-red-500 mb-4 font-medium">
                                ⚠️ 닫으면 포인트가 지급되지 않습니다
                            </p>
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-gray-400 border border-gray-300 rounded px-1">광고</span>
                                    <span className="text-[10px] text-gray-400">by Google</span>
                                </div>
                                <div className="bg-gradient-to-br from-violet-100 to-indigo-100 rounded-lg p-4 text-center">
                                    <p className="text-2xl mb-1">🎵</p>
                                    <p className="text-sm font-bold text-violet-800">PIXEL SUNDAY Premium</p>
                                    <p className="text-xs text-gray-500 mt-1">무제한 갤러리 이용권</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── WATCHING (실제 GPT 광고 대기) ── */}
                    {phase === 'watching' && !isSimMode && (
                        <>
                            <div className="text-5xl mb-4 animate-pulse">📺</div>
                            <p className="text-gray-800 font-semibold mb-1">광고가 재생 중입니다</p>
                            <p className="text-sm text-gray-500 mb-2">
                                광고를 끝까지 시청하면&nbsp;
                                <span className="text-indigo-600 font-bold">{AD_REWARD}P</span>가 지급됩니다
                            </p>
                            <p className="text-xs text-red-500 mb-4 font-medium">
                                ⚠️ 광고를 중간에 닫으면 포인트가 지급되지 않습니다
                            </p>
                            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                                <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                Powered by Google AdSense
                            </div>
                        </>
                    )}

                    {/* ── DONE ── */}
                    {phase === 'done' && (
                        <>
                            <div className="text-5xl mb-3">🎉</div>
                            <p className="text-lg font-bold text-gray-900 mb-2">광고 시청 완료!</p>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                <span className="text-indigo-600 font-bold">+{AD_REWARD}P</span>가 지급되었습니다.<br />
                                이제 갤러리를 이용하실 수 있습니다!
                            </p>
                            <button
                                onClick={handleClose}
                                className="mt-5 w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md"
                            >
                                ✓ 닫기
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
