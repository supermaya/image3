# 일일 포인트 만료 시스템 배포 가이드

일일 로그인 포인트가 자정에 만료되도록 설정하는 배포 절차입니다.

## 📋 배포 체크리스트

### ✅ 사전 준비
- [ ] Node.js 18 이상 설치 확인
- [ ] Firebase CLI 설치 확인 (`firebase --version`)
- [ ] Firebase 프로젝트 로그인 (`firebase login`)
- [ ] 프로젝트 선택 확인 (`firebase use`)

### ✅ 변경 사항 확인
- [ ] `src/routes/points.js` - 포인트 라우터 수정
- [ ] `functions/index.js` - Scheduled Function 추가
- [ ] `firestore.indexes.json` - 인덱스 설정 추가

---

## 🚀 배포 단계

### 1단계: Firestore 인덱스 배포

```bash
# 인덱스 배포
firebase deploy --only firestore:indexes

# 배포 확인
firebase firestore:indexes
```

**예상 소요 시간**: 1-2분

**확인 사항**:
- `users` 컬렉션에 `dailyPoints` 인덱스 생성
- `pointTransactions` 컬렉션에 복합 인덱스 생성

---

### 2단계: Firebase Functions 배포

```bash
# Functions 디렉토리로 이동
cd functions

# 의존성 설치 (처음만)
npm install

# 상위 디렉토리로 복귀
cd ..

# Scheduled Function 배포
firebase deploy --only functions:expireDailyPoints

# 또는 모든 함수 배포
firebase deploy --only functions
```

**예상 소요 시간**: 2-3분

**확인 사항**:
- Firebase Console > Functions에서 `expireDailyPoints` 함수 확인
- 스케줄: "매일 00:00 KST" 확인
- 상태: "활성" 확인

---

### 3단계: API 서버 배포 (필요시)

Express 서버를 별도로 운영하는 경우:

```bash
# API 서버 재시작
pm2 restart api

# 또는 Docker 사용 시
docker-compose up -d --build api
```

---

### 4단계: 배포 검증

#### 4-1. Firestore 데이터 구조 확인

Firebase Console > Firestore Database에서 임의의 사용자 문서 확인:

```javascript
{
  uid: "test123",
  dailyPoints: 0,        // ✅ 필드 존재 확인
  walletPoints: 0,       // ✅ 필드 존재 확인
  // ... 기타 필드
}
```

#### 4-2. API 테스트

##### 포인트 조회 테스트
```bash
curl -X GET https://your-api-domain.com/api/points \
  -H "Authorization: Bearer YOUR_TOKEN"

# 예상 응답
{
  "success": true,
  "data": {
    "dailyPoints": 0,
    "walletPoints": 0,
    "totalPoints": 0,
    "dailyBonusClaimed": false
  }
}
```

##### 일일 보너스 수령 테스트
```bash
curl -X POST https://your-api-domain.com/api/points/daily-bonus \
  -H "Authorization: Bearer YOUR_TOKEN"

# 예상 응답
{
  "success": true,
  "message": "일일 보너스 60P가 지급되었습니다. (당일 자정까지 유효)",
  "data": {
    "dailyPoints": 60,
    "walletPoints": 0,
    "totalPoints": 60
  }
}
```

##### 포인트 사용 테스트
```bash
curl -X POST https://your-api-domain.com/api/points/use \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 17, "reason": "갤러리 접근"}'

# 예상 응답
{
  "success": true,
  "message": "17P가 차감되었습니다. (일일: 17P)",
  "data": {
    "dailyPoints": 43,
    "walletPoints": 0,
    "totalPoints": 43,
    "usedFromDaily": 17,
    "usedFromWallet": 0
  }
}
```

#### 4-3. Scheduled Function 테스트

##### 수동 실행 (테스트용)
```bash
# Firebase Functions Shell 실행
firebase functions:shell

# 함수 호출
> expireDailyPoints()

# 결과 확인
✅ [일일 포인트 만료] 작업 완료
   - 영향받은 사용자: X명
   - 만료된 포인트: XXP
```

##### 로그 확인
```bash
# 최근 로그 확인
firebase functions:log --only expireDailyPoints --limit 10

# 실시간 로그 확인
firebase functions:log --only expireDailyPoints --follow
```

---

## 🔄 기존 사용자 마이그레이션

### 기존 사용자 포인트 구조 변환

기존에 `totalPoints` 필드만 있는 경우, 다음 스크립트로 마이그레이션:

**migrate-points.js**:
```javascript
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migratePoints() {
  console.log('🔄 포인트 마이그레이션 시작...');

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  let migratedCount = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const userData = doc.data();

    // totalPoints가 있지만 dailyPoints/walletPoints가 없는 경우
    if (userData.totalPoints !== undefined &&
        userData.dailyPoints === undefined) {

      // 기존 totalPoints를 walletPoints로 이동 (안전한 방법)
      batch.update(doc.ref, {
        dailyPoints: 0,
        walletPoints: userData.totalPoints || 0
      });

      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    await batch.commit();
    console.log(`✅ ${migratedCount}명의 사용자 포인트를 마이그레이션했습니다.`);
  } else {
    console.log('✅ 마이그레이션할 사용자가 없습니다.');
  }
}

migratePoints()
  .then(() => {
    console.log('완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('오류:', error);
    process.exit(1);
  });
```

**실행**:
```bash
node migrate-points.js
```

---

## 📊 배포 후 모니터링

### 1일차 모니터링 (배포 직후)

#### 자정(00:00 KST) 직전
- [ ] Firebase Console > Functions > 대시보드 확인
- [ ] 함수 상태 "활성" 확인
- [ ] 일일 보너스 지급 정상 작동 확인

#### 자정(00:00 KST) 직후
- [ ] Functions 로그 확인 (`expireDailyPoints` 실행 확인)
- [ ] Firestore > `dailyPointsExpiryLogs` 컬렉션 확인
- [ ] 임의 사용자의 `dailyPoints` 필드가 0인지 확인

### 1주차 모니터링

매일 확인:
```bash
# 함수 실행 로그
firebase functions:log --only expireDailyPoints --since 1d

# 에러 로그
firebase functions:log --only expireDailyPoints --filter "ERROR" --since 7d
```

Firestore 쿼리:
```javascript
// 최근 7일 만료 통계
const logs = await db.collection('dailyPointsExpiryLogs')
  .orderBy('date', 'desc')
  .limit(7)
  .get();

logs.forEach(doc => {
  const data = doc.data();
  console.log(`${data.date}: ${data.expiredUsers}명, ${data.totalExpiredPoints}P`);
});
```

---

## 🚨 롤백 절차

문제 발생 시 이전 버전으로 롤백:

### Functions 롤백
```bash
# 이전 버전 목록 확인
firebase functions:list

# 특정 버전으로 롤백 (Firebase Console에서 수동)
# Firebase Console > Functions > expireDailyPoints > 버전 탭 > 이전 버전 선택
```

### API 롤백
```bash
# Git으로 이전 커밋 복원
git log --oneline
git checkout <이전_커밋_해시> -- src/routes/points.js

# API 재배포
pm2 restart api
```

### 긴급 중지
```bash
# Scheduled Function 비활성화
# Firebase Console > Functions > expireDailyPoints > 사용 중지

# 또는 함수 삭제
firebase functions:delete expireDailyPoints
```

---

## 📝 배포 후 확인 사항

### 필수 확인
- [x] Firestore 인덱스 생성 완료
- [x] `expireDailyPoints` 함수 배포 완료
- [x] 함수 스케줄 "매일 00:00 KST" 설정
- [x] API 포인트 조회/지급/사용 정상 작동
- [x] 기존 사용자 포인트 마이그레이션 (필요 시)

### 권장 확인
- [ ] Cloud Functions 알림 설정 (오류 발생 시 이메일)
- [ ] Monitoring 대시보드 설정
- [ ] 사용자 공지사항 게시 (포인트 만료 안내)
- [ ] FAQ 업데이트

---

## 📞 문제 발생 시 대응

### 긴급 연락처
- 개발팀: [이메일]
- Firebase 지원: https://firebase.google.com/support

### 디버깅 도구
```bash
# Firebase Console 로그
https://console.firebase.google.com/project/YOUR_PROJECT/functions/logs

# Firestore 데이터
https://console.firebase.google.com/project/YOUR_PROJECT/firestore

# Functions 대시보드
https://console.firebase.google.com/project/YOUR_PROJECT/functions
```

---

## ✅ 배포 완료 체크리스트

- [ ] Firestore 인덱스 배포 완료
- [ ] Firebase Functions 배포 완료
- [ ] API 테스트 통과
- [ ] 수동 함수 실행 테스트 통과
- [ ] 기존 사용자 마이그레이션 완료 (필요 시)
- [ ] 모니터링 설정 완료
- [ ] 팀원에게 배포 완료 알림
- [ ] 문서 업데이트 완료

---

**배포 일시**: ___________
**배포자**: ___________
**확인자**: ___________

---

**참고 문서**:
- [DAILY_POINTS_EXPIRY_GUIDE.md](./DAILY_POINTS_EXPIRY_GUIDE.md) - 상세 가이드
- [POINT_SYSTEM_SETUP.md](./POINT_SYSTEM_SETUP.md) - 포인트 시스템 개요
