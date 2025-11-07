<?php
// 모든 포인트 시스템 테이블들의 구조 확인
include 'db_config.php';

echo "<h2>포인트 시스템 테이블들 구조 확인</h2>";

// 연결 확인
if ($conn->connect_error) {
    echo "❌ 데이터베이스 연결 실패: " . $conn->connect_error . "<br>";
    exit;
}

$tables = ['users', 'point_wallet', 'user_daily_points', 'transactions'];

foreach ($tables as $table) {
    echo "<h3>$table 테이블</h3>";

    // 테이블 존재 여부 확인
    $check_table = $conn->query("SHOW TABLES LIKE '$table'");
    if ($check_table->num_rows == 0) {
        echo "❌ $table 테이블이 존재하지 않습니다.<br><br>";
        continue;
    }

    // 테이블 구조 확인
    echo "<strong>컬럼 구조:</strong><br>";
    $result = $conn->query("DESCRIBE $table");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            echo "- " . $row['Field'] . " (" . $row['Type'] . ")" .
                 ($row['Key'] ? " [" . $row['Key'] . "]" : "") .
                 ($row['Extra'] ? " [" . $row['Extra'] . "]" : "") .
                 ($row['Default'] !== null ? " DEFAULT: " . $row['Default'] : "") . "<br>";
        }
    }

    // 인덱스 정보
    echo "<br><strong>인덱스:</strong><br>";
    $index_result = $conn->query("SHOW INDEX FROM $table");
    if ($index_result) {
        while ($row = $index_result->fetch_assoc()) {
            echo "- " . $row['Key_name'] . " (" . $row['Column_name'] . ")" .
                 ($row['Non_unique'] == 0 ? " [UNIQUE]" : "") . "<br>";
        }
    }

    // 데이터 개수 확인
    $count_result = $conn->query("SELECT COUNT(*) as count FROM $table");
    if ($count_result) {
        $count = $count_result->fetch_assoc()['count'];
        echo "<br><strong>데이터 개수:</strong> $count 개<br>";
    }

    echo "<br>---<br><br>";
}

// users 테이블에 signup_points_given 컬럼 확인
echo "<h3>users 테이블 특별 확인</h3>";
$users_columns = $conn->query("SHOW COLUMNS FROM users LIKE 'signup_points_given'");
if ($users_columns && $users_columns->num_rows > 0) {
    echo "✅ signup_points_given 컬럼 존재<br>";
} else {
    echo "❌ signup_points_given 컬럼 없음 - 추가 필요<br>";
}

echo "<br><h3>권장 조치사항</h3>";

// user_daily_points 테이블 PRIMARY KEY 확인
$udp_desc = $conn->query("DESCRIBE user_daily_points");
$has_auto_increment = false;
if ($udp_desc) {
    while ($row = $udp_desc->fetch_assoc()) {
        if ($row['Field'] == 'id' && strpos($row['Extra'], 'auto_increment') !== false) {
            $has_auto_increment = true;
            break;
        }
    }
}

if (!$has_auto_increment) {
    echo "⚠️ user_daily_points 테이블의 id 컬럼이 AUTO_INCREMENT가 아닙니다. fix_table_structure.php를 실행하세요.<br>";
}

// transactions 테이블 확인
$trans_check = $conn->query("SHOW TABLES LIKE 'transactions'");
if ($trans_check->num_rows == 0) {
    echo "⚠️ transactions 테이블이 없습니다. create_tables.php를 실행하세요.<br>";
}

// point_wallet 테이블 확인
$wallet_check = $conn->query("SHOW TABLES LIKE 'point_wallet'");
if ($wallet_check->num_rows == 0) {
    echo "⚠️ point_wallet 테이블이 없습니다. create_tables.php를 실행하세요.<br>";
}

$conn->close();
?>