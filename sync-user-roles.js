import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Service Account 키 파일 읽기
const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function syncUserRoles() {
  try {
    console.log('🔄 사용자 role을 커스텀 클레임으로 동기화 시작...\n');

    // Firestore의 모든 사용자 가져오기
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      console.log('❌ users 컬렉션에 사용자가 없습니다.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;
      const role = userData.role || 'user';
      const email = userData.email;

      try {
        // Firebase Auth에 커스텀 클레임 설정
        await auth.setCustomUserClaims(uid, { role });

        console.log(`✅ ${email || uid}`);
        console.log(`   UID: ${uid}`);
        console.log(`   Role: ${role}`);
        console.log('');

        successCount++;
      } catch (error) {
        console.error(`❌ ${email || uid} - 실패:`, error.message);
        errorCount++;
      }
    }

    console.log('\n=== 완료 ===');
    console.log(`성공: ${successCount}명`);
    console.log(`실패: ${errorCount}명`);
    console.log('\n✨ 사용자는 다시 로그인해야 새로운 권한이 적용됩니다.');

  } catch (error) {
    console.error('❌ 동기화 중 오류 발생:', error);
  } finally {
    process.exit(0);
  }
}

// 스크립트 실행
syncUserRoles();
