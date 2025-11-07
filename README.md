# Image3 - 음악 및 이미지 플랫폼

FastComet 서버(MySQL + PHP)에서 Firebase Firestore로 마이그레이션된 프로젝트입니다.

## 프로젝트 구조

```
Image3/
├── src/
│   ├── config/
│   │   └── firebase.js          # Firebase 초기화 및 설정
│   ├── middleware/
│   │   └── auth.js               # JWT 인증 미들웨어
│   ├── routes/
│   │   ├── auth.js               # 사용자 인증 라우트
│   │   ├── points.js             # 포인트 시스템 라우트
│   │   ├── music.js              # 음악 관련 라우트
│   │   └── user.js               # 사용자 프로필 라우트
│   ├── utils/
│   │   └── api.js                # 프론트엔드 API 유틸리티
│   └── server.js                 # Express 서버 진입점
├── firestore.rules               # Firestore 보안 규칙
├── firestore.indexes.json        # Firestore 인덱스
├── firebase.json                 # Firebase 설정
├── .env.example                  # 환경 변수 예시
└── package.json                  # 프로젝트 의존성

```

## 기능

### 1. 사용자 인증
- 회원가입 (이메일/비밀번호)
- 로그인/로그아웃
- JWT 토큰 기반 인증
- 역할 기반 권한 관리 (user, creator, admin)

### 2. 포인트 시스템
- 포인트 조회
- 일일 보너스 수령 (60P)
- 포인트 사용 (갤러리 접근 등)
- 거래 내역 조회
- 관리자 포인트 지급

### 3. 음악 관리
- 음악 목록 조회 (필터링, 검색)
- 음악 업로드 (크리에이터 전용)
- 음악 수정/삭제
- 음악 저장 (북마크)

### 4. 사용자 프로필
- 프로필 조회
- 프로필 업데이트

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 Firebase 설정을 입력합니다:

```bash
cp .env.example .env
```

`.env` 파일에 다음 정보를 입력:

```env
# Firebase 설정 (Firebase Console에서 확인)
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id

# 서버 설정
PORT=3001
NODE_ENV=development

# JWT 설정 (랜덤한 긴 문자열 사용)
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# CORS 설정
CORS_ORIGIN=http://localhost:3000
```

### 3. Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Firebase Authentication 활성화 (이메일/비밀번호 로그인)
3. Firestore Database 생성
4. Firebase 설정 정보를 `.env` 파일에 입력

### 4. Firestore 보안 규칙 배포

```bash
firebase deploy --only firestore:rules
```

### 5. 서버 실행

**개발 모드 (자동 재시작):**
```bash
npm run dev
```

**프로덕션 모드:**
```bash
npm start
```

서버는 기본적으로 `http://localhost:3001`에서 실행됩니다.

### 6. 클라이언트 실행 (별도 터미널)

```bash
npm run client
```

클라이언트는 `http://localhost:3000`에서 실행됩니다.

### 7. Firebase Emulator 실행 (선택사항)

로컬 개발 시 Firebase Emulator를 사용할 수 있습니다:

```bash
npm run emulator
```

Emulator UI: `http://localhost:4100`

## API 엔드포인트

### 인증 (Authentication)

- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/login` - 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/status` - 로그인 상태 확인

### 포인트 (Points)

- `GET /api/points` - 포인트 조회
- `POST /api/points/daily-bonus` - 일일 보너스 수령
- `POST /api/points/use` - 포인트 사용
- `GET /api/points/transactions` - 거래 내역 조회
- `POST /api/points/add` - 포인트 추가 (관리자 전용)

### 음악 (Music)

- `GET /api/music` - 음악 목록 조회
- `GET /api/music/:id` - 특정 음악 조회
- `POST /api/music` - 음악 업로드 (크리에이터 전용)
- `PUT /api/music/:id` - 음악 수정
- `DELETE /api/music/:id` - 음악 삭제
- `GET /api/music/saved/list` - 저장된 음악 조회
- `POST /api/music/saved/:musicId` - 음악 저장
- `DELETE /api/music/saved/:musicId` - 저장된 음악 삭제

### 사용자 (User)

- `GET /api/user/profile` - 프로필 조회
- `PUT /api/user/profile` - 프로필 업데이트

## Firestore 데이터 구조

### users 컬렉션

```javascript
{
  email: string,
  role: "user" | "creator" | "admin",
  totalPoints: number,
  dailyBonusClaimed: boolean,
  dailyBonusLastClaimed: timestamp,
  createdAt: timestamp,
  lastLoginAt: timestamp
}
```

### pointTransactions 컬렉션

```javascript
{
  userId: string,
  type: "daily_bonus" | "usage" | "admin_grant",
  amount: number,
  description: string,
  createdAt: timestamp
}
```

### music 컬렉션

```javascript
{
  title: string,
  artist: string,
  audioUrl: string,
  imageUrl: string,
  category: string,
  classification: string,
  tags: array,
  duration: number,
  recommended: boolean,
  uploadedBy: string,
  uploadedByEmail: string,
  createdAt: timestamp,
  playCount: number,
  likeCount: number
}
```

### savedMusic/{userId}/tracks/{musicId}

```javascript
{
  musicId: string,
  userId: string,
  savedAt: timestamp
}
```

## 마이그레이션 노트

### 기존 PHP 시스템에서 변경된 사항

1. **데이터베이스**: MySQL → Firestore
2. **인증 시스템**: PHP Session → Firebase Authentication + JWT
3. **API 구조**: PHP 단일 파일 → Express.js RESTful API
4. **보안**: 서버측 검증 + Firestore Security Rules

### 마이그레이션 체크리스트

- [x] Firebase SDK 초기화
- [x] Firestore 보안 규칙 작성
- [x] 사용자 인증 시스템
- [x] 포인트 시스템
- [x] 음악 관리 기능
- [x] 프론트엔드 API 통합
- [ ] 기존 MySQL 데이터 마이그레이션
- [ ] 이미지/오디오 파일 Storage 마이그레이션

### 데이터 마이그레이션 스크립트

기존 MySQL 데이터를 Firestore로 마이그레이션하려면 별도의 마이그레이션 스크립트가 필요합니다. 필요시 요청해주세요.

## 보안

### 인증 흐름

1. 사용자가 로그인하면 JWT 토큰 발급
2. 클라이언트는 localStorage에 토큰 저장
3. API 요청 시 `Authorization: Bearer <token>` 헤더로 토큰 전송
4. 서버에서 토큰 검증 후 요청 처리

### Firestore 보안

- 모든 데이터 접근은 인증 필요
- 사용자는 본인 데이터만 읽기/쓰기 가능
- 포인트 거래 내역은 읽기만 가능
- 관리자는 추가 권한 보유

## 트러블슈팅

### 1. Firebase 연결 오류

`.env` 파일의 Firebase 설정을 확인하세요.

### 2. CORS 오류

`CORS_ORIGIN` 환경 변수가 클라이언트 URL과 일치하는지 확인하세요.

### 3. 토큰 만료

JWT 토큰의 유효기간이 지났습니다. 다시 로그인해주세요.

### 4. 포인트 차감 실패

Firestore 트랜잭션 로그를 확인하여 동시성 문제가 있는지 확인하세요.

## 라이선스

ISC

## 개발자 정보

문의사항이 있으시면 프로젝트 관리자에게 연락해주세요.
