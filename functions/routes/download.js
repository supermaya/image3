import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();
const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * 인증 미들웨어 - Firebase ID 토큰 검증
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다.'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('토큰 검증 오류:', error);
    return res.status(401).json({
      success: false,
      message: '유효하지 않은 인증 토큰입니다.'
    });
  }
}

/**
 * 4K ZIP 파일 다운로드 API
 *
 * POST /api/download
 *
 * Request Body:
 * {
 *   "galleryId": "gallery_id_here"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "downloadUrl": "https://...",
 *   "expiresIn": 300,
 *   "purchased": true/false,
 *   "pointsUsed": 50/0
 * }
 */
router.post('/', verifyToken, async (req, res) => {
  const startTime = Date.now();

  try {
    const { galleryId } = req.body;
    const userId = req.user.uid;

    // 입력 검증
    if (!galleryId) {
      return res.status(400).json({
        success: false,
        message: '갤러리 ID가 필요합니다.'
      });
    }

    console.log(`📥 [다운로드 요청] 사용자: ${userId}, 갤러리: ${galleryId}`);

    // 1. 갤러리 정보 조회
    const galleryDoc = await db.collection('music').doc(galleryId).get();

    if (!galleryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: '갤러리를 찾을 수 없습니다.'
      });
    }

    const galleryData = galleryDoc.data();

    // ZIP 파일 URL 확인
    if (!galleryData.zipFileUrl) {
      return res.status(404).json({
        success: false,
        message: '이 갤러리에는 4K ZIP 파일이 없습니다.'
      });
    }

    // 2. 구매 내역 확인
    const purchaseQuery = await db.collection('purchases')
      .where('userId', '==', userId)
      .where('galleryId', '==', galleryId)
      .limit(1)
      .get();

    const alreadyPurchased = !purchaseQuery.empty;
    let pointsUsed = 0;
    let purchaseId = null;

    // 3. 구매 처리
    if (!alreadyPurchased) {
      console.log(`💰 [신규 구매] 포인트 차감 시작`);

      const DOWNLOAD_COST = 50; // 다운로드 비용

      // 트랜잭션으로 포인트 차감 및 구매 기록
      try {
        await db.runTransaction(async (transaction) => {
          // 사용자 포인트 조회
          const userRef = db.collection('users').doc(userId);
          const userDoc = await transaction.get(userRef);

          if (!userDoc.exists) {
            throw new Error('사용자 정보를 찾을 수 없습니다.');
          }

          const userData = userDoc.data();
          const dailyPoints = userData.dailyPoints || 0;
          const walletBalance = userData.walletBalance || 0;
          const totalPoints = dailyPoints + walletBalance;

          // 포인트 부족 체크
          if (totalPoints < DOWNLOAD_COST) {
            throw new Error('INSUFFICIENT_POINTS');
          }

          // 포인트 차감 (일일 포인트 우선 사용)
          let newDailyPoints = dailyPoints;
          let newWalletBalance = walletBalance;

          if (dailyPoints >= DOWNLOAD_COST) {
            newDailyPoints -= DOWNLOAD_COST;
          } else {
            const remaining = DOWNLOAD_COST - dailyPoints;
            newDailyPoints = 0;
            newWalletBalance -= remaining;
          }

          // 사용자 포인트 업데이트
          transaction.update(userRef, {
            dailyPoints: newDailyPoints,
            walletBalance: newWalletBalance
          });

          // 구매 기록 생성
          const purchaseRef = db.collection('purchases').doc();
          purchaseId = purchaseRef.id;

          transaction.set(purchaseRef, {
            userId,
            galleryId,
            galleryName: galleryData.name || '제목 없음',
            pointsUsed: DOWNLOAD_COST,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            type: 'gallery_download'
          });

          // 포인트 거래 내역 기록
          const transactionRef = db.collection('pointTransactions').doc();
          transaction.set(transactionRef, {
            userId,
            type: 'gallery_download',
            amount: -DOWNLOAD_COST,
            dailyPointsUsed: dailyPoints >= DOWNLOAD_COST ? DOWNLOAD_COST : dailyPoints,
            walletPointsUsed: dailyPoints >= DOWNLOAD_COST ? 0 : (DOWNLOAD_COST - dailyPoints),
            galleryId,
            galleryName: galleryData.name || '제목 없음',
            description: `갤러리 다운로드: ${galleryData.name || '제목 없음'}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          pointsUsed = DOWNLOAD_COST;
        });

        console.log(`✅ [구매 완료] ${DOWNLOAD_COST}P 차감, 구매 ID: ${purchaseId}`);

      } catch (error) {
        if (error.message === 'INSUFFICIENT_POINTS') {
          return res.status(402).json({
            success: false,
            message: '포인트가 부족합니다.',
            code: 'INSUFFICIENT_POINTS'
          });
        }
        throw error;
      }
    } else {
      console.log(`🔄 [재다운로드] 기존 구매 내역 사용 (무료)`);
      purchaseId = purchaseQuery.docs[0].id;
    }

    // 4. Signed URL 생성 (5분 만료)
    console.log(`🔗 [Signed URL 생성] ZIP 파일: ${galleryData.zipFileUrl}`);

    // ZIP 파일 경로 추출
    const zipUrl = new URL(galleryData.zipFileUrl);
    const pathMatch = zipUrl.pathname.match(/\/o\/(.+?)(\?|$)/);

    if (!pathMatch) {
      throw new Error('ZIP 파일 경로를 추출할 수 없습니다.');
    }

    const filePath = decodeURIComponent(pathMatch[1]);
    const file = bucket.file(filePath);

    // 파일 이름 추출
    const fileName = filePath.split('/').pop();

    // Signed URL 생성 (1분 만료 - 보안 강화)
    const expirationTime = 60; // 1분 (초 단위)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expirationTime * 1000,
      responseDisposition: `attachment; filename="${fileName}"`,
      responseType: 'application/zip'
    });

    const executionTime = Date.now() - startTime;

    console.log(`✅ [다운로드 성공] 실행 시간: ${executionTime}ms`);
    console.log(`   - 구매 여부: ${alreadyPurchased ? '재다운로드' : '신규 구매'}`);
    console.log(`   - 포인트 사용: ${pointsUsed}P`);

    // 다운로드 로그 기록 (보안 및 모니터링)
    await db.collection('downloadLogs').add({
      userId,
      galleryId,
      galleryName: galleryData.name || '제목 없음',
      isRedownload: alreadyPurchased,
      pointsCharged: pointsUsed,
      downloadedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + expirationTime * 1000),
      fileName,
      filePath
    });

    // 5. 응답 반환
    res.json({
      success: true,
      downloadUrl: signedUrl,
      expiresIn: expirationTime, // 1분 (초 단위)
      purchased: alreadyPurchased,
      pointsUsed,
      galleryName: galleryData.name || '제목 없음',
      message: alreadyPurchased
        ? '이미 구매한 갤러리입니다. 무료로 재다운로드합니다.'
        : `${pointsUsed}P를 사용하여 다운로드 링크를 생성했습니다.`
    });

  } catch (error) {
    console.error('❌ [다운로드 오류]:', error);

    // 오류 로그 저장
    try {
      await db.collection('downloadErrors').add({
        userId: req.user?.uid,
        galleryId: req.body?.galleryId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logError) {
      console.error('로그 저장 실패:', logError);
    }

    res.status(500).json({
      success: false,
      message: '다운로드 처리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 사용자의 구매 내역 조회 API
 *
 * GET /api/download/purchases
 *
 * Response:
 * {
 *   "success": true,
 *   "purchases": [
 *     {
 *       "purchaseId": "...",
 *       "galleryId": "...",
 *       "galleryName": "...",
 *       "purchasedAt": "2025-01-..."
 *     }
 *   ]
 * }
 */
router.get('/purchases', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    const purchasesSnapshot = await db.collection('purchases')
      .where('userId', '==', userId)
      .where('type', '==', 'gallery_download')
      .orderBy('purchasedAt', 'desc')
      .get();

    const purchases = [];
    purchasesSnapshot.forEach(doc => {
      const data = doc.data();
      purchases.push({
        purchaseId: doc.id,
        galleryId: data.galleryId,
        galleryName: data.galleryName,
        pointsUsed: data.pointsUsed,
        purchasedAt: data.purchasedAt?.toDate().toISOString()
      });
    });

    res.json({
      success: true,
      purchases
    });

  } catch (error) {
    console.error('구매 내역 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '구매 내역 조회 중 오류가 발생했습니다.'
    });
  }
});

export default router;
