// Firebase 설정 및 초기화
import { config as dotenvConfig } from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// ES Module에서 firebase.js가 먼저 로드될 수 있으므로 여기서 직접 dotenv 로드
dotenvConfig();

// Firebase 설정 (환경변수에서 가져오기)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firestore 데이터베이스 인스턴스
const db = getFirestore(app);

// Firebase Authentication 인스턴스
const auth = getAuth(app);

// Firebase Storage 인스턴스
const storage = getStorage(app);

export { db, auth, storage, app };
