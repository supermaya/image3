/**
 * falWorkflowCleaner.js
 *
 * Fal.ai 전송 전 워크플로우에서 미지원 커스텀 노드를 제거하고,
 * 모든 참조를 표준 ComfyUI 노드+ 인라인 값으로 해소합니다.
 *
 * 처리 대상 커스텀 노드:
 *   - DPRandomGenerator   : {a|b|c} 다이나믹 프롬프트 → JS에서 직접 랜덤 선택
 *   - CR Prompt Text       : 단순 텍스트 래퍼 → 인라인 문자열로 교체
 *   - easy promptConcat    : 문자열 연결 → 인라인 문자열로 교체
 *   - FluxResolutionNode   : 해상도 계산 → 고정 width/height 값으로 교체
 *   - easy cleanGpuUsed    : GPU 메모리 정리 → 제거 후 연결 우회
 */

// ── 지원 안 되는 커스텀 노드 목록 ──────────────────────────────────────────
const UNSUPPORTED_NODES = new Set([
    'DPRandomGenerator',
    'CR Prompt Text',
    'easy promptConcat',
    'FluxResolutionNode',
    'easy cleanGpuUsed',
    'Power Lora Loader (rgthree)',
]);

// VAEDecodeTiled 비디오 전용 파라미터 (이미지 모델에는 없는 입력 → 검증 실패 원인)
const VAEDECODETILED_VIDEO_PARAMS = ['temporal_size', 'temporal_overlap', 'num_frames'];

// ── FluxResolutionNode aspect_ratio → 실제 픽셀 치환표 ─────────────────────
// z_image_turbo (Lumina2 기반) 권장 해상도
const ASPECT_RATIO_DIMS = {
    '9:16 (Slim Vertical)':  { width: 1080, height: 1920 },
    '16:9 (Panorama)':       { width: 1920, height: 1080 },
    '1:1 (Square)':          { width: 1024, height: 1024 },
    '3:4 (Portrait)':        { width: 896,  height: 1152 },
    '4:3 (Landscape)':       { width: 1152, height: 896  },
};
const DEFAULT_DIMS = { width: 1080, height: 1920 };

/**
 * {option1|option2|option3} 형식의 다이나믹 프롬프트를 랜덤 선택하여 해소
 * 중첩 허용: {{a|b}|c} → 내부부터 순서대로 처리
 *
 * @param {string} text
 * @returns {string}
 */
export function resolveDynamicPrompt(text) {
    if (typeof text !== 'string') return text;
    // 중첩 지원: 가장 안쪽 {} 부터 처리 (반복)
    let result = text;
    let prev;
    do {
        prev = result;
        result = result.replace(/\{([^{}]+)\}/g, (_, inner) => {
            const options = inner.split('|').map(s => s.trim()).filter(Boolean);
            return options[Math.floor(Math.random() * options.length)];
        });
    } while (result !== prev);
    return result;
}

/**
 * 노드 참조 체인을 따라 텍스트 값을 문자열로 해소
 * node 참조: [nodeId, outputIndex]
 *
 * @param {object} wf   워크플로우 전체
 * @param {*}      ref  string 또는 [nodeId, outputIndex]
 * @returns {string}
 */
function resolveTextRef(wf, ref) {
    if (typeof ref === 'string') return ref;
    if (!Array.isArray(ref)) return '';

    const [nodeId] = ref;
    const node = wf[String(nodeId)];
    if (!node) return '';

    const inputs = node.inputs || {};
    const ct = node.class_type || '';

    switch (ct) {
        case 'DPRandomGenerator': {
            const raw = resolveTextRef(wf, inputs.text);
            return resolveDynamicPrompt(raw);
        }
        case 'CR Prompt Text':
            return typeof inputs.prompt === 'string' ? inputs.prompt : '';

        case 'easy promptConcat': {
            const p1 = resolveTextRef(wf, inputs.prompt1);
            const p2 = resolveTextRef(wf, inputs.prompt2);
            const sep = typeof inputs.separator === 'string' ? inputs.separator : ',';
            return [p1, p2].filter(Boolean).join(sep + ' ');
        }
        default:
            if (typeof inputs.text === 'string')   return inputs.text;
            if (typeof inputs.prompt === 'string') return inputs.prompt;
            if (Array.isArray(inputs.text))        return resolveTextRef(wf, inputs.text);
            return '';
    }
}

/**
 * easy cleanGpuUsed 노드를 제거하고 다운스트림 연결을 우회
 * anything 입력의 upstream 참조를 downstream 노드에 직접 연결
 *
 * @param {object} wf
 */
function bypassCleanGpuNodes(wf) {
    for (const [nodeId, node] of Object.entries(wf)) {
        if (node.class_type !== 'easy cleanGpuUsed') continue;

        const upstream = node.inputs?.anything;  // e.g. ["66", 0]
        if (!upstream) continue;

        // 이 노드를 참조하는 모든 노드의 입력을 upstream으로 교체
        for (const [, n] of Object.entries(wf)) {
            for (const [key, val] of Object.entries(n.inputs || {})) {
                if (Array.isArray(val) && String(val[0]) === String(nodeId)) {
                    n.inputs[key] = upstream;
                }
            }
        }
    }
}

/**
 * FluxResolutionNode를 참조하는 EmptySD3LatentImage / EmptyLatentImage의
 * width/height를 실제 픽셀값으로 교체
 *
 * @param {object} wf
 */
function resolveResolutionNodes(wf) {
    // FluxResolutionNode : aspect_ratio → 실제 dims 계산
    const resNodeDims = {};
    for (const [nodeId, node] of Object.entries(wf)) {
        if (node.class_type === 'FluxResolutionNode') {
            const ar = node.inputs?.aspect_ratio || '9:16 (Slim Vertical)';
            resNodeDims[nodeId] = ASPECT_RATIO_DIMS[ar] || DEFAULT_DIMS;
        }
    }

    // EmptySD3LatentImage / EmptyLatentImage 의 width/height 교체
    for (const [, node] of Object.entries(wf)) {
        if (!['EmptySD3LatentImage', 'EmptyLatentImage'].includes(node.class_type)) continue;
        const wi = node.inputs?.width;
        const hi = node.inputs?.height;
        if (Array.isArray(wi) && resNodeDims[String(wi[0])]) {
            node.inputs.width  = resNodeDims[String(wi[0])].width;
            node.inputs.height = resNodeDims[String(hi[0])].height;
        }
    }
}

/**
 * CLIPTextEncode 노드의 text 입력이 노드 참조이면 인라인 문자열로 교체
 *
 * @param {object} wf
 */
function inlineClipTextEncode(wf) {
    for (const [, node] of Object.entries(wf)) {
        if (node.class_type !== 'CLIPTextEncode') continue;
        if (Array.isArray(node.inputs?.text)) {
            const resolved = resolveTextRef(wf, node.inputs.text);
            node.inputs.text = resolveDynamicPrompt(resolved);
        }
    }
}

/**
 * 미지원 커스텀 노드 제거 및 남은 참조 정리
 * (inlineClipTextEncode / bypassCleanGpuNodes 이후 호출)
 *
 * @param {object} wf
 */
function removeUnsupportedNodes(wf) {
    for (const nodeId of Object.keys(wf)) {
        if (UNSUPPORTED_NODES.has(wf[nodeId]?.class_type)) {
            delete wf[nodeId];
        }
    }
}

/**
 * VAEDecodeTiled 비디오 전용 파라미터 제거
 * temporal_size / temporal_overlap 은 표준 ComfyUI VAEDecodeTiled 에 없는 입력으로
 * Fal.ai 프롬프트 검증 실패의 주원
 *
 * @param {object} wf
 */
function cleanVaeDecodeTiled(wf) {
    for (const [, node] of Object.entries(wf)) {
        if (node.class_type !== 'VAEDecodeTiled') continue;
        for (const param of VAEDECODETILED_VIDEO_PARAMS) {
            delete node.inputs[param];
        }
        // tile_size 기본값 보장
        if (!node.inputs.tile_size) node.inputs.tile_size = 512;
        if (!node.inputs.overlap)   node.inputs.overlap   = 64;
    }
}

/**
 * SaveImage filename_prefix 정제:
 *   - %date:hhmmss% 등 ComfyUI 전용 토큰 → Fal.ai 검증 실패 잠재 원인
 *   - Fal.ai 에 맞는 단순 문자열로 교체
 *
 * @param {object} wf
 */
function cleanSaveImageFilename(wf) {
    for (const [, node] of Object.entries(wf)) {
        if (!['SaveImage', 'Image Save', 'WAS_Save_Image'].includes(node.class_type)) continue;
        const prefix = node.inputs?.filename_prefix;
        if (typeof prefix === 'string' && prefix.includes('%')) {
            // %date:...% 토큰 제거 → 말껟한 디렉토리 + 시간스탬프
            node.inputs.filename_prefix = prefix
                .replace(/%[^%]+%/g, '')   // %...% 전체 제거
                .replace(/\/+$/, '')       // 난는 슬래시 제거
                .trim() || 'output';
        }
    }
}

/**
 * 출력 체인 연결 검증:
 * KSampler → VAEDecode* → SaveImage 체인이 유효한지 확인
 * 연결이 끊기면 경고만 출력 (교정 없음 – 클리닝 후 연결 자체는 정상)
 *
 * @param {object} wf
 * @returns {string[]} 경고 메시지 배열
 */
function validateOutputChain(wf) {
    const warnings = [];

    // SaveImage 노드가 있는지 확인
    const saveNodes = Object.entries(wf)
        .filter(([, n]) => ['SaveImage', 'Image Save'].includes(n.class_type));
    if (saveNodes.length === 0) {
        warnings.push('SaveImage 노드가 없습니다.');
        return warnings;
    }

    // SaveImage로부터 images 입력 연결 여부
    for (const [saveId, saveNode] of saveNodes) {
        const imagesRef = saveNode.inputs?.images;
        if (!Array.isArray(imagesRef)) {
            warnings.push(`SaveImage(${saveId}): images 입력이 연결되지 않았으면`);
            continue;
        }
        const decodeNodeId = String(imagesRef[0]);
        const decodeNode = wf[decodeNodeId];
        if (!decodeNode) {
            warnings.push(`SaveImage(${saveId}): images 입력이 존재하지 않는 노드(${decodeNodeId})를 참조함`);
            continue;
        }
        const samplesRef = decodeNode.inputs?.samples;
        if (!Array.isArray(samplesRef)) {
            warnings.push(`VAEDecode(${decodeNodeId}): samples 입력이 연결되지 않았으면`);
        }
    }

    return warnings;
}

/**
 * 메인 클리닝 함수 — generateWithFal()에서 호출
 *
 * 처리 순서:
 *   1. resolution 해소  (FluxResolutionNode → width/height)
 *   2. text 인라인화    (CLIPTextEncode text → string)
 *   3. GPU 클린업 우회  (easy cleanGpuUsed → upstream 직결)
 *   4. 미지원 노드 삭제
 *   5. VAEDecodeTiled 비디오 파라미터 제거   ← 생성 검증 오류 방지
 *   6. SaveImage filename 정제        ← 생성 검증 오류 방지
 *   7. 출력 체인 검증
 *
 * @param {object} workflow  injectWorkflow() 처리된 ComfyUI API JSON
 * @returns {object}  Fal.ai 전송 가능한 순수 표준 노드 워크플로우
 */
export function cleanWorkflowForFal(workflow) {
    const wf = JSON.parse(JSON.stringify(workflow)); // deep copy

    resolveResolutionNodes(wf);   // 1. width/height 고정값으로 교체
    inlineClipTextEncode(wf);     // 2. CLIPTextEncode text 인라인화
    bypassCleanGpuNodes(wf);      // 3. GPU 클린업 노드 우회
    removeUnsupportedNodes(wf);   // 4. 불필요 커스텀 노드 삭제
    cleanVaeDecodeTiled(wf);      // 5. temporal 파라미터 제거
    cleanSaveImageFilename(wf);   // 6. filename_prefix 정제

    const warnings = validateOutputChain(wf);  // 7. 출력 체인 검증
    if (warnings.length > 0) {
        console.warn('[falWorkflowCleaner] 출력 체인 경고:', warnings);
    }

    return wf;
}
