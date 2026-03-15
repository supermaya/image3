/**
 * falModelMapper.js
 *
 * 로컬 ComfyUI 모델 경로 → Fal.ai 접근 가능한 공개 URL 매핑 테이블
 *
 * 사용법:
 *   remapWorkflowForFal(workflow) → 로컬 경로가 URL로 교체된 워크플로우 반환
 *
 * 📌 모델 URL 채우기 가이드:
 *   - HuggingFace 직접 다운로드 URL: https://huggingface.co/{owner}/{repo}/resolve/main/{filename}
 *   - civitai: https://civitai.com/api/download/models/{modelVersionId}
 *   - URL이 '??MISSING'이면 Fal.ai 실행 시 해당 모델 로드 실패
 */

// ─── 모델 경로 → 공개 URL 매핑 ──────────────────────────────────────────────
export const MODEL_URL_MAP = {
    // ── Base UNet ──────────────────────────────────────────────────────────
    'z_Image\\z_image_turbo_bf16.safetensors':
        'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors',

    // ── VAE ────────────────────────────────────────────────────────────────
    'z_Image\\ae.safetensors':
        'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors',

    // ── CLIP (GGUF) ────────────────────────────────────────────────────────
    'qwen_3_4b.safetensors':
        'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',

    // LoRA 3종 → 워크플로우에서 제거됨 (node 47 삭제)
};

/**
 * 워크플로우 JSON의 모든 모델 경로를 공개 URL로 교체
 * - UNETLoader, VAELoader, CheckpointLoaderSimple, LoRA 관련 노드를 처리
 * - 매핑되지 않은 경로는 그대로 유지 (로컬 ComfyUI 경로명)
 *
 * @param {object} workflow — ComfyUI API format JSON
 * @returns {{ workflow: object, missing: string[] }} 교체된 워크플로우와 누락 URL 목록
 */
export function remapWorkflowForFal(workflow) {
    const wf = JSON.parse(JSON.stringify(workflow)); // deep copy
    const missing = [];

    for (const [nodeId, node] of Object.entries(wf)) {
        const inputs = node.inputs || {};
        const classType = node.class_type || '';

        // ── UNETLoader ──────────────────────────────────────────────────
        if (classType === 'UNETLoader' && inputs.unet_name) {
            inputs.unet_name = resolveModelUrl(inputs.unet_name, missing);
        }

        // ── VAELoader ───────────────────────────────────────────────────
        if (classType === 'VAELoader' && inputs.vae_name) {
            inputs.vae_name = resolveModelUrl(inputs.vae_name, missing);
        }

        // ── CheckpointLoaderSimple ─────────────────────────────────────
        if (classType === 'CheckpointLoaderSimple' && inputs.ckpt_name) {
            inputs.ckpt_name = resolveModelUrl(inputs.ckpt_name, missing);
        }

        // ── CLIPLoader / ClipLoaderGGUF ──────────────────────────────
        if ((classType === 'CLIPLoader' || classType === 'ClipLoaderGGUF') && inputs.clip_name) {
            inputs.clip_name = resolveModelUrl(inputs.clip_name, missing);
        }

        // ── LoRA Loader들 (Power Lora Loader, LoraLoader 등) ─────────
        // Power Lora Loader (rgthree): lora_1 ~ lora_20 필드
        for (let i = 1; i <= 20; i++) {
            const key = i === 1 ? 'lora_1' : `lora_1${i - 1}`;
            if (typeof inputs[key] === 'string' && inputs[key]) {
                inputs[key] = resolveModelUrl(inputs[key], missing);
            }
        }
        // 일반 LoraLoader
        if (classType === 'LoraLoader' && inputs.lora_name) {
            inputs.lora_name = resolveModelUrl(inputs.lora_name, missing);
        }
    }

    return { workflow: wf, missing };
}

/**
 * 경로를 URL로 변환. 매핑 없으면 원본 반환.
 * @param {string} localPath
 * @param {string[]} missingArr — 누락 URL 수집용
 */
function resolveModelUrl(localPath, missingArr) {
    const url = MODEL_URL_MAP[localPath];
    if (!url) return localPath; // 매핑 없으면 그대로 (로컬 ComfyUI 경로)
    if (url.startsWith('??MISSING')) {
        missingArr.push(`${localPath} → ${url}`);
        return localPath; // 누락이면 원본 유지
    }
    return url;
}
