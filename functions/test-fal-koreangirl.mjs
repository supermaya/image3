/**
 * fal.ai comfy/gounbada/koreangirl 직접 테스트
 * 실행: node test-fal-koreangirl.mjs
 */
import { fal } from '@fal-ai/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAL_KEY = '08207b7c-88c2-42ce-b086-7e4c26eb7a1f:7d084b0252ff50af89da0c657c966c74';
const ENDPOINT = 'comfy/gounbada/koreangirl';

fal.config({ credentials: FAL_KEY });

// ─── 테스트 1: prompt + seed 만 전달 (커스텀 등록 워크플로우 방식) ─────────────
async function test1_promptOnly() {
  console.log('\n======================================');
  console.log('테스트 1: prompt + seed 만 전달');
  console.log('======================================');
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input: {
        prompt: 'beautiful korean woman, cinematic lighting',
        seed:   Math.floor(Math.random() * 1e15),
      },
      logs: true,
      onQueueUpdate: (u) => {
        console.log(`  [Queue] status=${u.status}`, u.queue_position != null ? `pos=${u.queue_position}` : '');
        if (u.logs) u.logs.forEach(l => console.log('  [Log]', l.message));
      },
    });
    console.log('✅ 성공! 결과:', JSON.stringify(result?.data || result, null, 2).slice(0, 800));
  } catch (err) {
    console.error('❌ 실패:', err.message);
    console.error('   body:', typeof err.body === 'object' ? JSON.stringify(err.body, null, 2) : err.body);
  }
}

// ─── 테스트 2: workflow_api 전체 JSON 전달 ──────────────────────────────────
async function test2_workflowApi() {
  console.log('\n======================================');
  console.log('테스트 2: workflow_api 전체 JSON 전달');
  console.log('======================================');
  try {
    const wfRaw = readFileSync(resolve(__dirname, './workflows/KoreanGirl_api.json'), 'utf8');
    const wf = JSON.parse(wfRaw);

    // seed 랜덤화
    if (wf['3']?.inputs?.seed != null) wf['3'].inputs.seed = Math.floor(Math.random() * 1e15);
    if (wf['111']?.inputs?.seed != null) wf['111'].inputs.seed = Math.floor(Math.random() * 1e15);

    const result = await fal.subscribe(ENDPOINT, {
      input: { workflow_api: wf },
      logs: true,
      onQueueUpdate: (u) => {
        console.log(`  [Queue] status=${u.status}`, u.queue_position != null ? `pos=${u.queue_position}` : '');
        if (u.logs) u.logs.forEach(l => console.log('  [Log]', l.message));
      },
    });
    console.log('✅ 성공! 결과:', JSON.stringify(result?.data || result, null, 2).slice(0, 800));
  } catch (err) {
    console.error('❌ 실패:', err.message);
    console.error('   body:', typeof err.body === 'object' ? JSON.stringify(err.body, null, 2) : err.body);
  }
}

// ─── 테스트 4: 입력변수 없이 빈 {} 전달 ──────────────────────────────────────
// fal.ai에 등록된 워크플로우가 입력변수를 노출하지 않으면 빈 {} 로 호출
async function test4_emptyInput() {
  console.log('\n======================================');
  console.log('테스트 4: 빈 {} 입력 (노출 변수 없음)');
  console.log('======================================');
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input: {},           // 입력변수 없는 등록 워크플로우 → 빈 객체
      logs: true,
      onQueueUpdate: (u) => {
        console.log(`  [Queue] status=${u.status}`, u.queue_position != null ? `pos=${u.queue_position}` : '');
        if (u.logs) u.logs.slice(-3).forEach(l => console.log('  [Log]', l.message));
      },
    });
    const data = result?.data || result;
    console.log('✅ 성공!');
    console.log('이미지 URL:', data?.images?.[0]?.url || data?.output?.images?.[0]?.url || '(URL 위치 확인 필요)');
    console.log('전체 data 키:', Object.keys(data || {}));
    console.log('data 미리보기:', JSON.stringify(data, null, 2).slice(0, 600));
  } catch (err) {
    console.error('❌ 실패:', err.message);
    console.error('   body:', typeof err.body === 'object' ? JSON.stringify(err.body, null, 2) : err.body);
  }
}

// 순서대로 실행
(async () => {
  // 테스트 결과:
  //   3. Available keys: [] → 입력변수 노출 없이 등록됨
  //   1. prompt/seed → Unprocessable Entity
  //   2. workflow_api → Unprocessable Entity
  // → 빈 {} 입력으로 시도 (내부 파라미터로 실행)
  await test4_emptyInput();
})();

