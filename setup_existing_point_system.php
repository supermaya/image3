<?php
// 기존 포인트 시스템에 필요한 테이블들 생성

error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'db_config.php';

echo "<h2>기존 포인트 시스템 테이블 설정</h2>";

if ($conn->connect_error) {
    die("연결 실패: " . $conn->connect_error);
}

$success = true;

// 1. users 테이블에 signup_points_given 컬럼 추가 (없는 경우)
echo "<h3>1. users 테이블 업데이트</h3>";
$check_column = $conn->query("SHOW COLUMNS FROM users LIKE 'signup_points_given'");
if ($check_column->num_rows == 0) {
    $sql = "ALTER TABLE users ADD COLUMN signup_points_given BOOLEAN DEFAULT FALSE";
    if ($conn->query($sql) === TRUE) {
        echo "✅ users 테이블에 signup_points_given 컬럼 추가됨<br>";
    } else {
        echo "❌ signup_points_given 컬럼 추가 실패: " . $conn->error . "<br>";
        $success = false;
    }
} else {
    echo "✅ signup_points_given 컬럼 이미 존재<br>";
}

// 2. user_daily_points 테이블 생성
echo "<h3>2. user_daily_points 테이블 생성</h3>";
$sql = "CREATE TABLE IF NOT EXISTS user_daily_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    daily_bonus_claimed BOOLEAN DEFAULT FALSE,
    daily_points_earned INT DEFAULT 0,
    daily_points_used INT DEFAULT 0,
    daily_points_expired INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_date (user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)";

if ($conn->query($sql) === TRUE) {
    echo "✅ user_daily_points 테이블 생성/확인됨<br>";
} else {
    echo "❌ user_daily_points 테이블 생성 실패: " . $conn->error . "<br>";
    $success = false;
}

// 3. point_wallet 테이블 생성
echo "<h3>3. point_wallet 테이블 생성</h3>";
$sql = "CREATE TABLE IF NOT EXISTS point_wallet (
    user_id INT PRIMARY KEY,
    balance INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)";

if ($conn->query($sql) === TRUE) {
    echo "✅ point_wallet 테이블 생성/확인됨<br>";
} else {
    echo "❌ point_wallet 테이블 생성 실패: " . $conn->error . "<br>";
    $success = false;
}

// 4. transactions 테이블 생성
echo "<h3>4. transactions 테이블 생성</h3>";
$sql = "CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('signup_bonus', 'daily_bonus', 'deduct', 'expire') NOT NULL,
    amount INT NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)";

if ($conn->query($sql) === TRUE) {
    echo "✅ transactions 테이블 생성/확인됨<br>";
} else {
    echo "❌ transactions 테이블 생성 실패: " . $conn->error . "<br>";
    $success = false;
}

// 5. 기존 사용자들에게 포인트 지갑 생성
echo "<h3>5. 기존 사용자 포인트 지갑 설정</h3>";
$sql = "INSERT IGNORE INTO point_wallet (user_id, balance)
        SELECT id, 0 FROM users WHERE id NOT IN (SELECT user_id FROM point_wallet)";

if ($conn->query($sql) === TRUE) {
    $affected = $conn->affected_rows;
    echo "✅ {$affected}명의 기존 사용자에게 포인트 지갑 생성됨<br>";
} else {
    echo "❌ 기존 사용자 포인트 지갑 생성 실패: " . $conn->error . "<br>";
    $success = false;
}

// 6. 신규 가입자 확인 및 가입축하 포인트 지급
echo "<h3>6. 신규 가입자 가입축하 포인트 지급</h3>";
$sql = "UPDATE users SET signup_points_given = TRUE WHERE signup_points_given = FALSE";
$result = $conn->query($sql);

if ($result) {
    $updated_users = $conn->affected_rows;

    if ($updated_users > 0) {
        // 가입축하 포인트 지급
        $sql = "UPDATE point_wallet pw
                JOIN users u ON pw.user_id = u.id
                SET pw.balance = pw.balance + 500
                WHERE u.signup_points_given = TRUE";

        if ($conn->query($sql) === TRUE) {
            echo "✅ {$updated_users}명의 신규 사용자에게 가입축하 포인트 500P 지급됨<br>";

            // 트랜잭션 기록
            $sql = "INSERT INTO transactions (user_id, type, amount, description)
                    SELECT id, 'signup_bonus', 500, '신규 가입 보너스'
                    FROM users WHERE signup_points_given = TRUE";
            $conn->query($sql);
        } else {
            echo "❌ 가입축하 포인트 지급 실패: " . $conn->error . "<br>";
            $success = false;
        }
    } else {
        echo "ℹ️ 가입축하 포인트를 받을 신규 사용자가 없습니다.<br>";
    }
} else {
    echo "❌ 신규 가입자 확인 실패: " . $conn->error . "<br>";
    $success = false;
}

if ($success) {
    echo "<br><h3>🎉 포인트 시스템 설정 완료!</h3>";
    echo "<p>이제 다음과 같이 작동합니다:</p>";
    echo "<ul>";
    echo "<li>로그인 시 매일 60포인트 자동 지급</li>";
    echo "<li>갤러리 접근 시 17포인트 차감</li>";
    echo "<li>신규 가입자는 500포인트 가입축하 보너스 지급</li>";
    echo "<li>포인트는 매일 자정에 소멸 (크론잡 설정 필요)</li>";
    echo "</ul>";
} else {
    echo "<br><h3>❌ 일부 설정에서 오류가 발생했습니다.</h3>";
    echo "<p>위의 오류 메시지를 확인하고 수동으로 수정해주세요.</p>";
}

$conn->close();
?>