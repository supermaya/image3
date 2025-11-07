import express from 'express';
import multer from 'multer';
import { storage } from '../config/firebase.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { verifyToken, requireCreator } from '../middleware/auth.js';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();

// Multer 설정 (메모리 저장)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 제한
  },
  fileFilter: (req, file, cb) => {
    // 파일 타입 검증
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];

    if ([...allowedImageTypes, ...allowedAudioTypes].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다.'));
    }
  }
});

// 파일명 생성 함수
const generateFileName = (originalName, userId) => {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${userId}_${timestamp}_${randomString}${ext}`;
};

// 이미지 업로드
router.post('/image', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '파일이 업로드되지 않았습니다.'
      });
    }

    // 파일명 생성
    const fileName = generateFileName(req.file.originalname, req.user.uid);
    const storagePath = `images/${req.user.uid}/${fileName}`;

    // Storage 참조 생성
    const storageRef = ref(storage, storagePath);

    // 메타데이터 설정
    const metadata = {
      contentType: req.file.mimetype,
      customMetadata: {
        uploadedBy: req.user.uid,
        uploadedByEmail: req.user.email,
        originalName: req.file.originalname
      }
    };

    // 파일 업로드
    await uploadBytes(storageRef, req.file.buffer, metadata);

    // 다운로드 URL 가져오기
    const downloadURL = await getDownloadURL(storageRef);

    res.json({
      success: true,
      message: '이미지 업로드 성공',
      data: {
        url: downloadURL,
        fileName: fileName,
        path: storagePath,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '이미지 업로드 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 오디오 업로드 (크리에이터 전용)
router.post('/audio', verifyToken, requireCreator, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '파일이 업로드되지 않았습니다.'
      });
    }

    // 파일명 생성
    const fileName = generateFileName(req.file.originalname, req.user.uid);
    const storagePath = `audio/${req.user.uid}/${fileName}`;

    // Storage 참조 생성
    const storageRef = ref(storage, storagePath);

    // 메타데이터 설정
    const metadata = {
      contentType: req.file.mimetype,
      customMetadata: {
        uploadedBy: req.user.uid,
        uploadedByEmail: req.user.email,
        originalName: req.file.originalname,
        title: req.body.title || '',
        artist: req.body.artist || ''
      }
    };

    // 파일 업로드
    await uploadBytes(storageRef, req.file.buffer, metadata);

    // 다운로드 URL 가져오기
    const downloadURL = await getDownloadURL(storageRef);

    res.json({
      success: true,
      message: '오디오 업로드 성공',
      data: {
        url: downloadURL,
        fileName: fileName,
        path: storagePath,
        size: req.file.size,
        duration: req.body.duration || 0
      }
    });
  } catch (error) {
    console.error('오디오 업로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '오디오 업로드 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 다중 이미지 업로드
router.post('/images', verifyToken, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '파일이 업로드되지 않았습니다.'
      });
    }

    const uploadPromises = req.files.map(async (file) => {
      const fileName = generateFileName(file.originalname, req.user.uid);
      const storagePath = `images/${req.user.uid}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      const metadata = {
        contentType: file.mimetype,
        customMetadata: {
          uploadedBy: req.user.uid,
          uploadedByEmail: req.user.email,
          originalName: file.originalname
        }
      };

      await uploadBytes(storageRef, file.buffer, metadata);
      const downloadURL = await getDownloadURL(storageRef);

      return {
        url: downloadURL,
        fileName: fileName,
        path: storagePath,
        size: file.size
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.json({
      success: true,
      message: `${uploadedFiles.length}개의 이미지 업로드 성공`,
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length
      }
    });
  } catch (error) {
    console.error('다중 이미지 업로드 오류:', error);
    res.status(500).json({
      success: false,
      message: '이미지 업로드 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 파일 삭제
router.delete('/file', verifyToken, async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: '파일 경로가 제공되지 않았습니다.'
      });
    }

    // 본인의 파일인지 확인
    if (!filePath.includes(req.user.uid)) {
      return res.status(403).json({
        success: false,
        message: '본인이 업로드한 파일만 삭제할 수 있습니다.'
      });
    }

    // Storage 참조 생성
    const storageRef = ref(storage, filePath);

    // 파일 삭제
    await deleteObject(storageRef);

    res.json({
      success: true,
      message: '파일이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('파일 삭제 오류:', error);

    if (error.code === 'storage/object-not-found') {
      return res.status(404).json({
        success: false,
        message: '파일을 찾을 수 없습니다.'
      });
    }

    res.status(500).json({
      success: false,
      message: '파일 삭제 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 에러 핸들러
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '파일 크기가 너무 큽니다. (최대 50MB)'
      });
    }
    return res.status(400).json({
      success: false,
      message: '파일 업로드 오류: ' + error.message
    });
  }

  res.status(500).json({
    success: false,
    message: error.message || '서버 오류가 발생했습니다.'
  });
});

export default router;
