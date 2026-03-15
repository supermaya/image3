/**
 * StripeCheckoutForm.jsx
 * Stripe Elements 카드 입력 폼
 * 테스트 카드: 4242 4242 4242 4242 / 유효기간: 미래 아무 날 / CVC: 임의 3자리
 */
import { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';

const CARD_STYLE = {
    style: {
        base: {
            fontSize: '16px',
            color: '#1f2937',
            fontFamily: 'system-ui, sans-serif',
            '::placeholder': { color: '#9ca3af' },
        },
        invalid: { color: '#ef4444' },
    },
};

const BACKEND = 'http://localhost:3001';

export default function StripeCheckoutForm({ pkg, uid, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setErrorMsg('');

        try {
            // 1. 백엔드에서 PaymentIntent 생성
            const intentRes = await fetch(`${BACKEND}/api/stripe/create-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageId: pkg.packageId, uid }),
            });
            const { clientSecret, error: intentError } = await intentRes.json();
            if (intentError) throw new Error(intentError);

            // 2. Stripe 카드 결제 확정
            const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: { card: elements.getElement(CardElement) },
            });

            if (stripeError) throw new Error(stripeError.message);
            if (paymentIntent.status !== 'succeeded') throw new Error('결제가 완료되지 않았습니다.');

            // 3. 백엔드 검증 + 포인트 지급
            const verifyRes = await fetch(`${BACKEND}/api/stripe/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId: paymentIntent.id, uid }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success) throw new Error(verifyData.error || '검증 실패');

            onSuccess(verifyData);
        } catch (err) {
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* 패키지 요약 */}
            <div className={`bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-center`}>
                <p className="text-sm opacity-90">{pkg.label}</p>
                <p className="text-2xl font-black">{pkg.points.toLocaleString()}P</p>
                <p className="text-sm opacity-80">₩{pkg.priceKrw.toLocaleString()}</p>
            </div>

            {/* 테스트 카드 안내 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                🧪 <strong>테스트 카드:</strong> 4242 4242 4242 4242 · 유효기간: 미래 임의 · CVC: 임의 3자리
            </div>

            {/* Stripe CardElement */}
            <div className="border border-gray-300 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
                <CardElement options={CARD_STYLE} />
            </div>

            {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-600">⚠️ {errorMsg}</p>
                </div>
            )}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                    취소
                </button>
                <button
                    type="submit"
                    disabled={!stripe || loading}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {loading
                        ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />처리 중...</>
                        : `₩${pkg.priceKrw.toLocaleString()} 결제`}
                </button>
            </div>

            <p className="text-center text-[10px] text-gray-400">
                🔒 Stripe 보안 결제 · SSL 암호화
            </p>
        </form>
    );
}
