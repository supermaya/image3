# Storage 마이그레이션 가이드

## 사전 준비

### 1. Firebase Service Account Key 다운로드

1. Firebase Console 접속: https://console.firebase.google.com/project/pixelplanet-95dd9/settings/serviceaccounts/adminsdk
2. "새 비공개 키 생성" 버튼 클릭
3. 다운로드한 JSON 파일을 `serviceAccountKey.json` 이름으로 프로젝트 루트에 저장

### 2. 패키지 설치

```bash
npm install firebase-admin
```

## 마이그레이션 실행

```bash
node migrate-storage.js
```

## 마이그레이션 동작 방식

1. **Firestore에서 모든 음악 문서 조회**
2. **각 문서의 파일 경로 확인**
   - `images/**` → `gallery/images/**`로 복사
   - `audio/**` → `gallery/audio/**`로 복사
3. **새 경로의 Download URL 생성**
4. **Firestore 문서 업데이트**
5. **기존 파일은 보존** (삭제하지 않음)

## 주의사항

- ⚠️ 마이그레이션 중에는 사용자 업로드를 중지하는 것을 권장
- ✅ 기존 파일은 삭제되지 않으므로 안전함
- ✅ 마이그레이션 실패 시 수동으로 롤백 가능
- ⚠️ Service Account Key는 절대 Git에 커밋하지 말 것

## 마이그레이션 후 확인사항

1. 사이트에서 이미지가 정상적으로 표시되는지 확인
2. 음악 재생이 정상적으로 되는지 확인
3. 기존 파일 정리 (선택사항)

## 기존 파일 정리 (선택사항)

마이그레이션이 성공적으로 완료되고 확인 후, 기존 파일을 삭제하려면 Firebase Console > Storage에서 수동으로 삭제
