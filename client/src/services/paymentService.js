/**
 * paymentService.js — PortOne V1 (iamport) 결제 서비스
 *
 * 가맹점 식별코드 : imp17212056
 * PG사           : html5_inicis.INIpayTest (KG이니시스 테스트)
 *
 * 결제 흐름:
 *   1. IMP.request_pay() → KG이니시스 결제창 오픈
 *   2. 결제 완료 콜백 수신 (error_code 없음 = 성공)
 *   3. imp_uid를 서버로 전송 → /api/iamport/verify 검증
 *   4. 서버 검증 성공 시에만 포인트 지급 (resolve)
 *   5. 서버 검증 실패 시 에러 메시지 표시 (reject)
 */

const IMP_UID = 'imp17212056';
const PG_PROVIDER = 'html5_inicis.INIpayTest';
const BACKEND = 'http://localhost:3001';

function getIMP() {
    if (typeof window === 'undefined' || !window.IMP) {
        throw new Error('iamport SDK가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
    }
    window.IMP.init(IMP_UID);
    return window.IMP;
}

export const isPortOneConfigured = () => true;

/**
 * 포인트 패키지 결제 (서버 검증 후 포인트 지급)
 *
 * @param {{ packageId, points, priceKrw, label }} pkg  선택한 패키지
 * @param {string} uid                                   Firebase 유저 uid
 * @param {{ email?: string, name?: string, phone?: string }} userInfo  로그인 유저 정보
 * @returns {{ success, points, newWallet }}
 */
export function purchasePoints(pkg, uid, userInfo = {}) {
    return new Promise((resolve, reject) => {
        if (!uid) return reject(new Error('로그인이 필요합니다.'));

        const IMP = getIMP();
        const merchantUid = `pixel_${uid.slice(0, 8)}_${Date.now()}`;

        // ✅ 동적 상품명: '상품 라벨 · N 포인트 (₩금액)'
        const orderName = `${pkg.label ?? 'PIXEL SUNDAY'} · ${pkg.points.toLocaleString()} 포인트 (₩${pkg.priceKrw.toLocaleString()})`;

        IMP.request_pay(
            {
                pg: PG_PROVIDER,
                pay_method: 'card',
                merchant_uid: merchantUid,
                name: orderName,                                   // ✅ 동적 상품명
                amount: pkg.priceKrw,                               // ✅ 동적 결제 금액
                buyer_name: userInfo.name || 'PIXEL USER',             // ✅ 동적 구매자명
                buyer_email: userInfo.email || 'user@pixelsunday.com',   // ✅ 동적 이메일
                buyer_tel: userInfo.phone || '01000000000',
            },
            async (response) => {
                // ── 취소 / PG 오류 ────────────────────────────────────
                if (response.error_code) {
                    console.warn('[iamport] 결제 실패:', response.error_code, response.error_msg);
                    return reject(new Error(response.error_msg || '결제가 취소되었습니다.'));
                }

                const { imp_uid } = response;
                console.info('[iamport] 결제 완료, 서버 검증 중...', imp_uid);

                // ── 서버 검증 (성공 확인 후 포인트 지급) ─────────────
                try {
                    const verifyRes = await fetch(`${BACKEND}/api/iamport/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imp_uid,
                            merchant_uid: merchantUid,
                            packageId: pkg.packageId,
                            uid,
                            amount: pkg.priceKrw,   // 기본 검증용 (API 키 미설정 시)
                        }),
                    });

                    const result = await verifyRes.json();

                    if (!result.success) {
                        console.error('[iamport] 서버 검증 실패:', result.message);
                        return reject(new Error(result.message || '결제 검증에 실패했습니다.'));
                    }

                    console.info('[iamport] 검증 완료 ✓', `+${result.points}P`, `→ ${result.newWallet}P`);
                    // 검증 성공 → 포인트 지급
                    resolve({
                        success: true,
                        points: result.points,
                        newWallet: result.newWallet,
                        paymentId: imp_uid,
                    });

                } catch (err) {
                    console.error('[iamport] verify 네트워크 오류:', err.message);
                    reject(new Error('결제 검증 중 네트워크 오류가 발생했습니다.'));
                }
            }
        );
    });
}
