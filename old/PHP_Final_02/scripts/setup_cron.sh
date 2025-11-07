#!/bin/bash

# 포인트 소멸 크론잡 설정 스크립트
# 매일 자정(00:00)에 포인트 소멸 스크립트 실행

# 현재 스크립트 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 로그 디렉토리 생성
mkdir -p "$SCRIPT_DIR/logs"

# PHP 경로 찾기
PHP_PATH=$(which php)

if [ -z "$PHP_PATH" ]; then
    echo "PHP가 설치되어 있지 않거나 PATH에 없습니다."
    exit 1
fi

echo "PHP 경로: $PHP_PATH"
echo "프로젝트 경로: $PROJECT_DIR"

# 크론탭에 추가할 작업
CRON_JOB="0 0 * * * $PHP_PATH $SCRIPT_DIR/midnight_points_expiry.php >> $SCRIPT_DIR/logs/cron.log 2>&1"

# 현재 크론탭 백업
crontab -l > /tmp/current_cron 2>/dev/null || true

# 이미 존재하는지 확인
if grep -F "midnight_points_expiry.php" /tmp/current_cron >/dev/null 2>&1; then
    echo "포인트 소멸 크론잡이 이미 설정되어 있습니다."
else
    # 새로운 크론잡 추가
    echo "$CRON_JOB" >> /tmp/current_cron
    crontab /tmp/current_cron
    echo "포인트 소멸 크론잡이 성공적으로 추가되었습니다."
    echo "매일 자정(00:00)에 실행됩니다."
fi

# 임시 파일 삭제
rm -f /tmp/current_cron

# 현재 크론탭 확인
echo "현재 설정된 크론탭:"
crontab -l