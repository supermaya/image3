// Firebase Admin SDK 설정
import admin from 'firebase-admin';

// Firebase Admin 초기화 (이미 초기화되어 있으면 무시됨)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

export { db, auth, storage };
