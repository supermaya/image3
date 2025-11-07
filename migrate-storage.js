/**
 * Storage 마이그레이션 스크립트
 * images/** 와 audio/** 파일들을 gallery/** 경로로 이동
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Firebase Admin 초기화
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'pixelplanet-95dd9.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function migrateStorageFiles() {
  console.log('🚀 Storage 파일 마이그레이션 시작...\n');

  try {
    // 1. 모든 음악 문서 가져오기
    const musicSnapshot = await db.collection('music').get();
    console.log(`📊 총 ${musicSnapshot.size}개의 음악 문서를 찾았습니다.\n`);

    let totalMigrated = 0;
    let totalErrors = 0;

    // 2. 각 음악 문서 처리
    for (const doc of musicSnapshot.docs) {
      const musicData = doc.data();
      const musicId = doc.id;
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🎵 처리 중: ${musicData.name || musicId}`);

      let updated = false;
      const updateData = {};

      // 3. 오디오 파일 마이그레이션
      if (musicData.audioSrc) {
        try {
          const audioPath = extractStoragePath(musicData.audioSrc);

          if (audioPath && !audioPath.startsWith('gallery/')) {
            console.log(`  📁 오디오 파일: ${audioPath}`);
            const newAudioPath = `gallery/${audioPath}`;

            // 파일 복사
            await copyFile(audioPath, newAudioPath);

            // 새 URL 생성
            const newAudioUrl = await getDownloadURL(newAudioPath);
            updateData.audioSrc = newAudioUrl;

            console.log(`  ✅ 오디오 마이그레이션 완료: ${newAudioPath}`);
            totalMigrated++;
            updated = true;
          }
        } catch (error) {
          console.error(`  ❌ 오디오 마이그레이션 실패:`, error.message);
          totalErrors++;
        }
      }

      // 4. 이미지 파일들 마이그레이션
      if (musicData.images && Array.isArray(musicData.images)) {
        const newImages = [];

        for (let i = 0; i < musicData.images.length; i++) {
          const image = musicData.images[i];

          try {
            const imagePath = extractStoragePath(image.imageSrc);

            if (imagePath && !imagePath.startsWith('gallery/')) {
              console.log(`  📁 이미지 ${i + 1}: ${imagePath}`);
              const newImagePath = `gallery/${imagePath}`;

              // 파일 복사
              await copyFile(imagePath, newImagePath);

              // 새 URL 생성
              const newImageUrl = await getDownloadURL(newImagePath);
              newImages.push({
                ...image,
                imageSrc: newImageUrl
              });

              console.log(`  ✅ 이미지 ${i + 1} 마이그레이션 완료: ${newImagePath}`);
              totalMigrated++;
              updated = true;
            } else {
              newImages.push(image);
            }
          } catch (error) {
            console.error(`  ❌ 이미지 ${i + 1} 마이그레이션 실패:`, error.message);
            totalErrors++;
            newImages.push(image);
          }
        }

        if (newImages.length > 0) {
          updateData.images = newImages;
        }
      }

      // 5. Firestore 문서 업데이트
      if (updated) {
        await db.collection('music').doc(musicId).update(updateData);
        console.log(`  💾 Firestore 문서 업데이트 완료`);
      } else {
        console.log(`  ⏭️  마이그레이션 불필요 (이미 gallery 경로)`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ 마이그레이션 완료!`);
    console.log(`📊 총 ${totalMigrated}개 파일 마이그레이션`);
    if (totalErrors > 0) {
      console.log(`⚠️  ${totalErrors}개 파일 마이그레이션 실패`);
    }

  } catch (error) {
    console.error('❌ 마이그레이션 중 오류 발생:', error);
    throw error;
  }
}

// URL에서 Storage 경로 추출
function extractStoragePath(url) {
  if (!url || !url.includes('firebasestorage.googleapis.com')) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);

    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
  } catch (error) {
    console.error('URL 파싱 오류:', error);
  }

  return null;
}

// 파일 복사
async function copyFile(sourcePath, destPath) {
  const sourceFile = bucket.file(sourcePath);
  const destFile = bucket.file(destPath);

  // 파일이 이미 존재하는지 확인
  const [destExists] = await destFile.exists();
  if (destExists) {
    console.log(`    ℹ️  대상 파일이 이미 존재함: ${destPath}`);
    return;
  }

  // 파일 복사
  await sourceFile.copy(destFile);
}

// Download URL 생성
async function getDownloadURL(path) {
  const file = bucket.file(path);

  // 파일을 공개로 설정
  await file.makePublic();

  // 공개 URL 반환
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
}

// 스크립트 실행
migrateStorageFiles()
  .then(() => {
    console.log('\n🎉 모든 작업이 완료되었습니다!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 오류 발생:', error);
    process.exit(1);
  });
