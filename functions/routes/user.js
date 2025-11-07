import express from 'express';
import { db } from '../config/firebase.js';
import admin from 'firebase-admin';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// 사용자 프로필 조회
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
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
    const { displayName, photoURL } = req.body;

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    if (photoURL !== undefined) {
      updateData.photoURL = photoURL;
    }

    await db.collection('users').doc(req.user.uid).set(updateData, { merge: true });

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

// 사용자 성인 인증 상태 조회
router.get('/adult-verification', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const userData = userDoc.data();
    const isAdultVerified = userData.isAdultVerified || false;

    res.json({
      success: true,
      data: {
        isAdultVerified: isAdultVerified
      }
    });
  } catch (error) {
    console.error('성인 인증 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '성인 인증 상태 조회 중 오류가 발생했습니다.'
    });
  }
});

// 관리자: 사용자 성인 인증 상태 변경
router.put('/admin/adult-verification/:userId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isAdultVerified } = req.body;

    if (typeof isAdultVerified !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isAdultVerified는 boolean 값이어야 합니다.'
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    await userRef.update({
      isAdultVerified: isAdultVerified,
      adultVerificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      adultVerificationUpdatedBy: req.user.uid
    });

    res.json({
      success: true,
      message: `사용자의 성인 인증 상태가 ${isAdultVerified ? '승인' : '취소'}되었습니다.`,
      data: {
        userId: userId,
        isAdultVerified: isAdultVerified
      }
    });
  } catch (error) {
    console.error('성인 인증 상태 변경 오류:', error);
    res.status(500).json({
      success: false,
      message: '성인 인증 상태 변경 중 오류가 발생했습니다.'
    });
  }
});

export default router;
