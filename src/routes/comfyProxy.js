/**
 * ComfyUI Proxy 라우터 (원격 서버 지원 버전)
 * - COMFYUI_HOST_URL 환경변수로 주소 동적 설정
 * - WebSocket 자동재연결 (Auto-reconnect)
 * - SSE 기반 실시간 진행 상태 스트리밍
 * - /queue 엔드포인트로 대기열 위치 확인
 */
import express from 'express';
import { WebSocket } from 'ws';
import { readFileSync, readdirSync } from 'fs';

import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// 클라이언트 워크플로우 디렉토리 (server.js → src/ 기준)
const WORKFLOWS_DIR = resolve(__dirname, '../../client/src/assets/workflows');
const PROMPTS_DIR   = resolve(__dirname, '../assets/prompts');


const router = express.Router();

// ─── 설정 ──────────────────────────────────────────────────────────────────
function getComfyBase() {
    return (process.env.COMFYUI_HOST_URL || 'http://localhost:8188').replace(/\/$/, '');
}
function getComfyWsBase() {
    const base = getComfyBase();
    return base.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws'));
}

// Ngrok 터널 사용 시 필수 헤더 (브라우저 경고 페이지 우회)
function comfyHeaders(extra = {}) {
    return {
        'ngrok-skip-browser-warning': 'true',
        ...extra,
    };
}

// ─── 인메모리 작업 상태 맵 (promptId → status) ─────────────────────────────
// status: { progress: 0-100, done: false, filename, subfolder, error }
const jobStatus = new Map();

// ─── WebSocket 관리 (서버 → ComfyUI) ───────────────────────────────────────
let comfyWs = null;
let wsReconnectTimer = null;
const WS_CLIENT_ID = `pixelsunday_server_${Date.now()}`;
const MAX_WS_RETRIES = 3;   // 최대 재연결 시도 횟수
let wsRetryCount = 0;        // 현재 재연결 시도 횟수

function connectComfyWs() {
    try {
        const wsUrl = `${getComfyWsBase()}/ws?clientId=${WS_CLIENT_ID}`;
        console.log(`[comfyProxy] WebSocket 연결: ${wsUrl}`);

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log('[comfyProxy] ComfyUI WebSocket 연결됨');
            comfyWs = ws;
            wsRetryCount = 0; // 연결 성공 시 카운터 리셋
            if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                const type = msg.type;
                const d = msg.data || {};

                if (type === 'progress') {
                    const { value, max, prompt_id } = d;
                    if (prompt_id) {
                        const cur = jobStatus.get(prompt_id) || {};
                        jobStatus.set(prompt_id, {
                            ...cur,
                            progress: max ? Math.round((value / max) * 90) + 5 : cur.progress || 5,
                            done: false,
                        });
                    }
                } else if (type === 'executed') {
                    // executed 이벤트는 개별 노드별로 발생 — images가 있는 노드만 done 처리
                    const { prompt_id, output } = d;
                    if (!prompt_id) return;
                    const images = output?.images || [];
                    if (images.length > 0) {
                        const img = images[0];
                        jobStatus.set(prompt_id, {
                            progress: 100, done: true,
                            filename: img.filename,
                            subfolder: img.subfolder || '',
                        });
                    }
                } else if (type === 'execution_cached') {
                    // 캐시된 실행 결과
                    const { prompt_id, output } = d;
                    if (!prompt_id) return;
                    const images = output?.images || [];
                    if (images.length > 0) {
                        const img = images[0];
                        jobStatus.set(prompt_id, {
                            progress: 100, done: true,
                            filename: img.filename,
                            subfolder: img.subfolder || '',
                        });
                    }
                } else if (type === 'execution_error') {
                    const { prompt_id, exception_message } = d;
                    if (prompt_id) {
                        jobStatus.set(prompt_id, { progress: 0, done: false, error: exception_message || '알 수 없는 오류' });
                    }
                }
            } catch { /* non-JSON 메시지 무시 */ }
        });

        ws.on('error', (err) => {
            console.warn('[comfyProxy] WebSocket 오류:', err.message);
        });

        ws.on('close', () => {
            comfyWs = null;
            wsRetryCount++;
            if (wsRetryCount >= MAX_WS_RETRIES) {
                console.warn(`[comfyProxy] WebSocket 연결 ${MAX_WS_RETRIES}회 실패 — 재연결 중단`);
                return;
            }
            console.warn(`[comfyProxy] WebSocket 연결 끊김 — 5초 후 재연결 (${wsRetryCount}/${MAX_WS_RETRIES})`);
            wsReconnectTimer = setTimeout(connectComfyWs, 5000);
        });
    } catch (err) {
        comfyWs = null;
        wsRetryCount++;
        if (wsRetryCount >= MAX_WS_RETRIES) {
            console.warn(`[comfyProxy] WebSocket 연결 ${MAX_WS_RETRIES}회 실패 — 재연결 중단`);
            return;
        }
        console.warn(`[comfyProxy] WebSocket 연결 실패 (${wsRetryCount}/${MAX_WS_RETRIES}):`, err.message);
        wsReconnectTimer = setTimeout(connectComfyWs, 5000);
    }
}

// 서버 시작 시 WebSocket 연결 시도
connectComfyWs();

// ─── FAL 프록시: 클라이언트 @fal-ai/client → 서버 FAL_KEY로 fal.ai 호출 ─────
// @fal-ai/client proxyUrl 방식:
//   모든 요청 → POST /api/comfy/fal-proxy
//   실제 목적지 URL → 'x-fal-target-url' 헤더로 전달
router.all('/fal-proxy', async (req, res) => {
    const falKey = process.env.FAL_KEY;
    if (!falKey) return res.status(503).json({ error: 'FAL_KEY 미설정' });

    // @fal-ai/client가 x-fal-target-url 헤더로 실제 fal.ai URL을 전달함
    const targetUrl = req.headers['x-fal-target-url'];
    if (!targetUrl) {
        return res.status(400).json({ error: 'x-fal-target-url 헤더가 필요합니다.' });
    }

    console.log(`[fal-proxy] ${req.method} → ${targetUrl}`);

    try {
        const isGet = req.method === 'GET' || req.method === 'HEAD';
        const response = await fetch(targetUrl, {
            method:  req.method,
            headers: {
                'Authorization':  `Key ${falKey}`,
                'Content-Type':   'application/json',
                'Accept':         'application/json',
            },
            body: isGet ? undefined : JSON.stringify(req.body),
        });

        res.status(response.status);
        const ct = response.headers.get('content-type') || 'application/json';
        res.setHeader('Content-Type', ct);
        res.send(await response.text());
    } catch (err) {
        console.error('[fal-proxy] 오류:', err.message);
        res.status(503).json({ error: `fal.ai 프록시 오류: ${err.message}` });
    }
});

// ─── GET /workflow/:name — 서버측 파일에서 워크플로우 JSON 제공 ─────────────
// ─── 워크플로우 목록 조회 ─────────────────────────────────────────────
router.get('/workflows', (req, res) => {
    try {
        const files = readdirSync(WORKFLOWS_DIR)
            .filter(f => f.endsWith('_api.json'))
            .map(f => {
                const id = f.replace(/_api\.json$/, '');
                // CamelCase → 공백 분리로 표시명 자동 생성
                const name = id
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .trim();
                return { id, name };
            });
        res.json({ workflows: files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 브라우저 모듈 캐시 우회: 매 요청마다 파일에서 새로 읽음
router.get('/workflow/:name', (req, res) => {
    try {
        const { name } = req.params;
        // 경로 탐색 방지
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
        const filePath = join(WORKFLOWS_DIR, `${safeName}_api.json`);
        const raw = readFileSync(filePath, 'utf8');
        const workflow = JSON.parse(raw);
        res.json({ workflow, name: safeName });
    } catch (err) {
        res.status(404).json({ error: `워크플로우 없음: ${req.params.name}`, detail: err.message });
    }
});

// ─── GET /random-prompt — 프롬프트 파일에서 랜덤 1줄 반환 ─────────────────────
// Stunning 스타일 선택 시 클라이언트가 호출: ?file=pt01 (기본값)
// src/assets/prompts/{file}.txt 에서 비어있지 않은 줄 중 1개 무작위 선택
router.get('/random-prompt', (req, res) => {
    const fileName = (req.query.file || 'pt01').replace(/[^a-zA-Z0-9_-]/g, '');
    try {
        const filePath = join(PROMPTS_DIR, `${fileName}.txt`);
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
        if (!lines.length) return res.status(404).json({ error: '프롬프트가 없습니다.' });
        const prompt = lines[Math.floor(Math.random() * lines.length)];
        return res.json({ prompt, file: fileName, total: lines.length });
    } catch (err) {
        return res.status(404).json({ error: `파일 없음: ${fileName}.txt` });
    }
});

// ─── GET /ping — 헬스체크 (FAL_KEY 있으면 항상 온라인) ─────────────────────────
router.get('/ping', (req, res) => {
    const falKey = process.env.FAL_KEY;
    if (falKey) {
        return res.json({ ok: true, via: 'fal.ai', message: 'fal-ai/z-image/turbo 준비됨' });
    }
    return res.status(503).json({ ok: false, error: 'FAL_KEY 미설정' });
});

// ─── ComfyUI 헬스 체크 ────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
    try {
        const r = await fetch(`${getComfyBase()}/system_stats`, {
            headers: comfyHeaders(),
            signal: AbortSignal.timeout(3000),
        });
        const stats = await r.json();
        res.json({ ok: true, wsConnected: !!comfyWs, host: getComfyBase(), stats });
    } catch (err) {
        res.status(503).json({ ok: false, wsConnected: false, error: err.message });
    }
});

// ─── POST /generate ───────────────────────────────────────────────────────────
// Body: { workflow: object } — 클라이언트에서 완성된 workflow JSON 수신
router.post('/generate', async (req, res) => {
    const { workflow } = req.body;
    if (!workflow || typeof workflow !== 'object') {
        return res.status(400).json({ error: 'workflow 객체가 필요합니다.' });
    }

    try {
        // 디버그: 실제 전송 workflow 확인
        const node103 = workflow['103'];
        console.log('[comfyProxy /generate] node103 inputs:', JSON.stringify(node103?.inputs));
        console.log('[comfyProxy /generate] node3 negative:', JSON.stringify(workflow['3']?.inputs?.negative));

        const payload = JSON.stringify({
            prompt: workflow,
            client_id: WS_CLIENT_ID,
        });

        const response = await fetch(`${getComfyBase()}/prompt`, {
            method: 'POST',
            headers: comfyHeaders({ 'Content-Type': 'application/json' }),
            body: payload,
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const text = await response.text();
            return res.status(502).json({ error: 'ComfyUI 오류', detail: text });
        }

        const data = await response.json();
        const prompt_id = data.prompt_id;

        // 상태 초기화
        jobStatus.set(prompt_id, { progress: 5, done: false });
        res.json({ prompt_id });
    } catch (err) {
        console.error('[comfyProxy /generate]', err.message);
        res.status(503).json({ error: `ComfyUI 연결 실패 (${getComfyBase()})` });
    }
});

// ─── GET /status/:promptId (폴링 fallback + WS 캐시) ──────────────────────────
router.get('/status/:promptId', async (req, res) => {
    const { promptId } = req.params;

    // 1. 인메모리 캐시 우선 확인
    const cached = jobStatus.get(promptId);
    if (cached?.done) return res.json(cached);
    if (cached?.error) return res.json({ done: false, error: cached.error, progress: 0 });

    // 2. WS로 수신 중이지만 아직 done이 아닌 경우 → 캐시된 progress 반환
    if (cached) return res.json(cached);

    // 3. Fallback: /history 직접 조회
    try {
        const response = await fetch(`${getComfyBase()}/history/${promptId}`, {
            headers: comfyHeaders(),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return res.json({ done: false, progress: 0 });

        const history = await response.json();
        const entry = history[promptId];
        if (!entry) return res.json({ done: false, progress: 0 });

        for (const nodeOut of Object.values(entry.outputs || {})) {
            const images = nodeOut.images || [];
            if (images.length > 0) {
                const img = images[0];
                const result = { done: true, progress: 100, filename: img.filename, subfolder: img.subfolder || '' };
                jobStatus.set(promptId, result);
                return res.json(result);
            }
        }
        return res.json({ done: false, progress: cached?.progress || 0 });
    } catch (err) {
        res.json({ done: false, progress: cached?.progress || 0 });
    }
});

// ─── GET /queue — 현재 대기열 위치 조회 ─────────────────────────────────────
router.get('/queue', async (req, res) => {
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
            // running 중이면 position = 0 (내 차례)
            const isRunning = running.some(j => j[1] === promptId);
            if (isRunning) { position = 0; }
            else {
                const idx = pending.findIndex(j => j[1] === promptId);
                position = idx >= 0 ? idx + 1 : null;
            }
        }

        res.json({
            position,
            queueSize: pending.length,
            runningCount: running.length,
        });
    } catch (err) {
        res.json({ position: null, queueSize: 0, runningCount: 0 });
    }
});

// ─── GET /view — 이미지 바이너리 프록시 ──────────────────────────────────────
router.get('/view', async (req, res) => {
    const { filename, subfolder = '' } = req.query;
    if (!filename) return res.status(400).json({ error: 'filename 파라미터 필요' });

    try {
        const url = `${getComfyBase()}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
        const response = await fetch(url, {
            headers: comfyHeaders(),
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) return res.status(502).json({ error: '이미지 가져오기 실패' });

        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
    } catch (err) {
        console.error('[comfyProxy /view]', err.message);
        res.status(503).json({ error: '이미지 다운로드 실패' });
    }
});

// ─── GET /models — 사용 가능한 모델 목록 ────────────────────────────────────
router.get('/models', async (req, res) => {
    try {
        const r = await fetch(`${getComfyBase()}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(5000) });
        const data = await r.json();
        const models = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
        res.json({ models });
    } catch {
        res.json({ models: [] });
    }
});

export default router;
