/**
 * Storage에 있는 기존 파일들의 Cache-Control 메타데이터를 업데이트하는 스크립트
 *
 * 사용법:
 * node scripts/update-cache-metadata.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 서비스 계정 키가 있다면 사용, 없으면 기본 자격증명 사용
try {
  const serviceAccount = JSON.parse(
    readFileSync('./serviceAccountKey.json', 'utf8')
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'pixelplanet-95dd9.firebasestorage.app'
  });
} catch (error) {
  // 기본 자격증명 사용 (로컬 환경에서 Firebase CLI로 로그인한 경우)
  admin.initializeApp({
    storageBucket: 'pixelplanet-95dd9.firebasestorage.app'
  });
}

const bucket = admin.storage().bucket();

/**
 * 파일 확장자에 따라 적절한 Cache-Control 값을 반환
 */
function getCacheControl(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();

  // 정적 리소스 - 1년 캐시 (immutable)
  const staticAssets = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico',
                        'woff', 'woff2', 'ttf', 'eot', 'js', 'css'];

  // 반정적 리소스 - 1시간 캐시
  const semiStaticAssets = ['json', 'xml', 'txt'];

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
 * 디렉토리의 모든 파일 메타데이터 업데이트
 */
async function updateFilesMetadata(prefix = '') {
  console.log(`\n📁 처리 중: ${prefix || '루트'} 디렉토리`);

  try {
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      console.log('  파일이 없습니다.');
      return;
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of files) {
      try {
        const [metadata] = await file.getMetadata();
        const currentCacheControl = metadata.cacheControl;
        const newCacheControl = getCacheControl(file.name);

        // 이미 올바른 Cache-Control이 설정되어 있으면 건너뛰기
        if (currentCacheControl === newCacheControl) {
          console.log(`  ⏭️  건너뜀: ${file.name} (이미 설정됨)`);
          skipped++;
          continue;
        }

        // 메타데이터 업데이트
        await file.setMetadata({
          cacheControl: newCacheControl
        });

        console.log(`  ✅ 업데이트: ${file.name}`);
        console.log(`      이전: ${currentCacheControl || '(없음)'}`);
        console.log(`      이후: ${newCacheControl}`);
        updated++;

      } catch (error) {
        console.error(`  ❌ 에러: ${file.name}`, error.message);
        errors++;
      }
    }

    console.log(`\n📊 ${prefix || '루트'} 디렉토리 요약:`);
    console.log(`  - 업데이트: ${updated}개`);
    console.log(`  - 건너뜀: ${skipped}개`);
    console.log(`  - 에러: ${errors}개`);

    return { updated, skipped, errors };

  } catch (error) {
    console.error(`❌ 디렉토리 처리 실패: ${error.message}`);
    return { updated: 0, skipped: 0, errors: 1 };
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🚀 Storage 파일 메타데이터 업데이트 시작\n');
  console.log('버킷:', bucket.name);

  // 처리할 디렉토리 목록
  const directories = [
    'gallery',     // 갤러리 공개 영역
    'users',       // 사용자 업로드 영역
    ''             // 루트 디렉토리
  ];

  const totalStats = { updated: 0, skipped: 0, errors: 0 };

  for (const dir of directories) {
    const stats = await updateFilesMetadata(dir);
    if (stats) {
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    }
  }

  console.log('\n✨ 전체 작업 완료!');
  console.log('═══════════════════════════════════');
  console.log(`총 업데이트: ${totalStats.updated}개`);
  console.log(`총 건너뜀: ${totalStats.skipped}개`);
  console.log(`총 에러: ${totalStats.errors}개`);
  console.log('═══════════════════════════════════\n');

  process.exit(totalStats.errors > 0 ? 1 : 0);
}

// 스크립트 실행
main().catch(error => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});
