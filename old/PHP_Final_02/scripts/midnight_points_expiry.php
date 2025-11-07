<?php
/**
 * 매일 자정 포인트 소멸 스크립트
 * 크론잡으로 매일 00:00에 실행되도록 설정
 *
 * 크론탭 설정 예시:
 * 0 0 * * * /usr/bin/php /path/to/your/project/scripts/midnight_points_expiry.php
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/services/PointsService.php';

try {
    // 데이터베이스 연결
    $pdo = new PDO($dsn, $username, $password, $options);

    // 포인트 서비스 인스턴스 생성
    $pointsService = new PointsService($pdo);

    // 로그 시작
    $logMessage = "[" . date('Y-m-d H:i:s') . "] 포인트 소멸 작업 시작\n";
    echo $logMessage;
    file_put_contents(__DIR__ . '/logs/points_expiry.log', $logMessage, FILE_APPEND | LOCK_EX);

    // 모든 사용자 포인트 소멸
    $result = $pointsService->expireAllUserPoints();

    if ($result['success']) {
        $logMessage = "[" . date('Y-m-d H:i:s') . "] " . $result['message'] . "\n";
        echo $logMessage;
        file_put_contents(__DIR__ . '/logs/points_expiry.log', $logMessage, FILE_APPEND | LOCK_EX);
    } else {
        $logMessage = "[" . date('Y-m-d H:i:s') . "] 오류: " . $result['message'] . "\n";
        echo $logMessage;
        file_put_contents(__DIR__ . '/logs/points_expiry.log', $logMessage, FILE_APPEND | LOCK_EX);
        exit(1);
    }

    $logMessage = "[" . date('Y-m-d H:i:s') . "] 포인트 소멸 작업 완료\n\n";
    echo $logMessage;
    file_put_contents(__DIR__ . '/logs/points_expiry.log', $logMessage, FILE_APPEND | LOCK_EX);

} catch (Exception $e) {
    $logMessage = "[" . date('Y-m-d H:i:s') . "] 치명적 오류: " . $e->getMessage() . "\n\n";
    echo $logMessage;
    file_put_contents(__DIR__ . '/logs/points_expiry.log', $logMessage, FILE_APPEND | LOCK_EX);
    exit(1);
}