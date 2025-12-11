import express from 'express';
import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// 사용자 프로필 조회
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      data: {
        uid: req.user.uid,
        email: userData.email,
        role: userData.role,
        totalPoints: userData.totalPoints || 0,
        dailyBonusClaimed: userData.dailyBonusClaimed || false,
        createdAt: userData.createdAt?.toDate().toISOString(),
        lastLoginAt: userData.lastLoginAt?.toDate().toISOString()
      }
    });
  } catch (error) {
    console.error('프로필 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '프로필 조회 중 오류가 발생했습니다.'
    });
  }
});

// 사용자 프로필 업데이트
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const userRef = doc(db, 'users', req.user.uid);
    const { displayName, photoURL } = req.body;

    const updateData = {
      updatedAt: serverTimestamp()
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    if (photoURL !== undefined) {
      updateData.photoURL = photoURL;
    }

    await setDoc(userRef, updateData, { merge: true });

    res.json({
      success: true,
      message: '프로필이 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '프로필 업데이트 중 오류가 발생했습니다.'
    });
  }
});


export default router;
