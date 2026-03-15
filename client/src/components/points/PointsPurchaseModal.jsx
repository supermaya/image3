import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import useUserStore from '../../store/userStore';
import usePointsStore from '../../store/pointsStore';
import StripeCheckoutForm from './StripeCheckoutForm';
import StripeWalletButton from './StripeWalletButton';
import TossPaymentForm from './TossPaymentForm';
import PaymentwallWidget from './PaymentwallWidget';
import EximbayForm from './EximbayForm';
import { purchasePoints, isPortOneConfigured } from '../../services/paymentService';

const PACKAGES = [
    { packageId: 'pkg_500', points: 500, priceKrw: 1000, label: '⚡ 스타터', color: 'from-blue-400 to-blue-600' },
    { packageId: 'pkg_1200', points: 1200, priceKrw: 2000, label: '💎 인기', color: 'from-indigo-500 to-purple-600', badge: 'BEST' },
    { packageId: 'pkg_3000', points: 3000, priceKrw: 4500, label: '🚀 프리미엄', color: 'from-purple-600 to-pink-600' },
    { packageId: 'pkg_7000', points: 7000, priceKrw: 9000, label: '👑 VIP', color: 'from-yellow-400 to-orange-500' },
];

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const PAYPAL_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || '';
const BACKEND = 'http://localhost:3001';

const stripePromise = STRIPE_KEY && !STRIPE_KEY.includes('XXXX') ? loadStripe(STRIPE_KEY) : null;

// 결제 방법 그룹 정의
const GROUPS = [
    {
        title: '🌍 국제 간편결제',
        methods: [
            { id: 'apple_google_pay', label: 'Apple / Google Pay', icon: '🍎', sub: 'Stripe 지갑' },
            { id: 'stripe_card', label: 'Stripe 카드', icon: '💳', sub: '신용·체크카드' },
            { id: 'paypal', label: 'PayPal', icon: '🅿️', sub: 'PayPal 계정' },
            { id: 'alipay', label: '알리페이', icon: '💙', sub: 'Alipay / Stripe' },
        ],
    },
    {
        title: '🇰🇷 국내 간편결제',
        methods: [
            { id: 'portone', label: '포트원 카드결제 (INIpay)', icon: '🏦', sub: 'INIpayTest · 테스트 채널', badge: 'TEST' },
        ],
    },
    {
        title: '🌐 글로벌 대안결제',
        methods: [
            { id: 'paymentwall', label: 'Paymentwall', icon: '🧱', sub: '200+ 결제 방법' },
            { id: 'eximbay', label: 'Eximbay', icon: '🌏', sub: '국제카드·외국인 결제' },
        ],
    },
];

export default function PointsPurchaseModal({ onClose }) {
    const { user } = useUserStore();
    const { applyAddition } = usePointsStore();

    const [step, setStep] = useState('packages');
    const [selectedPkg, setSelectedPkg] = useState(null);
    const [activeMethod, setActiveMethod] = useState(null);
    const [done, setDone] = useState(null);
    const [paypalErr, setPaypalErr] = useState('');

    const selectPackage = (pkg) => { setSelectedPkg(pkg); setStep('method'); };
    const selectMethod = (id) => { setActiveMethod(id); setStep('checkout'); };
    const back = () => { setStep(step === 'checkout' ? 'method' : 'packages'); setActiveMethod(null); };

    const handleSuccess = (data) => {
        if (data.points) applyAddition(data.points);
        setDone(data.points || selectedPkg?.points);
        setStep('done');
    };

    const [payingPortOne, setPayingPortOne] = useState(false);
    const [portOneError, setPortOneError] = useState('');

    // PortOne (INIpay) 결제 → 서버 검증 → 포인트 지급
    const handlePortOnePay = async () => {
        if (!user) return;
        setPayingPortOne(true);
        setPortOneError('');
        try {
            // userInfo로 실제 로그인 유저 정보를 동적 연결
            const userInfo = {
                email: user.email || '',
                name: user.displayName || user.email?.split('@')[0] || 'PIXEL USER',
            };
            const result = await purchasePoints(selectedPkg, user.uid, userInfo);
            handleSuccess(result);
        } catch (e) {
            setPortOneError(e.message);
        } finally {
            setPayingPortOne(false);
        }
    };
    const paypalCreate = async () => {
        const res = await fetch(`${BACKEND}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: selectedPkg.packageId, uid: user.uid }),
        });
        const { orderID, error } = await res.json();
        if (error) throw new Error(error);
        return orderID;
    };
    const paypalApprove = async (data) => {
        const res = await fetch(`${BACKEND}/api/paypal/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID, uid: user.uid }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || '처리 실패');
        handleSuccess(result);
    };

    // Alipay via Stripe
    const handleAlipay = async () => {
        // Stripe Alipay는 별도 redirect flow. 여기선 카드 폼과 동일 UI 재사용
        setActiveMethod('stripe_card');
        setStep('checkout');
    };

    const stepTitle = {
        packages: '패키지 선택',
        method: `${selectedPkg?.points?.toLocaleString()}P · 결제 방법`,
        checkout: activeMethod ? GROUPS.flatMap(g => g.methods).find(m => m.id === activeMethod)?.label : '결제',
        done: '구매 완료',
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && step === 'packages' && onClose()}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">

                {/* 헤더 */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 text-white flex items-center gap-3 shrink-0">
                    {step !== 'packages' && step !== 'done' && (
                        <button onClick={back} className="text-white/70 hover:text-white text-xl">←</button>
                    )}
                    <div className="flex-1">
                        <h2 className="text-lg font-bold">💎 포인트 구매</h2>
                        <p className="text-xs opacity-80">{stepTitle[step]}</p>
                    </div>
                    {step === 'packages' && (
                        <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none px-1">×</button>
                    )}
                </div>

                <div className="overflow-y-auto flex-1 p-5">

                    {/* ── 패키지 선택 ── */}
                    {step === 'packages' && (
                        <>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {PACKAGES.map((pkg) => (
                                    <button key={pkg.packageId} onClick={() => selectPackage(pkg)}
                                        className={`relative bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-left hover:scale-105 active:scale-95 transition-transform shadow-md`}>
                                        {pkg.badge && (
                                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{pkg.badge}</span>
                                        )}
                                        <div className="text-xs opacity-90 mb-1">{pkg.label}</div>
                                        <div className="text-xl font-black">{pkg.points.toLocaleString()}P</div>
                                        <div className="text-xs opacity-80 mt-0.5">₩{pkg.priceKrw.toLocaleString()}</div>
                                    </button>
                                ))}
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-0.5">
                                <p className="font-semibold text-gray-800 mb-1">📋 포인트 안내</p>
                                <p>• 갤러리 1회 = <span className="text-indigo-600 font-semibold">17P</span> 차감</p>
                                <p>• 일일 로그인 보너스 <span className="text-amber-500 font-semibold">100P</span></p>
                                <p>• 구매 포인트는 <strong>영구 보관</strong></p>
                            </div>
                        </>
                    )}

                    {/* ── 결제 방법 선택 ── */}
                    {step === 'method' && (
                        <div className="space-y-4">
                            {GROUPS.map((group) => (
                                <div key={group.title}>
                                    <p className="text-xs font-semibold text-gray-500 mb-2">{group.title}</p>
                                    <div className="space-y-2">
                                        {group.methods.map((m) => (
                                            <button key={m.id} onClick={() => m.id === 'alipay' ? handleAlipay() : selectMethod(m.id)}
                                                className="w-full flex items-center gap-3 border-2 border-gray-100 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl px-4 py-3 transition-all group">
                                                <span className="text-2xl">{m.icon}</span>
                                                <div className="text-left flex-1">
                                                    <p className="font-semibold text-sm text-gray-800 group-hover:text-indigo-700">{m.label}</p>
                                                    <p className="text-xs text-gray-400">{m.sub}</p>
                                                </div>
                                                {m.badge && (
                                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{m.badge}</span>
                                                )}
                                                <span className="text-gray-300 group-hover:text-indigo-400">›</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── 결제창 ── */}
                    {step === 'checkout' && selectedPkg && (
                        <>
                            {activeMethod === 'portone' && (
                                <div className="space-y-4">
                                    <div className={`bg-gradient-to-br ${selectedPkg.color} text-white rounded-xl p-4 text-center`}>
                                        <p className="text-sm opacity-90">{selectedPkg.label}</p>
                                        <p className="text-2xl font-black">{selectedPkg.points.toLocaleString()}P</p>
                                        <p className="text-xs opacity-80">₩{selectedPkg.priceKrw.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-xs text-indigo-700">
                                        🏦 <strong>포트원 INIpay 테스트 채널</strong><br />
                                        채널: channel-key-baa6ffd7...<br />
                                        MID: INIpayTest
                                    </div>
                                    {portOneError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                            <p className="text-xs text-red-600">⚠️ {portOneError}</p>
                                        </div>
                                    )}
                                    <button onClick={handlePortOnePay} disabled={payingPortOne}
                                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                                        {payingPortOne
                                            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />결제창 열기 중...</>
                                            : `🏦 포트원 결제 (₩${selectedPkg.priceKrw.toLocaleString()})`}
                                    </button>
                                    <button onClick={back} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">취소</button>
                                </div>
                            )}
                            {activeMethod === 'stripe_card' && (
                                stripePromise
                                    ? <Elements stripe={stripePromise}>
                                        <StripeCheckoutForm pkg={selectedPkg} uid={user?.uid} onSuccess={handleSuccess} onCancel={back} />
                                    </Elements>
                                    : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">⚠️ Stripe 미설정 — <code className="text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code> 필요</div>
                            )}
                            {activeMethod === 'apple_google_pay' && (
                                <StripeWalletButton pkg={selectedPkg} uid={user?.uid} onSuccess={handleSuccess} onCancel={back} />
                            )}
                            {activeMethod === 'paypal' && (
                                PAYPAL_ID && !PAYPAL_ID.includes('XXXX')
                                    ? <div className="space-y-4">
                                        <div className={`bg-gradient-to-br ${selectedPkg.color} text-white rounded-xl p-4 text-center`}>
                                            <p className="text-2xl font-black">{selectedPkg.points.toLocaleString()}P</p>
                                        </div>
                                        {paypalErr && <p className="text-xs text-red-500 text-center">⚠️ {paypalErr}</p>}
                                        <PayPalScriptProvider options={{ clientId: PAYPAL_ID, currency: 'USD' }}>
                                            <PayPalButtons style={{ layout: 'vertical', shape: 'rect', color: 'blue' }}
                                                createOrder={paypalCreate} onApprove={paypalApprove}
                                                onError={(e) => setPaypalErr(String(e))} />
                                        </PayPalScriptProvider>
                                        <button onClick={back} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600">취소</button>
                                    </div>
                                    : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">⚠️ PayPal 미설정 — <code className="text-xs">VITE_PAYPAL_CLIENT_ID</code> 필요</div>
                            )}
                            {activeMethod === 'toss_korean' && (
                                <TossPaymentForm pkg={selectedPkg} uid={user?.uid} onSuccess={handleSuccess} onCancel={back} />
                            )}
                            {activeMethod === 'paymentwall' && (
                                <PaymentwallWidget pkg={selectedPkg} uid={user?.uid} onSuccess={handleSuccess} onCancel={back} />
                            )}
                            {activeMethod === 'eximbay' && (
                                <EximbayForm pkg={selectedPkg} uid={user?.uid} onSuccess={handleSuccess} onCancel={back} />
                            )}
                        </>
                    )}

                    {/* ── 완료 ── */}
                    {step === 'done' && (
                        <div className="text-center py-10">
                            <div className="text-5xl mb-3">🎉</div>
                            <p className="text-xl font-bold text-gray-900">{done?.toLocaleString()}P 구매 완료!</p>
                            <p className="text-sm text-gray-500 mt-1">지갑 포인트에 추가되었습니다</p>
                            <button onClick={onClose}
                                className="mt-6 px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
                                확인
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
