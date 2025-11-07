# Firebase Storage 사용 가이드

Firebase Storage가 활성화되었고, 이미지 및 오디오 파일 업로드 기능이 구현되었습니다.

## 설정 완료 사항

### 1. Firebase Storage 설정
- ✅ Firebase SDK에 Storage 추가
- ✅ Storage 보안 규칙 설정
- ✅ 파일 업로드 라우트 생성
- ✅ 프론트엔드 업로드 유틸리티 작성

### 2. 의존성 추가
- ✅ multer (파일 업로드 미들웨어)

## API 엔드포인트

### 이미지 업로드
```http
POST /api/upload/image
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body (FormData):
- image: File (이미지 파일)
```

**응답:**
```json
{
  "success": true,
  "message": "이미지 업로드 성공",
  "data": {
    "url": "https://firebasestorage.googleapis.com/...",
    "fileName": "uid_timestamp_random.jpg",
    "path": "images/userId/fileName.jpg",
    "size": 123456
  }
}
```

### 오디오 업로드 (크리에이터 전용)
```http
POST /api/upload/audio
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body (FormData):
- audio: File (오디오 파일)
- title: string (선택)
- artist: string (선택)
- duration: number (선택)
```

**응답:**
```json
{
  "success": true,
  "message": "오디오 업로드 성공",
  "data": {
    "url": "https://firebasestorage.googleapis.com/...",
    "fileName": "uid_timestamp_random.mp3",
    "path": "audio/userId/fileName.mp3",
    "size": 5242880,
    "duration": 180
  }
}
```

### 다중 이미지 업로드
```http
POST /api/upload/images
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body (FormData):
- images: File[] (최대 10개)
```

**응답:**
```json
{
  "success": true,
  "message": "5개의 이미지 업로드 성공",
  "data": {
    "files": [
      {
        "url": "https://...",
        "fileName": "...",
        "path": "...",
        "size": 123456
      }
    ],
    "count": 5
  }
}
```

### 파일 삭제
```http
DELETE /api/upload/file
Content-Type: application/json
Authorization: Bearer <token>

Body:
{
  "filePath": "images/userId/fileName.jpg"
}
```

**응답:**
```json
{
  "success": true,
  "message": "파일이 삭제되었습니다."
}
```

## 프론트엔드 사용 예시

### 1. 이미지 업로드 (진행률 표시)

```html
<input type="file" id="imageInput" accept="image/*">
<button onclick="uploadImageFile()">업로드</button>
<div id="progress"></div>
<img id="preview" style="display:none; max-width: 300px;">
```

```javascript
import { uploadImage } from './src/utils/api.js';

async function uploadImageFile() {
  const input = document.getElementById('imageInput');
  const file = input.files[0];

  if (!file) {
    alert('파일을 선택해주세요.');
    return;
  }

  // 파일 크기 확인 (50MB)
  if (file.size > 50 * 1024 * 1024) {
    alert('파일 크기는 50MB를 초과할 수 없습니다.');
    return;
  }

  try {
    // 진행률 콜백
    const onProgress = (percent) => {
      document.getElementById('progress').textContent =
        `업로드 중... ${Math.round(percent)}%`;
    };

    const result = await uploadImage(file, onProgress);

    if (result.success) {
      console.log('업로드 성공:', result.data);

      // 이미지 미리보기
      const preview = document.getElementById('preview');
      preview.src = result.data.url;
      preview.style.display = 'block';

      document.getElementById('progress').textContent = '업로드 완료!';
    }
  } catch (error) {
    console.error('업로드 오류:', error);
    alert('업로드 실패: ' + error.message);
  }
}
```

### 2. 오디오 업로드 (메타데이터 포함)

```html
<input type="file" id="audioInput" accept="audio/*">
<input type="text" id="titleInput" placeholder="곡 제목">
<input type="text" id="artistInput" placeholder="아티스트">
<button onclick="uploadAudioFile()">업로드</button>
<div id="audioProgress"></div>
```

```javascript
import { uploadAudio, uploadMusic } from './src/utils/api.js';

async function uploadAudioFile() {
  const fileInput = document.getElementById('audioInput');
  const titleInput = document.getElementById('titleInput');
  const artistInput = document.getElementById('artistInput');

  const file = fileInput.files[0];
  const title = titleInput.value;
  const artist = artistInput.value;

  if (!file) {
    alert('파일을 선택해주세요.');
    return;
  }

  if (!title || !artist) {
    alert('제목과 아티스트를 입력해주세요.');
    return;
  }

  try {
    // 1단계: 오디오 파일 업로드
    const onProgress = (percent) => {
      document.getElementById('audioProgress').textContent =
        `파일 업로드 중... ${Math.round(percent)}%`;
    };

    const uploadResult = await uploadAudio(file, {
      title,
      artist,
      duration: 0 // 실제로는 오디오 길이를 계산해야 함
    }, onProgress);

    if (!uploadResult.success) {
      throw new Error(uploadResult.message);
    }

    // 2단계: 음악 정보를 Firestore에 저장
    const audioUrl = uploadResult.data.url;

    const musicData = {
      title,
      artist,
      audioUrl,
      imageUrl: '', // 별도로 앨범 커버 업로드 가능
      category: 'uncategorized',
      classification: 'general',
      tags: [],
      duration: uploadResult.data.duration || 0,
      recommended: false
    };

    const musicResult = await uploadMusic(musicData);

    if (musicResult.success) {
      document.getElementById('audioProgress').textContent = '업로드 완료!';
      alert('음악이 성공적으로 업로드되었습니다.');

      // 폼 초기화
      fileInput.value = '';
      titleInput.value = '';
      artistInput.value = '';
    }

  } catch (error) {
    console.error('업로드 오류:', error);
    alert('업로드 실패: ' + error.message);
  }
}
```

### 3. 다중 이미지 업로드

```html
<input type="file" id="multiImageInput" accept="image/*" multiple>
<button onclick="uploadMultipleImages()">업로드</button>
<div id="multiProgress"></div>
<div id="imageGallery"></div>
```

```javascript
import { uploadImages } from './src/utils/api.js';

async function uploadMultipleImages() {
  const input = document.getElementById('multiImageInput');
  const files = input.files;

  if (files.length === 0) {
    alert('파일을 선택해주세요.');
    return;
  }

  if (files.length > 10) {
    alert('최대 10개의 이미지만 업로드할 수 있습니다.');
    return;
  }

  try {
    const onProgress = (percent) => {
      document.getElementById('multiProgress').textContent =
        `업로드 중... ${Math.round(percent)}%`;
    };

    const result = await uploadImages(files, onProgress);

    if (result.success) {
      console.log('업로드된 파일:', result.data.files);

      // 갤러리에 이미지 표시
      const gallery = document.getElementById('imageGallery');
      gallery.innerHTML = '';

      result.data.files.forEach(file => {
        const img = document.createElement('img');
        img.src = file.url;
        img.style.width = '150px';
        img.style.margin = '5px';
        gallery.appendChild(img);
      });

      document.getElementById('multiProgress').textContent =
        `${result.data.count}개 이미지 업로드 완료!`;
    }

  } catch (error) {
    console.error('업로드 오류:', error);
    alert('업로드 실패: ' + error.message);
  }
}
```

### 4. 파일 삭제

```javascript
import { deleteFile } from './src/utils/api.js';

async function deleteUploadedFile(filePath) {
  if (!confirm('파일을 삭제하시겠습니까?')) {
    return;
  }

  try {
    const result = await deleteFile(filePath);

    if (result.success) {
      alert('파일이 삭제되었습니다.');
      // UI 업데이트
    }

  } catch (error) {
    console.error('삭제 오류:', error);
    alert('삭제 실패: ' + error.message);
  }
}
```

### 5. 오디오 길이 계산 (선택사항)

```javascript
function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      window.URL.revokeObjectURL(audio.src);
      resolve(Math.floor(audio.duration));
    };

    audio.onerror = () => {
      reject(new Error('오디오 파일을 읽을 수 없습니다.'));
    };

    audio.src = URL.createObjectURL(file);
  });
}

// 사용 예시
const duration = await getAudioDuration(audioFile);
console.log('오디오 길이:', duration, '초');
```

## Storage 보안 규칙

### 이미지 파일
- **읽기**: 모든 인증된 사용자
- **쓰기**: 본인만 (최대 50MB, 이미지 파일만)
- **삭제**: 본인만

### 오디오 파일
- **읽기**: 모든 인증된 사용자
- **쓰기**: 크리에이터 (최대 50MB, 오디오 파일만)
- **삭제**: 본인만

### 파일 경로 구조
```
/images/{userId}/{fileName}  - 사용자별 이미지
/audio/{userId}/{fileName}   - 사용자별 오디오
```

## 제한 사항

- **파일 크기**: 최대 50MB
- **이미지 형식**: JPEG, PNG, GIF, WebP
- **오디오 형식**: MP3, WAV, OGG, M4A
- **다중 업로드**: 최대 10개 파일

## 오류 처리

### 일반적인 오류

```javascript
try {
  const result = await uploadImage(file);
} catch (error) {
  if (error.message.includes('크기가 너무 큽니다')) {
    // 파일 크기 초과
  } else if (error.message.includes('지원하지 않는 파일')) {
    // 잘못된 파일 형식
  } else if (error.message.includes('인증')) {
    // 로그인 필요
  } else {
    // 기타 오류
  }
}
```

## 베스트 프랙티스

### 1. 파일 크기 체크
업로드 전에 클라이언트에서 파일 크기를 확인하세요.

```javascript
if (file.size > 50 * 1024 * 1024) {
  alert('파일 크기는 50MB를 초과할 수 없습니다.');
  return;
}
```

### 2. 파일 형식 검증
허용된 파일 형식인지 확인하세요.

```javascript
const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!allowedTypes.includes(file.type)) {
  alert('지원하지 않는 파일 형식입니다.');
  return;
}
```

### 3. 이미지 압축 (선택사항)
큰 이미지는 업로드 전에 압축하세요.

```javascript
// 예시: browser-image-compression 라이브러리 사용
import imageCompression from 'browser-image-compression';

const options = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920
};

const compressedFile = await imageCompression(file, options);
```

### 4. 진행률 표시
사용자 경험 향상을 위해 진행률을 표시하세요.

### 5. 오류 처리
모든 업로드 작업에 try-catch를 사용하세요.

## 다음 단계

1. **의존성 설치**
   ```bash
   npm install
   ```

2. **보안 규칙 배포**
   ```bash
   firebase deploy --only storage,firestore:rules
   ```

3. **서버 재시작**
   ```bash
   npm run dev
   ```

4. **테스트**
   - 이미지 업로드 테스트
   - 오디오 업로드 테스트 (크리에이터 계정 필요)
   - 파일 삭제 테스트

## 참고 자료

- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [Multer Documentation](https://github.com/expressjs/multer)
- [Browser Image Compression](https://github.com/Donaldcwl/browser-image-compression)
