import express from 'express';
import { db } from '../config/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 포인트 조회
router.get('/', verifyToken, async (req, res) => {
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
        totalPoints: userData.totalPoints || 0,
        dailyBonusClaimed: userData.dailyBonusClaimed || false,
        dailyBonusLastClaimed: userData.dailyBonusLastClaimed
      }
    });
  } catch (error) {
    console.error('포인트 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '포인트 조회 중 오류가 발생했습니다.'
    });
  }
});

// 일일 보너스 수령
router.post('/daily-bonus', verifyToken, async (req, res) => {
  try {
    const userRef = doc(db, 'users', req.user.uid);

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      const userData = userDoc.data();
      const lastClaimed = userData.dailyBonusLastClaimed;
      const now = new Date();

      // 오늘 이미 보너스를 받았는지 확인
      if (lastClaimed) {
        const lastClaimedDate = lastClaimed.toDate();
        const isSameDay =
          lastClaimedDate.getFullYear() === now.getFullYear() &&
          lastClaimedDate.getMonth() === now.getMonth() &&
          lastClaimedDate.getDate() === now.getDate();

        if (isSameDay) {
          throw new Error('오늘 이미 일일 보너스를 받았습니다.');
        }
      }

      const bonusAmount = 60;
      const newTotalPoints = (userData.totalPoints || 0) + bonusAmount;

      // 사용자 포인트 업데이트
      transaction.set(userRef, {
        totalPoints: newTotalPoints,
        dailyBonusClaimed: true,
        dailyBonusLastClaimed: serverTimestamp()
      }, { merge: true });

      // 거래 내역 추가
      const transactionRef = collection(db, 'pointTransactions');
      transaction.set(doc(transactionRef), {
        userId: req.user.uid,
        type: 'daily_bonus',
        amount: bonusAmount,
        description: '일일 보너스',
        createdAt: serverTimestamp()
      });
    });

    // 업데이트된 사용자 정보 조회
    const updatedUserDoc = await getDoc(userRef);
    const updatedUserData = updatedUserDoc.data();

    res.json({
      success: true,
      message: '일일 보너스 60P가 지급되었습니다.',
      data: {
        totalPoints: updatedUserData.totalPoints,
        dailyBonusClaimed: true
      }
    });
  } catch (error) {
    console.error('일일 보너스 수령 오류:', error);

    let message = '일일 보너스 수령 중 오류가 발생했습니다.';
    if (error.message === '오늘 이미 일일 보너스를 받았습니다.') {
      message = error.message;
    }

    res.status(400).json({
      success: false,
      message
    });
  }
});

// 포인트 사용 (갤러리 접근)
router.post('/use', verifyToken, async (req, res) => {
  try {
    const { amount = 17, reason = '갤러리 접근' } = req.body;
    const userRef = doc(db, 'users', req.user.uid);

    // 사용자 정보 조회
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const userData = userDoc.data();
    const userRole = userData.role;

    // 크리에이터 또는 관리자가 갤러리 접근하는 경우 포인트 차감하지 않음
    if ((userRole === 'creator' || userRole === 'admin') && reason === '갤러리 접근') {
      // 갤러리 접근 로그만 추가 (포인트 차감 없음)
      const logRef = collection(db, 'galleryAccessLogs');
      await setDoc(doc(logRef), {
        userId: req.user.uid,
        pointsUsed: 0,
        accessedAt: serverTimestamp(),
        freeAccess: true,
        role: userRole
      });

      return res.json({
        success: true,
        message: '크리에이터/관리자는 무료로 갤러리에 접근할 수 있습니다.',
        data: {
          totalPoints: userData.totalPoints || 0,
          usedAmount: 0,
          freeAccess: true
        }
      });
    }

    // 일반 사용자는 포인트 차감
    let newTotalPoints;

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      const userData = userDoc.data();
      const currentPoints = userData.totalPoints || 0;

      if (currentPoints < amount) {
        throw new Error(`포인트가 부족합니다. 필요: ${amount}P, 보유: ${currentPoints}P`);
      }

      newTotalPoints = currentPoints - amount;

      // 사용자 포인트 차감
      transaction.set(userRef, {
        totalPoints: newTotalPoints
      }, { merge: true });

      // 거래 내역 추가
      const transactionRef = collection(db, 'pointTransactions');
      transaction.set(doc(transactionRef), {
        userId: req.user.uid,
        type: 'usage',
        amount: -amount,
        description: reason,
        createdAt: serverTimestamp()
      });

      // 갤러리 접근 로그 추가 (reason이 갤러리 접근인 경우)
      if (reason === '갤러리 접근') {
        const logRef = collection(db, 'galleryAccessLogs');
        transaction.set(doc(logRef), {
          userId: req.user.uid,
          pointsUsed: amount,
          accessedAt: serverTimestamp(),
          freeAccess: false
        });
      }
    });

    res.json({
      success: true,
      message: `${amount}P가 차감되었습니다.`,
      data: {
        totalPoints: newTotalPoints,
        usedAmount: amount
      }
    });
  } catch (error) {
    console.error('포인트 사용 오류:', error);

    let message = '포인트 사용 중 오류가 발생했습니다.';
    if (error.message.includes('포인트가 부족합니다')) {
      message = error.message;
    }

    res.status(400).json({
      success: false,
      message
    });
  }
});

// 포인트 거래 내역 조회
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const { limitCount = 50 } = req.query;

    const transactionsRef = collection(db, 'pointTransactions');
    const q = query(
      transactionsRef,
      where('userId', '==', req.user.uid),
      orderBy('createdAt', 'desc'),
      limit(parseInt(limitCount))
    );

    const querySnapshot = await getDocs(q);
    const transactions = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        type: data.type,
        amount: data.amount,
        description: data.description,
        createdAt: data.createdAt?.toDate().toISOString()
      });
    });

    res.json({
      success: true,
      data: {
        transactions,
        count: transactions.length
      }
    });
  } catch (error) {
    console.error('거래 내역 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '거래 내역 조회 중 오류가 발생했습니다.'
    });
  }
});

// 포인트 추가 (관리자 전용)
router.post('/add', verifyToken, async (req, res) => {
  try {
    // 관리자 권한 확인
    const adminRef = doc(db, 'users', req.user.uid);
    const adminDoc = await getDoc(adminRef);

    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }

    const { userId, amount, reason = '관리자 지급' } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 요청입니다.'
      });
    }

    const userRef = doc(db, 'users', userId);

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists()) {
        throw new Error('대상 사용자를 찾을 수 없습니다.');
      }

      const userData = userDoc.data();
      const newTotalPoints = (userData.totalPoints || 0) + amount;

      // 사용자 포인트 추가
      transaction.set(userRef, {
        totalPoints: newTotalPoints
      }, { merge: true });

      // 거래 내역 추가
      const transactionRef = collection(db, 'pointTransactions');
      transaction.set(doc(transactionRef), {
        userId: userId,
        type: 'admin_grant',
        amount: amount,
        description: reason,
        grantedBy: req.user.uid,
        createdAt: serverTimestamp()
      });
    });

    res.json({
      success: true,
      message: `${amount}P가 지급되었습니다.`
    });
  } catch (error) {
    console.error('포인트 추가 오류:', error);
    res.status(500).json({
      success: false,
      message: '포인트 추가 중 오류가 발생했습니다.'
    });
  }
});

export default router;
