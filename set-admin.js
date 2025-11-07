// Firebase Admin SDK를 사용하여 사용자에게 admin 권한 부여
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Firebase Admin 초기화
admin.initializeApp({
  projectId: 'pixelplanet-95dd9'
});

const db = admin.firestore();
const auth = admin.auth();

async function setAdminRole(email) {
  try {
    console.log(`Searching for user: ${email}`);

    // 이메일로 사용자 찾기
    const userRecord = await auth.getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid}`);

    // Firestore에 사용자 문서 생성/업데이트
    const userRef = db.collection('users').doc(userRecord.uid);

    // 기존 데이터 가져오기
    const userDoc = await userRef.get();
    const existingData = userDoc.exists ? userDoc.data() : {};

    // admin role 설정
    await userRef.set({
      ...existingData,
      email: email,
      role: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✅ Successfully set admin role for ${email}`);
    console.log(`   User ID: ${userRecord.uid}`);

    // 업데이트된 데이터 확인
    const updatedDoc = await userRef.get();
    console.log('   Updated user data:', updatedDoc.data());

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User not found: ${email}`);
      console.log('Please create this user in Firebase Authentication first.');
    } else {
      console.error('Error:', error);
    }
  }
}

// 실행
const adminEmail = 'admin@metamotion.io';
setAdminRole(adminEmail)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
