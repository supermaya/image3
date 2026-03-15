/**
 * iamportPayment.js — iamport V1 결제 검증 + 포인트 지급
 *
 * POST /api/iamport/verify
 *   1) iamport REST API로 imp_uid 조회 (실제 결제 상태 확인)
 *   2) 금액 위변조 방지 (패키지 금액 vs 실제 결제 금액 비교)
 *   3) Firestore walletBalance 업데이트
 *   4) pointTransactions 기록
 */
import express from 'express';
import axios from 'axios';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';

const router = express.Router();

const IMP_KEY = process.env.IAMPORT_API_KEY || '';
const IMP_SECRET = process.env.IAMPORT_API_SECRET || '';
const IAMPORT_BASE = 'https://api.iamport.kr';

// 실제 키 여부 확인 (플레이스홀더 'XXXX...' 제외)
const hasRealKeys = IMP_KEY && !IMP_KEY.includes('X')
    && IMP_SECRET && !IMP_SECRET.includes('X');

const PACKAGES = {
    'pkg_500': { points: 500, priceKrw: 1000 },
    'pkg_1200': { points: 1200, priceKrw: 2000 },
    'pkg_3000': { points: 3000, priceKrw: 4500 },
    'pkg_7000': { points: 7000, priceKrw: 9000 },
};

const processed = new Set(); // 중복 지급 방지

// ── iamport 액세스 토큰 발급 ────────────────────────────────────────
async function getIamportToken() {
    const { data } = await axios.post(`${IAMPORT_BASE}/users/getToken`, {
        imp_key: IMP_KEY,
        imp_secret: IMP_SECRET,
    });
    if (data.code !== 0) throw new Error(`iamport 토큰 발급 실패: ${data.message}`);
    return data.response.access_token;
}

// ── iamport 결제 단건 조회 ──────────────────────────────────────────
async function getIamportPayment(impUid, token) {
    const { data } = await axios.get(`${IAMPORT_BASE}/payments/${impUid}`, {
        headers: { Authorization: token },
    });
    if (data.code !== 0) throw new Error(`결제 조회 실패: ${data.message}`);
    return data.response;
}

// ── POST /api/iamport/verify ────────────────────────────────────────
router.post('/verify', async (req, res) => {
    const { imp_uid, merchant_uid, packageId, uid, amount } = req.body;

    if (!imp_uid || !packageId || !uid) {
        return res.status(400).json({ success: false, message: '필수 파라미터 누락' });
    }
    if (processed.has(imp_uid)) {
        return res.status(409).json({ success: false, message: '이미 처리된 결제입니다.' });
    }

    const pkg = PACKAGES[packageId];
    if (!pkg) return res.status(400).json({ success: false, message: '알 수 없는 패키지' });

    try {
        // ── iamport REST API 검증 (실제 API 키가 설정된 경우만) ─────
        if (hasRealKeys) {
            const token = await getIamportToken();
            const payment = await getIamportPayment(imp_uid, token);

            if (payment.status !== 'paid') {
                return res.status(400).json({
                    success: false,
                    message: `결제 상태 이상: ${payment.status}`,
                });
            }
            if (payment.amount !== pkg.priceKrw) {
                return res.status(400).json({
                    success: false,
                    message: `금액 불일치 (기대: ${pkg.priceKrw}, 실제: ${payment.amount})`,
                });
            }
        } else {
            // ── API 키 미설정 시: 콜백 amount로 기본 검증 ────────────
            console.warn('[iamport] API 키 미설정 — 콜백 금액으로 기본 검증');
            const clientAmount = Number(amount);
            if (clientAmount !== pkg.priceKrw) {
                return res.status(400).json({
                    success: false,
                    message: `금액 불일치 (기대: ${pkg.priceKrw}, 수신: ${clientAmount})`,
                });
            }
        }

        // ── Firestore 포인트 업데이트 ─────────────────────────────────
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }

        const currentWallet = userSnap.data().walletBalance || 0;
        const newWallet = currentWallet + pkg.points;
        await updateDoc(userRef, { walletBalance: newWallet });

        // ── 거래 내역 기록 ─────────────────────────────────────────────
        await addDoc(collection(db, 'pointTransactions'), {
            userId: uid,
            type: 'purchase',
            amount: pkg.points,
            priceKrw: pkg.priceKrw,
            packageId,
            impUid: imp_uid,
            merchantUid: merchant_uid || '',
            provider: 'iamport_v1',
            pg: 'html5_inicis',
            description: `[KG이니시스] 포인트 구매 (+${pkg.points}P)`,
            createdAt: serverTimestamp(),
        });

        processed.add(imp_uid);

        return res.json({ success: true, points: pkg.points, newWallet });

    } catch (err) {
        console.error('[iamport/verify]', err?.response?.data || err.message);
        return res.status(500).json({ success: false, message: err.message || '검증 실패' });
    }
});

export default router;
