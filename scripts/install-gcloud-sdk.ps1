# Google Cloud SDK 설치 스크립트 (PowerShell)
#
# 사용법: PowerShell에서 다음 명령어 실행
# Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
# .\scripts\install-gcloud-sdk.ps1

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Google Cloud SDK 설치 스크립트" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 다운로드 URL
$installerUrl = "https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe"
$installerPath = "$env:TEMP\GoogleCloudSDKInstaller.exe"

Write-Host "1. Google Cloud SDK 설치 프로그램 다운로드 중..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "   ✓ 다운로드 완료: $installerPath" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 다운로드 실패: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "수동 다운로드:" -ForegroundColor Yellow
    Write-Host "https://cloud.google.com/sdk/docs/install-sdk#windows" -ForegroundColor Cyan
    exit 1
}

Write-Host ""
Write-Host "2. 설치 프로그램 실행 중..." -ForegroundColor Yellow
Write-Host "   - 설치 마법사가 나타납니다" -ForegroundColor Gray
Write-Host "   - 모든 기본 옵션으로 진행하세요" -ForegroundColor Gray
Write-Host "   - 마지막에 'Run gcloud init' 체크 해제하세요 (나중에 수동으로 실행)" -ForegroundColor Gray
Write-Host ""

Start-Process -FilePath $installerPath -Wait

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "설치 완료!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "1. 새로운 터미널/PowerShell 창을 열어주세요" -ForegroundColor White
Write-Host "2. 다음 명령어로 설치 확인:" -ForegroundColor White
Write-Host "   gcloud --version" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Firebase 프로젝트 인증:" -ForegroundColor White
Write-Host "   gcloud auth login" -ForegroundColor Cyan
Write-Host "   gcloud config set project pixelplanet-95dd9" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Storage CORS 설정 적용:" -ForegroundColor White
Write-Host "   gsutil cors set cors.json gs`://pixelplanet-95dd9.firebasestorage.app" -ForegroundColor Cyan
Write-Host ""
