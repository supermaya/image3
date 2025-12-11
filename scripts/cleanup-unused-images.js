import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin 초기화
admin.initializeApp({
  storageBucket: 'pixelplanet-95dd9.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Storage의 gallery/image 폴더에서 사용되지 않는 이미지 삭제
 * @param {boolean} dryRun - true이면 실제 삭제하지 않고 목록만 출력
 */
async function cleanupUnusedImages(dryRun = true) {
  console.log('🔍 사용되지 않는 이미지 찾기 시작...');
  console.log(`모드: ${dryRun ? '시뮬레이션 (삭제 안 함)' : '실제 삭제'}\n`);

  try {
    // 1. Storage의 gallery/image 폴더에 있는 모든 이미지 파일 목록 가져오기
    console.log('📂 Storage에서 gallery/image 폴더의 이미지 목록 가져오는 중...');
    const [files] = await bucket.getFiles({
      prefix: 'gallery/image/'
    });

    console.log(`✅ Storage에서 ${files.length}개의 파일 발견\n`);

    // 파일 URL 추출 (full path)
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

    console.log(`📊 gallery/image 폴더의 이미지 파일: ${storageImages.size}개\n`);

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
    console.log(`   (총 ${musicSnapshot.size}개의 음악 항목 확인)\n`);

    // 3. 사용되지 않는 이미지 찾기
    console.log('🔍 사용되지 않는 이미지 비교 중...\n');
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

    // 결과 출력
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 분석 결과:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`총 이미지 파일: ${storageImages.size}개`);
    console.log(`사용 중인 이미지: ${usedImages.size}개`);
    console.log(`사용되지 않는 이미지: ${unusedImages.length}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (unusedImages.length === 0) {
      console.log('✅ 삭제할 이미지가 없습니다.');
      return {
        success: true,
        deletedCount: 0,
        message: '사용되지 않는 이미지가 없습니다.'
      };
    }

    // 사용되지 않는 이미지 목록 출력
    console.log('🗑️  사용되지 않는 이미지 목록:\n');
    unusedImages.forEach((img, index) => {
      const sizeInKB = (parseInt(img.size) / 1024).toFixed(2);
      console.log(`${index + 1}. ${img.name}`);
      console.log(`   URL: ${img.url}`);
      console.log(`   크기: ${sizeInKB} KB`);
      console.log(`   업데이트: ${img.updated}`);
      console.log('');
    });

    // 4. 삭제 작업
    if (dryRun) {
      console.log('⚠️  시뮬레이션 모드: 실제로 삭제하지 않습니다.');
      console.log('💡 실제로 삭제하려면 dryRun=false로 다시 실행하세요.\n');
      return {
        success: true,
        deletedCount: 0,
        unusedCount: unusedImages.length,
        message: '시뮬레이션 모드로 실행됨'
      };
    }

    // 실제 삭제 진행
    console.log('🗑️  실제 삭제 시작...\n');
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

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 삭제 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`성공: ${deletedCount}개`);
    console.log(`실패: ${errors.length}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (errors.length > 0) {
      console.log('❌ 삭제 실패한 파일:');
      errors.forEach(err => {
        console.log(`   - ${err.name}: ${err.error}`);
      });
    }

    return {
      success: true,
      deletedCount,
      errorCount: errors.length,
      errors,
      message: `${deletedCount}개의 이미지가 삭제되었습니다.`
    };

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
const execute = process.argv.includes('--execute') || process.argv.includes('-e');

if (!dryRun && !execute) {
  console.log('⚠️  사용법:');
  console.log('  시뮬레이션 모드: node cleanup-unused-images.js --dry-run');
  console.log('  실제 삭제 모드: node cleanup-unused-images.js --execute');
  console.log('');
  console.log('기본적으로 시뮬레이션 모드로 실행합니다...\n');
}

cleanupUnusedImages(!execute)
  .then(result => {
    console.log('✅ 작업 완료:', result.message);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 작업 실패:', error);
    process.exit(1);
  });
