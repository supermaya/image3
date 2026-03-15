/**
 * comfyService.js — 워크플로우 기반 ComfyUI 연동 (v2)
 * - 로컬 JSON 워크플로우 로드 & 프롬프트/seed/aspect_ratio 주입
 * - Firebase Storage/Firestore 유저 갤러리 저장
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    collection, addDoc, getDocs, query, where,
    updateDoc, serverTimestamp, doc, increment, deleteDoc
} from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { fal } from '@fal-ai/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// fal.ai 엔드포인트 (로컬 Express 서버가 FAL_KEY를 보유한 프록시 역할)
const COMFY_BASE = import.meta.env.VITE_COMFY_FUNCTIONS_URL || API_BASE;
const FAL_ENDPOINT = 'fal-ai/z-image/turbo';

// ─── 스타일 프리셋 (서버 STYLE_PRESETS와 동기화) ──────────────────────────────
const STYLE_PRESETS = {
    KoreanGirl: `{검은 머리|갈색 머리|금발|분홍 머리|은발}, {옅은 화장|스모키 화장|광택 입술과 블러셔|자연스러운 화장}을 한 20대 한국 여성이 {다이아몬드 귀걸이|진주 목걸이|선그래스|액세서리 없음}, (긴 다리, 짧은 상체, 좁은 허리, 자연스럽게 늘어진 작은 가슴), (성적으로 암시적인), 가벼운 미소, 매혹적인 미소, 윤기 나는 입술을 묘사한 아름다운 포스터. {크롭탑|스트랩리스 톱|레이스 디테일 탑|캐미솔 레이어드 탑}과 {마이크로 미니스커트|하이웨이스트 미니스커트|테일러드 쇼츠|로우라이즈 패션 스커트}를 입고 {세련된 스트리트 패션 스타일|하이패션 런웨이 스타일|인스타그램 패션 인플루언서 스타일|트렌디한 도시 패션 스타일},{자신감 있는 포즈|자연스러운 워킹 포즈|스타일링을 강조하는 포즈|패션 화보 촬영 장면|스트리트 패션 스냅 스타일},배경에는 {야간 도시 불빛|최고급 쇼핑몰|대도시 골목길|현대적인 아파트 옥상|영화 스튜디오 조명|해변 일몰 풍경|해변 일출 풍경}.`,
    InstaCeleb: `{크롭 니트 탑|스트랩리스 패션 톱|레이스 포인트 패션 탑|시스루 레이어드 캐미솔}과 {마이크로 미니스커트|슬림핏 미니스커트|패션 쇼츠|로우라이즈 트렌디 스커트}를 입은 한국 여성,{인스타그램 패션 인플루언서 스타일|트렌디 스트리트 패션|하이패션 매거진 스타일|도시적인 패션 화보 스타일},자연스러운 포즈, 카메라를 향한 자신감 있는 시선,패션 화보 촬영, 스트리트 스타일 스냅, 트렌디한 스타일링 강조`,
    Stunning:   null, // 서버 /random-prompt?file=pt01 에서 매 요청마다 랜덤 선택
};

const POLL_INTERVAL = 2500;
const QUEUE_POLL_INTERVAL = 3000;
const POLL_MAX = 240;
const FETCH_RETRY = 3;

// Cloud Functions는 서버이므로 ngrok 헤더 불필요
const JSON_HEADERS = {};

// ─── 사용 가능한 워크플로우 목록 (폴백) ─────────────────────────────────────────
export const AVAILABLE_WORKFLOWS = [
    { id: 'KoreanGirl', name: 'Korean Girl' },
    { id: 'InstaCeleb', name: 'Insta Celeb' },
    { id: 'Stunning',   name: 'Stunning' },
];

// ─── fal.ai 엔드포인트 ────────────────────────────────────────────────────────
const STYLE_ENDPOINTS = {
    KoreanGirl:  'fal-ai/z-image/turbo',
    InstaCeleb:  'fal-ai/z-image/turbo',
};

export function getFalStyleEndpoint(styleId) {
    return STYLE_ENDPOINTS[styleId] || 'fal-ai/any-comfy-node';
}

// ─── 서버 헬스체크 ────────────────────────────────────────────────────────────
export async function checkComfyHealth() {
    try {
        const res = await fetch(`${COMFY_BASE}/api/comfy/ping`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json();
        return { ok: !!data.ok, via: data.via };
    } catch (e) {
        console.warn('[checkComfyHealth] 연결 실패:', e.message);
        return { ok: false };
    }
}

// ─── 서버에서 동적 워크플로우 목록 로드 ───────────────────────────────────────
export async function fetchWorkflows() {
    try {
        const res = await fetch(`${COMFY_BASE}/api/comfy/workflows`);
        if (!res.ok) throw new Error('목록 로드 실패');
        const { workflows } = await res.json();
        return workflows.length > 0 ? workflows : AVAILABLE_WORKFLOWS;
    } catch (e) {
        console.warn('[fetchWorkflows] 서버 목록 실패, 폴백 사용:', e.message);
        return AVAILABLE_WORKFLOWS;
    }
}

// ─── 워크플로우 로딩 ──────────────────────────────────────────────────────────
export async function loadWorkflow(workflowId) {
    const res = await fetch(`${COMFY_BASE}/api/comfy/workflow/${workflowId}`, {
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`워크플로우 로드 실패: ${workflowId}`);
    const { workflow } = await res.json();
    return workflow;
}

// ─── 노드 참조 체인 resolve ───────────────────────────────────────────────────
function resolveNodeText(wf, ref) {
    if (typeof ref === 'string') return ref;
    if (!Array.isArray(ref)) return '';
    const [nodeId] = ref;
    const node = wf[String(nodeId)];
    if (!node) return '';
    const inputs = node.inputs || {};
    const ct = node.class_type || '';

    if (ct === 'easy promptConcat') {
        const p1 = resolveNodeText(wf, inputs.prompt1);
        const p2 = resolveNodeText(wf, inputs.prompt2);
        const sep = typeof inputs.separator === 'string' ? inputs.separator : ',';
        return [p1, p2].filter(Boolean).join(sep + ' ');
    }
    if (ct === 'CR Prompt Text') return typeof inputs.prompt === 'string' ? inputs.prompt : '';
    if (typeof inputs.text === 'string') return inputs.text;
    if (typeof inputs.prompt === 'string') return inputs.prompt;
    return '';
}

export function injectWorkflow(workflow, { prompt, aspectRatio }) {
    const wf = JSON.parse(JSON.stringify(workflow));
    const runId = Date.now();
    const userPrompt = prompt?.trim() || '';

    for (const [nodeId, node] of Object.entries(wf)) {
        const inputs = node.inputs || {};
        const classType = node.class_type || '';

        if (userPrompt) {
            if (classType === 'CLIPTextEncode') {
                const textVal = inputs.text;
                if (Array.isArray(textVal) || (typeof textVal === 'string' && textVal !== '')) {
                    inputs.text = userPrompt;
                }
            }
            for (const [key, val] of Object.entries(inputs)) {
                if (typeof val === 'string' && val.includes('[[USER_PROMPT_HERE]]')) {
                    inputs[key] = val.replace('[[USER_PROMPT_HERE]]', userPrompt);
                }
            }
        } else {
            if (classType === 'DPRandomGenerator' && Array.isArray(inputs.text)) {
                inputs.text = resolveNodeText(wf, inputs.text);
            }
        }

        if (classType === 'KSampler' && 'seed' in inputs) {
            inputs.seed = Math.floor(Math.random() * 1e15);
        }
        if (classType === 'DPRandomGenerator' && 'seed' in inputs) {
            inputs.seed = Math.floor(Math.random() * 1e15);
        }
        if (['EmptySD3LatentImage', 'EmptyLatentImage'].includes(classType)) {
            const is16x9 = aspectRatio && aspectRatio.startsWith('16:9');
            inputs.width  = is16x9 ? 1920 : 1080;
            inputs.height = is16x9 ? 1080 : 1920;
        }
        if (classType === 'FluxResolutionNode' && 'aspect_ratio' in inputs) {
            inputs.aspect_ratio = aspectRatio;
        }
        if (classType === 'SaveImage' && 'filename_prefix' in inputs) {
            inputs.filename_prefix = `VISVIS/API/${runId}`;
        }
    }

    return wf;
}

// ─── 재시도 fetch ────────────────────────────────────────────────────────────
function makeAbortSignal(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

async function fetchWithRetry(url, options = {}, retries = FETCH_RETRY) {
    for (let i = 0; i <= retries; i++) {
        const { signal, clear } = makeAbortSignal(12000);
        try {
            const res = await fetch(url, {
                ...options,
                headers: { ...JSON_HEADERS, ...(options.headers || {}) },
                signal,
            });
            clear();
            return res;
        } catch (err) {
            clear();
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
    }
}

// ─── 이미지 생성 (메인 함수) ─────────────────────────────────────────────────
export async function generateFromWorkflow(onProgress = () => {}, meta = {}) {
    onProgress({ progress: 5, status: 'AI 이미지 생성 요청 중...' });

    fal.config({ proxyUrl: `${COMFY_BASE}/api/comfy/fal-proxy` });

    let presetText = STYLE_PRESETS[meta.workflowId];
    if (presetText === null) {
        onProgress({ progress: 6, status: '랜덤 프롬프트 선택 중...' });
        try {
            const randRes = await fetch(`${COMFY_BASE}/api/comfy/random-prompt?file=pt01`);
            if (randRes.ok) {
                const { prompt } = await randRes.json();
                presetText = prompt;
                console.log(`[generateFromWorkflow] Stunning 랜덤 프롬프트: "${prompt.slice(0, 60)}..."`);
            }
        } catch (e) {
            console.warn('[generateFromWorkflow] 랜덤 프롬프트 로드 실패, 기본값 사용');
            presetText = STYLE_PRESETS.KoreanGirl;
        }
    } else if (!presetText) {
        presetText = STYLE_PRESETS.KoreanGirl;
    }

    const finalPrompt = [presetText, (meta.prompt || '').trim()].filter(Boolean).join(', ');
    const is16x9    = (meta.aspectRatio || '').startsWith('16:9');
    const imageSize = is16x9
        ? { width: 1920, height: 1080 }
        : { width: 1080, height: 1920 };

    console.log(`[generateFromWorkflow] ${meta.workflowId} | prompt ${finalPrompt.length}자 | ${imageSize.width}×${imageSize.height}`);

    let result;
    try {
        result = await fal.subscribe(FAL_ENDPOINT, {
            input: {
                prompt:                finalPrompt,
                image_size:            imageSize,
                num_inference_steps:   8,
                sync_mode:             true,
                enable_safety_checker: true,
            },
            onQueueUpdate: (update) => {
                if (update.status === 'IN_QUEUE') {
                    onProgress({ status: `대기 중 (${update.queue_position}번째)`, queuePosition: update.queue_position });
                } else if (update.status === 'IN_PROGRESS') {
                    onProgress({ progress: 50, status: '생성 중...' });
                }
            },
        });
    } catch (falErr) {
        const detail = falErr?.body
            ? (typeof falErr.body === 'string' ? falErr.body : JSON.stringify(falErr.body))
            : falErr.message;
        console.error('[generateFromWorkflow] fal.ai 오류:', detail);
        throw new Error(`Fal.ai 호출 실패 (${falErr.status || 'unknown'}): ${detail}`);
    }

    const data = result?.data || result;
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) throw new Error('fal.ai에서 이미지 URL을 받지 못했습니다.');

    onProgress({ progress: 90, status: '이미지 다운로드 중...' });
    const imgRes = await fetchWithRetry(imageUrl);
    if (!imgRes.ok) throw new Error('이미지 다운로드 실패');

    onProgress({ progress: 99, status: '다운로드 완료!' });
    return await imgRes.blob();
}


// ─── PNG/WebP → JPEG 압축 변환 ───────────────────────────────────────────────
async function compressToJpeg(blob, quality = 0.92) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob(
                (jpegBlob) => jpegBlob ? resolve(jpegBlob) : reject(new Error('toBlob failed')),
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}


// ─── Firebase 유저 갤러리 저장 ────────────────────────────────────────────────
export async function saveToUserGallery(imageBlob, uid, userName, prompt, workflowId, aspectRatio) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const safeStorageName = (userName || uid).replace(/[^a-zA-Z0-9_-]/g, '_'); // Storage 경로 전용 (ASCII)
    const displayGalleryName = (userName || uid).replace(/[^\w\-가-힣 ]/g, '_').trim() || uid; // Firestore 이름 (한글 허용)

    // 1-b. 기본 갤러리 문서 확보 및 50개 제한 체크 (업로드 전)
    const USER_GALLERY_MAX = 50;
    const defaultGalleryId = await ensureDefaultGallery(uid, displayGalleryName);
    if (defaultGalleryId) {
        const galDoc = await getDoc(doc(db, 'users', uid, 'userGalleries', defaultGalleryId)).catch(() => null);
        const currentCount = galDoc?.data()?.imageCount || 0;
        if (currentCount >= USER_GALLERY_MAX) {
            throw Object.assign(
                new Error(`갤러리 저장 한도(${USER_GALLERY_MAX}개)에 도달했습니다. 오래된 이미지를 삭제한 후 다시 시도하세요.`),
                { code: 'gallery_full' }
            );
        }
    }

    let uploadBlob = imageBlob;
    try {
        uploadBlob = await compressToJpeg(imageBlob, 0.92);
    } catch (e) {
        console.warn('[saveToUserGallery] JPEG 변환 실패, 원본 사용:', e.message);
    }
    const isJpeg = uploadBlob.type === 'image/jpeg';
    const filename = `${timestamp}_${random}.${isJpeg ? 'jpg' : 'png'}`;

    // 2. Storage 업로드
    const storagePath = `user_img/${safeStorageName}/gallery/${filename}`;
    const storageRef = ref(storage, storagePath);
    const snap = await uploadBytes(storageRef, uploadBlob, {
        contentType: isJpeg ? 'image/jpeg' : 'image/png',
        customMetadata: { workflowId, aspectRatio, prompt: prompt.slice(0, 200), generatedAt: new Date().toISOString() },
    });
    const url = await getDownloadURL(snap.ref);


    // 4. Firestore: users/{uid}/galleries 이미지 저장
    const docRef = await addDoc(collection(db, 'users', uid, 'galleries'), {
        url,
        storagePath,
        prompt,
        workflowId,
        workflowName: workflowId.replace(/_/g, ' '),
        aspectRatio,
        galleryId: defaultGalleryId,
        createdAt: serverTimestamp(),
        fileName: filename,
    });

    // 5. userGalleries imageCount 증가
    if (defaultGalleryId) {
        await updateDoc(doc(db, 'users', uid, 'userGalleries', defaultGalleryId), {
            imageCount: increment(1),
            updatedAt: serverTimestamp(),
        }).catch(() => {});
    }

    // 6. 메인 갤러리 시스템 통합 (music 컬렉션)
    const musicDocId = await saveToMainGallery(url, displayGalleryName, uid);
    if (musicDocId) {
        await updateDoc(doc(db, 'users', uid, 'galleries', docRef.id), { musicDocId }).catch(() => {});
    }

    return { url, docId: docRef.id };
}

// ─── 기본 갤러리 문서 보장 ────────────────────────────────────────────────────
async function ensureDefaultGallery(uid, galleryName) {
    try {
        const galCol = collection(db, 'users', uid, 'userGalleries');
        const existing = await getDocs(query(galCol, where('isDefault', '==', true)));
        if (!existing.empty) return existing.docs[0].id;

        const newGal = await addDoc(galCol, {
            name: galleryName,
            isDefault: true,
            imageCount: 0,
            createdAt: serverTimestamp(),
        });
        console.log('[ensureDefaultGallery] 기본 갤러리 생성:', newGal.id);
        return newGal.id;
    } catch (e) {
        console.warn('[ensureDefaultGallery] 실패:', e.message);
        return null;
    }
}

// ─── UserGen 카테고리의 {userName} 갤러리에 이미지 추가 ────────────────────────
const USER_GEN_CATEGORY = 'UserGen';

async function saveToMainGallery(imageUrl, userName, uid) {
    try {
        // 1. UserGen 카테고리 문서 ID 확보
        const catSnap = await getDocs(
            query(collection(db, 'categories'), where('name', '==', USER_GEN_CATEGORY))
        );

        let categoryId;
        if (catSnap.empty) {
            const newCat = await addDoc(collection(db, 'categories'), {
                name: USER_GEN_CATEGORY,
                topSection: 'visual-mode',
                classification: 'ai-generated',
                isUserGenerated: true,
                createdAt: new Date().toISOString(),
            });
            categoryId = newCat.id;
        } else {
            categoryId = catSnap.docs[0].id;
        }

        // 2. 이 uid의 기존 music 문서 검색 (uploaderId 단일 쿼리 — 복합 인덱스 불필요)
        const musicSnap = await getDocs(
            query(collection(db, 'music'), where('uploaderId', '==', uid))
        );
        // 클라이언트 필터: isUserGenerated + category 일치하는 첫 번째
        const existing = musicSnap.docs
            .find(d => d.data().isUserGenerated && d.data().category === categoryId) || null;

        let musicDocId;

        if (existing) {
            musicDocId = existing.id;
            try {
                await updateDoc(doc(db, 'music', musicDocId), {
                    imageUrl: imageUrl,
                    uploaderId: uid,
                    updatedAt: serverTimestamp(),
                });
            } catch (updateErr) {
                console.warn('[saveToMainGallery] 썸네일 update 실패:', updateErr.code, updateErr.message);
            }
        } else {
            const newDoc = await addDoc(collection(db, 'music'), {
                name: userName,
                category: categoryId,
                topSection: 'visual-mode',
                recommended: false,
                isUserGenerated: true,
                uploaderId: uid,
                imageUrl: imageUrl,
                imageCount: 0,
                musicUrl: '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            musicDocId = newDoc.id;
        }

        // 3. images 서브컬렉션에 이미지 추가
        await addDoc(collection(db, 'music', musicDocId, 'images'), {
            imageSrc: imageUrl,
            createdAt: serverTimestamp(),
        });

        // 4. imageCount 증가
        try {
            await updateDoc(doc(db, 'music', musicDocId), { imageCount: increment(1) });
        } catch (incErr) {
            console.warn('[saveToMainGallery] imageCount 증가 실패:', incErr.code, incErr.message);
        }

        console.log(`[saveToMainGallery] ✅ ${userName} 갤러리 저장 완료 (catId: ${categoryId}, musicId: ${musicDocId})`);
        return musicDocId;
    } catch (e) {
        console.error('[saveToMainGallery] ❌ 오류:', e.code, e.message);
        return null;
    }
}

// ─── 회원가입 시 UserGen 갤러리 사전 생성 ────────────────────────────────────
// userStore.js initAuth 최초 가입 분기에서 호출
export async function ensureUserMusicGallery(uid, displayName) {
    try {
        const safeUserName = (displayName || uid || '')
            .replace(/[^a-zA-Z0-9_\-가-힣]/g, '_');

        // 1. UserGen 카테고리 ID 확보
        const catSnap = await getDocs(
            query(collection(db, 'categories'), where('name', '==', 'UserGen'))
        );
        let categoryId;
        if (catSnap.empty) {
            const newCat = await addDoc(collection(db, 'categories'), {
                name: 'UserGen',
                topSection: 'visual-mode',
                classification: 'ai-generated',
                isUserGenerated: true,
                createdAt: new Date().toISOString(),
            });
            categoryId = newCat.id;
        } else {
            categoryId = catSnap.docs[0].id;
        }

        // 2. 이미 해당 uid의 music 문서 존재 여부 확인
        const musicSnap = await getDocs(
            query(
                collection(db, 'music'),
                where('category', '==', categoryId),
                where('uploaderId', '==', uid)
            )
        );
        if (!musicSnap.empty) {
            console.log('[ensureUserMusicGallery] 이미 갤러리 존재:', musicSnap.docs[0].id);
            return musicSnap.docs[0].id;
        }

        // 3. 신규 music 문서 생성
        const newDoc = await addDoc(collection(db, 'music'), {
            name: safeUserName,
            category: categoryId,
            topSection: 'visual-mode',
            recommended: false,
            isUserGenerated: true,
            uploaderId: uid,
            imageUrl: '',
            imageCount: 0,
            musicUrl: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        console.log('[ensureUserMusicGallery] ✅ 갤러리 생성:', newDoc.id, '이름:', safeUserName);
        return newDoc.id;
    } catch (e) {
        console.warn('[ensureUserMusicGallery] 실패 (무시):', e.message);
        return null;
    }
}

// ─── My Page 갤러리 생성 시 UserGen music 문서 신규 생성 ──────────────────────
// 복합 인덱스 불필요 — 항상 새 doc 생성, 중복 방지는 musicDocId로 관리
export async function createUserMusicGallery(uid, galleryName) {
    try {
        const safeName = (galleryName || '').replace(/[^a-zA-Z0-9_\-가-힣 ]/g, '_').trim() || 'Gallery';

        // 1. UserGen 카테고리 ID 확보
        const catSnap = await getDocs(
            query(collection(db, 'categories'), where('name', '==', 'UserGen'))
        );
        let categoryId;
        if (catSnap.empty) {
            const newCat = await addDoc(collection(db, 'categories'), {
                name: 'UserGen',
                topSection: 'visual-mode',
                classification: 'ai-generated',
                isUserGenerated: true,
                createdAt: new Date().toISOString(),
            });
            categoryId = newCat.id;
        } else {
            categoryId = catSnap.docs[0].id;
        }

        // 2. 신규 music 문서 생성 (중복 체크 없음 — 호출자가 musicDocId로 관리)
        const newDoc = await addDoc(collection(db, 'music'), {
            name: safeName,
            category: categoryId,
            topSection: 'visual-mode',
            recommended: false,
            isUserGenerated: true,
            uploaderId: uid,
            imageUrl: '',
            imageCount: 0,
            musicUrl: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        console.log('[createUserMusicGallery] ✅ 생성:', newDoc.id, '이름:', safeName);
        return newDoc.id;
    } catch (e) {
        console.error('[createUserMusicGallery] 실패:', e.message);
        return null;
    }
}
