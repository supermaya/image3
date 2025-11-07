# Storage CORS 설정 가이드

Firebase Storage에 CORS(Cross-Origin Resource Sharing) 정책을 적용하는 방법입니다.

## 현재 CORS 설정 (`cors.json`)

```json
[
  {
    "origin": [
      "https://pixelplanet-95dd9.web.app",
      "https://pixelplanet-95dd9.firebaseapp.com",
      "https://*.pixelsunday.com"
    ],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
  }
]
```

---

## 방법 1: Google Cloud SDK 사용 (권장)

### Step 1: Google Cloud SDK 설치

#### Windows 자동 설치:
```powershell
# PowerShell에서 실행
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\install-gcloud-sdk.ps1
```

#### 수동 다운로드:
https://cloud.google.com/sdk/docs/install-sdk#windows

### Step 2: 설치 확인 (새 터미널에서)

```bash
gcloud --version
gsutil --version
```

### Step 3: 인증

```bash
# Google 계정으로 로그인
gcloud auth login

# 프로젝트 설정
gcloud config set project pixelplanet-95dd9
```

### Step 4: CORS 적용

```bash
# CORS 설정 적용
gsutil cors set cors.json gs://pixelplanet-95dd9.firebasestorage.app

# CORS 설정 확인
gsutil cors get gs://pixelplanet-95dd9.firebasestorage.app
```

---

## 방법 2: Google Cloud Console (수동)

### Step 1: Console 접속
https://console.cloud.google.com/storage/browser?project=pixelplanet-95dd9

### Step 2: Bucket 선택
`pixelplanet-95dd9.firebasestorage.app` 클릭

### Step 3: Configuration 탭
- **Configuration** 탭 클릭
- **CORS** 섹션 찾기
- **Edit CORS** 버튼 클릭

### Step 4: CORS JSON 입력

```json
[
  {
    "origin": [
      "https://pixelplanet-95dd9.web.app",
      "https://pixelplanet-95dd9.firebaseapp.com",
      "https://*.pixelsunday.com"
    ],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
  }
]
```

### Step 5: Save
**Save** 버튼 클릭

---

## 방법 3: Firebase Admin SDK (Cloud Functions)

일회성 스크립트를 통한 설정 (복잡하므로 비권장)

---

## CORS 설정 확인

### 브라우저 개발자 도구에서:

1. https://pixelplanet-95dd9.web.app 접속
2. F12로 개발자 도구 열기
3. Network 탭에서 Storage 파일 요청 확인
4. Response Headers에서 확인:
   - `access-control-allow-origin`
   - `access-control-allow-methods`

### curl 명령어로 확인:

```bash
curl -I -H "Origin: https://pixelplanet-95dd9.web.app" \
  -H "Access-Control-Request-Method: GET" \
  https://storage.googleapis.com/pixelplanet-95dd9.firebasestorage.app/gallery/images/[파일명]
```

---

## 트러블슈팅

### `gsutil: command not found`
- Google Cloud SDK가 설치되지 않았거나
- 설치 후 터미널을 재시작하지 않음
- 해결: 터미널 재시작 또는 SDK 재설치

### `AccessDeniedException: 403`
- Google 계정 권한 부족
- 해결: `gcloud auth login`으로 재인증
- Firebase 프로젝트 소유자/편집자 권한 필요

### CORS가 적용되지 않음
- 브라우저 캐시 문제
- 해결: 시크릿 모드에서 테스트 또는 캐시 삭제

### 와일드카드 서브도메인이 작동하지 않음
- Cloud Storage CORS는 `https://*.pixelsunday.com` 패턴 지원
- 정확한 형식으로 입력했는지 확인

---

## 참고 문서

- [Cloud Storage CORS 설정](https://cloud.google.com/storage/docs/configuring-cors)
- [Firebase Storage 보안 규칙](https://firebase.google.com/docs/storage/security)
- [Google Cloud SDK 설치](https://cloud.google.com/sdk/docs/install)
