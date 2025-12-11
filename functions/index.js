import { onRequest } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import admin from 'firebase-admin';
// import authRoutes from './routes/auth.js';  // TODO: Admin SDK로 변환 필요
import musicRoutes from './routes/music.js';
import userRoutes from './routes/user.js';
import downloadRoutes from './routes/download.js';
// import uploadRoutes from './routes/upload.js';  // TODO: Admin SDK로 변환 필요

// Firebase Admin 초기화
admin.initializeApp();

// Firestore 인스턴스
const db = admin.firestore();

// Storage 인스턴스
const bucket = admin.storage().bucket();

// Express 앱 생성
const app = express();

// 허용된 오리진 설정
const allowedOrigins = [
  'https://pixelplanet-95dd9.web.app',
  'https://pixelplanet-95dd9.firebaseapp.com',
  /^https:\/\/.*\.pixelsunday\.com$/
];

// CORS 설정
const corsOptions = {
  origin: (origin, callback) => {
    // origin이 없는 경우(같은 오리진 요청)는 허용
    if (!origin) {
      return callback(null, true);
    }

    // 허용된 오리진 목록과 비교
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS 정책에 의해 차단되었습니다.'));
    }
  },
  credentials: true
};

// 미들웨어 설정
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우트 설정
// app.use('/auth', authRoutes);  // TODO: Admin SDK로 변환 필요
app.use('/music', musicRoutes);
app.use('/user', userRoutes);
app.use('/download', downloadRoutes);
// app.use('/upload', uploadRoutes);  // TODO: Admin SDK로 변환 필요

/**
 * Storage에 파일 업로드 헬퍼 함수
 * @param {string} destination - 저장될 경로 (예: 'gallery/image.jpg')
 * @param {Buffer} buffer - 파일 버퍼
 * @param {Object} options - 추가 옵션
 * @returns {Promise<Object>} 업로드된 파일 정보
 */
async function uploadToStorage(destination, buffer, options = {}) {
  const {
    contentType = 'application/octet-stream',
    isPublic = false,
    // 정적 리소스는 1년 캐시, 동적 콘텐츠는 1시간 캐시
    cacheControl = 'public, max-age=31536000, immutable'
  } = options;

  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl,
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    },
    resumable: false
  });

  // 공개 파일인 경우 public 설정
  if (isPublic) {
    await file.makePublic();
  }

  return {
    name: file.name,
    bucket: file.bucket.name,
    publicUrl: isPublic ? `https://storage.googleapis.com/${file.bucket.name}/${file.name}` : null
  };
}

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 파일 업로드 예시 엔드포인트 (Multer 사용 시)
// import multer from 'multer';
// const upload = multer({ storage: multer.memoryStorage() });
//
// app.post('/upload', upload.single('file'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: '파일이 없습니다.' });
//     }
//
//     const fileExtension = req.file.originalname.split('.').pop();
//     const fileName = `${Date.now()}.${fileExtension}`;
//     const destination = `gallery/${fileName}`;
//
//     const result = await uploadToStorage(destination, req.file.buffer, {
//       contentType: req.file.mimetype,
//       isPublic: true,
//       cacheControl: 'public, max-age=31536000, immutable'
//     });
//
//     res.json({ success: true, file: result });
//   } catch (error) {
//     console.error('업로드 에러:', error);
//     res.status(500).json({ success: false, message: '업로드 실패' });
//   }
// });

// 404 에러 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '요청한 리소스를 찾을 수 없습니다.'
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('서버 에러:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '서버 내부 오류가 발생했습니다.'
  });
});

// Firebase Functions으로 익스포트
export const api = onRequest(app);

/**
 * 매일 자정(한국 시간) 일일 포인트 만료 처리
 *
 * 스케줄: 매일 00:00 KST (Asia/Seoul 시간대)
 *
 * 작동 방식:
 * 1. dailyPoints가 0보다 큰 모든 사용자 조회
 * 2. 각 사용자의 dailyPoints를 0으로 초기화
 * 3. 만료된 포인트를 pointTransactions에 기록
 * 4. 만료 통계를 로그에 기록
 */
export const expireDailyPoints = onSchedule({
  schedule: '0 0 * * *',  // 매일 자정
  timeZone: 'Asia/Seoul',  // 한국 시간대
  memory: '256MiB',
  timeoutSeconds: 540,  // 9분
}, async (event) => {
  const startTime = Date.now();
  console.log('⏰ [일일 포인트 만료] 작업 시작:', new Date().toISOString());

  try {
    // dailyPoints가 0보다 큰 모든 사용자 조회
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('dailyPoints', '>', 0).get();

    if (snapshot.empty) {
      console.log('✅ [일일 포인트 만료] 만료할 포인트가 없습니다.');
      return {
        success: true,
        expiredUsers: 0,
        totalExpiredPoints: 0,
        message: '만료할 일일 포인트가 없습니다.'
      };
    }

    console.log(`📊 [일일 포인트 만료] 처리 대상 사용자: ${snapshot.size}명`);

    let expiredCount = 0;
    let totalExpiredPoints = 0;
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // 배치 작업 제한 (Firestore 배치는 최대 500개)
    const batchLimit = 500;
    let operationCount = 0;

    for (const userDoc of snapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const dailyPoints = userData.dailyPoints || 0;

      if (dailyPoints > 0) {
        // 사용자의 dailyPoints를 0으로 설정
        batch.update(userDoc.ref, {
          dailyPoints: 0,
          lastDailyPointsExpiry: now
        });
        operationCount++;

        // 거래 내역 추가
        const transactionRef = db.collection('pointTransactions').doc();
        batch.set(transactionRef, {
          userId,
          type: 'daily_expire',
          pointType: 'daily',
          amount: -dailyPoints,
          description: '일일 포인트 자동 만료 (자정)',
          createdAt: now
        });
        operationCount++;

        expiredCount++;
        totalExpiredPoints += dailyPoints;

        // 배치 제한에 도달하면 커밋 후 새 배치 시작
        if (operationCount >= batchLimit - 50) {
          await batch.commit();
          console.log(`🔄 [일일 포인트 만료] 중간 커밋 완료 (${expiredCount}명 처리됨)`);
          operationCount = 0;
        }
      }
    }

    // 남은 배치 커밋
    if (operationCount > 0) {
      await batch.commit();
    }

    const executionTime = Date.now() - startTime;

    console.log('✅ [일일 포인트 만료] 작업 완료');
    console.log(`   - 영향받은 사용자: ${expiredCount}명`);
    console.log(`   - 만료된 포인트: ${totalExpiredPoints}P`);
    console.log(`   - 실행 시간: ${executionTime}ms`);

    // 만료 통계를 별도 컬렉션에 저장 (선택사항)
    await db.collection('dailyPointsExpiryLogs').add({
      date: new Date().toISOString().split('T')[0],
      expiredUsers: expiredCount,
      totalExpiredPoints,
      executionTime,
      completedAt: now
    });

    return {
      success: true,
      expiredUsers: expiredCount,
      totalExpiredPoints,
      executionTime,
      message: `${expiredCount}명의 사용자 포인트(${totalExpiredPoints}P)가 만료되었습니다.`
    };

  } catch (error) {
    console.error('❌ [일일 포인트 만료] 오류 발생:', error);

    // 오류 로그 저장
    await db.collection('dailyPointsExpiryErrors').add({
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('로그 저장 실패:', err));

    throw error;
  }
});

/**
 * 파일 확장자에 따라 적절한 Cache-Control 값을 반환
 * @param {string} fileName - 파일 이름
 * @returns {string} Cache-Control 헤더 값
 */
function getCacheControlForFile(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();

  // 정적 리소스 - 1년 캐시 (immutable)
  const staticAssets = [
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'js', 'css', 'mjs'
  ];

  // 반정적 리소스 - 1시간 캐시
  const semiStaticAssets = [
    'json', 'xml', 'txt', 'csv',
    'mp3', 'mp4', 'webm', 'ogg', 'wav', 'flac',
    'pdf', 'doc', 'docx', 'xls', 'xlsx'
  ];

  // HTML - 즉시 재검증
  const dynamicAssets = ['html', 'htm'];

  if (staticAssets.includes(extension)) {
    return 'public, max-age=31536000, immutable';
  } else if (semiStaticAssets.includes(extension)) {
    return 'public, max-age=3600';
  } else if (dynamicAssets.includes(extension)) {
    return 'public, max-age=0, must-revalidate';
  }

  // 기본값 - 1시간 캐시
  return 'public, max-age=3600';
}

/**
 * Storage에 파일이 업로드되면 자동으로 캐시 메타데이터를 설정하는 트리거
 *
 * 작동 방식:
 * 1. Storage에 새 파일이 업로드됨
 * 2. 이 함수가 자동 실행됨
 * 3. 파일 확장자를 확인하여 적절한 Cache-Control 값 결정
 * 4. 파일 메타데이터에 Cache-Control 설정
 */
export const setStorageCacheMetadata = onObjectFinalized(async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const contentType = event.data.contentType;

  console.log(`📁 파일 업로드 감지: ${filePath}`);

  // 이미 메타데이터가 설정되어 있는지 확인
  const existingCacheControl = event.data.metadata?.cacheControl;

  if (existingCacheControl) {
    console.log(`⏭️  이미 캐시 설정됨: ${filePath} (${existingCacheControl})`);
    return null;
  }

  // 파일 확장자에 따른 Cache-Control 값 결정
  const cacheControl = getCacheControlForFile(filePath);

  try {
    // Storage 버킷 참조
    const bucket = admin.storage().bucket(fileBucket);
    const file = bucket.file(filePath);

    // 메타데이터 업데이트
    await file.setMetadata({
      cacheControl: cacheControl,
      metadata: {
        autoSetCacheControl: 'true',
        updatedAt: new Date().toISOString()
      }
    });

    console.log(`✅ 캐시 메타데이터 설정 완료: ${filePath}`);
    console.log(`   Cache-Control: ${cacheControl}`);
    console.log(`   Content-Type: ${contentType}`);

    return {
      success: true,
      filePath,
      cacheControl
    };

  } catch (error) {
    console.error(`❌ 메타데이터 설정 실패: ${filePath}`, error);

    // 에러가 발생해도 함수는 성공으로 처리 (재시도 방지)
    return {
      success: false,
      filePath,
      error: error.message
    };
  }
});

/**
 * Storage의 gallery/image 폴더에서 사용되지 않는 이미지를 정리하는 HTTP 함수
 *
 * 사용법:
 * - GET 요청: 삭제할 이미지 목록만 확인 (시뮬레이션 모드)
 * - POST 요청: 실제로 이미지 삭제 실행
 */
export const cleanupUnusedImages = onRequest({
  memory: '512MiB',
  timeoutSeconds: 540,  // 9분
}, async (req, res) => {
  const startTime = Date.now();
  const dryRun = req.method === 'GET';

  console.log('🔍 [이미지 정리] 작업 시작:', new Date().toISOString());
  console.log(`모드: ${dryRun ? '시뮬레이션 (삭제 안 함)' : '실제 삭제'}`);

  try {
    // 1. Storage의 gallery/image 폴더에 있는 모든 이미지 파일 목록 가져오기
    console.log('📂 Storage에서 gallery/image 폴더의 이미지 목록 가져오는 중...');
    const [files] = await bucket.getFiles({
      prefix: 'gallery/image/'
    });

    console.log(`✅ Storage에서 ${files.length}개의 파일 발견`);

    // 파일 URL 추출
    const storageImages = new Set();
    const storageImageDetails = new Map();

    files.forEach(file => {
      const fileName = file.name;
      // gallery/image/ 폴더 내의 파일만 처리 (하위 폴더 제외)
      if (fileName.startsWith('gallery/image/') && !fileName.endsWith('/')) {
        // Public URL 생성
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        storageImages.add(publicUrl);
        storageImageDetails.set(publicUrl, {
          name: fileName,
          size: file.metadata.size,
          updated: file.metadata.updated
        });
      }
    });

    console.log(`📊 gallery/image 폴더의 이미지 파일: ${storageImages.size}개`);

    // 2. Music 데이터베이스에서 사용 중인 imageUrl 목록 가져오기
    console.log('🎵 Music 데이터베이스에서 사용 중인 이미지 URL 가져오는 중...');
    const musicSnapshot = await db.collection('music').get();

    const usedImages = new Set();
    musicSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.imageUrl && data.imageUrl.trim() !== '') {
        usedImages.add(data.imageUrl);
      }
    });

    console.log(`✅ Music 데이터베이스에서 ${usedImages.size}개의 이미지 URL 발견`);
    console.log(`   (총 ${musicSnapshot.size}개의 음악 항목 확인)`);

    // 3. 사용되지 않는 이미지 찾기
    console.log('🔍 사용되지 않는 이미지 비교 중...');
    const unusedImages = [];

    for (const imageUrl of storageImages) {
      if (!usedImages.has(imageUrl)) {
        const details = storageImageDetails.get(imageUrl);
        unusedImages.push({
          url: imageUrl,
          ...details
        });
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 분석 결과:');
    console.log(`총 이미지 파일: ${storageImages.size}개`);
    console.log(`사용 중인 이미지: ${usedImages.size}개`);
    console.log(`사용되지 않는 이미지: ${unusedImages.length}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (unusedImages.length === 0) {
      console.log('✅ 삭제할 이미지가 없습니다.');
      return res.json({
        success: true,
        deletedCount: 0,
        message: '사용되지 않는 이미지가 없습니다.',
        stats: {
          totalImages: storageImages.size,
          usedImages: usedImages.size,
          unusedImages: 0
        }
      });
    }

    // 사용되지 않는 이미지 목록 출력
    console.log('🗑️  사용되지 않는 이미지 목록:');
    unusedImages.forEach((img, index) => {
      const sizeInKB = (parseInt(img.size) / 1024).toFixed(2);
      console.log(`${index + 1}. ${img.name} (${sizeInKB} KB)`);
    });

    // 4. 삭제 작업 (POST 요청인 경우에만)
    if (dryRun) {
      console.log('⚠️  시뮬레이션 모드: 실제로 삭제하지 않습니다.');
      return res.json({
        success: true,
        dryRun: true,
        unusedImages: unusedImages.map(img => ({
          name: img.name,
          url: img.url,
          size: parseInt(img.size)
        })),
        message: `${unusedImages.length}개의 사용되지 않는 이미지를 찾았습니다.`,
        stats: {
          totalImages: storageImages.size,
          usedImages: usedImages.size,
          unusedImages: unusedImages.length
        }
      });
    }

    // 실제 삭제 진행
    console.log('🗑️  실제 삭제 시작...');
    let deletedCount = 0;
    const errors = [];

    for (const img of unusedImages) {
      try {
        const file = bucket.file(img.name);
        await file.delete();
        deletedCount++;
        console.log(`✅ 삭제됨: ${img.name}`);
      } catch (error) {
        console.error(`❌ 삭제 실패: ${img.name}`, error.message);
        errors.push({
          name: img.name,
          error: error.message
        });
      }
    }

    const executionTime = Date.now() - startTime;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 삭제 완료!');
    console.log(`성공: ${deletedCount}개`);
    console.log(`실패: ${errors.length}개`);
    console.log(`실행 시간: ${executionTime}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 삭제 로그 저장 (선택사항)
    await db.collection('imageCleanupLogs').add({
      date: new Date().toISOString().split('T')[0],
      deletedCount,
      errorCount: errors.length,
      totalImages: storageImages.size,
      usedImages: usedImages.size,
      unusedImages: unusedImages.length,
      executionTime,
      errors: errors.length > 0 ? errors : null,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({
      success: true,
      deletedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${deletedCount}개의 이미지가 삭제되었습니다.`,
      stats: {
        totalImages: storageImages.size,
        usedImages: usedImages.size,
        unusedImages: unusedImages.length,
        executionTime
      }
    });

  } catch (error) {
    console.error('❌ [이미지 정리] 오류 발생:', error);

    // 오류 로그 저장
    await db.collection('imageCleanupErrors').add({
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('로그 저장 실패:', err));

    return res.status(500).json({
      success: false,
      message: '이미지 정리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});
