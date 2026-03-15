import { useState } from 'react';
import {
    loginWithGoogle,
    loginWithFacebook,
    loginWithApple,
    loginWithDiscord,
    loginWithKakao,
    loginWithLine,
} from '../../services/auth';

const PROVIDERS = [
    {
        id: 'google', label: 'Google로 로그인',
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
        ),
        bg: 'bg-white hover:bg-gray-50 border border-gray-200', text: 'text-gray-800',
        fn: loginWithGoogle,
    },
    {
        id: 'apple', label: 'Apple로 로그인', devOnly: true,
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
        ),
        bg: 'bg-black hover:bg-gray-900', text: 'text-white',
        fn: loginWithApple,
    },
    {
        id: 'facebook', label: 'Facebook으로 로그인', devOnly: true,
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
        bg: 'bg-[#1877F2] hover:bg-[#166fe5]', text: 'text-white',
        fn: loginWithFacebook,
    },
    {
        id: 'discord', label: 'Discord로 로그인', devOnly: true,
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
        ),
        bg: 'bg-[#5865F2] hover:bg-[#4752c4]', text: 'text-white',
        fn: loginWithDiscord,
    },
    {
        id: 'line', label: 'LINE으로 로그인', devOnly: true,
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="white" aria-hidden="true">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
        ),
        bg: 'bg-[#06C755] hover:bg-[#05b04c]', text: 'text-white',
        fn: loginWithLine,
    },
    {
        id: 'kakao', label: 'Kakao로 로그인', devOnly: true,
        icon: (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                <path fill="#3C1E1E" d="M12 3C6.477 3 2 6.477 2 10.72c0 2.69 1.696 5.064 4.258 6.48L5.18 20.64a.36.36 0 0 0 .546.394l4.166-2.775A11.6 11.6 0 0 0 12 18.44c5.523 0 10-3.477 10-7.72C22 6.477 17.523 3 12 3z" />
            </svg>
        ),
        bg: 'bg-[#FEE500] hover:bg-[#f0d800]', text: 'text-[#3C1E1E]',
        fn: loginWithKakao,
    },
];

// localhost(dev server)에서는 모든 소셜 로그인 표시, 배포 환경에서는 Google만
const IS_DEV = import.meta.env.DEV;
const VISIBLE_PROVIDERS = IS_DEV ? PROVIDERS : PROVIDERS.filter(p => !p.devOnly);

export default function LoginModal({ onClose }) {
    const [loadingId, setLoadingId] = useState(null);
    const [error, setError] = useState('');

    const handleLogin = async (provider) => {
        setLoadingId(provider.id);
        setError('');
        try {
            await provider.fn();
            onClose(); // 로그인 성공 시 모달 닫기
        } catch (e) {
            setError(e.message || '로그인 중 오류가 발생했습니다.');
            console.error(`[${provider.id}] login error:`, e);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                {/* 헤더 */}
                <div className="px-6 pt-7 pb-4 text-center">
                    <div className="text-3xl mb-2">🎵</div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">PIXEL SUNDAY</h2>
                    <p className="text-sm text-gray-500 mt-1">소셜 계정으로 간편 로그인</p>
                </div>

                {/* 로그인 버튼 목록 */}
                <div className="px-6 pb-4 flex flex-col gap-2.5">
                    {VISIBLE_PROVIDERS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => handleLogin(p)}
                            disabled={!!loadingId}
                            className={`
                                w-full flex items-center gap-3 px-4 py-3 rounded-xl
                                font-semibold text-sm transition-all duration-150
                                shadow-sm disabled:opacity-60 disabled:cursor-not-allowed
                                ${p.bg} ${p.text}
                            `}
                        >
                            {loadingId === p.id ? (
                                <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                            ) : (
                                p.icon
                            )}
                            <span className="flex-1 text-left">{p.label}</span>
                        </button>
                    ))}
                </div>

                {/* 에러 */}
                {error && (
                    <p className="px-6 pb-4 text-xs text-red-500 text-center">{error}</p>
                )}

                {/* 닫기 */}
                <div className="border-t border-gray-100 px-6 py-4">
                    <button
                        onClick={onClose}
                        className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
