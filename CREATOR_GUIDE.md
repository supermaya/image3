# 크리에이터 및 관리자 가이드

관리자와 크리에이터가 Firebase Storage와 Firestore를 통해 이미지와 오디오를 업로드하고 관리하는 방법을 설명합니다.

## 개요

크리에이터와 관리자는 전용 인터페이스를 통해:
1. **음악 업로드**: 오디오 파일과 앨범 커버 이미지를 Firebase Storage에 업로드
2. **음악 정보 관리**: Firestore에 메타데이터 저장 및 관리
3. **음악 목록 조회**: 업로드한 음악 목록 확인 및 수정/삭제

## 접근 페이지

### 1. 음악 업로드 페이지
**URL**: `creator-upload.html`

음악을 업로드하는 전용 페이지입니다.

**기능**:
- 앨범 커버 이미지 업로드 (선택)
- 오디오 파일 업로드 (필수)
- 음악 메타데이터 입력
- 실시간 업로드 진행률 표시
- 드래그 앤 드롭 지원

### 2. 음악 관리 페이지
**URL**: `creator-manage.html`

업로드한 음악을 관리하는 페이지입니다.

**기능**:
- 음악 목록 조회
- 음악 재생
- 음악 정보 수정
- 음악 삭제
- 검색 기능
- 통계 표시

## 사용 방법

### 1. 로그인 및 권한 확인

페이지 접근 시 자동으로 로그인 상태와 권한을 확인합니다.

**필요 권한**:
- `creator`: 크리에이터 (자신의 음악 업로드/관리)
- `admin`: 관리자 (모든 음악 관리)

**권한 없는 경우**: 자동으로 메인 페이지로 리다이렉트됩니다.

### 2. 음악 업로드

#### 단계 1: 페이지 접근
```
http://localhost:3000/creator-upload.html
```

#### 단계 2: 기본 정보 입력
- **곡 제목** (필수)
- **아티스트** (필수)
- **카테고리** (필수): 팝, 록, 재즈, 클래식, 힙합, 일렉트로닉, R&B, 기타
- **분류**: 일반, 추천, 신곡, 인기
- **태그**: Enter 키로 추가 (선택)

#### 단계 3: 앨범 커버 이미지 업로드 (선택)
- 클릭 또는 드래그 앤 드롭으로 이미지 선택
- 지원 형식: JPEG, PNG, GIF, WebP
- 최대 크기: 50MB
- 자동으로 Firebase Storage에 업로드
- 실시간 진행률 표시
- 미리보기 제공

#### 단계 4: 오디오 파일 업로드 (필수)
- 클릭 또는 드래그 앤 드롭으로 오디오 선택
- 지원 형식: MP3, WAV, OGG, M4A
- 최대 크기: 50MB
- 자동으로 오디오 길이 측정
- 자동으로 Firebase Storage에 업로드
- 실시간 진행률 표시
- 오디오 플레이어로 미리 듣기

#### 단계 5: 음악 업로드 버튼 클릭
- 모든 정보가 Firestore에 저장됩니다
- 성공 메시지 표시 후 폼 초기화

### 3. 음악 관리

#### 페이지 접근
```
http://localhost:3000/creator-manage.html
```

#### 통계 확인
- **총 음악**: 업로드한 음악 수
- **총 재생**: 모든 음악의 총 재생 횟수
- **총 좋아요**: 모든 음악의 총 좋아요 수

#### 음악 검색
- 검색창에 곡 제목 또는 아티스트 입력
- 실시간으로 필터링

#### 음악 재생
- 재생 버튼(▶) 클릭
- 모달에서 앨범 커버와 오디오 플레이어 표시

#### 음악 정보 수정
1. 수정 버튼(✎) 클릭
2. 수정 모달에서 정보 변경
3. 저장 버튼 클릭
4. Firestore에 자동 업데이트

**수정 가능 항목**:
- 곡 제목
- 아티스트
- 카테고리
- 분류

**수정 불가 항목**:
- 오디오 파일 (삭제 후 재업로드 필요)
- 앨범 커버 이미지 (삭제 후 재업로드 필요)

#### 음악 삭제
1. 삭제 버튼(🗑) 클릭
2. 확인 대화상자에서 확인
3. Firestore에서 음악 정보 삭제

**주의**:
- 삭제는 되돌릴 수 없습니다
- Firestore의 음악 정보만 삭제됩니다
- Storage의 파일은 수동으로 삭제해야 합니다 (Firebase Console)

### 4. 권한별 차이

#### 크리에이터 (creator)
- **업로드**: 본인 음악만 업로드
- **조회**: 본인 음악만 조회
- **수정**: 본인 음악만 수정
- **삭제**: 본인 음악만 삭제

#### 관리자 (admin)
- **업로드**: 음악 업로드 가능
- **조회**: 모든 음악 조회 가능
- **수정**: 모든 음악 수정 가능
- **삭제**: 모든 음악 삭제 가능

## 데이터 흐름

### 업로드 프로세스
```
1. 이미지 선택
   ↓
2. Firebase Storage에 이미지 업로드
   /images/{userId}/{fileName}
   ↓
3. 이미지 다운로드 URL 획득
   ↓
4. 오디오 선택
   ↓
5. Firebase Storage에 오디오 업로드
   /audio/{userId}/{fileName}
   ↓
6. 오디오 다운로드 URL 획득
   ↓
7. Firestore에 음악 정보 저장
   /music/{musicId}
   {
     title, artist, audioUrl, imageUrl,
     category, classification, tags,
     duration, uploadedBy, ...
   }
```

### Firestore 데이터 구조
```javascript
// /music/{musicId}
{
  title: "곡 제목",
  artist: "아티스트",
  audioUrl: "https://firebasestorage.googleapis.com/...",
  imageUrl: "https://firebasestorage.googleapis.com/...",
  category: "pop",
  classification: "general",
  tags: ["태그1", "태그2"],
  duration: 180, // 초
  recommended: false,
  uploadedBy: "사용자UID",
  uploadedByEmail: "user@example.com",
  createdAt: Timestamp,
  uploadedAt: Timestamp,
  playCount: 0,
  likeCount: 0
}
```

## 보안 규칙

### Firestore 규칙
```javascript
// 음악 컬렉션
match /music/{musicId} {
  // 모든 인증된 사용자가 음악 목록 읽기 가능
  allow read: if request.auth != null;

  // 음악 업로드는 크리에이터만 가능
  allow create: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'creator';

  // 본인이 업로드한 음악만 수정/삭제 가능
  allow update, delete: if request.auth != null &&
    resource.data.uploadedBy == request.auth.uid;
}
```

### Storage 규칙
```javascript
// 이미지
match /images/{userId}/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId
               && request.resource.size < 50 * 1024 * 1024
               && request.resource.contentType.matches('image/.*');
  allow delete: if request.auth != null && request.auth.uid == userId;
}

// 오디오
match /audio/{userId}/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
               && request.auth.uid == userId
               && request.resource.size < 50 * 1024 * 1024
               && request.resource.contentType.matches('audio/.*');
  allow delete: if request.auth != null && request.auth.uid == userId;
}
```

## 제한 사항

### 파일 업로드
- **이미지 최대 크기**: 50MB
- **오디오 최대 크기**: 50MB
- **동시 업로드**: 1개씩 순차 업로드 권장

### 메타데이터
- **곡 제목**: 최대 255자
- **아티스트**: 최대 255자
- **태그**: 개수 제한 없음

### API 제한
- Firestore 읽기/쓰기 할당량 적용
- Storage 대역폭 제한 적용

## 트러블슈팅

### 1. 업로드 실패
**문제**: "업로드 실패" 오류 메시지

**해결책**:
- 파일 크기 확인 (50MB 이하)
- 파일 형식 확인
- 인터넷 연결 확인
- 로그인 상태 확인
- 크리에이터 권한 확인

### 2. 권한 오류
**문제**: "크리에이터 권한이 필요합니다"

**해결책**:
- Firestore의 users 컬렉션에서 role 확인
- role을 'creator' 또는 'admin'으로 변경
- 다시 로그인

### 3. 이미지가 표시되지 않음
**문제**: 앨범 커버가 표시되지 않음

**해결책**:
- Storage 보안 규칙 확인
- 이미지 URL 확인
- 브라우저 콘솔에서 CORS 오류 확인

### 4. 오디오 재생 불가
**문제**: 오디오가 재생되지 않음

**해결책**:
- Storage 보안 규칙 확인
- 오디오 URL 확인
- 브라우저 지원 형식 확인

## 베스트 프랙티스

### 1. 파일 이름
- 명확하고 설명적인 파일명 사용
- 특수문자 사용 자제
- 공백 대신 하이픈(-) 또는 언더스코어(_) 사용

### 2. 이미지 최적화
- 앨범 커버는 정사각형 권장 (500x500px 이상)
- JPEG 또는 WebP 형식 권장 (파일 크기 최소화)
- 업로드 전 이미지 압축 권장

### 3. 오디오 최적화
- MP3 형식 권장 (호환성)
- 비트레이트: 192-320kbps 권장
- 메타데이터 포함 권장

### 4. 메타데이터
- 정확한 정보 입력
- 일관된 카테고리 사용
- 유용한 태그 추가

### 5. 정기적인 관리
- 중복 음악 확인 및 삭제
- 오래된 음악 정리
- 통계 확인

## FAQ

### Q1. 크리에이터 권한은 어떻게 받나요?
A1. 관리자에게 요청하여 Firestore의 users 컬렉션에서 role을 'creator'로 변경해야 합니다.

### Q2. 업로드한 파일을 수정할 수 있나요?
A2. 음악 정보(제목, 아티스트 등)는 수정 가능하지만, 파일 자체는 삭제 후 재업로드해야 합니다.

### Q3. 여러 음악을 동시에 업로드할 수 있나요?
A3. 현재는 한 번에 하나씩 업로드해야 합니다. 여러 음악은 순차적으로 업로드하세요.

### Q4. 삭제한 음악을 복구할 수 있나요?
A4. 아니요. 삭제는 되돌릴 수 없으므로 신중하게 삭제하세요.

### Q5. 다른 크리에이터의 음악을 수정할 수 있나요?
A5. 일반 크리에이터는 본인 음악만 수정 가능합니다. 관리자만 모든 음악을 수정할 수 있습니다.

## 관리자 전용 기능

### 사용자 권한 관리
Firebase Console 또는 Admin SDK를 통해 사용자 권한 관리:

```javascript
// Firestore에서 사용자 권한 변경
await setDoc(doc(db, 'users', userId), {
  role: 'creator' // 또는 'admin'
}, { merge: true });
```

### Storage 파일 관리
Firebase Console > Storage에서:
- 업로드된 모든 파일 조회
- 파일 삭제
- 사용량 확인

### Firestore 데이터 관리
Firebase Console > Firestore에서:
- 모든 음악 정보 조회
- 직접 수정/삭제
- 쿼리 실행

## 추가 리소스

- [Firebase Storage 문서](https://firebase.google.com/docs/storage)
- [Firestore 문서](https://firebase.google.com/docs/firestore)
- [프로젝트 README](./README.md)
- [Storage 가이드](./STORAGE_GUIDE.md)
- [마이그레이션 가이드](./MIGRATION_GUIDE.md)

## 문의

문제가 발생하거나 도움이 필요한 경우 프로젝트 관리자에게 문의하세요.
