import { useState, useEffect } from 'react';
import useUserStore from '../../store/userStore';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import PointsDisplay from '../points/PointsDisplay';
import AdWatchModal from '../points/AdWatchModal';
import PointsPurchaseModal from '../points/PointsPurchaseModal';
import LoginModal from './LoginModal';

// 전체 섹션 정의 (관리자 페이지의 TOP_SECTIONS과 동기)
const ALL_MODES = [
    {
        id: "visual-mode",
        title: "LOOKS & LINES",
        desc: "Black & White Minimal",
        colors: "from-black to-gray-800 text-white border-black hover:border-white shadow-lg",
        activeShadow: "shadow-[0_4px_20px_rgba(0,0,0,0.3)]",
        descColor: "text-gray-300"
    },
    {
        id: "momentary",
        title: "MOMENTARY",
        desc: "Soft Beige / Emotional",
        colors: "from-[#f5e6d3] to-[#d4a574] text-[#5a4a3a] border-[#d4a574] hover:border-[#8b6f47]",
        activeShadow: "shadow-[0_4px_20px_rgba(212,165,116,0.4)]",
        descColor: "text-[#7d6a5a]"
    },
    {
        id: "chronicles",
        title: "CHRONICLES",
        desc: "Story & Archive",
        colors: "from-slate-700 to-slate-900 text-white border-slate-600 hover:border-slate-400",
        activeShadow: "shadow-[0_4px_20px_rgba(71,85,105,0.4)]",
        descColor: "text-slate-300"
    },
];

export default function Header({ activeMode, setActiveMode, onToggleMyPage, myPageOpen }) {
    const { user, role, loading } = useUserStore();
    const [showPurchase, setShowPurchase] = useState(false);
    const [showPointsPurchase, setShowPointsPurchase] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [hiddenSections, setHiddenSections] = useState([]);

    // Firestore에서 숨김 섹션 설정 로드
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'config', 'sections'));
                if (snap.exists()) setHiddenSections(snap.data().hidden || []);
            } catch { /* 설정 없으면 전체 표시 */ }
        })();
    }, []);

    // 숨김 처리된 섹션 제외
    const modes = ALL_MODES.filter(m => !hiddenSections.includes(m.id));

    return (<>
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link to="/" className="text-xl font-bold tracking-tighter landscape:hidden">
                    PIXEL SUNDAY
                </Link>

                <nav className="hidden md:flex landscape:flex gap-2">
                    {modes.map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setActiveMode(mode.id)}
                            className={`
                px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center border-2
                bg-gradient-to-br ${mode.colors}
                ${activeMode === mode.id ? 'border-opacity-100 scale-105 ' + mode.activeShadow : 'border-opacity-50 hover:-translate-y-1'}
              `}
                        >
                            <span className="text-sm font-bold tracking-wide">{mode.title}</span>
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    {!loading && user ? (
                        <div className="flex items-center gap-3">
                            {/* 포인트 표시 */}
                            <PointsDisplay onOpenPurchase={() => setShowPurchase(true)} />
                            {/* My Page 토글 버튼 */}
                            <button
                                onClick={onToggleMyPage}
                                className={`text-sm font-semibold transition-colors hidden sm:block underline-offset-2 hover:underline ${
                                    myPageOpen ? 'text-indigo-600 underline' : 'text-gray-700 hover:text-indigo-600'
                                }`}
                            >
                                {user.displayName || user.email}
                            </button>
                            {role === 'admin' && (
                                <Link to="/admin" className="text-xs bg-red-100 text-red-700 font-bold px-2 py-1 rounded">Admin</Link>
                            )}
                            {role === 'creator' && (
                                <Link to="/creator" className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded">Creator</Link>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowLogin(true)}
                            className="text-sm font-semibold text-white bg-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-md"
                        >
                            로그인
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile nav */}
            <div className="md:hidden landscape:hidden flex overflow-x-auto px-4 py-2 gap-2 snap-x hide-scrollbar">
                {modes.map((mode) => (
                    <button
                        key={mode.id}
                        onClick={() => setActiveMode(mode.id)}
                        className={`
              snap-center shrink-0 px-3 py-1.5 rounded-lg border-2 whitespace-nowrap
              bg-gradient-to-br ${mode.colors}
              ${activeMode === mode.id ? 'opacity-100 ' + mode.activeShadow : 'opacity-80'}
            `}
                    >
                        <span className="text-xs font-bold block">{mode.title}</span>
                    </button>
                ))}
            </div>
        </header>

        {/* 포인트 채우기 모달 */}
        {showPurchase && <AdWatchModal
            onClose={() => setShowPurchase(false)}
            onOpenPurchase={() => { setShowPurchase(false); setShowPointsPurchase(true); }}
        />}
        {showPointsPurchase && <PointsPurchaseModal onClose={() => setShowPointsPurchase(false)} />}
        {/* 로그인 모달 */}
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>);
}
