/**
 * tossPayment.js — 토스페이먼츠 결제 검증
 * POST /api/toss/confirm  결제 승인 요청 + 포인트 지급
 */
import express from 'express';
import axios from 'axios';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const TOSS_BASE = 'https://api.tosspayments.com/v1/payments';
const SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const authHeader = () => `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`;

const PACKAGES = {
    'pkg_500': { points: 500, priceKrw: 1000 },
    'pkg_1200': { points: 1200, priceKrw: 2000 },
    'pkg_3000': { points: 3000, priceKrw: 4500 },
    'pkg_7000': { points: 7000, priceKrw: 9000 },
};

const processed = new Set();

// POST /api/toss/confirm
router.post('/confirm', async (req, res) => {
    const { paymentKey, orderId, amount, packageId, uid } = req.body;
    if (!paymentKey || !orderId || !amount || !packageId || !uid)
        return res.status(400).json({ error: '필수 파라미터 누락' });
    if (processed.has(paymentKey)) return res.status(409).json({ error: '이미 처리됨' });

    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: '알 수 없는 패키지' });
    if (Number(amount) !== pkg.priceKrw)
        return res.status(400).json({ error: '금액 불일치' });

    try {
        // 토스페이먼츠 결제 승인
        const { data } = await axios.post(
            `${TOSS_BASE}/confirm`,
            { paymentKey, orderId, amount: pkg.priceKrw },
            { headers: { Authorization: authHeader(), 'Content-Type': 'application/json' } }
        );
        if (data.status !== 'DONE') return res.status(400).json({ error: `결제 상태: ${data.status}` });

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return res.status(404).json({ error: '사용자 없음' });

        const newWallet = (userSnap.data().walletBalance || 0) + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });
        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid, type: 'purchase', amount: pkg.points,
            priceKrw: pkg.priceKrw, packageId, paymentKey,
            provider: 'tosspayments',
            description: `[토스페이먼츠] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });

        processed.add(paymentKey);
        res.json({ success: true, points: pkg.points, newWallet });
    } catch (err) {
        console.error('[toss/confirm]', err?.response?.data || err.message);
        res.status(500).json({ error: err?.response?.data?.message || '결제 실패' });
    }
});

export default router;
