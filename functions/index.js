import { onRequest } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import admin from 'firebase-admin';
// import authRoutes from './routes/auth.js';  // TODO: Admin SDK로 변환 필요
import musicRoutes from './routes/music.js';
import userRoutes from './routes/user.js';
// import uploadRoutes from './routes/upload.js';  // TODO: Admin SDK로 변환 필요

// Firebase Admin 초기화
admin.initializeApp();

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
