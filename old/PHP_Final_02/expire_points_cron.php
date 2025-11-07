<?php
/**
 * 일일 포인트 소멸 처리 cron job 스크립트
 * 매일 자정(00:00)에 실행되어야 함
 *
 * crontab 설정 예시:
 * 0 0 * * * /usr/bin/php /path/to/your/project/expire_points_cron.php
 */

// CLI에서만 실행 가능하도록 제한
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die('This script can only be run from the command line.');
}

// 스크립트 시작 시간 기록
$startTime = microtime(true);
echo "[" . date('Y-m-d H:i:s') . "] 일일 포인트 소멸 처리 시작\n";

// 데이터베이스 연결
require_once __DIR__ . '/db_config.php';

// 데이터베이스 연결 확인
if ($conn->connect_error) {
    echo "[ERROR] 데이터베이스 연결 실패: " . $conn->connect_error . "\n";
    exit(1);
}

try {
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));

    echo "[INFO] 처리 대상 날짜: $yesterday\n";

    $conn->begin_transaction();

    // 어제 미사용 일일 포인트들을 찾아서 소멸 처리
    $stmt_expire = $conn->prepare("
        UPDATE user_daily_points
        SET daily_points_expired = daily_points_earned - daily_points_used,
            updated_at = CURRENT_TIMESTAMP
        WHERE date = ?
        AND (daily_points_earned - daily_points_used) > 0
        AND daily_points_expired = 0
    ");

    $stmt_expire->bind_param("s", $yesterday);
    $stmt_expire->execute();
    $affectedRows = $stmt_expire->affected_rows;
    $stmt_expire->close();

    echo "[INFO] $affectedRows 개의 레코드에서 포인트 소멸 처리\n";

    // 소멸된 포인트들에 대한 트랜잭션 기록
    $stmt_trans = $conn->prepare("
        INSERT INTO transactions (user_id, type, amount, description, created_at)
        SELECT user_id, 'expire', daily_points_expired, CONCAT('일일 포인트 자동 소멸 (', ?, ')'), CURRENT_TIMESTAMP
        FROM user_daily_points
        WHERE date = ? AND daily_points_expired > 0
    ");

    $stmt_trans->bind_param("ss", $yesterday, $yesterday);
    $stmt_trans->execute();
    $transactionRows = $stmt_trans->affected_rows;
    $stmt_trans->close();

    echo "[INFO] $transactionRows 개의 트랜잭션 기록 생성\n";

    // 소멸된 총 포인트 계산
    $stmt_total = $conn->prepare("
        SELECT
            COUNT(*) as users_affected,
            SUM(daily_points_expired) as total_expired_points
        FROM user_daily_points
        WHERE date = ? AND daily_points_expired > 0
    ");

    $stmt_total->bind_param("s", $yesterday);
    $stmt_total->execute();
    $result = $stmt_total->get_result();
    $stats = $result->fetch_assoc();
    $stmt_total->close();

    $conn->commit();

    $endTime = microtime(true);
    $executionTime = round(($endTime - $startTime) * 1000, 2);

    echo "[SUCCESS] 포인트 소멸 처리 완료\n";
    echo "[STATS] 영향받은 사용자: {$stats['users_affected']}명\n";
    echo "[STATS] 총 소멸된 포인트: {$stats['total_expired_points']}P\n";
    echo "[STATS] 실행 시간: {$executionTime}ms\n";
    echo "[" . date('Y-m-d H:i:s') . "] 작업 완료\n";

} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    echo "[ERROR] 포인트 소멸 처리 실패: " . $e->getMessage() . "\n";
    exit(1);
} finally {
    $conn->close();
}

// 로그 파일에도 기록 (선택사항)
$logMessage = "[" . date('Y-m-d H:i:s') . "] 포인트 소멸 처리 완료 - 영향받은 사용자: {$stats['users_affected']}명, 소멸된 포인트: {$stats['total_expired_points']}P\n";
file_put_contents(__DIR__ . '/logs/point_expiration.log', $logMessage, FILE_APPEND | LOCK_EX);

exit(0);
?>