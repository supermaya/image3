// Firebase Admin SDK를 사용하여 사용자에게 admin 권한 부여
// Custom Claims (request.auth.token.role) + Firestore role 동시 설정
import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Admin 초기화 (serviceAccountKey 사용)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'pixelplanet-95dd9'
});

const db = admin.firestore();
const auth = admin.auth();

async function setAdminRole(email) {
  try {
    console.log(`🔍 사용자 검색 중: ${email}`);

    // 이메일로 사용자 찾기
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✅ 사용자 발견: ${userRecord.uid}`);

    // ★ Firebase Auth Custom Claims 설정 (Storage/Firestore Rules에서 사용)
    await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });
    console.log(`✅ Custom Claims 설정 완료: role = 'admin'`);

    // Firestore에도 role 저장 (앱 내부 권한 확인용)
    const userRef = db.collection('users').doc(userRecord.uid);
    const userDoc = await userRef.get();
    const existingData = userDoc.exists ? userDoc.data() : {};

    await userRef.set({
      ...existingData,
      email: email,
      role: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✅ Firestore 역할 저장 완료`);
    console.log(`\n🎉 완료! 사용자 ${email} (UID: ${userRecord.uid})에게 admin 권한이 부여되었습니다.`);
    console.log('⚠️  변경사항 적용을 위해 브라우저에서 로그아웃 후 다시 로그인해주세요.');

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ 사용자를 찾을 수 없습니다: ${email}`);
      console.log('Firebase Authentication에서 먼저 사용자를 생성해주세요.');
    } else {
      console.error('오류 발생:', error);
    }
  }
}

// 실행 - 이메일 주소를 여기서 변경하세요
const adminEmail = process.argv[2] || 'admin@metamotion.io';
console.log(`\n🚀 관리자 권한 설정 시작: ${adminEmail}\n`);

setAdminRole(adminEmail)
  .then(() => {
    console.log('\n완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
