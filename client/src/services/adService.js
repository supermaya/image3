/**
 * adService.js — Google GPT 리워드 광고 서비스
 *
 * ┌ VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT_REWARDED 설정 시 → 실제 광고
 * └ 미설정 시 → Google 공식 데모 슬롯으로 테스트 광고 자동 집행
 *
 * 테스트 슬롯:  /21775744923/example-rewarded
 * 실제 슬롯  :  /<publisherId>/<slotId>
 */

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
const SLOT_ID = import.meta.env.VITE_ADSENSE_SLOT_REWARDED || '';

// Publisher ID 숫자만 추출 (ca-pub-XXXXXXXX → XXXXXXXX)
const publisherId = CLIENT.replace('ca-pub-', '').replace(/X+/g, '');

const isRealConfigured = () =>
    publisherId.length > 5 && SLOT_ID.length > 5;

// Google 공식 테스트/데모 슬롯 (광고 계정 없이 사용 가능)
const DEMO_SLOT = '/21775744923/example-rewarded';

function getAdUnitPath() {
    return isRealConfigured()
        ? `/${publisherId}/${SLOT_ID}`
        : DEMO_SLOT;
}

// GPT apiReady 대기
function waitForGPT(timeout = 6000) {
    return new Promise((resolve, reject) => {
        if (window.googletag?.apiReady) { resolve(); return; }
        const start = Date.now();
        const check = setInterval(() => {
            if (window.googletag?.apiReady) { clearInterval(check); resolve(); }
            else if (Date.now() - start > timeout) {
                clearInterval(check);
                reject(new Error('GPT 로드 타임아웃'));
            }
        }, 100);
    });
}

/**
 * 리워드 광고 표시
 *
 * 콜백:
 *   onStart({ simulation })  — 광고/시뮬레이션 시작 알림
 *   onRewarded()             — 광고 완료, 보상 트리거
 *   onFailed(reason)         — 실패/닫힘 (reason: 'closed' | 'error')
 */
export async function loadAndShowRewardedAd({ onStart, onRewarded, onFailed }) {
    try {
        await waitForGPT();
    } catch {
        console.warn('[AdService] GPT 미로드 → 시뮬레이션 폴백');
        onStart?.({ simulation: true });
        return;
    }

    window.googletag = window.googletag || { cmd: [] };

    window.googletag.cmd.push(() => {
        const gt = window.googletag;
        const adUnitPath = getAdUnitPath();

        const slot = gt.defineOutOfPageSlot(
            adUnitPath,
            gt.enums.OutOfPageFormat.REWARDED
        );

        if (!slot) {
            // 브라우저가 리워드 포맷 미지원 → 시뮬레이션 폴백
            console.warn('[AdService] REWARDED 슬롯 미지원 → 시뮬레이션');
            onStart?.({ simulation: true });
            return;
        }

        slot.addService(gt.pubads());

        // 테스트 모드
        if (!isRealConfigured()) {
            gt.pubads().setTargeting('test', 'true');
        }

        let adStarted = false;

        // ── 광고 로드 타임아웃 (6초) ─────────────────────────────────
        const timeout = setTimeout(() => {
            if (!adStarted) {
                console.warn('[AdService] rewardedSlotReady 미응답 → 시뮬레이션 폴백');
                try { gt.destroySlots([slot]); } catch { }
                onFailed?.('timeout');
            }
        }, 6000);

        // ── 이벤트 핸들러 ──────────────────────────────────────────
        gt.pubads().addEventListener('rewardedSlotReady', (e) => {
            adStarted = true;
            clearTimeout(timeout);
            onStart?.({ simulation: false });
            e.makeRewardedVisible();
        });

        gt.pubads().addEventListener('rewardedSlotGranted', () => {
            clearTimeout(timeout);
            gt.destroySlots([slot]);
            onRewarded?.();
        });

        gt.pubads().addEventListener('rewardedSlotClosed', () => {
            clearTimeout(timeout);
            gt.destroySlots([slot]);
            onFailed?.('closed');
        });

        // 광고 요청 자체 실패 (인벤토리 없음 등)
        gt.pubads().addEventListener('slotRenderEnded', (e) => {
            if (e.slot === slot && e.isEmpty && !adStarted) {
                clearTimeout(timeout);
                console.warn('[AdService] 광고 인벤토리 없음 → 시뮬레이션 폴백');
                try { gt.destroySlots([slot]); } catch { }
                onFailed?.('empty');
            }
        });

        gt.enableServices();
        gt.display(slot);
    });
}

// 외부에서 설정 여부 확인용
export const AD_CONFIGURED = isRealConfigured();
export const AD_USING_DEMO = !isRealConfigured(); // 데모 슬롯 사용 중 여부
