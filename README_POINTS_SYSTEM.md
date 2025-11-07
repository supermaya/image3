# 포인트 시스템 구현 가이드

## 시스템 개요

사용자 포인트 관리 시스템이 구현되었습니다. 주요 기능은 다음과 같습니다:

- **일일 로그인 보너스**: 매일 60포인트 지급
- **갤러리 접근 비용**: 접근 시 17포인트 차감
- **포인트 소멸**: 매일 자정 모든 포인트 소멸
- **가입축하 보너스**: 신규 가입자 500포인트 지급

## 데이터베이스 설정

### 1. 테이블 생성
```bash
mysql -u [username] -p [database_name] < database/points_system.sql
```

### 2. 주요 테이블
- `user_points_balance`: 사용자별 포인트 잔액
- `user_points_transactions`: 모든 포인트 거래 내역
- `user_daily_login`: 일일 로그인 보너스 기록
- `user_gallery_access`: 갤러리 접근 기록
- `points_system_config`: 시스템 설정값

## 크론잡 설정

### 자동 포인트 소멸 설정
```bash
chmod +x scripts/setup_cron.sh
./scripts/setup_cron.sh
```

이 스크립트는 매일 자정(00:00)에 모든 사용자의 포인트를 소멸시킵니다.

## API 사용법

### 포인트 잔액 조회
```
GET /api/points.php?action=balance
```

### 포인트 내역 조회
```
GET /api/points.php?action=history&limit=20
```

### 일일 로그인 보너스 수령
```
POST /api/points.php?action=daily_bonus
```

### 갤러리 접근 (포인트 사용)
```
POST /api/points.php?action=gallery_access
```

## 사용 예시

### 1. 로그인 처리
```php
require_once 'src/controllers/AuthController.php';

$authController = new AuthController($pdo);
$result = $authController->login($email, $password);

if ($result['success']) {
    // 로그인 성공
    echo "현재 포인트: " . $result['current_balance'];

    if ($result['bonus_result']['success']) {
        echo "일일 보너스 지급: " . $result['bonus_result']['points_granted'] . "포인트";
    }
}
```

### 2. 회원가입 처리
```php
$result = $authController->register($email, $password, $name);

if ($result['success']) {
    // 가입 성공
    echo "가입축하 보너스: " . $result['welcome_bonus']['points_granted'] . "포인트";
}
```

### 3. 갤러리 접근
```php
require_once 'src/controllers/GalleryController.php';

$galleryController = new GalleryController($pdo);
$result = $galleryController->accessGallery($userId);

if ($result['success']) {
    // 갤러리 접근 성공
    echo "사용된 포인트: " . $result['points_used'];
    echo "남은 포인트: " . $result['remaining_balance'];
} else {
    // 포인트 부족
    echo $result['message'];
}
```

## 설정 변경

포인트 값들은 `points_system_config` 테이블에서 수정할 수 있습니다:

```sql
-- 일일 로그인 보너스 변경 (기본: 60포인트)
UPDATE points_system_config SET config_value = 100 WHERE config_key = 'daily_login_points';

-- 갤러리 접근 비용 변경 (기본: 17포인트)
UPDATE points_system_config SET config_value = 20 WHERE config_key = 'gallery_access_cost';

-- 가입축하 보너스 변경 (기본: 500포인트)
UPDATE points_system_config SET config_value = 1000 WHERE config_key = 'welcome_bonus_points';
```

## 로그 확인

포인트 소멸 작업 로그는 `scripts/logs/points_expiry.log`에서 확인할 수 있습니다:

```bash
tail -f scripts/logs/points_expiry.log
```

## 주의사항

1. **크론잡 설정**: 포인트 소멸을 위해 크론잡이 반드시 설정되어야 합니다.
2. **데이터베이스 트랜잭션**: 모든 포인트 관련 작업은 트랜잭션으로 처리됩니다.
3. **중복 방지**: 일일 보너스와 가입축하 보너스는 중복 지급을 방지합니다.
4. **세션 관리**: API 사용 시 사용자 로그인 세션이 필요합니다.