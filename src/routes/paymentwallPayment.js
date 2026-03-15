/**
 * paymentwallPayment.js — Paymentwall 서명 생성 + 웹훅
 * GET  /api/paymentwall/widget-params  위젯 파라미터 서명 반환
 * POST /api/paymentwall/webhook        결제 완료 알림 → 포인트 지급
 */
import express from 'express';
import crypto from 'crypto';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const PROJECT_KEY = process.env.PAYMENTWALL_PROJECT_KEY || '';
const SECRET_KEY = process.env.PAYMENTWALL_SECRET_KEY || '';

const PACKAGES = {
    'pkg_500': { points: 500, priceUsd: '0.75', name: 'PIXEL SUNDAY 500P' },
    'pkg_1200': { points: 1200, priceUsd: '1.50', name: 'PIXEL SUNDAY 1200P' },
    'pkg_3000': { points: 3000, priceUsd: '3.50', name: 'PIXEL SUNDAY 3000P' },
    'pkg_7000': { points: 7000, priceUsd: '7.00', name: 'PIXEL SUNDAY 7000P' },
};

function pwSign(params) {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHash('md5').update(sorted + SECRET_KEY).digest('hex');
}

// GET /api/paymentwall/widget-params
router.get('/widget-params', (req, res) => {
    const { packageId, uid } = req.query;
    const pkg = PACKAGES[packageId];
    if (!pkg || !uid) return res.status(400).json({ error: '파라미터 오류' });

    const params = {
        key: PROJECT_KEY,
        uid,
        widget: 'p1_1',
        amount: pkg.priceUsd,
        currencyCode: 'USD',
        ag_name: pkg.name,
        ag_external_id: `${uid}_${packageId}_${Date.now()}`,
        ps: 'all',
        success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment-success`,
    };
    params.sign = pwSign(params);
    res.json({ params });
});

// POST /api/paymentwall/webhook
const processed = new Set();
router.post('/webhook', async (req, res) => {
    const { uid, goodsid: packageId, ref, sign } = req.query;

    // 서명 검증
    const params = { ...req.query };
    const receivedSign = params.sign;
    delete params.sign;
    const expected = pwSign(params);
    if (receivedSign !== expected) return res.status(400).send('Invalid signature');
    if (processed.has(ref)) return res.send('OK');

    const pkg = PACKAGES[packageId];
    if (!pkg || !uid) return res.status(400).send('Invalid params');

    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return res.status(404).send('User not found');

        const newWallet = (snap.data().walletBalance || 0) + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });
        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid, type: 'purchase', amount: pkg.points,
            provider: 'paymentwall', ref, packageId,
            description: `[Paymentwall] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });
        processed.add(ref);
        res.send('OK');
    } catch (err) {
        console.error('[paymentwall/webhook]', err.message);
        res.status(500).send('Error');
    }
});

export default router;
