# Firebase 설정 가이드

## 🚀 Firebase 프로젝트 설정

### 1. Firebase 프로젝트 생성
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: pixelplanet-95dd9)
4. Google Analytics 활성화 (선택사항)

### 2. 웹 앱 등록
1. 프로젝트 설정 → 일반 탭
2. "앱 추가" → 웹 아이콘 클릭
3. 앱 닉네임 입력
4. Firebase SDK 구성 정보 복사 (이미 index.html에 적용됨)

---

## 🔐 Authentication 설정

### 1. 이메일/비밀번호 인증 활성화
1. Authentication → Sign-in method
2. "이메일/비밀번호" 제공업체 클릭
3. "사용 설정" 토글 ON
4. 저장

### 2. Google 로그인 활성화
1. Authentication → Sign-in method
2. "Google" 제공업체 클릭
3. "사용 설정" 토글 ON
4. 프로젝트 지원 이메일 선택
5. 저장

### 3. 승인된 도메인 추가
1. Authentication → Settings → Authorized domains
2. 배포할 도메인 추가 (예: yourdomain.com)
3. localhost는 기본으로 포함됨

---

## 📊 Firestore Database 설정

### 1. Firestore 데이터베이스 생성
1. Firestore Database → 데이터베이스 만들기
2. **테스트 모드**로 시작 (나중에 보안 규칙 적용)
3. 위치 선택: asia-northeast3 (서울) 권장

### 2. 보안 규칙 적용
Firestore Database → 규칙 탭에서 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // users 컬렉션 - 사용자 정보 및 역할 관리
    match /users/{userId} {
      // 자신의 문서만 읽기 가능
      allow read: if request.auth != null && request.auth.uid == userId;

      // 회원가입 시 생성 가능
      allow create: if request.auth != null &&
                      request.auth.uid == userId &&
                      request.resource.data.keys().hasAll(['email', 'role', 'createdAt']);

      // 자신의 문서만 수정 가능 (role, email은 수정 불가)
      allow update: if request.auth != null &&
                      request.auth.uid == userId &&
                      request.resource.data.role == resource.data.role &&
                      request.resource.data.email == resource.data.email;

      // 삭제 불가
      allow delete: if false;
    }

    // admin은 모든 users 문서 읽기 가능
    match /users/{userId} {
      allow read: if request.auth != null &&
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // userLikes 컬렉션 - 사용자 좋아요 정보
    match /userLikes/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // music 컬렉션 - 음악 데이터
    match /music/{musicId} {
      // 모든 인증된 사용자가 읽기 가능
      allow read: if request.auth != null;

      // creator 이상만 음악 생성 가능
      allow create: if request.auth != null &&
                      (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'creator' ||
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin') &&
                      request.resource.data.keys().hasAll(['name', 'audioSrc', 'category', 'images', 'uploadedBy', 'uploadedAt']);

      // 본인이 업로드한 음악이거나 admin만 수정 가능
      allow update: if request.auth != null &&
                      (resource.data.uploadedBy == request.auth.uid ||
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');

      // 본인이 업로드한 음악이거나 admin만 삭제 가능
      allow delete: if request.auth != null &&
                      (resource.data.uploadedBy == request.auth.uid ||
                       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

### 3. 인덱스 생성
Firestore Database → 색인(Indexes) 탭에서 다음 복합 인덱스 생성:

#### 인덱스 1: 카테고리별 정렬
- 컬렉션 ID: `music`
- 필드:
  - `category` (오름차순)
  - `uploadedAt` (내림차순)

#### 인덱스 2: 추천 음악 정렬
- 컬렉션 ID: `music`
- 필드:
  - `isRecommended` (오름차순)
  - `uploadedAt` (내림차순)

---

## 📦 Storage 설정

### 1. Storage 활성화
1. Storage → 시작하기
2. **테스트 모드**로 시작
3. 위치: asia-northeast3 (서울) 권장

### 2. 보안 규칙 적용
Storage → Rules 탭에서 다음 규칙 적용:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // audio 폴더 - creator 이상만 업로드 가능
    match /audio/{audioFile} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                     (firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'creator' ||
                      firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin');
      allow delete: if request.auth != null &&
                      (firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }

    // images 폴더 - creator 이상만 업로드 가능
    match /images/{imageFile} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                     (firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'creator' ||
                      firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin');
      allow delete: if request.auth != null &&
                      (firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

---

## 🧪 테스트

### 1. 회원가입 테스트
1. 앱 실행 → 로그인/회원가입 클릭
2. 이메일/비밀번호 입력
3. 역할 선택 (크리에이터 선택 시 업로드 가능)
4. 회원가입 버튼 클릭

### 2. Google 로그인 테스트
1. 로그인 화면에서 "Google로 로그인" 클릭
2. Google 계정 선택
3. 로그인 성공 확인

### 3. 음악 업로드 테스트 (creator 역할 필요)
1. 로그인 후 "업로드" 버튼 클릭
2. 음악 이름, 카테고리 입력
3. 오디오 파일 선택 (.mp3, .wav 등)
4. 이미지 파일 선택 (여러 개 가능)
5. 업로드 버튼 클릭
6. 업로드 성공 확인

### 4. 포인트 시스템 테스트
1. 로그인 시 일일 포인트 100P 자동 지급 확인
2. 좋아요 클릭 시 포인트 차감 확인

---

## 🚨 문제 해결

### "Permission denied" 오류
- Firestore 보안 규칙이 올바르게 적용되었는지 확인
- 사용자가 로그인 상태인지 확인
- 사용자 역할(role)이 올바르게 설정되었는지 확인

### 인덱스 오류
- Firestore 콘솔에서 제안된 인덱스 자동 생성 링크 클릭
- 또는 위의 인덱스를 수동으로 생성

### Storage 업로드 실패
- Storage 보안 규칙이 적용되었는지 확인
- 사용자가 creator 또는 admin 역할인지 확인
- 파일 크기 제한 확인 (기본 10MB)

---

## 📈 프로덕션 배포 전 체크리스트

- [ ] Firestore 보안 규칙 적용 완료
- [ ] Storage 보안 규칙 적용 완료
- [ ] 필수 인덱스 생성 완료
- [ ] Authentication 승인된 도메인 추가 완료
- [ ] 테스트 모드에서 프로덕션 모드로 전환
- [ ] Firebase 프로젝트 결제 플랜 확인 (무료 플랜 제한 확인)

---

## 💰 비용 예상

### Spark 플랜 (무료)
- Firestore: 1GB 저장소, 50,000 읽기/20,000 쓰기/일
- Storage: 5GB 저장소, 1GB 다운로드/일
- Authentication: 무제한 사용자

### Blaze 플랜 (종량제)
- 무료 한도 초과 시 종량제 과금
- 자세한 내용: https://firebase.google.com/pricing

---

## 📚 추가 자료

- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Firestore 보안 규칙 가이드](https://firebase.google.com/docs/firestore/security/get-started)
- [Storage 보안 규칙 가이드](https://firebase.google.com/docs/storage/security)
