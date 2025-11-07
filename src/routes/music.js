import express from 'express';
import { db } from '../config/firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { verifyToken, requireCreator } from '../middleware/auth.js';

const router = express.Router();

// 음악 목록 조회
router.get('/', verifyToken, async (req, res) => {
  try {
    const {
      category,
      classification,
      searchTerm,
      limitCount = 50,
      orderField = 'createdAt',
      orderDirection = 'desc'
    } = req.query;

    // 현재 사용자의 성인 인증 상태 확인
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);
    const isAdultVerified = userDoc.exists() ? userDoc.data().isAdultVerified || false : false;

    // 모든 카테고리 정보 조회 (성인 카테고리 판별용)
    const categoriesSnapshot = await getDocs(collection(db, 'categories'));
    const adultCategories = new Set();
    categoriesSnapshot.forEach((catDoc) => {
      const catData = catDoc.data();
      if (catData.isAdult === true) {
        adultCategories.add(catData.name);
      }
    });

    const musicRef = collection(db, 'music');
    let q = query(musicRef);

    // 필터 적용
    if (category) {
      // 성인용 카테고리인데 인증이 안된 경우 접근 차단
      if (adultCategories.has(category) && !isAdultVerified) {
        return res.status(403).json({
          success: false,
          message: '성인 인증이 필요한 카테고리입니다.',
          requireAdultVerification: true
        });
      }
      q = query(q, where('category', '==', category));
    }

    if (classification) {
      q = query(q, where('classification', '==', classification));
    }

    // 정렬 및 제한
    q = query(q, orderBy(orderField, orderDirection), limit(parseInt(limitCount)));

    const querySnapshot = await getDocs(q);
    let musicList = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const musicCategory = data.category;

      // 성인용 카테고리의 음악이고 사용자가 성인 인증이 안된 경우 제외
      if (adultCategories.has(musicCategory) && !isAdultVerified) {
        return; // 이 음악은 건너뛰기
      }

      musicList.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString(),
        uploadedAt: data.uploadedAt?.toDate().toISOString()
      });
    });

    // 클라이언트 측에서 검색어 필터링 (Firestore의 제한된 검색 기능 보완)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      musicList = musicList.filter(music =>
        music.title?.toLowerCase().includes(term) ||
        music.artist?.toLowerCase().includes(term) ||
        music.tags?.some(tag => tag.toLowerCase().includes(term))
      );
    }

    res.json({
      success: true,
      data: {
        music: musicList,
        count: musicList.length,
        isAdultVerified: isAdultVerified
      }
    });
  } catch (error) {
    console.error('음악 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 목록 조회 중 오류가 발생했습니다.'
    });
  }
});

// 특정 음악 조회
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const musicRef = doc(db, 'music', req.params.id);
    const musicDoc = await getDoc(musicRef);

    if (!musicDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '음악을 찾을 수 없습니다.'
      });
    }

    const data = musicDoc.data();
    const musicCategory = data.category;

    // 현재 사용자의 성인 인증 상태 확인
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);
    const isAdultVerified = userDoc.exists() ? userDoc.data().isAdultVerified || false : false;

    // 카테고리가 성인용인지 확인
    if (musicCategory) {
      const categoryRef = doc(db, 'categories', musicCategory);
      const categoryDoc = await getDoc(categoryRef);

      if (categoryDoc.exists()) {
        const categoryData = categoryDoc.data();
        if (categoryData.isAdult === true && !isAdultVerified) {
          return res.status(403).json({
            success: false,
            message: '성인 인증이 필요한 컨텐츠입니다.',
            requireAdultVerification: true
          });
        }
      } else {
        // 카테고리 이름으로 다시 검색 (이전 방식 호환)
        const categoriesSnapshot = await getDocs(
          query(collection(db, 'categories'), where('name', '==', musicCategory))
        );
        if (!categoriesSnapshot.empty) {
          const categoryData = categoriesSnapshot.docs[0].data();
          if (categoryData.isAdult === true && !isAdultVerified) {
            return res.status(403).json({
              success: false,
              message: '성인 인증이 필요한 컨텐츠입니다.',
              requireAdultVerification: true
            });
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        id: musicDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString(),
        uploadedAt: data.uploadedAt?.toDate().toISOString()
      }
    });
  } catch (error) {
    console.error('음악 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 조회 중 오류가 발생했습니다.'
    });
  }
});

// 음악 업로드 (크리에이터 전용)
router.post('/', verifyToken, requireCreator, async (req, res) => {
  try {
    const {
      title,
      artist,
      audioUrl,
      imageUrl,
      category,
      classification,
      tags = [],
      duration,
      recommended = false
    } = req.body;

    // 필수 필드 검증
    if (!title || !artist || !audioUrl) {
      return res.status(400).json({
        success: false,
        message: '제목, 아티스트, 오디오 URL은 필수입니다.'
      });
    }

    // 새 음악 문서 생성
    const musicRef = doc(collection(db, 'music'));
    await setDoc(musicRef, {
      title,
      artist,
      audioUrl,
      imageUrl: imageUrl || '',
      category: category || 'uncategorized',
      classification: classification || 'general',
      tags: Array.isArray(tags) ? tags : [],
      duration: duration || 0,
      recommended: recommended || false,
      uploadedBy: req.user.uid,
      uploadedByEmail: req.user.email,
      createdAt: serverTimestamp(),
      uploadedAt: serverTimestamp(),
      playCount: 0,
      likeCount: 0
    });

    res.status(201).json({
      success: true,
      message: '음악이 업로드되었습니다.',
      data: {
        id: musicRef.id
      }
    });
  } catch (error) {
    console.error('음악 업로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 업로드 중 오류가 발생했습니다.'
    });
  }
});

// 음악 수정
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const musicRef = doc(db, 'music', req.params.id);
    const musicDoc = await getDoc(musicRef);

    if (!musicDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '음악을 찾을 수 없습니다.'
      });
    }

    const musicData = musicDoc.data();

    // 본인이 업로드한 음악인지 확인 (관리자는 모든 음악 수정 가능)
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);
    const isAdmin = userDoc.exists() && userDoc.data().role === 'admin';

    if (musicData.uploadedBy !== req.user.uid && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: '본인이 업로드한 음악만 수정할 수 있습니다.'
      });
    }

    // 업데이트할 필드
    const updateData = {};
    const allowedFields = [
      'title',
      'artist',
      'imageUrl',
      'category',
      'classification',
      'tags',
      'duration',
      'recommended'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    updateData.updatedAt = serverTimestamp();

    await setDoc(musicRef, updateData, { merge: true });

    res.json({
      success: true,
      message: '음악 정보가 수정되었습니다.'
    });
  } catch (error) {
    console.error('음악 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 수정 중 오류가 발생했습니다.'
    });
  }
});

// 음악 삭제
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const musicRef = doc(db, 'music', req.params.id);
    const musicDoc = await getDoc(musicRef);

    if (!musicDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '음악을 찾을 수 없습니다.'
      });
    }

    const musicData = musicDoc.data();

    // 본인이 업로드한 음악인지 확인 (관리자는 모든 음악 삭제 가능)
    const userRef = doc(db, 'users', req.user.uid);
    const userDoc = await getDoc(userRef);
    const isAdmin = userDoc.exists() && userDoc.data().role === 'admin';

    if (musicData.uploadedBy !== req.user.uid && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: '본인이 업로드한 음악만 삭제할 수 있습니다.'
      });
    }

    await deleteDoc(musicRef);

    res.json({
      success: true,
      message: '음악이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('음악 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 저장된 음악 목록 조회
router.get('/saved/list', verifyToken, async (req, res) => {
  try {
    const savedMusicRef = collection(db, 'savedMusic', req.user.uid, 'tracks');
    const querySnapshot = await getDocs(savedMusicRef);

    const savedMusic = [];

    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();

      // 원본 음악 정보 조회
      const musicRef = doc(db, 'music', data.musicId);
      const musicDoc = await getDoc(musicRef);

      if (musicDoc.exists()) {
        const musicData = musicDoc.data();
        savedMusic.push({
          id: docSnapshot.id,
          musicId: data.musicId,
          savedAt: data.savedAt?.toDate().toISOString(),
          ...musicData
        });
      }
    }

    res.json({
      success: true,
      data: {
        savedMusic,
        count: savedMusic.length
      }
    });
  } catch (error) {
    console.error('저장된 음악 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '저장된 음악 조회 중 오류가 발생했습니다.'
    });
  }
});

// 음악 저장
router.post('/saved/:musicId', verifyToken, async (req, res) => {
  try {
    const { musicId } = req.params;

    // 음악 존재 확인
    const musicRef = doc(db, 'music', musicId);
    const musicDoc = await getDoc(musicRef);

    if (!musicDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '음악을 찾을 수 없습니다.'
      });
    }

    // 저장
    const savedMusicRef = doc(db, 'savedMusic', req.user.uid, 'tracks', musicId);
    await setDoc(savedMusicRef, {
      musicId,
      userId: req.user.uid,
      savedAt: serverTimestamp()
    });

    res.json({
      success: true,
      message: '음악이 저장되었습니다.'
    });
  } catch (error) {
    console.error('음악 저장 오류:', error);
    res.status(500).json({
      success: false,
      message: '음악 저장 중 오류가 발생했습니다.'
    });
  }
});

// 저장된 음악 삭제
router.delete('/saved/:musicId', verifyToken, async (req, res) => {
  try {
    const { musicId } = req.params;
    const savedMusicRef = doc(db, 'savedMusic', req.user.uid, 'tracks', musicId);

    const savedDoc = await getDoc(savedMusicRef);
    if (!savedDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '저장된 음악을 찾을 수 없습니다.'
      });
    }

    await deleteDoc(savedMusicRef);

    res.json({
      success: true,
      message: '저장된 음악이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('저장된 음악 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '저장된 음악 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 카테고리 목록 조회
router.get('/categories/list', verifyToken, async (req, res) => {
  try {
    const categoriesRef = collection(db, 'categories');
    const querySnapshot = await getDocs(categoriesRef);

    // 현재 사용자의 성인 인증 상태 확인
    const userDoc = await getDoc(doc(db, 'users', req.user.uid));
    const isAdultVerified = userDoc.exists() ? userDoc.data().isAdultVerified || false : false;

    const categories = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const isAdult = data.isAdult || false;

      // 성인용 카테고리는 성인 인증된 사용자만 볼 수 있음
      if (isAdult && !isAdultVerified) {
        return; // 성인 인증 안된 사용자는 성인 카테고리 제외
      }

      categories.push({
        id: doc.id,
        name: data.name,
        classification: data.classification,
        description: data.description,
        isAdult: isAdult
      });
    });

    // 이름순으로 정렬
    categories.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        categories,
        count: categories.length,
        isAdultVerified: isAdultVerified
      }
    });
  } catch (error) {
    console.error('카테고리 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '카테고리 목록 조회 중 오류가 발생했습니다.'
    });
  }
});

// 카테고리 생성 (크리에이터 이상 권한 필요)
router.post('/categories/create', verifyToken, requireCreator, async (req, res) => {
  try {
    const { name, classification, description, isAdult } = req.body;

    // 필수 필드 검증
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '카테고리 이름은 필수입니다.'
      });
    }

    if (!classification || !classification.trim()) {
      return res.status(400).json({
        success: false,
        message: '분류는 필수입니다.'
      });
    }

    // 분류 유효성 검증
    const validClassifications = ['인물', '패션', '화보', '시네마틱'];
    if (!validClassifications.includes(classification)) {
      return res.status(400).json({
        success: false,
        message: '올바른 분류를 선택하세요. (인물, 패션, 화보, 시네마틱)'
      });
    }

    // 중복 확인
    const categoriesRef = collection(db, 'categories');
    const q = query(categoriesRef, where('name', '==', name.trim()));
    const existingDocs = await getDocs(q);

    if (!existingDocs.empty) {
      return res.status(409).json({
        success: false,
        message: '이미 존재하는 카테고리입니다.'
      });
    }

    // 새 카테고리 생성
    const newCategoryRef = doc(collection(db, 'categories'));
    const categoryData = {
      name: name.trim(),
      classification: classification.trim(),
      description: description?.trim() || '',
      isAdult: isAdult === true, // 성인용 카테고리 여부
      createdAt: serverTimestamp(),
      createdBy: req.user.uid
    };

    await setDoc(newCategoryRef, categoryData);

    res.json({
      success: true,
      message: '카테고리가 생성되었습니다.',
      data: {
        id: newCategoryRef.id,
        ...categoryData
      }
    });
  } catch (error) {
    console.error('카테고리 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '카테고리 생성 중 오류가 발생했습니다.'
    });
  }
});

// 카테고리 수정 (크리에이터 이상 권한 필요)
router.put('/categories/:id', verifyToken, requireCreator, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, classification, description, isAdult } = req.body;

    // 카테고리 존재 확인
    const categoryRef = doc(db, 'categories', id);
    const categoryDoc = await getDoc(categoryRef);

    if (!categoryDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: '카테고리를 찾을 수 없습니다.'
      });
    }

    // 업데이트할 데이터 구성
    const updateData = {};

    if (name && name.trim()) {
      // 이름 중복 확인 (자기 자신 제외)
      const categoriesRef = collection(db, 'categories');
      const q = query(categoriesRef, where('name', '==', name.trim()));
      const existingDocs = await getDocs(q);

      let isDuplicate = false;
      existingDocs.forEach((doc) => {
        if (doc.id !== id) {
          isDuplicate = true;
        }
      });

      if (isDuplicate) {
        return res.status(409).json({
          success: false,
          message: '이미 존재하는 카테고리 이름입니다.'
        });
      }

      updateData.name = name.trim();
    }

    if (classification && classification.trim()) {
      const validClassifications = ['인물', '패션', '화보', '시네마틱'];
      if (!validClassifications.includes(classification)) {
        return res.status(400).json({
          success: false,
          message: '올바른 분류를 선택하세요. (인물, 패션, 화보, 시네마틱)'
        });
      }
      updateData.classification = classification.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || '';
    }

    if (isAdult !== undefined) {
      updateData.isAdult = isAdult === true;
    }

    updateData.updatedAt = serverTimestamp();

    // 카테고리 업데이트
    await updateDoc(categoryRef, updateData);

    res.json({
      success: true,
      message: '카테고리가 수정되었습니다.',
      data: {
        id: id,
        ...updateData
      }
    });
  } catch (error) {
    console.error('카테고리 수정 오류:', error);
    res.status(500).json({
      success: false,
      message: '카테고리 수정 중 오류가 발생했습니다.'
    });
  }
});

export default router;
