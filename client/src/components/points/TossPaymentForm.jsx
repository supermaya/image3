/**
 * TossPaymentForm.jsx
 * 토스페이먼츠 SDK — 카카오페이, 네이버페이, 토스페이, 삼성페이
 */
import { useState } from 'react';
import { loadTossPayments } from '@tosspayments/payment-sdk';

const CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || '';
const BACKEND = 'http://localhost:3001';

const EASY_PAY_METHODS = [
    { id: 'kakaopay', label: '카카오페이', icon: '💬', color: 'bg-yellow-400 hover:bg-yellow-500', textColor: 'text-gray-900' },
    { id: 'naverpay', label: '네이버페이', icon: '🟢', color: 'bg-green-500 hover:bg-green-600', textColor: 'text-white' },
    { id: 'tosspay', label: '토스페이', icon: '💙', color: 'bg-blue-500 hover:bg-blue-600', textColor: 'text-white' },
    { id: 'samsungpay', label: '삼성페이', icon: '🔵', color: 'bg-blue-800 hover:bg-blue-900', textColor: 'text-white' },
];

export default function TossPaymentForm({ pkg, uid, onSuccess, onCancel }) {
    const [loading, setLoading] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const handlePay = async (method) => {
        if (!CLIENT_KEY || CLIENT_KEY.includes('XXXX')) {
            setErrorMsg('토스페이먼츠 키가 설정되지 않았습니다. (VITE_TOSS_CLIENT_KEY)');
            return;
        }
        setLoading(true);
        setActiveId(method.id);
        setErrorMsg('');

        try {
            const tossPayments = await loadTossPayments(CLIENT_KEY);
            const orderId = `toss_${uid.slice(0, 8)}_${Date.now()}`;

            // 결제 요청 → Toss 결제창 팝업
            const payment = await tossPayments.requestPayment('카드', {
                amount: pkg.priceKrw,
                orderId,
                orderName: `PIXEL SUNDAY ${pkg.points.toLocaleString()}P`,
                customerName: uid.slice(0, 8),
                easyPay: method.id !== 'card' ? method.id : undefined,
                successUrl: `${window.location.origin}/payment-success`,
                failUrl: `${window.location.origin}/payment-fail`,
            });

            // Toss는 successUrl로 리다이렉트됨. 여기서는 팝업 방식이 아닌 경우 처리
            if (payment) {
                // 직접 반환 시 (일부 간편결제)
                const { paymentKey, orderId: oid, amount } = payment;
                const res = await fetch(`${BACKEND}/api/toss/confirm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentKey, orderId: oid, amount, packageId: pkg.packageId, uid }),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '결제 실패');
                onSuccess(data);
            }
        } catch (err) {
            if (err.code === 'USER_CANCEL') {
                setErrorMsg('결제가 취소되었습니다.');
            } else {
                setErrorMsg(err.message || '결제 중 오류');
            }
        } finally {
            setLoading(false);
            setActiveId(null);
        }
    };

    const isConfigured = CLIENT_KEY && !CLIENT_KEY.includes('XXXX');

    return (
        <div className="space-y-4">
            {/* 패키지 요약 */}
            <div className={`bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-center`}>
                <p className="text-sm opacity-90">{pkg.label}</p>
                <p className="text-2xl font-black">{pkg.points.toLocaleString()}P</p>
                <p className="text-xs opacity-80">₩{pkg.priceKrw.toLocaleString()}</p>
            </div>

            {!isConfigured && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠️ 토스페이먼츠 미설정 — <code>VITE_TOSS_CLIENT_KEY</code> 입력 필요
                </div>
            )}

            {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">⚠️ {errorMsg}</p>
                </div>
            )}

            {/* 간편결제 버튼들 */}
            <div className="grid grid-cols-2 gap-3">
                {EASY_PAY_METHODS.map(m => (
                    <button
                        key={m.id}
                        onClick={() => handlePay(m)}
                        disabled={loading || !isConfigured}
                        className={`relative ${m.color} ${m.textColor} rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1 transition-all active:scale-95 disabled:opacity-50`}
                    >
                        <span className="text-2xl">{m.icon}</span>
                        <span>{m.label}</span>
                        {activeId === m.id && (
                            <div className="absolute inset-0 rounded-xl bg-black/20 flex items-center justify-center">
                                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <button onClick={onCancel} disabled={loading}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                취소
            </button>
        </div>
    );
}
