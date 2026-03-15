/**
 * paypalPayment.js — PayPal 결제 백엔드
 *
 * POST /api/paypal/create-order   PayPal 주문 생성
 * POST /api/paypal/capture         주문 캡처 후 포인트 지급
 */
import express from 'express';
import axios from 'axios';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const SECRET = process.env.PAYPAL_SECRET || '';

const PACKAGES = {
    'pkg_500': { points: 500, priceUsd: '0.75' },
    'pkg_1200': { points: 1200, priceUsd: '1.50' },
    'pkg_3000': { points: 3000, priceUsd: '3.50' },
    'pkg_7000': { points: 7000, priceUsd: '7.00' },
};

async function getPayPalToken() {
    const res = await axios.post(
        `${PAYPAL_BASE}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
            auth: { username: CLIENT_ID, password: SECRET },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
    );
    return res.data.access_token;
}

// ── POST /api/paypal/create-order ─────────────────────────────────────────
router.post('/create-order', async (req, res) => {
    const { packageId, uid } = req.body;
    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: '알 수 없는 패키지' });

    try {
        const token = await getPayPalToken();
        const order = await axios.post(
            `${PAYPAL_BASE}/v2/checkout/orders`,
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: { currency_code: 'USD', value: pkg.priceUsd },
                    description: `PIXEL SUNDAY ${pkg.points}P`,
                    custom_id: `${uid}::${packageId}`,
                }],
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        res.json({ orderID: order.data.id });
    } catch (err) {
        console.error('[paypal/create-order]', err?.response?.data || err.message);
        res.status(500).json({ error: '주문 생성 실패' });
    }
});

// ── POST /api/paypal/capture ──────────────────────────────────────────────
const processedPayPal = new Set();

router.post('/capture', async (req, res) => {
    const { orderID, uid } = req.body;
    if (processedPayPal.has(orderID)) return res.status(409).json({ error: '이미 처리됨' });

    try {
        const token = await getPayPalToken();
        const capture = await axios.post(
            `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
            {},
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        const captureData = capture.data;
        if (captureData.status !== 'COMPLETED') {
            return res.status(400).json({ error: `PayPal 상태: ${captureData.status}` });
        }

        // custom_id에서 패키지 추출
        const customId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
        const [, packageId] = customId.split('::');
        const pkg = PACKAGES[packageId];
        if (!pkg) return res.status(400).json({ error: '패키지 불일치' });

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return res.status(404).json({ error: '사용자 없음' });

        const newWallet = (userSnap.data().walletBalance || 0) + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });

        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid, type: 'purchase', amount: pkg.points,
            packageId, paypalOrderId: orderID,
            provider: 'paypal',
            description: `[PayPal] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });

        processedPayPal.add(orderID);
        res.json({ success: true, points: pkg.points, newWallet });
    } catch (err) {
        console.error('[paypal/capture]', err?.response?.data || err.message);
        res.status(500).json({ error: '결제 캡처 실패' });
    }
});

export default router;
