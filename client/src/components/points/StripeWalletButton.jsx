/**
 * StripeWalletButton.jsx
 * Apple Pay / Google Pay / Alipay — Stripe PaymentRequestButton
 */
import { useState, useEffect } from 'react';
import { useStripe, PaymentRequestButtonElement, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const BACKEND = 'http://localhost:3001';

// 내부 폼 컴포넌트 (Stripe context 필요)
function WalletButtonInner({ pkg, uid, onSuccess, onCancel }) {
    const stripe = useStripe();
    const [paymentRequest, setPaymentRequest] = useState(null);
    const [canPay, setCanPay] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!stripe) return;
        const pr = stripe.paymentRequest({
            country: 'KR',
            currency: 'krw',
            total: { label: `PIXEL SUNDAY ${pkg.points}P`, amount: pkg.priceKrw },
            requestPayerName: true,
            requestPayerEmail: true,
        });
        pr.canMakePayment().then(result => {
            if (result) { setPaymentRequest(pr); setCanPay(true); }
        });

        pr.on('paymentmethod', async (ev) => {
            setLoading(true);
            try {
                // 1. 백엔드에서 PaymentIntent 생성
                const intentRes = await fetch(`${BACKEND}/api/stripe/create-intent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ packageId: pkg.packageId, uid }),
                });
                const { clientSecret, error: intentErr } = await intentRes.json();
                if (intentErr) throw new Error(intentErr);

                // 2. 결제 확정
                const { paymentIntent, error: confirmErr } = await stripe.confirmCardPayment(
                    clientSecret,
                    { payment_method: ev.paymentMethod.id },
                    { handleActions: false }
                );
                if (confirmErr) { ev.complete('fail'); throw new Error(confirmErr.message); }

                ev.complete('success');

                // 3. 백엔드 검증
                const verifyRes = await fetch(`${BACKEND}/api/stripe/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentIntentId: paymentIntent.id, uid }),
                });
                const verifyData = await verifyRes.json();
                if (!verifyData.success) throw new Error(verifyData.error);
                onSuccess(verifyData);
            } catch (err) {
                setErrorMsg(err.message);
            } finally {
                setLoading(false);
            }
        });
    }, [stripe, pkg, uid]);

    // 패키지 요약 표시
    const summary = (
        <div className={`bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-center mb-4`}>
            <p className="text-sm opacity-90">{pkg.label}</p>
            <p className="text-2xl font-black">{pkg.points.toLocaleString()}P</p>
            <p className="text-xs opacity-80">₩{pkg.priceKrw.toLocaleString()}</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {summary}
            {errorMsg && <p className="text-xs text-red-500 text-center">⚠️ {errorMsg}</p>}
            {canPay ? (
                <PaymentRequestButtonElement
                    options={{ paymentRequest, style: { paymentRequestButton: { height: '48px' } } }}
                />
            ) : (
                <div className="bg-gray-100 rounded-xl p-4 text-center text-sm text-gray-500">
                    <p className="font-semibold mb-1">Apple Pay / Google Pay</p>
                    <p className="text-xs">이 브라우저/기기에서 지원되지 않습니다.</p>
                    <p className="text-xs mt-1">Safari(iPhone/Mac) 또는 Chrome(Android)에서 사용하세요.</p>
                </div>
            )}
            <button onClick={onCancel} disabled={loading}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                취소
            </button>
        </div>
    );
}

const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

export default function StripeWalletButton(props) {
    if (!stripePromise) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
                ⚠️ Stripe 미설정 — <code className="text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code> 입력 필요
            </div>
        );
    }
    return (
        <Elements stripe={stripePromise}>
            <WalletButtonInner {...props} />
        </Elements>
    );
}
