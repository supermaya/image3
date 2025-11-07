# Admin 계정 설정 방법

## Firebase Console에서 직접 설정하기

1. Firebase Console 접속: https://console.firebase.google.com/project/pixelplanet-95dd9/firestore
2. Firestore Database로 이동
3. `users` 컬렉션 선택
4. `admin@metamotion.io` 계정의 UID로 된 문서 찾기 (또는 새로 생성)
5. 다음 필드 추가/수정:
   ```
   email: "admin@metamotion.io"
   role: "admin"
   ```

## Firebase Authentication에서 사용자 확인

1. Firebase Console에서 Authentication으로 이동
2. `admin@metamotion.io` 계정이 있는지 확인
3. 없다면 새로 생성:
   - Email/Password 방식으로 사용자 추가
   - 이메일: admin@metamotion.io
   - 비밀번호: (원하는 비밀번호 설정)
4. 사용자의 UID를 복사

## Firestore에 admin role 설정

1. Firestore Database로 돌아가기
2. `users` 컬렉션에서 위에서 복사한 UID로 문서 찾기
3. 문서가 없다면 새로 생성 (문서 ID = UID)
4. 필드 설정:
   ```
   email: "admin@metamotion.io"
   role: "admin"
   createdAt: (현재 timestamp)
   dailyPoints: 0
   walletBalance: 0
   ```

완료 후 https://pixelplanet-95dd9.web.app/admin 에서 로그인 시도
