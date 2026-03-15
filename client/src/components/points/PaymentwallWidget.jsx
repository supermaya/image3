/**
 * PaymentwallWidget.jsx
 * Paymentwall 결제 위젯 임베드
 */
import { useState, useEffect, useRef } from 'react';

const BACKEND = 'http://localhost:3001';

export default function PaymentwallWidget({ pkg, uid, onSuccess, onCancel }) {
    const [params, setParams] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const iframeRef = useRef(null);

    useEffect(() => {
        // 백엔드에서 서명된 파라미터 받기
        fetch(`${BACKEND}/api/paymentwall/widget-params?packageId=${pkg.packageId}&uid=${uid}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setParams(data.params);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));

        // Paymentwall 완료 메시지 수신
        const handler = (e) => {
            if (e.data?.eventName === 'widget:paymentSuccess') {
                onSuccess({ points: pkg.points, newWallet: null });
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [pkg, uid]);

    const widgetUrl = params
        ? `https://api.paymentwall.com/api/subscription?${new URLSearchParams(params).toString()}`
        : null;

    return (
        <div className="space-y-3">
            <div className={`bg-gradient-to-br ${pkg.color} text-white rounded-xl p-4 text-center`}>
                <p className="text-sm opacity-90">{pkg.label} — {pkg.points.toLocaleString()}P</p>
                <p className="text-xs opacity-80">₩{pkg.priceKrw?.toLocaleString() || '—'}</p>
            </div>

            {loading && (
                <div className="flex items-center justify-center h-32 text-gray-400 gap-2">
                    <span className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    위젯 로딩 중...
                </div>
            )}
            {error && <p className="text-xs text-red-500 text-center">⚠️ {error}</p>}
            {widgetUrl && !loading && (
                <iframe
                    ref={iframeRef}
                    src={widgetUrl}
                    className="w-full rounded-xl border border-gray-200"
                    style={{ height: '400px' }}
                    title="Paymentwall"
                    allow="payment"
                />
            )}
            <button onClick={onCancel} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                취소
            </button>
        </div>
    );
}
