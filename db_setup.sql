-- 포인트 시스템을 위한 데이터베이스 테이블 생성 스크립트

-- 1. users 테이블에 신규 가입 포인트 지급 여부 컬럼 추가
ALTER TABLE users ADD COLUMN signup_points_given BOOLEAN DEFAULT FALSE AFTER role;

-- 2. 유상 충전 포인트 지갑 테이블
CREATE TABLE IF NOT EXISTS point_wallet (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_wallet (user_id),
    INDEX idx_user_id (user_id)
);

-- 3. 포인트 변동 내역 (충전/차감/소멸) 테이블
CREATE TABLE IF NOT EXISTS transactions (
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
);

-- 4. 일일 포인트 적립/사용/소멸 기록 테이블
CREATE TABLE IF NOT EXISTS user_daily_points (
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
);

-- 5. 기존 사용자들에게 신규 가입 포인트 지급 및 지갑 생성
-- 이미 가입한 사용자들에게 500P 지급
INSERT IGNORE INTO point_wallet (user_id, balance)
SELECT id, 500 FROM users;

-- 신규 가입 포인트 지급 여부를 TRUE로 설정
UPDATE users SET signup_points_given = TRUE;

-- 기존 사용자들의 신규 가입 포인트 지급 내역 기록
INSERT INTO transactions (user_id, type, amount, description)
SELECT id, 'signup_bonus', 500, '신규 가입 보너스 (기존 사용자)' FROM users;