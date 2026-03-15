/**
 * EximbayForm.jsx
 * Eximbay 결제 — 서버에서 서명 받아 Form 자동 제출 (팝업 방식)
 */
import { useState } from 'react';
import { useRef, useEffect } from 'react';

const BACKEND = 'http://localhost:3001';

export default function EximbayForm({ pkg, uid, onSuccess, onCancel }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const formRef = useRef(null);
    const paramsRef = useRef(null);

    const handlePay = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${BACKEND}/api/eximbay/prepare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageId: pkg.packageId, uid }),
            });
            const { params, error: err } = await res.json();
            if (err) throw new Error(err);

            paramsRef.current = params;
            // Form 자동 제출 → Eximbay 호스팅 페이지로 이동
            setTimeout(() => formRef.current?.submit(), 100);
        } catch (e) {
            setError(e.message);
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className={`bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-center`}>
                <p className="text-sm opacity-90">{pkg.label}</p>
                <p className="text-2xl font-black">{pkg.points.toLocaleString()}P</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 text-center space-y-1">
                <p className="font-semibold">🌏 Eximbay 국제 결제</p>
                <p className="text-xs">외국 카드 · 알리페이 · WeChat Pay 지원</p>
                <p className="text-xs opacity-70">버튼 클릭 시 Eximbay 결제 페이지로 이동합니다</p>
            </div>

            {error && <p className="text-xs text-red-500 text-center">⚠️ {error}</p>}

            {/* 숨김 Form — Eximbay 서버로 POST 제출 */}
            {paramsRef.current && (
                <form
                    ref={formRef}
                    method="POST"
                    action="https://api.eximbay.com/v1/payments/ready"
                    target="_blank"
                    className="hidden"
                >
                    {Object.entries(paramsRef.current).map(([k, v]) => (
                        <input key={k} type="hidden" name={k} value={v} />
                    ))}
                </form>
            )}

            <button
                onClick={handlePay}
                disabled={loading}
                className="w-full py-3 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
                {loading
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />로딩 중...</>
                    : '🌏 Eximbay 결제 진행'}
            </button>
            <button onClick={onCancel} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                취소
            </button>
        </div>
    );
}
