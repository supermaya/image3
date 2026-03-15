/**
 * stripePayment.js — Stripe 결제 백엔드
 *
 * POST /api/stripe/create-intent   PaymentIntent 생성 (클라이언트 시크릿 반환)
 * POST /api/stripe/verify          결제 완료 검증 후 포인트 지급
 */
import express from 'express';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// 포인트 패키지 (클라이언트와 동기화)
const PACKAGES = {
    'pkg_500': { points: 500, priceKrw: 1000 },
    'pkg_1200': { points: 1200, priceKrw: 2000 },
    'pkg_3000': { points: 3000, priceKrw: 4500 },
    'pkg_7000': { points: 7000, priceKrw: 9000 },
};

// ── POST /api/stripe/create-intent ────────────────────────────────────────
router.post('/create-intent', async (req, res) => {
    const { packageId, uid } = req.body;
    if (!packageId || !uid) return res.status(400).json({ error: '필수 파라미터 누락' });

    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ error: '알 수 없는 패키지' });

    try {
        const intent = await stripe.paymentIntents.create({
            amount: pkg.priceKrw,       // KRW는 소수점 없음
            currency: 'krw',
            metadata: { uid, packageId },
            automatic_payment_methods: { enabled: true },
        });

        res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    } catch (err) {
        console.error('[stripe/create-intent]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/stripe/verify ───────────────────────────────────────────────
const processedStripe = new Set();

router.post('/verify', async (req, res) => {
    const { paymentIntentId, uid } = req.body;
    if (!paymentIntentId || !uid) return res.status(400).json({ error: '필수 파라미터 누락' });
    if (processedStripe.has(paymentIntentId)) return res.status(409).json({ error: '이미 처리됨' });

    try {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (intent.status !== 'succeeded') {
            return res.status(400).json({ error: `결제 상태: ${intent.status}` });
        }

        const { packageId } = intent.metadata;
        const pkg = PACKAGES[packageId];
        if (!pkg) return res.status(400).json({ error: '패키지 불일치' });

        // 금액 위변조 방지
        if (intent.amount !== pkg.priceKrw) {
            return res.status(400).json({ error: '금액 불일치' });
        }

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return res.status(404).json({ error: '사용자 없음' });

        const newWallet = (userSnap.data().walletBalance || 0) + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });

        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid, type: 'purchase', amount: pkg.points,
            priceKrw: pkg.priceKrw, packageId, paymentIntentId,
            provider: 'stripe',
            description: `[Stripe] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });

        processedStripe.add(paymentIntentId);
        res.json({ success: true, points: pkg.points, newWallet });
    } catch (err) {
        console.error('[stripe/verify]', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
