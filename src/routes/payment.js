/**
 * payment.js — 포트원 V2 결제 검증 및 포인트 지급
 *
 * POST /api/payment/verify   결제 검증 후 포인트 지급
 * POST /api/payment/webhook  포트원 웹훅 수신 (선택)
 */
import express from 'express';
import axios from 'axios';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const PORTONE_API_BASE = 'https://api.portone.io';
const API_SECRET = process.env.PORTONE_API_SECRET || '';

// 포인트 패키지 정의 (클라이언트와 동기화 필수)
const PACKAGES = {
    'pkg_500': { points: 500, priceKrw: 1000 },
    'pkg_1200': { points: 1200, priceKrw: 2000 },
    'pkg_3000': { points: 3000, priceKrw: 4500 },
    'pkg_7000': { points: 7000, priceKrw: 9000 },
};

// ── 중복 지급 방지용 처리된 paymentId 메모리 캐시 ─────────────────────────
// 실제 운영 시 Redis 또는 Firestore로 대체 권장
const processedPayments = new Set();

// ── PortOne API: 결제 단건 조회 ───────────────────────────────────────────
async function getPortOnePayment(paymentId) {
    const res = await axios.get(`${PORTONE_API_BASE}/payments/${paymentId}`, {
        headers: { Authorization: `PortOne ${API_SECRET}` },
    });
    return res.data;
}

// ── POST /api/payment/verify ──────────────────────────────────────────────
router.post('/verify', async (req, res) => {
    const { paymentId, packageId, uid } = req.body;

    if (!paymentId || !packageId || !uid) {
        return res.status(400).json({ success: false, message: '필수 파라미터 누락' });
    }

    // 중복 처리 방지
    if (processedPayments.has(paymentId)) {
        return res.status(409).json({ success: false, message: '이미 처리된 결제입니다.' });
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) {
        return res.status(400).json({ success: false, message: '알 수 없는 패키지입니다.' });
    }

    try {
        // 1. 포트원 서버로 결제 정보 조회 (위변조 방지)
        const payment = await getPortOnePayment(paymentId);

        // 2. 결제 상태 확인
        if (payment.status !== 'PAID') {
            return res.status(400).json({
                success: false,
                message: `결제 상태 이상: ${payment.status}`,
            });
        }

        // 3. 금액 검증 (위변조 방지: 클라이언트 요청금액 != 실제 결제금액 차단)
        if (payment.amount.total !== pkg.priceKrw) {
            return res.status(400).json({
                success: false,
                message: `결제 금액 불일치 (기대: ${pkg.priceKrw}, 실제: ${payment.amount.total})`,
            });
        }

        // 4. Firestore 포인트 업데이트
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        const currentWallet = userSnap.data().walletBalance || 0;
        const newWallet = currentWallet + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });

        // 5. 거래 내역 기록
        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid,
            type: 'purchase',
            amount: pkg.points,
            priceKrw: pkg.priceKrw,
            packageId,
            paymentId,
            description: `포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });

        // 6. 중복 처리 방지 캐시 등록
        processedPayments.add(paymentId);

        return res.json({
            success: true,
            points: pkg.points,
            newWallet,
        });
    } catch (err) {
        console.error('[payment/verify]', err?.response?.data || err.message);
        return res.status(500).json({ success: false, message: '결제 검증 실패' });
    }
});

// ── POST /api/payment/webhook ─────────────────────────────────────────────
// 포트원 콘솔에서 웹훅 URL: POST https://your-domain.com/api/payment/webhook
router.post('/webhook', async (req, res) => {
    const { type, data } = req.body;

    if (type === 'Transaction.Paid') {
        const { paymentId } = data;
        console.log('[webhook] Payment confirmed:', paymentId);
        // 웹훅은 verify 로직과 동일하게 처리 가능 (중복 방지로 안전)
    }

    res.sendStatus(200);
});

export default router;
