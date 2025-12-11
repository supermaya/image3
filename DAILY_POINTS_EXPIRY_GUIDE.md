# 일일 포인트 자정 만료 시스템 가이드

일일 로그인 보너스로 지급받은 포인트가 당일 자정에 자동으로 만료되는 시스템입니다.

## 📋 시스템 개요

### 포인트 구조

사용자 포인트는 두 가지 타입으로 구분됩니다:

1. **일일 포인트 (dailyPoints)**
   - 매일 로그인 보너스로 지급 (60P)
   - **당일 자정(00:00 KST)에 자동 만료**
   - 포인트 사용 시 우선적으로 차감

2. **지갑 포인트 (walletPoints)**
   - 유상 충전 포인트
   - **영구 보존** (만료되지 않음)
   - 일일 포인트 소진 후 차감

### Firestore 데이터 구조

#### users 컬렉션
```javascript
{
  uid: "user123",
  dailyPoints: 60,              // 일일 포인트 (자정 만료)
  walletPoints: 500,            // 지갑 포인트 (영구)
  dailyBonusClaimed: true,      // 오늘 보너스 수령 여부
  dailyBonusLastClaimed: Timestamp,  // 마지막 보너스 수령 시간
  dailyPointsGrantedDate: Timestamp, // 일일 포인트 지급 날짜
  lastDailyPointsExpiry: Timestamp   // 마지막 만료 처리 시간
}
```

#### pointTransactions 컬렉션
```javascript
{
  userId: "user123",
  type: "daily_bonus" | "usage" | "admin_grant" | "daily_expire",
  pointType: "daily" | "wallet",
  amount: 60,                    // 지급/차감 포인트
  usedFromDaily: 17,             // 일일 포인트에서 사용한 양
  usedFromWallet: 0,             // 지갑 포인트에서 사용한 양
  description: "일일 보너스",
  createdAt: Timestamp
}
```

---

## 🚀 설정 방법

### 1. Firestore 인덱스 설정

`firestore.indexes.json`에 다음 인덱스를 추가하세요:

```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "dailyPoints", "order": "ASCENDING" }
      ]
    }
  ]
}
```

배포:
```bash
firebase deploy --only firestore:indexes
```

### 2. Firebase Functions 배포

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:expireDailyPoints
```

### 3. 배포 확인

Firebase Console에서 확인:
1. Firebase Console > Functions
2. `expireDailyPoints` 함수가 배포되었는지 확인
3. 스케줄이 "매일 00:00 KST"로 설정되었는지 확인

---

## 📖 사용 방법

### API 엔드포인트

#### 1. 포인트 조회
```javascript
GET /api/points

// 응답
{
  "success": true,
  "data": {
    "dailyPoints": 60,      // 일일 포인트
    "walletPoints": 500,    // 지갑 포인트
    "totalPoints": 560,     // 총 포인트
    "dailyBonusClaimed": true,
    "dailyBonusLastClaimed": "2024-01-15T10:30:00Z"
  }
}
```

#### 2. 일일 보너스 수령
```javascript
POST /api/points/daily-bonus

// 응답
{
  "success": true,
  "message": "일일 보너스 60P가 지급되었습니다. (당일 자정까지 유효)",
  "data": {
    "dailyPoints": 60,
    "walletPoints": 500,
    "totalPoints": 560,
    "dailyBonusClaimed": true
  }
}
```

#### 3. 포인트 사용 (갤러리 접근)
```javascript
POST /api/points/use
{
  "amount": 17,
  "reason": "갤러리 접근"
}

// 응답 (일일 포인트로만 차감)
{
  "success": true,
  "message": "17P가 차감되었습니다. (일일: 17P)",
  "data": {
    "dailyPoints": 43,
    "walletPoints": 500,
    "totalPoints": 543,
    "usedAmount": 17,
    "usedFromDaily": 17,
    "usedFromWallet": 0
  }
}

// 응답 (일일 + 지갑 포인트 혼용)
{
  "success": true,
  "message": "17P가 차감되었습니다. (일일: 10P, 지갑: 7P)",
  "data": {
    "dailyPoints": 0,
    "walletPoints": 493,
    "totalPoints": 493,
    "usedAmount": 17,
    "usedFromDaily": 10,
    "usedFromWallet": 7
  }
}
```

#### 4. 관리자 포인트 지급
```javascript
POST /api/points/add
{
  "userId": "user123",
  "amount": 1000,
  "pointType": "wallet",  // "daily" 또는 "wallet"
  "reason": "이벤트 보상"
}

// 응답
{
  "success": true,
  "message": "지갑 포인트 1000P가 지급되었습니다."
}
```

---

## 🔄 자정 만료 프로세스

### 작동 방식

1. **스케줄**: 매일 00:00 KST (한국 시간)
2. **실행 함수**: `expireDailyPoints` (Firebase Scheduled Function)
3. **처리 순서**:
   ```
   ① dailyPoints > 0인 모든 사용자 조회
   ② 각 사용자의 dailyPoints를 0으로 초기화
   ③ 만료된 포인트를 pointTransactions에 기록
   ④ 만료 통계를 dailyPointsExpiryLogs에 저장
   ⑤ 에러 발생 시 dailyPointsExpiryErrors에 기록
   ```

### 로그 확인

#### Firebase Console에서 확인
```
Firebase Console > Functions > expireDailyPoints > 로그 탭
```

#### 로그 예시
```
⏰ [일일 포인트 만료] 작업 시작: 2024-01-16T00:00:01.234Z
📊 [일일 포인트 만료] 처리 대상 사용자: 150명
✅ [일일 포인트 만료] 작업 완료
   - 영향받은 사용자: 150명
   - 만료된 포인트: 8,340P
   - 실행 시간: 1,234ms
```

#### Firestore 만료 로그 확인
```javascript
// dailyPointsExpiryLogs 컬렉션
{
  date: "2024-01-16",
  expiredUsers: 150,
  totalExpiredPoints: 8340,
  executionTime: 1234,
  completedAt: Timestamp
}
```

---

## 🧪 테스트 방법

### 1. 수동 테스트 (로컬)

Firebase Emulator를 사용한 테스트:

```bash
# Emulator 시작
firebase emulators:start

# 테스트 스크립트 실행
node test-daily-points-expiry.js
```

**test-daily-points-expiry.js**:
```javascript
import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function testExpiry() {
  // 1. 테스트 사용자 생성
  await db.collection('users').doc('testUser').set({
    dailyPoints: 60,
    walletPoints: 100
  });

  console.log('✅ 테스트 사용자 생성 (dailyPoints: 60)');

  // 2. expireDailyPoints 함수 직접 호출 (함수를 import 후)
  // 또는 시간을 00:00로 변경하여 자동 실행 대기

  // 3. 결과 확인
  const user = await db.collection('users').doc('testUser').get();
  const userData = user.data();

  console.log('만료 후 dailyPoints:', userData.dailyPoints);  // 0이어야 함
  console.log('만료 후 walletPoints:', userData.walletPoints);  // 100이어야 함

  // 4. 거래 내역 확인
  const transactions = await db.collection('pointTransactions')
    .where('userId', '==', 'testUser')
    .where('type', '==', 'daily_expire')
    .get();

  console.log('만료 거래 내역:', transactions.size);  // 1이어야 함
}

testExpiry().then(() => process.exit(0));
```

### 2. 프로덕션 테스트

```bash
# 함수 수동 실행 (테스트용)
firebase functions:shell

# 함수 직접 호출
> expireDailyPoints()
```

---

## 📊 모니터링

### Cloud Functions 메트릭

Firebase Console > Functions > expireDailyPoints:
- 실행 횟수: 매일 1회
- 평균 실행 시간: ~1-2초 (사용자 수에 따라 다름)
- 오류율: 0% (정상)

### Firestore 쿼리 모니터링

```javascript
// 오늘 만료된 포인트 통계
const today = new Date().toISOString().split('T')[0];
const log = await db.collection('dailyPointsExpiryLogs')
  .where('date', '==', today)
  .get();

console.log(log.docs[0].data());
```

### 알림 설정 (선택사항)

Firebase Console > Functions > expireDailyPoints > 알림:
- 오류 발생 시 이메일 알림 설정
- 실행 실패 시 Slack/Discord 웹훅 전송

---

## 🛠️ 문제 해결

### 1. 함수가 실행되지 않음

**증상**: 자정이 지났는데 포인트가 만료되지 않음

**해결**:
```bash
# 함수 재배포
firebase deploy --only functions:expireDailyPoints

# 로그 확인
firebase functions:log --only expireDailyPoints --limit 10
```

### 2. 일부 사용자만 만료됨

**증상**: 일부 사용자의 dailyPoints가 남아있음

**원인**: Firestore 인덱스 미생성 또는 쿼리 제한

**해결**:
```bash
# 인덱스 확인 및 재배포
firebase deploy --only firestore:indexes

# 수동으로 누락된 사용자 처리
node manual-expire-script.js
```

### 3. 타임존 문제

**증상**: 한국 시간이 아닌 다른 시간에 실행됨

**해결**:
`functions/index.js`에서 timeZone 확인:
```javascript
timeZone: 'Asia/Seoul'  // 반드시 'Asia/Seoul'
```

### 4. 배치 작업 실패

**증상**: 사용자가 많을 때 타임아웃 발생

**해결**:
- 함수 타임아웃 증가: `timeoutSeconds: 540` (9분)
- 메모리 증가: `memory: '512MiB'`
- 배치 크기 조정: `batchLimit = 400`

---

## ⚡ 성능 최적화

### 사용자 수에 따른 예상 실행 시간

| 사용자 수 | 실행 시간 | 메모리 사용량 |
|----------|----------|-------------|
| 100명    | ~500ms   | 128MiB      |
| 1,000명  | ~2s      | 256MiB      |
| 10,000명 | ~15s     | 512MiB      |
| 100,000명| ~90s     | 1GiB        |

### 대규모 사용자 처리

사용자가 10만 명 이상인 경우:
```javascript
// 페이지네이션 방식으로 처리
const pageSize = 5000;
let lastDoc = null;

while (true) {
  let query = db.collection('users')
    .where('dailyPoints', '>', 0)
    .limit(pageSize);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snapshot = await query.get();
  if (snapshot.empty) break;

  // 배치 처리...

  lastDoc = snapshot.docs[snapshot.docs.length - 1];
}
```

---

## 📝 FAQ

### Q1: 자정 직전에 받은 포인트도 만료되나요?
**A**: 네, 23:59에 받은 포인트도 00:00에 만료됩니다. 일일 포인트는 "지급 시간"이 아닌 "날짜"를 기준으로 만료됩니다.

### Q2: 만료된 포인트를 복구할 수 있나요?
**A**: 관리자가 `/api/points/add` API로 지갑 포인트를 지급할 수 있습니다. 일일 포인트는 자동 지급만 가능합니다.

### Q3: 포인트 사용 순서를 변경할 수 있나요?
**A**: `src/routes/points.js`의 포인트 사용 로직을 수정하여 순서를 바꿀 수 있습니다. (권장하지 않음)

### Q4: 크리에이터/관리자도 포인트가 만료되나요?
**A**: 네, 일일 포인트는 모든 사용자에게 동일하게 적용됩니다. 단, 크리에이터/관리자는 갤러리 접근 시 포인트를 차감하지 않습니다.

### Q5: 휴일에도 만료되나요?
**A**: 네, 매일 자정마다 실행됩니다. 특정 날짜에만 실행하려면 함수 코드를 수정해야 합니다.

---

## 🔗 관련 파일

- `src/routes/points.js` - 포인트 API 라우터
- `functions/index.js` - Firebase Scheduled Function
- `firestore.indexes.json` - Firestore 인덱스 설정
- `firestore.rules` - Firestore 보안 규칙

---

## 📞 지원

문제가 발생하거나 질문이 있으시면:
1. Firebase Console > Functions > 로그 확인
2. `dailyPointsExpiryErrors` 컬렉션 확인
3. GitHub Issues에 문의

---

**마지막 업데이트**: 2024-11-17
