/**
 * eximbayPayment.js — Eximbay 결제 서명 생성 + 결과 수신
 * POST /api/eximbay/prepare   결제 요청 파라미터 + 서명 반환
 * POST /api/eximbay/return    결제 결과 수신 → 포인트 지급
 */
import express from 'express';
import crypto from 'crypto';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const MID = process.env.EXIMBAY_MID || '';
const API_KEY = process.env.EXIMBAY_API_KEY || '';
const EXIMBAY_URL = 'https://api.eximbay.com/v1/payments/ready'; // Eximbay API endpoint

const PACKAGES = {
    'pkg_500': { points: 500, priceUsd: '0.75' },
    'pkg_1200': { points: 1200, priceUsd: '1.50' },
    'pkg_3000': { points: 3000, priceUsd: '3.50' },
    'pkg_7000': { points: 7000, priceUsd: '7.00' },
};

function eximbaySign(params) {
    // Eximbay HMAC-SHA256 서명
    const signStr = Object.keys(params).sort()
        .map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHmac('sha256', API_KEY).update(signStr).digest('hex');
}

// POST /api/eximbay/prepare
router.post('/prepare', (req, res) => {
    const { packageId, uid } = req.body;
    const pkg = PACKAGES[packageId];
    if (!pkg || !uid) return res.status(400).json({ error: '파라미터 오류' });

    const orderId = `eximbay_${uid.slice(0, 8)}_${Date.now()}`;
    const params = {
        ver: '2.1',
        mid: MID,
        ref: orderId,
        amt: pkg.priceUsd,
        cur: 'USD',
        product: `PIXEL SUNDAY ${pkg.points}P`,
        lang: 'KO',
        returnurl: `${process.env.SERVER_URL || 'http://localhost:3001'}/api/eximbay/return`,
        userId: uid,
        packageId,
    };
    params.fgkey = eximbaySign(params);

    // uid와 packageId를 orderId에 인코딩 (return 시 복원용)
    res.json({ params, orderId });
});

// POST /api/eximbay/return
const processed = new Set();
router.post('/return', async (req, res) => {
    const { replycode, ref: orderId, mid, fgkey } = req.body;
    if (replycode !== '0000') return res.status(400).json({ error: `Eximbay 오류: ${replycode}` });
    if (processed.has(orderId)) return res.status(409).json({ error: '이미 처리됨' });

    // orderId에서 uid, packageId 추출 (prepare에서 커스텀 파라미터 전달)
    const { uid, packageId } = req.body;
    const pkg = PACKAGES[packageId];
    if (!pkg || !uid) return res.status(400).json({ error: '패키지 정보 오류' });

    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return res.status(404).json({ error: '사용자 없음' });

        const newWallet = (snap.data().walletBalance || 0) + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });
        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid, type: 'purchase', amount: pkg.points,
            provider: 'eximbay', orderId, packageId,
            description: `[Eximbay] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });
        processed.add(orderId);
        res.json({ success: true, points: pkg.points, newWallet });
    } catch (err) {
        console.error('[eximbay/return]', err.message);
        res.status(500).json({ error: '처리 실패' });
    }
});

export default router;
