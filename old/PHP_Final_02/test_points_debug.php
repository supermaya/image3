<?php
session_start();

// 디버깅을 위해 에러 출력 활성화
error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'db_config.php';

echo "<h1>포인트 시스템 디버깅</h1>";

// 1. 세션 정보 확인
echo "<h2>1. 세션 정보</h2>";
echo "<pre>";
print_r($_SESSION);
echo "</pre>";

// 2. 데이터베이스 연결 확인
echo "<h2>2. 데이터베이스 연결</h2>";
if ($conn->connect_error) {
    echo "❌ 연결 실패: " . $conn->connect_error;
    exit;
} else {
    echo "✅ 데이터베이스 연결 성공<br>";
}

// 3. 필요한 테이블들 존재 확인
echo "<h2>3. 테이블 존재 여부</h2>";
$required_tables = ['users', 'user_daily_points', 'point_wallet', 'transactions'];

foreach ($required_tables as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if ($result->num_rows > 0) {
        echo "✅ $table 테이블 존재<br>";

        // 테이블 구조 간단히 표시
        $desc = $conn->query("DESCRIBE $table");
        echo "<details><summary>$table 구조 보기</summary>";
        echo "<table border='1'><tr><th>컬럼</th><th>타입</th><th>키</th></tr>";
        while ($row = $desc->fetch_assoc()) {
            echo "<tr><td>{$row['Field']}</td><td>{$row['Type']}</td><td>{$row['Key']}</td></tr>";
        }
        echo "</table></details>";
    } else {
        echo "❌ $table 테이블 없음<br>";
    }
}

// 4. 로그인한 사용자가 있으면 포인트 상황 확인
if (isset($_SESSION['user_id'])) {
    $userId = $_SESSION['user_id'];
    echo "<h2>4. 사용자 {$userId} 포인트 상황</h2>";

    $today = date('Y-m-d');

    // 일일 포인트 확인
    echo "<h3>일일 포인트 (오늘: $today)</h3>";
    $stmt = $conn->prepare("SELECT * FROM user_daily_points WHERE user_id = ? AND date = ?");
    if ($stmt) {
        $stmt->bind_param("is", $userId, $today);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            echo "<pre>";
            print_r($row);
            echo "</pre>";

            $available = $row['daily_points_earned'] - $row['daily_points_used'];
            echo "사용 가능한 일일 포인트: $available P<br>";
        } else {
            echo "오늘 일일 포인트 기록 없음<br>";
        }
        $stmt->close();
    } else {
        echo "❌ user_daily_points 쿼리 준비 실패<br>";
    }

    // 지갑 포인트 확인
    echo "<h3>지갑 포인트</h3>";
    $stmt = $conn->prepare("SELECT * FROM point_wallet WHERE user_id = ?");
    if ($stmt) {
        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            echo "<pre>";
            print_r($row);
            echo "</pre>";
        } else {
            echo "지갑 포인트 기록 없음<br>";
        }
        $stmt->close();
    } else {
        echo "❌ point_wallet 쿼리 준비 실패<br>";
    }

    // 최근 트랜잭션 확인
    echo "<h3>최근 트랜잭션 (최신 5개)</h3>";
    $stmt = $conn->prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5");
    if ($stmt) {
        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            echo "<table border='1'><tr><th>타입</th><th>금액</th><th>설명</th><th>시간</th></tr>";
            while ($row = $result->fetch_assoc()) {
                echo "<tr><td>{$row['type']}</td><td>{$row['amount']}</td><td>{$row['description']}</td><td>{$row['created_at']}</td></tr>";
            }
            echo "</table>";
        } else {
            echo "트랜잭션 기록 없음<br>";
        }
        $stmt->close();
    } else {
        echo "❌ transactions 쿼리 준비 실패<br>";
    }
} else {
    echo "<h2>4. 로그인 필요</h2>";
    echo "포인트 상황을 확인하려면 로그인이 필요합니다.<br>";
}

// 5. 실제 use_point API 테스트
if (isset($_SESSION['user_id'])) {
    echo "<h2>5. use_point API 시뮬레이션</h2>";
    echo "<p>실제 API를 호출하지 않고 로직만 테스트합니다.</p>";

    $userId = $_SESSION['user_id'];
    $pointsNeeded = 17;
    $today = date('Y-m-d');

    echo "필요한 포인트: $pointsNeeded P<br>";

    try {
        // 일일 포인트 확인
        $stmt_daily = $conn->prepare("SELECT daily_points_earned - daily_points_used AS available_daily_points FROM user_daily_points WHERE user_id = ? AND date = ?");
        $stmt_daily->bind_param("is", $userId, $today);
        $stmt_daily->execute();
        $result_daily = $stmt_daily->get_result();

        $availableDailyPoints = 0;
        if ($result_daily->num_rows > 0) {
            $availableDailyPoints = $result_daily->fetch_assoc()['available_daily_points'] ?? 0;
        }
        $stmt_daily->close();

        echo "사용 가능한 일일 포인트: $availableDailyPoints P<br>";

        // 지갑 포인트 확인
        $stmt_wallet = $conn->prepare("SELECT balance FROM point_wallet WHERE user_id = ?");
        $stmt_wallet->bind_param("i", $userId);
        $stmt_wallet->execute();
        $result_wallet = $stmt_wallet->get_result();

        $walletBalance = 0;
        if ($result_wallet->num_rows > 0) {
            $walletBalance = $result_wallet->fetch_assoc()['balance'] ?? 0;
        }
        $stmt_wallet->close();

        echo "지갑 포인트: $walletBalance P<br>";

        $totalAvailable = $availableDailyPoints + $walletBalance;
        echo "총 사용 가능한 포인트: $totalAvailable P<br>";

        if ($totalAvailable >= $pointsNeeded) {
            echo "✅ 포인트 충분: 갤러리 접근 가능<br>";
        } else {
            echo "❌ 포인트 부족: 갤러리 접근 불가<br>";
        }

    } catch (Exception $e) {
        echo "❌ 테스트 중 오류: " . $e->getMessage() . "<br>";
    }
}

echo "<h2>권장 조치사항</h2>";
echo "<ol>";
echo "<li><a href='setup_existing_point_system.php'>setup_existing_point_system.php</a> 실행하여 테이블 생성</li>";
echo "<li>로그인하여 일일 보너스 받기</li>";
echo "<li>갤러리 접근 테스트</li>";
echo "</ol>";

$conn->close();
?>