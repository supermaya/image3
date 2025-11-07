<?php
// 데이터베이스 테이블 확인 테스트
include 'db_config.php';

echo "<h2>데이터베이스 연결 테스트</h2>";

// 연결 확인
if ($conn->connect_error) {
    echo "❌ 데이터베이스 연결 실패: " . $conn->connect_error . "<br>";
    exit;
} else {
    echo "✅ 데이터베이스 연결 성공<br><br>";
}

// 테이블 존재 여부 확인
$tables_to_check = ['users', 'point_wallet', 'user_daily_points', 'transactions'];

echo "<h3>테이블 존재 여부 확인:</h3>";
foreach ($tables_to_check as $table) {
    $result = $conn->query("SHOW TABLES LIKE '$table'");
    if ($result->num_rows > 0) {
        echo "✅ $table 테이블 존재<br>";

        // 테이블 구조 확인
        $desc = $conn->query("DESCRIBE $table");
        echo "&nbsp;&nbsp;&nbsp;컬럼: ";
        $columns = [];
        while ($row = $desc->fetch_assoc()) {
            $columns[] = $row['Field'];
        }
        echo implode(', ', $columns) . "<br>";
    } else {
        echo "❌ $table 테이블 없음<br>";
    }
}

// users 테이블에서 샘플 데이터 확인
echo "<br><h3>users 테이블 데이터 확인:</h3>";
$users_result = $conn->query("SELECT id, email, role FROM users LIMIT 3");
if ($users_result && $users_result->num_rows > 0) {
    while ($row = $users_result->fetch_assoc()) {
        echo "User ID: " . $row['id'] . ", Email: " . $row['email'] . ", Role: " . ($row['role'] ?? 'null') . "<br>";
    }
} else {
    echo "❌ users 테이블에 데이터 없음<br>";
}

$conn->close();
?>