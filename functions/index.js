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
import { readFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
// JSON 파일 읽기 제거 — fal.ai 등록 워크플로우 SDK 직접 호출으로 통일

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
  'https://pixelsunday.com',              // 루트 도메인
  /^https:\/\/.*\.pixelsunday\.com$/,     // 서브도메인 (www.pixelsunday.com 등)
  // ── 개발 환경 (localhost) ────────────────────────────────────────────────
  'http://localhost:5173',                // Vite 기본 포트
  'http://localhost:5174',                // Vite 포트 충돌 시 자동 할당
  'http://localhost:3000',                // 기타 개발 서버
  /^http:\/\/localhost:\d+$/,             // localhost 모든 포트 허용
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

// ── ComfyUI / Fal.ai 라우터 ──────────────────────────────────────────────────
// @fal-ai/client SDK 직접 사용 — JSON 파일 읽기 코드 완전 제거
const __filename = fileURLToPath(import.meta.url);
const __dirname_cf = dirname(__filename);
const WORKFLOWS_DIR = resolve(__dirname_cf, './workflows');

// ── fal.ai 엔드포인트 (모든 스타일 공통) ────────────────────────────────────
const FAL_ENDPOINT = 'fal-ai/z-image/turbo';

// ── 스타일 프리셋 텍스트 (워크플로우 JSON의 핵심 키워드 추출) ─────────────────
// 프롬프트 조립: [presetText, userPrompt].filter(Boolean).join(', ')
const STYLE_PRESETS = {
  KoreanGirl: `{검은 머리|갈색 머리|금발|분홍 머리|은발}, {옅은 화장|스모키 화장|광택 입술과 블러셔|자연스러운 화장}을 한 20대 한국 여성이 {다이아몬드 귀걸이|진주 목걸이|선그래스|액세서리 없음}, (긴 다리, 짧은 상체, 좁은 허리, 자연스럽게 늘어진 작은 가슴), (성적으로 암시적인), 가벼운 미소, 매혹적인 미소, 윤기 나는 입술을 묘사한 아름다운 포스터. {크롭탑|스트랩리스 톱|레이스 디테일 탑|캐미솔 레이어드 탑}과 {마이크로 미니스커트|하이웨이스트 미니스커트|테일러드 쇼츠|로우라이즈 패션 스커트}를 입고 {세련된 스트리트 패션 스타일|하이패션 런웨이 스타일|인스타그램 패션 인플루언서 스타일|트렌디한 도시 패션 스타일},{자신감 있는 포즈|자연스러운 워킹 포즈|스타일링을 강조하는 포즈|패션 화보 촬영 장면|스트리트 패션 스냅 스타일},배경에는 {야간 도시 불빛|최고급 쇼핑몰|대도시 골목길|현대적인 아파트 옥상|영화 스튜디오 조명|해변 일몰 풍경|해변 일출 풍경}.`,
  InstaCeleb: `{크롭 니트 탑|스트랩리스 패션 톱|레이스 포인트 패션 탑|시스루 레이어드 캐미솔}과 {마이크로 미니스커트|슬림핏 미니스커트|패션 쇼츠|로우라이즈 트렌디 스커트}를 입은 한국 여성,{인스타그램 패션 인플루언서 스타일|트렌디 스트리트 패션|하이패션 매거진 스타일|도시적인 패션 화보 스타일},자연스러운 포즈, 카메라를 향한 자신감 있는 시선,패션 화보 촬영, 스트리트 스타일 스냅, 트렌디한 스타일링 강조`,
};

const comfyRouter = express.Router();

// GET /comfy/health — 상태 확인 (fal.ai 등록 워크플로우 방식에서는 항상 ok)
comfyRouter.get('/health', async (req, res) => {
  const falKey = process.env.FAL_KEY;
  if (falKey) {
    return res.json({ ok: true, via: 'fal.ai' });
  }
  res.status(503).json({ ok: false, error: 'FAL_KEY 미설정' });
});

// GET /comfy/workflows — fal.ai 등록 워크플로우 목록 (STYLE_ENDPOINTS 기준)
comfyRouter.get('/workflows', (req, res) => {
  const workflows = Object.entries(STYLE_ENDPOINTS).map(([id]) => ({
    id,
    name: id.replace(/([A-Z])/g, ' $1').trim(), // 'KoreanGirl' → 'Korean Girl'
  }));
  res.json({ workflows });
});

// GET /comfy/ping — 헬스체크 (FAL_KEY 있으면 항상 온라인)
comfyRouter.get('/ping', async (req, res) => {
  const falKey = process.env.FAL_KEY;
  if (falKey) {
    return res.json({ ok: true, via: 'fal.ai', message: 'Fal.ai 서버리스 활성화됨' });
  }
  return res.status(503).json({ ok: false, error: 'FAL_KEY 미설정' });
});

// POST /comfy/generate — fal.ai 등록 워크플로우 직접 호출
// FAL_KEY 환경변수 필수 (로컬 ComfyUI / ngrok 방식 폐기)
comfyRouter.post('/generate', async (req, res) => {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return res.status(503).json({ error: 'FAL_KEY 환경변수가 설정되지 않았습니다.' });
  }
  return await generateWithFal(falKey, req, res);
});

// (resolveResolution · buildFalInput · getFalEndpoint 제거 — generateWithFal 내부로 통합)

/**
 * fal-ai/z-image/turbo 직접 호출
 *
 * - 스타일 프리셋 텍스트 + 유저 프롬프트 조립 → input.prompt 주입
 * - sync_mode:true → 즉시 이미지 URL 반환
 * - 오프라인/연결 실패 → 즉시 503, 재시도 루프 없음
 *
 * @param {string} apiKey — FAL_KEY
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function generateWithFal(apiKey, req, res) {
  try {
    console.log('[comfy/generate] fal-ai/z-image/turbo 호출 시작...');

    // ── 0. 요청 파라미터 추출 ──────────────────────────────────────────
    const uid         = req.body.uid;
    const userName    = req.body.userName;
    const aspectRatio = req.body.aspectRatio || '9:16 (Slim Vertical)';
    const userPrompt  = (req.body.prompt || '').trim();
    const workflowId  = req.body.workflowId || 'KoreanGirl';

    if (!uid) return res.status(401).json({ error: '사용자 UID가 필요합니다.' });

    // ── 1. 스타일 프리셋 + 유저 프롬프트 조립 ────────────────────────────
    const presetText  = STYLE_PRESETS[workflowId] || STYLE_PRESETS.KoreanGirl;
    const finalPrompt = [presetText, userPrompt].filter(Boolean).join(', ');
    console.log(`[fal.ai] workflowId: ${workflowId} | prompt 길이: ${finalPrompt.length}자`);

    // ── 2. image_size 동적 결정 ───────────────────────────────────────
    const is16x9    = typeof aspectRatio === 'string' && aspectRatio.startsWith('16:9');
    const imageSize = is16x9
      ? { width: 1920, height: 1080 }
      : { width: 1080, height: 1920 };

    // ── 3. fal.ai SDK 호출 ────────────────────────────────────────────
    fal.config({ credentials: apiKey });

    let result;
    try {
      result = await fal.subscribe(FAL_ENDPOINT, {
        input: {
          prompt:                 finalPrompt,
          image_size:             imageSize,
          num_inference_steps:    8,
          sync_mode:              true,
          enable_safety_checker:  true,
        },
        logs: true,
        onQueueUpdate: (u) => {
          if (u.status === 'IN_QUEUE')    console.log(`[fal.ai] 대기 position=${u.queue_position}`);
          if (u.status === 'IN_PROGRESS') {
            const logs = (u.logs || []).map(l => l.message).join(' | ');
            console.log('[fal.ai] 실행 중...', logs ? `logs: ${logs}` : '');
          }
        },
      });
    } catch (falErr) {
      const bodyStr = falErr?.body
        ? (typeof falErr.body === 'string' ? falErr.body : JSON.stringify(falErr.body, null, 2))
        : '(body 없음)';
      console.error('[fal.ai] ❌ 호출 실패:', falErr.message, '| body:', bodyStr);

      // 네트워크/오프라인 오류 감지 → 503 즉시 반환 (재시도 없음)
      const isOffline =
        falErr?.status === 503 ||
        falErr?.message?.includes('ECONNREFUSED') ||
        falErr?.message?.includes('fetch failed') ||
        falErr?.message?.includes('network');

      return res.status(isOffline ? 503 : 422).json({
        error: isOffline
          ? '서비스 점검 중 (오프라인): fal.ai에 연결할 수 없습니다.'
          : `Fal.ai 호출 실패 (${falErr.status || 'unknown'}): ${falErr.message}`,
        detail: bodyStr,
      });
    }

    const data = result?.data || result;

    // sync_mode=true: data.images[0].url 로 즉시 반환
    const falImageUrl = data?.images?.[0]?.url;

    if (!falImageUrl) {
      console.error('[fal.ai] 이미지 URL 없음:', JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: 'fal.ai에서 이미지 URL을 받지 못했습니다.' });
    }
    console.log('[fal.ai] 생성 완료, URL:', falImageUrl);

    // ── 4. 이미지 다운로드 ────────────────────────────────────────────
    const imgRes = await fetch(falImageUrl);
    if (!imgRes.ok) throw new Error('fal.ai 이미지 다운로드 실패');
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // ── 5. sharp로 원본 JPEG + 썸네일(600px) 생성 ────────────────────
    const [fullBuffer, thumbBuffer] = await Promise.all([
      sharp(imgBuffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer(),
      sharp(imgBuffer).resize({ width: 600, withoutEnlargement: true })
                      .jpeg({ quality: 75, mozjpeg: true }).toBuffer(),
    ]);

    // ── 6. Firebase Storage 업로드 ──────────────────────────────────────
    const bucketInst = admin.storage().bucket();
    const safeUser   = (userName || uid).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts         = Date.now();
    const rand       = Math.floor(Math.random() * 1e5).toString().padStart(5, '0');

    const fullPath  = `user_img/${safeUser}/gallery/${ts}_${rand}.jpg`;
    const thumbPath = `user_img/${safeUser}/gallery/thumb_${ts}_${rand}.jpg`;

    const uploadMeta = {
      contentType: 'image/jpeg',
      metadata: { workflowId, aspectRatio, prompt: userPrompt.slice(0, 200) },
    };

    const [fullFile, thumbFile] = [bucketInst.file(fullPath), bucketInst.file(thumbPath)];
    await Promise.all([
      fullFile.save(fullBuffer,  uploadMeta),
      thumbFile.save(thumbBuffer, uploadMeta),
    ]);

    const makePublicUrl = (path) =>
      `https://firebasestorage.googleapis.com/v0/b/${bucketInst.name}/o/${encodeURIComponent(path)}?alt=media`;

    const fullUrl  = makePublicUrl(fullPath);
    const thumbUrl = makePublicUrl(thumbPath);

    // ── 7. Firestore 저장 ────────────────────────────────────────────
    const dbInst = admin.firestore();

    const galRef = await dbInst.collection('users').doc(uid).collection('galleries').add({
      fullUrl, thumbUrl, fullPath, thumbPath,
      prompt: userPrompt, workflowId,
      workflowName: workflowId.replace(/_api$/, '').replace(/_/g, ' '),
      aspectRatio,
      via: 'fal-ai/z-image/turbo',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const musicDocId = await saveToUserGenGallery(dbInst, uid, safeUser, fullUrl, thumbUrl);
    if (musicDocId) {
      await galRef.update({ musicDocId }).catch(() => {});
    }

    // ── 8. 포인트 1P 차감 ───────────────────────────────────────────
    let pointResult = { success: false, reason: 'not_attempted' };
    try {
      const userRef = dbInst.collection('users').doc(uid);
      pointResult = await dbInst.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) return { success: false, reason: 'user_not_found' };

        const d = userSnap.data();
        const daily  = d.dailyPoints  ?? 0;
        const wallet = d.walletBalance ?? 0;
        const total  = daily + wallet;

        if (total < 1) return { success: false, reason: 'insufficient_points' };

        const dailyDeduct  = Math.min(daily, 1);
        const walletDeduct = 1 - dailyDeduct;
        tx.update(userRef, {
          dailyPoints:   admin.firestore.FieldValue.increment(-dailyDeduct),
          walletBalance: admin.firestore.FieldValue.increment(-walletDeduct),
        });
        return { success: true, dailyDeduct, walletDeduct };
      });
    } catch (ptErr) {
      console.warn('[comfy/generate] 포인트 차감 실패 (이미지는 저장됨):', ptErr.message);
    }

    console.log('[comfy/generate] 완료. docId:', galRef.id, '| 포인트:', pointResult);

    // ── 9. 클라이언트 응답 ──────────────────────────────────────────
    return res.json({
      done:      true,
      via:       'fal-ai/z-image/turbo',
      thumbUrl,
      fullUrl,
      docId:     galRef.id,
      musicDocId,
      pointResult,
    });

  } catch (err) {
    const bodyStr = err?.body
      ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body))
      : null;
    console.error('[comfy/generate] 오류:', err.message);
    return res.status(503).json({
      error:  `이미지 생성 실패: ${err.message}`,
      detail: bodyStr,
    });
  }
}

// ── UserGen 메인 갤러리 통합 헬퍼 ───────────────────────────────────────────────
// music/{docId} + music/{docId}/images subcollection 저장— 클라이언트 saveToMainGallery와 동일
// 로직이나, Admin SDK를 쓰면 보안적으로 더 안정적

async function saveToUserGenGallery(db, uid, safeUserName, fullUrl, thumbUrl) {
  const USER_GEN_CATEGORY = 'UserGen';
  try {
    // UserGen 카테고리 직접 찾기
    const catSnap = await db.collection('categories')
      .where('name', '==', USER_GEN_CATEGORY).limit(1).get();

    let categoryId;
    if (catSnap.empty) {
      const newCat = await db.collection('categories').add({
        name: USER_GEN_CATEGORY, topSection: 'visual-mode',
        classification: 'ai-generated', isUserGenerated: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      categoryId = newCat.id;
    } else {
      categoryId = catSnap.docs[0].id;
    }

    // 유저의 music 도큐먼트 찾기
    const musicSnap = await db.collection('music')
      .where('category', '==', categoryId)
      .where('name', '==', safeUserName).limit(1).get();

    let musicDocId;
    if (!musicSnap.empty) {
      musicDocId = musicSnap.docs[0].id;
      await db.collection('music').doc(musicDocId).update({
        imageUrl: thumbUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const newMusic = await db.collection('music').add({
        name: safeUserName, category: categoryId, topSection: 'visual-mode',
        recommended: false, isUserGenerated: true,
        imageUrl: thumbUrl, imageCount: 0, musicUrl: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      musicDocId = newMusic.id;
    }

    // images 서브콜렉션에 원본 + 썼네일 URL 저장
    await db.collection('music').doc(musicDocId).collection('images').add({
      imageSrc:  fullUrl,
      thumbUrl:  thumbUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('music').doc(musicDocId).update({
      imageCount: admin.firestore.FieldValue.increment(1),
    });

    return musicDocId;
  } catch (e) {
    console.error('[saveToUserGenGallery] 오류:', e.message);
    return null;
  }
}

// GET /comfy/status/:promptId — 완료 여부 확인 (HTTP history polling)
comfyRouter.get('/status/:promptId', async (req, res) => {
  const { promptId } = req.params;
  try {
    const response = await fetch(`${getComfyBase()}/history/${promptId}`, {
      headers: comfyHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return res.json({ done: false, progress: 0 });

    const history = await response.json();
    const entry = history[promptId];
    if (!entry) return res.json({ done: false, progress: 0 });

    // 에러 확인
    if (entry.status?.status_str === 'error') {
      const msgs = entry.status?.messages || [];
      const errMsg = msgs.find(m => m[0] === 'execution_error')?.[1]?.exception_message || '알 수 없는 오류';
      return res.json({ done: false, error: errMsg, progress: 0 });
    }

    // 완료 확인 (outputs에 images가 있는지)
    for (const nodeOut of Object.values(entry.outputs || {})) {
      const images = nodeOut.images || [];
      if (images.length > 0) {
        const img = images[0];
        return res.json({
          done: true,
          progress: 100,
          filename: img.filename,
          subfolder: img.subfolder || '',
        });
      }
    }

    // 진행 중
    return res.json({ done: false, progress: 50 });
  } catch (err) {
    console.warn('[comfy/status] 오류:', err.message);
    res.json({ done: false, progress: 0 });
  }
});

// GET /comfy/queue — 대기열 위치 조회
comfyRouter.get('/queue', async (req, res) => {
  const { promptId } = req.query;
  try {
    const r = await fetch(`${getComfyBase()}/queue`, {
      headers: comfyHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.json({ position: null, queueSize: 0 });

    const data = await r.json();
    const pending = data.queue_pending || [];
    const running = data.queue_running || [];

    let position = null;
    if (promptId) {
      const isRunning = running.some(j => j[1] === promptId);
      if (isRunning) { position = 0; }
      else {
        const idx = pending.findIndex(j => j[1] === promptId);
        position = idx >= 0 ? idx + 1 : null;
      }
    }
    res.json({ position, queueSize: pending.length, runningCount: running.length });
  } catch (err) {
    res.json({ position: null, queueSize: 0, runningCount: 0 });
  }
});

// GET /comfy/view — 이미지 바이너리 프록시 (ComfyUI output 이미지 다운로드)
comfyRouter.get('/view', async (req, res) => {
  const { filename, subfolder = '' } = req.query;
  if (!filename) return res.status(400).json({ error: 'filename 파라미터 필요' });

  try {
    const url = `${getComfyBase()}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
    const response = await fetch(url, {
      headers: comfyHeaders(),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) return res.status(502).json({ error: '이미지 가져오기 실패' });

    const contentType = response.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[comfy/view] 오류:', err.message);
    res.status(503).json({ error: '이미지 다운로드 실패' });
  }
});

// 직접 Cloud Functions URL: https://asia-northeast3-...cloudfunctions.net/api/comfy/*
app.use('/comfy', comfyRouter);

// Firebase Hosting 리라이트 경유: https://pixelplanet-95dd9.web.app/api/comfy/*
// Hosting "/api/**" → api 함수로 리라이트 시, 전체 경로(/api/comfy/...)가 Express에 도달함
app.use('/api/comfy', comfyRouter);
app.use('/api/music', musicRoutes);
app.use('/api/user', userRoutes);
app.use('/api/download', downloadRoutes);

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
export const api = onRequest({
  region: 'asia-northeast3',  // 서울 리전 (한국 사용자 최적화)
  memory: '1GiB',             // Fal.ai 응답 처리 여유를 위해 증가
  timeoutSeconds: 540,        // Fal.ai 워크플로우 실행 최대 9분 (기존 ComfyUI 포함 여유)
}, app);

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
