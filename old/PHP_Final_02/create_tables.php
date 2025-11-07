<?php
// 필요한 테이블들을 생성하는 스크립트
include 'db_config.php';

echo "<h2>포인트 시스템 테이블 생성</h2>";

// 연결 확인
if ($conn->connect_error) {
    echo "❌ 데이터베이스 연결 실패: " . $conn->connect_error . "<br>";
    exit;
}

// 1. users 테이블에 signup_points_given 컬럼 추가 (이미 있으면 무시)
echo "1. users 테이블 업데이트...<br>";
$sql1 = "ALTER TABLE users ADD COLUMN signup_points_given BOOLEAN DEFAULT FALSE AFTER role";
if ($conn->query($sql1)) {
    echo "✅ users 테이블에 signup_points_given 컬럼 추가됨<br>";
} else {
    if (strpos($conn->error, "Duplicate column") !== false) {
        echo "ℹ️ signup_points_given 컬럼 이미 존재<br>";
    } else {
        echo "❌ users 테이블 수정 실패: " . $conn->error . "<br>";
    }
}

// 2. point_wallet 테이블 생성
echo "<br>2. point_wallet 테이블 생성...<br>";
$sql2 = "CREATE TABLE IF NOT EXISTS point_wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_wallet (user_id),
    INDEX idx_user_id (user_id)
)";
if ($conn->query($sql2)) {
    echo "✅ point_wallet 테이블 생성됨<br>";
} else {
    echo "❌ point_wallet 테이블 생성 실패: " . $conn->error . "<br>";
}

// 3. transactions 테이블 생성
echo "<br>3. transactions 테이블 생성...<br>";
$sql3 = "CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('charge', 'deduct', 'signup_bonus', 'daily_bonus', 'expire') NOT NULL,
    amount INT NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
)";
if ($conn->query($sql3)) {
    echo "✅ transactions 테이블 생성됨<br>";
} else {
    echo "❌ transactions 테이블 생성 실패: " . $conn->error . "<br>";
}

// 4. user_daily_points 테이블 생성
echo "<br>4. user_daily_points 테이블 생성...<br>";
$sql4 = "CREATE TABLE IF NOT EXISTS user_daily_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    daily_bonus_claimed BOOLEAN DEFAULT FALSE,
    daily_points_earned INT DEFAULT 0,
    daily_points_used INT DEFAULT 0,
    daily_points_expired INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, date),
    INDEX idx_date (date),
    INDEX idx_user_date (user_id, date)
)";
if ($conn->query($sql4)) {
    echo "✅ user_daily_points 테이블 생성됨<br>";
} else {
    echo "❌ user_daily_points 테이블 생성 실패: " . $conn->error . "<br>";
}

// 5. 기존 사용자들에게 포인트 지갑 생성 (이미 있으면 무시)
echo "<br>5. 기존 사용자들 포인트 지갑 생성...<br>";
$sql5 = "INSERT IGNORE INTO point_wallet (user_id, balance) SELECT id, 500 FROM users";
$result5 = $conn->query($sql5);
if ($result5) {
    echo "✅ 기존 사용자들 포인트 지갑 생성 완료 (영향받은 행: " . $conn->affected_rows . ")<br>";
} else {
    echo "❌ 기존 사용자 포인트 지갑 생성 실패: " . $conn->error . "<br>";
}

// 6. 기존 사용자들 signup_points_given 업데이트
echo "<br>6. 기존 사용자들 signup_points_given 업데이트...<br>";
$sql6 = "UPDATE users SET signup_points_given = TRUE WHERE signup_points_given IS NULL OR signup_points_given = FALSE";
$result6 = $conn->query($sql6);
if ($result6) {
    echo "✅ 기존 사용자들 signup_points_given 업데이트 완료 (영향받은 행: " . $conn->affected_rows . ")<br>";
} else {
    echo "❌ signup_points_given 업데이트 실패: " . $conn->error . "<br>";
}

echo "<br><h3>✅ 포인트 시스템 설정 완료!</h3>";
echo "이제 로그인을 시도해보세요.";

$conn->close();
?>