import { useState, useRef, useEffect } from 'react';
import useUserStore from '../../store/userStore';
import usePointsStore from '../../store/pointsStore';
import { deductPointsForComfy, COMFY_COST } from '../../services/points';
import {
    checkComfyHealth,
    generateFromWorkflow,
    saveToUserGallery,
    AVAILABLE_WORKFLOWS,
} from '../../services/comfyService';

import LoginModal from '../common/LoginModal';
import PointsPurchaseModal from '../points/PointsPurchaseModal';

const ASPECT_RATIOS = [
    { id: '16:9 (Panorama)', label: '16:9', icon: '⬛', desc: 'Panorama' },
    { id: '9:16 (Slim Vertical)', label: '9:16', icon: '▬', desc: 'Vertical' },
];

export default function ComfyGeneratorModal({ onClose, onSaved }) {
    const { user, role } = useUserStore();
    const { dailyPoints, walletBalance, applyDeduction } = usePointsStore();
    const totalPoints = (dailyPoints || 0) + (walletBalance || 0);
    const isAdmin = role === 'admin';

    const [prompt, setPrompt] = useState('');
    const [promptOpen, setPromptOpen] = useState(false);
    const [workflows, setWorkflows] = useState(AVAILABLE_WORKFLOWS);
    const [selectedWorkflow, setSelectedWorkflow] = useState(AVAILABLE_WORKFLOWS[0]?.id || '');

    const [aspectRatio, setAspectRatio] = useState('9:16 (Slim Vertical)');
    const [status, setStatus] = useState('idle'); // idle|generating|done|error
    const [progress, setProgress] = useState(0);       // 실제 서버 progress (0~100)
    const [displayProgress, setDisplayProgress] = useState(0); // 화면에 표시할 부드러운 progress
    const [statusText, setStatusText] = useState('');
    const [queuePos, setQueuePos] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [savedUrl, setSavedUrl] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [serverOk, setServerOk] = useState(null);
    const [showLogin, setShowLogin] = useState(false);
    const [showPurchase, setShowPurchase] = useState(false);
    const blobRef = useRef(null);
    const progressRef = useRef(0);       // 실제 progress 최신값 (ref)
    const displayRef = useRef(0);        // 표시 progress 최신값 (ref)
    const timerRef = useRef(null);       // interval ref

    // ─── 시간 기반 부드러운 프로그래스 타이머 ────────────────────────────────
    // generating 시작 시 실행, 100ms마다 표시값을 실제값으로 서서히 수렴시킴
    // 실제값이 없을 때는 천천히 자동 증가 (max 90%까지)
    useEffect(() => {
        if (status === 'generating') {
            displayRef.current = 0;
            progressRef.current = 0;
            setDisplayProgress(0);

            timerRef.current = setInterval(() => {
                const real = progressRef.current;
                const disp = displayRef.current;

                let next;
                if (real > disp) {
                    // 실제값이 표시값보다 크면 빠르게 따라감
                    next = disp + Math.max(1, (real - disp) * 0.25);
                } else {
                    // 실제값이 없거나 같으면 천천히 자동 증가 (경계: 90%)
                    const ceiling = Math.min(90, real + 30);
                    if (disp < ceiling) {
                        // 구간별 속도: 0~40% 빠름, 40~80% 중간, 80~90% 느림
                        const speed = disp < 40 ? 0.4 : disp < 80 ? 0.15 : 0.03;
                        next = disp + speed;
                    } else {
                        next = disp; // 90% 이상에서 정지 대기
                    }
                }
                next = Math.min(next, 100);
                displayRef.current = next;
                setDisplayProgress(Math.round(next * 10) / 10);
            }, 100);
        } else {
            // 생성 종료 시 타이머 정리
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            if (status === 'done') {
                setDisplayProgress(100);
                displayRef.current = 100;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status]);

    // 실제 progress가 업데이트되면 ref에 반영 (타이머가 참조)
    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);


    // 서버 헬스 체크 (30초마다 자동 재시도 — 네트워크 전환 후 자동 복구)
    const checkHealth = () => {
        checkComfyHealth().then(h => setServerOk(h.ok));
    };
    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    // fal.ai 대시보드 등록 워크플로우 목록 (정적 — 로컬 JSON 스캔 불필요)
    // fetchWorkflows()는 서버에서 동적 목록을 가져오는 방식으로, fal.ai 방식에서는 필요 없음
    useEffect(() => {
        // 서버 /api/comfy/workflows 가 정적 목록을 반환하므로 초기 state(AVAILABLE_WORKFLOWS)로 충분
    }, []);

    const canGenerate = !!selectedWorkflow && totalPoints >= COMFY_COST
        && status !== 'generating' && serverOk && !isAdmin;

    const handleGenerateClick = () => {
        if (!user) { setShowLogin(true); return; }
        if (isAdmin) return;
        handleGenerate();
    };

    const handleGenerate = async () => {
        if (!canGenerate) return;
        setStatus('generating');
        setProgress(0);
        setStatusText('이미지 생성 준비 중...');
        setImageUrl(null);
        setSavedUrl(null);
        setErrorMsg('');
        setQueuePos(null);

        try {
            const userName = user.displayName || user.email?.split('@')[0] || user.uid;

            // fal.ai 등록 워크플로우 직접 호출 — 로컬 JSON 로드/주입 불필요
            // 서버(Cloud Functions)에서 aspectRatio → width/height 변환 후 fal.ai에 전달
            setStatusText('fal.ai 워크플로우 호출 중...');
            const result = await generateFromWorkflow(
                ({ progress: p, status: s, queuePosition }) => {
                    if (p != null) setProgress(p);
                    if (s) setStatusText(s);
                    if (queuePosition != null) setQueuePos(queuePosition);
                },
                // Fal.ai 경로 전용 메타 — Cloud Functions에서 저장/포인트 처리
                { uid: user.uid, userName, prompt, workflowId: selectedWorkflow, aspectRatio }
            );

            // ── Fal.ai 서버 저장 완료 응답 ────────────────────────────────────
            // Cloud Functions에서 Storage 저장 + Firestore + 포인트 차감 완료
            if (result?.__falResult) {
                const { thumbUrl, fullUrl, pointResult } = result;

                // 포인트 차감 결과를 store에 반영
                if (pointResult?.success) {
                    applyDeduction({
                        success:      true,
                        dailyDeduct:  pointResult.dailyDeduct  ?? 0,
                        walletDeduct: pointResult.walletDeduct ?? 0,
                    });
                } else {
                    console.warn('[ComfyGenerator] 포인트 차감 실패:', pointResult?.reason);
                }

                // 갤러리 미리보기: thumbUrl (저용량), 클릭 시 fullUrl (고화질)
                setSavedUrl(fullUrl);
                setImageUrl(thumbUrl || fullUrl);
                setStatus('done');
                setProgress(100);
                setStatusText('완료!');
                onSaved?.({ thumbUrl, fullUrl, docId: result.docId });
                return;
            }

            // ── 기존 로컬 ComfyUI 경로 (Blob 반환) ───────────────────────────
            const blob = result;
            blobRef.current = blob;
            setProgress(95);
            setStatusText('변환중...');

            console.log('[ComfyGenerator] 갤러리 저장 시작 — uid:', user.uid, 'userName:', userName);
            let url;
            try {
                const saved = await saveToUserGallery(
                    blob, user.uid, userName, prompt, selectedWorkflow, aspectRatio
                );
                url = saved.url;
                console.log('[ComfyGenerator] ✅ 갤러리 저장 완료 — url:', url);
            } catch (saveErr) {
                console.error('[ComfyGenerator] ❌ 갤러리 저장 실패:', saveErr.code, saveErr.message);
                throw new Error(`갤러리 저장 실패: ${saveErr.message}`);
            }

            // 업로드 성공 후 포인트 차감
            setStatusText('포인트 차감 중...');
            const deduct = await deductPointsForComfy(user.uid);
            if (deduct.success) {
                applyDeduction(deduct);
            } else {
                console.warn('[ComfyGenerator] 포인트 차감 실패 (이미지는 저장됨):', deduct);
            }

            setSavedUrl(url);
            setImageUrl(url);
            setStatus('done');
            setProgress(100);
            setStatusText('완료!');
        } catch (err) {
            console.error('[ComfyGenerator] ❌ 전체 오류:', err.code, err.message);
            setStatus('error');
            setErrorMsg(err.message || '이미지 생성 실패');
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <span className="text-2xl">✨</span>
                            <h2 className="text-lg font-bold text-white">AI 이미지 생성</h2>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                serverOk === null ? 'bg-yellow-400/80 text-yellow-900' :
                                serverOk ? 'bg-green-400/80 text-green-900' : 'bg-red-400/80 text-red-900'
                            }`}>
                                {serverOk === null ? '확인 중' : serverOk ? '연결됨' : '점검 중'}
                            </span>
                            {/* 오프라인 시 수동 재연결 버튼 */}
                            {serverOk === false && (
                                <button
                                    onClick={checkHealth}
                                    className="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded-full transition-colors"
                                >
                                    🔄 재연결
                                </button>
                            )}
                        </div>
                        <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto flex-1">
                        {/* 포인트 */}
                        <div className="flex justify-between text-sm bg-indigo-50 rounded-xl px-4 py-2.5">
                            <span className="text-gray-600">생성 비용 <strong>{COMFY_COST}P</strong></span>
                            <span className={`font-bold ${totalPoints >= COMFY_COST ? 'text-green-600' : 'text-red-500'}`}>
                                {user ? `보유 ${totalPoints.toLocaleString()}P` : '로그인 후 이용 가능'}
                            </span>
                        </div>

                        {/* 포인트 부족 경고 */}
                        {user && totalPoints < COMFY_COST && (
                            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                                <span className="text-sm text-red-600 font-semibold">⚠️ 포인트가 부족합니다</span>
                                <button
                                    onClick={() => setShowPurchase(true)}
                                    className="text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-1.5 rounded-lg hover:opacity-90 transition shadow"
                                >
                                    💎 포인트 채우기
                                </button>
                            </div>
                        )}

                        {/* 워크플로우 선택 */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">스타일선택</label>
                            <select
                                value={selectedWorkflow}
                                onChange={e => setSelectedWorkflow(e.target.value)}
                                disabled={status === 'generating'}
                                className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {workflows.map(wf => (
                                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Aspect Ratio */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Aspect Ratio</label>
                            <div className="flex gap-2">
                                {ASPECT_RATIOS.map(ar => (
                                    <button
                                        key={ar.id}
                                        onClick={() => setAspectRatio(ar.id)}
                                        disabled={status === 'generating'}
                                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                                            aspectRatio === ar.id
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-400'
                                        }`}
                                    >
                                        <div className="font-bold">{ar.label}</div>
                                        <div className="text-xs font-normal opacity-70">{ar.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 프롬프트 (closeable) */}
                        <div>
                            <button
                                type="button"
                                onClick={() => setPromptOpen(v => !v)}
                                className="flex items-center justify-end gap-1.5 w-full text-xs font-semibold text-gray-500 mb-1.5 hover:text-indigo-600 transition"
                            >
                                <span>프롬프트 (영어 권장)</span>
                                <span className="text-gray-400 text-[10px]">{promptOpen ? '▲ 접기' : '▼ 입력'}</span>
                            </button>
                            {promptOpen && (
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    disabled={status === 'generating'}
                                    placeholder="a beautiful woman in the city, cinematic lighting, 8k"
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    autoFocus
                                />
                            )}
                        </div>

                        {/* 진행 상태 */}
                        {status === 'generating' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-indigo-600 font-semibold animate-pulse">{statusText}</span>
                                    <div className="flex items-center gap-2">
                                        {queuePos > 0 && (
                                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">
                                                대기 {queuePos}번째
                                            </span>
                                        )}
                                        <span className="text-gray-500 text-xs font-semibold tabular-nums">
                                            {Math.floor(displayProgress)}%
                                        </span>
                                    </div>
                                </div>
                                {/* 프로그래스바: 시간 기반 부드러운 증가 */}
                                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full relative overflow-hidden"
                                        style={{
                                            width: `${displayProgress}%`,
                                            background: 'linear-gradient(90deg, #7c3aed, #4f46e5, #818cf8)',
                                            transition: 'width 0.12s linear',
                                        }}
                                    >
                                        {/* 시머 애니메이션 */}
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 1.4s infinite linear',
                                            }}
                                        />
                                    </div>
                                </div>
                                <style>{`
                                    @keyframes shimmer {
                                        0%   { background-position: -200% 0; }
                                        100% { background-position: 200% 0; }
                                    }
                                `}</style>
                            </div>
                        )}


                        {/* 오류 */}
                        {status === 'error' && (
                            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">⚠️ {errorMsg}</p>
                        )}

                        {/* 생성된 이미지 (Firebase URL — 업로드 완료 후 표시) */}
                        {imageUrl && status === 'done' && (
                            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-md">
                                <img src={imageUrl} alt="generated" className="w-full object-contain max-h-64" />
                                {savedUrl && (
                                    <p className="text-xs text-center text-green-600 bg-green-50 py-1.5 font-semibold">
                                        ✓ 갤러리에 저장 완료
                                    </p>
                                )}
                            </div>
                        )}

                        {/* 버튼 */}
                        <div className="flex gap-3">
                            {isAdmin ? (
                                <div className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center bg-gray-100 text-gray-400 border border-gray-200">
                                    🔒 관리자 계정은 AI 생성을 사용할 수 없습니다
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateClick}
                                    disabled={status === 'generating' || !serverOk}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                        (status !== 'generating' && serverOk)
                                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 shadow-lg'
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    {status === 'generating' ? '생성 중...' :
                                     !user ? `로그인 후 생성 (${COMFY_COST}P)` :
                                     `✨ 생성 (${COMFY_COST}P)`}
                                </button>
                            )}
                        </div>

                        <p className="text-xs text-gray-400 text-center">
                            생성된 이미지는 내 갤러리에 자동 저장됩니다
                        </p>


                    </div>
                </div>
            </div>

            {/* 비회원 로그인 모달 */}
            {showLogin    && <LoginModal          onClose={() => setShowLogin(false)} />}
            {showPurchase && <PointsPurchaseModal onClose={() => setShowPurchase(false)} />}
        </>
    );
}
