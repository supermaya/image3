-- 포인트 시스템 테이블 구조
-- 요구사항:
-- 1. 로그인시 매일 60포인트 지급
-- 2. 갤러리 진입시 17포인트 사용
-- 3. 남은 포인트는 매일 자정에 소멸
-- 4. 최초 가입자는 500포인트 가입축하 포인트 지급

-- 사용자별 포인트 잔액 테이블
DROP TABLE IF EXISTS `user_points_balance`;
CREATE TABLE `user_points_balance` (
  `user_id` int NOT NULL,
  `total_points` int NOT NULL DEFAULT '0',
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_points_balance_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 포인트 트랜잭션 내역 테이블
DROP TABLE IF EXISTS `user_points_transactions`;
CREATE TABLE `user_points_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `transaction_type` enum('daily_login','gallery_access','welcome_bonus','daily_expire') NOT NULL,
  `points` int NOT NULL,
  `balance_after` int NOT NULL,
  `description` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_transaction_type` (`transaction_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  CONSTRAINT `user_points_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 일일 로그인 보너스 수령 기록 테이블
DROP TABLE IF EXISTS `user_daily_login`;
CREATE TABLE `user_daily_login` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `login_date` date NOT NULL,
  `points_granted` int NOT NULL DEFAULT '60',
  `granted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_login_date` (`user_id`, `login_date`),
  KEY `idx_login_date` (`login_date`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `user_daily_login_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 갤러리 접근 기록 테이블
DROP TABLE IF EXISTS `user_gallery_access`;
CREATE TABLE `user_gallery_access` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `points_used` int NOT NULL DEFAULT '17',
  `accessed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_accessed_at` (`accessed_at`),
  CONSTRAINT `user_gallery_access_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 포인트 시스템 설정 테이블
DROP TABLE IF EXISTS `points_system_config`;
CREATE TABLE `points_system_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `config_key` varchar(50) NOT NULL,
  `config_value` int NOT NULL,
  `description` varchar(100) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 포인트 시스템 기본 설정값
INSERT INTO `points_system_config` (`config_key`, `config_value`, `description`) VALUES
('daily_login_points', 60, '일일 로그인 보너스 포인트'),
('gallery_access_cost', 17, '갤러리 접근 비용 포인트'),
('welcome_bonus_points', 500, '가입축하 보너스 포인트');

-- 일일 포인트 요약 뷰
CREATE OR REPLACE VIEW `user_daily_points_summary` AS
SELECT
    DATE(CURRENT_DATE) as summary_date,
    u.id as user_id,
    COALESCE(pb.total_points, 0) as current_balance,
    COALESCE(dl.points_granted, 0) as daily_login_points,
    IF(dl.id IS NOT NULL, 1, 0) as daily_login_claimed,
    COALESCE(ga_summary.total_gallery_access, 0) as daily_gallery_access_count,
    COALESCE(ga_summary.total_points_used, 0) as daily_points_used
FROM `users` u
LEFT JOIN `user_points_balance` pb ON u.id = pb.user_id
LEFT JOIN `user_daily_login` dl ON u.id = dl.user_id AND dl.login_date = CURRENT_DATE
LEFT JOIN (
    SELECT
        user_id,
        COUNT(*) as total_gallery_access,
        SUM(points_used) as total_points_used
    FROM `user_gallery_access`
    WHERE DATE(accessed_at) = CURRENT_DATE
    GROUP BY user_id
) ga_summary ON u.id = ga_summary.user_id;