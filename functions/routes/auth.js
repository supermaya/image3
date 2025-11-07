import express from 'express';
import { auth, db } from '../config/firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 회원가입
router.post('/signup', async (req, res) => {
  try {
    const { email, password, role = 'user' } = req.body;

    // 입력 검증
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '이메일과 비밀번호를 입력해주세요.'
      });
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '비밀번호는 최소 6자 이상이어야 합니다.'
      });
    }

    // Firebase Authentication으로 사용자 생성
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore에 사용자 정보 저장
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      email: email,
      role: role === 'creator' ? 'creator' : 'user', // user 또는 creator
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      totalPoints: 0,
      dailyBonusClaimed: false,
      dailyBonusLastClaimed: null
    });

    // JWT 토큰 생성
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: {
        token,
        user: {
          uid: user.uid,
          email: user.email,
          role: role === 'creator' ? 'creator' : 'user'
        }
      }
    });
  } catch (error) {
    console.error('회원가입 오류:', error);

    // Firebase 에러 메시지 처리
    let message = '회원가입 중 오류가 발생했습니다.';
    if (error.code === 'auth/email-already-in-use') {
      message = '이미 사용 중인 이메일입니다.';
    } else if (error.code === 'auth/invalid-email') {
      message = '유효하지 않은 이메일 형식입니다.';
    } else if (error.code === 'auth/weak-password') {
      message = '비밀번호가 너무 약합니다.';
    }

    res.status(400).json({
      success: false,
      message
    });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 입력 검증
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '이메일과 비밀번호를 입력해주세요.'
      });
    }

    // Firebase Authentication으로 로그인
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore에서 사용자 정보 조회
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '사용자 정보를 찾을 수 없습니다.'
      });
    }

    const userData = userDoc.data();

    // 마지막 로그인 시간 업데이트
    await setDoc(userRef, {
      lastLoginAt: serverTimestamp()
    }, { merge: true });

    // JWT 토큰 생성
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: '로그인 성공',
      data: {
        token,
        user: {
          uid: user.uid,
          email: user.email,
          role: userData.role || 'user',
          totalPoints: userData.totalPoints || 0,
          dailyBonusClaimed: userData.dailyBonusClaimed || false
        }
      }
    });
  } catch (error) {
    console.error('로그인 오류:', error);

    // Firebase 에러 메시지 처리
    let message = '로그인 중 오류가 발생했습니다.';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      message = '이메일 또는 비밀번호가 올바르지 않습니다.';
    } else if (error.code === 'auth/invalid-email') {
      message = '유효하지 않은 이메일 형식입니다.';
    } else if (error.code === 'auth/user-disabled') {
      message = '비활성화된 계정입니다.';
    } else if (error.code === 'auth/invalid-credential') {
      message = '이메일 또는 비밀번호가 올바르지 않습니다.';
    }

    res.status(401).json({
      success: false,
      message
    });
  }
});

// 로그아웃
router.post('/logout', verifyToken, async (req, res) => {
  try {
    await signOut(auth);
    res.json({
      success: true,
      message: '로그아웃 성공'
    });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    res.status(500).json({
      success: false,
      message: '로그아웃 중 오류가 발생했습니다.'
    });
  }
});

// 로그인 상태 확인
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '사용자 정보를 찾을 수 없습니다.'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      data: {
        uid: req.user.uid,
        email: req.user.email,
        role: userData.role || 'user',
        totalPoints: userData.totalPoints || 0,
        dailyBonusClaimed: userData.dailyBonusClaimed || false
      }
    });
  } catch (error) {
    console.error('상태 확인 오류:', error);
    res.status(500).json({
      success: false,
      message: '상태 확인 중 오류가 발생했습니다.'
    });
  }
});

export default router;
