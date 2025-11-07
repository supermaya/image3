<?php
// user_daily_points 테이블 구조 수정
include 'db_config.php';

echo "<h2>user_daily_points 테이블 구조 수정</h2>";

// 연결 확인
if ($conn->connect_error) {
    echo "❌ 데이터베이스 연결 실패: " . $conn->connect_error . "<br>";
    exit;
}

// 현재 테이블 구조 확인
echo "<h3>현재 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE user_daily_points");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        echo "- " . $row['Field'] . " (" . $row['Type'] . ")" .
             ($row['Key'] ? " [" . $row['Key'] . "]" : "") .
             ($row['Extra'] ? " [" . $row['Extra'] . "]" : "") . "<br>";
    }
} else {
    echo "❌ 테이블 구조 조회 실패: " . $conn->error . "<br>";
    exit;
}

echo "<br><h3>테이블 구조 수정 중...</h3>";

// 1. PRIMARY KEY 추가 (id 컬럼을 AUTO_INCREMENT로 변경)
echo "1. PRIMARY KEY 및 AUTO_INCREMENT 설정...<br>";
$sql1 = "ALTER TABLE user_daily_points MODIFY id INT AUTO_INCREMENT PRIMARY KEY";
if ($conn->query($sql1)) {
    echo "✅ PRIMARY KEY 및 AUTO_INCREMENT 설정 완료<br>";
} else {
    echo "❌ PRIMARY KEY 설정 실패: " . $conn->error . "<br>";
}

// 2. UNIQUE KEY 추가 (user_id, date 조합)
echo "<br>2. UNIQUE KEY 추가...<br>";
$sql2 = "ALTER TABLE user_daily_points ADD UNIQUE KEY unique_user_date (user_id, date)";
if ($conn->query($sql2)) {
    echo "✅ UNIQUE KEY 추가 완료<br>";
} else {
    if (strpos($conn->error, "Duplicate key name") !== false) {
        echo "ℹ️ UNIQUE KEY 이미 존재<br>";
    } else {
        echo "❌ UNIQUE KEY 추가 실패: " . $conn->error . "<br>";
    }
}

// 3. 인덱스 추가
echo "<br>3. 인덱스 추가...<br>";
$indexes = [
    "ADD INDEX idx_user_id (user_id)",
    "ADD INDEX idx_date (date)",
    "ADD INDEX idx_user_date (user_id, date)"
];

foreach ($indexes as $index) {
    $sql = "ALTER TABLE user_daily_points $index";
    if ($conn->query($sql)) {
        echo "✅ 인덱스 추가: $index<br>";
    } else {
        if (strpos($conn->error, "Duplicate key name") !== false) {
            echo "ℹ️ 인덱스 이미 존재: $index<br>";
        } else {
            echo "❌ 인덱스 추가 실패: $index - " . $conn->error . "<br>";
        }
    }
}

// 4. FOREIGN KEY 추가 (users 테이블과 연결)
echo "<br>4. FOREIGN KEY 제약조건 추가...<br>";
$sql4 = "ALTER TABLE user_daily_points ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE";
if ($conn->query($sql4)) {
    echo "✅ FOREIGN KEY 제약조건 추가 완료<br>";
} else {
    if (strpos($conn->error, "Duplicate foreign key") !== false || strpos($conn->error, "already exists") !== false) {
        echo "ℹ️ FOREIGN KEY 제약조건 이미 존재<br>";
    } else {
        echo "❌ FOREIGN KEY 제약조건 추가 실패: " . $conn->error . "<br>";
    }
}

// 수정된 테이블 구조 확인
echo "<br><h3>수정된 테이블 구조:</h3>";
$result2 = $conn->query("DESCRIBE user_daily_points");
if ($result2) {
    while ($row = $result2->fetch_assoc()) {
        echo "- " . $row['Field'] . " (" . $row['Type'] . ")" .
             ($row['Key'] ? " [" . $row['Key'] . "]" : "") .
             ($row['Extra'] ? " [" . $row['Extra'] . "]" : "") . "<br>";
    }
} else {
    echo "❌ 수정된 테이블 구조 조회 실패: " . $conn->error . "<br>";
}

// 인덱스 정보 확인
echo "<br><h3>테이블 인덱스 정보:</h3>";
$result3 = $conn->query("SHOW INDEX FROM user_daily_points");
if ($result3) {
    while ($row = $result3->fetch_assoc()) {
        echo "- " . $row['Key_name'] . " (" . $row['Column_name'] . ")" .
             ($row['Non_unique'] == 0 ? " [UNIQUE]" : "") . "<br>";
    }
} else {
    echo "❌ 인덱스 정보 조회 실패: " . $conn->error . "<br>";
}

echo "<br><h3>✅ 테이블 구조 수정 완료!</h3>";
echo "이제 로그인을 다시 시도해보세요.";

$conn->close();
?>