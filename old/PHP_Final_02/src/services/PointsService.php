<?php

class PointsService
{
    private $db;

    public function __construct($database)
    {
        $this->db = $database;
    }

    /**
     * 사용자 포인트 잔액 조회
     */
    public function getUserPointsBalance($userId)
    {
        $stmt = $this->db->prepare("SELECT total_points FROM user_points_balance WHERE user_id = ?");
        $stmt->execute([$userId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        return $result ? $result['total_points'] : 0;
    }

    /**
     * 일일 로그인 보너스 지급 (60포인트)
     */
    public function grantDailyLoginBonus($userId)
    {
        $today = date('Y-m-d');

        // 이미 오늘 로그인 보너스를 받았는지 확인
        $stmt = $this->db->prepare("SELECT id FROM user_daily_login WHERE user_id = ? AND login_date = ?");
        $stmt->execute([$userId, $today]);

        if ($stmt->fetch()) {
            return ['success' => false, 'message' => '오늘 이미 로그인 보너스를 받았습니다.'];
        }

        try {
            $this->db->beginTransaction();

            // 설정에서 로그인 보너스 포인트 조회
            $loginPoints = $this->getConfigValue('daily_login_points');

            // 포인트 지급
            $newBalance = $this->addPoints($userId, $loginPoints, 'daily_login', '일일 로그인 보너스');

            // 로그인 기록 저장
            $stmt = $this->db->prepare("INSERT INTO user_daily_login (user_id, login_date, points_granted) VALUES (?, ?, ?)");
            $stmt->execute([$userId, $today, $loginPoints]);

            $this->db->commit();

            return [
                'success' => true,
                'points_granted' => $loginPoints,
                'new_balance' => $newBalance,
                'message' => "로그인 보너스 {$loginPoints}포인트가 지급되었습니다."
            ];

        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => '포인트 지급 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 갤러리 접근 포인트 차감 (17포인트)
     */
    public function usePointsForGalleryAccess($userId)
    {
        try {
            $this->db->beginTransaction();

            // 설정에서 갤러리 접근 비용 조회
            $galleryCost = $this->getConfigValue('gallery_access_cost');

            // 현재 포인트 잔액 확인
            $currentBalance = $this->getUserPointsBalance($userId);

            if ($currentBalance < $galleryCost) {
                $this->db->rollBack();
                return [
                    'success' => false,
                    'message' => '포인트가 부족합니다.',
                    'required_points' => $galleryCost,
                    'current_balance' => $currentBalance
                ];
            }

            // 포인트 차감
            $newBalance = $this->deductPoints($userId, $galleryCost, 'gallery_access', '갤러리 접근');

            // 갤러리 접근 기록 저장
            $stmt = $this->db->prepare("INSERT INTO user_gallery_access (user_id, points_used) VALUES (?, ?)");
            $stmt->execute([$userId, $galleryCost]);

            $this->db->commit();

            return [
                'success' => true,
                'points_used' => $galleryCost,
                'new_balance' => $newBalance,
                'message' => "갤러리 접근을 위해 {$galleryCost}포인트가 사용되었습니다."
            ];

        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => '포인트 사용 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 가입축하 보너스 지급 (500포인트)
     */
    public function grantWelcomeBonus($userId)
    {
        try {
            $this->db->beginTransaction();

            // 이미 가입축하 보너스를 받았는지 확인
            $stmt = $this->db->prepare("SELECT id FROM user_points_transactions WHERE user_id = ? AND transaction_type = 'welcome_bonus'");
            $stmt->execute([$userId]);

            if ($stmt->fetch()) {
                $this->db->rollBack();
                return ['success' => false, 'message' => '이미 가입축하 보너스를 받았습니다.'];
            }

            // 설정에서 가입축하 보너스 포인트 조회
            $welcomePoints = $this->getConfigValue('welcome_bonus_points');

            // 포인트 지급
            $newBalance = $this->addPoints($userId, $welcomePoints, 'welcome_bonus', '가입축하 보너스');

            $this->db->commit();

            return [
                'success' => true,
                'points_granted' => $welcomePoints,
                'new_balance' => $newBalance,
                'message' => "가입축하 보너스 {$welcomePoints}포인트가 지급되었습니다."
            ];

        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => '가입축하 보너스 지급 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 매일 자정 포인트 소멸
     */
    public function expireAllUserPoints()
    {
        try {
            $this->db->beginTransaction();

            // 포인트가 있는 모든 사용자 조회
            $stmt = $this->db->prepare("SELECT user_id, total_points FROM user_points_balance WHERE total_points > 0");
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $expiredCount = 0;
            $totalExpiredPoints = 0;

            foreach ($users as $user) {
                if ($user['total_points'] > 0) {
                    // 포인트 소멸 처리
                    $this->deductPoints($user['user_id'], $user['total_points'], 'daily_expire', '일일 포인트 소멸');
                    $expiredCount++;
                    $totalExpiredPoints += $user['total_points'];
                }
            }

            $this->db->commit();

            return [
                'success' => true,
                'expired_users' => $expiredCount,
                'total_expired_points' => $totalExpiredPoints,
                'message' => "{$expiredCount}명의 사용자 포인트({$totalExpiredPoints}포인트)가 소멸되었습니다."
            ];

        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => '포인트 소멸 처리 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 포인트 추가
     */
    private function addPoints($userId, $points, $transactionType, $description)
    {
        // 현재 잔액 조회
        $currentBalance = $this->getUserPointsBalance($userId);
        $newBalance = $currentBalance + $points;

        // 잔액 업데이트 또는 신규 생성
        $stmt = $this->db->prepare("INSERT INTO user_points_balance (user_id, total_points) VALUES (?, ?) ON DUPLICATE KEY UPDATE total_points = ?");
        $stmt->execute([$userId, $newBalance, $newBalance]);

        // 트랜잭션 기록
        $stmt = $this->db->prepare("INSERT INTO user_points_transactions (user_id, transaction_type, points, balance_after, description) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $transactionType, $points, $newBalance, $description]);

        return $newBalance;
    }

    /**
     * 포인트 차감
     */
    private function deductPoints($userId, $points, $transactionType, $description)
    {
        // 현재 잔액 조회
        $currentBalance = $this->getUserPointsBalance($userId);
        $newBalance = max(0, $currentBalance - $points);

        // 잔액 업데이트
        $stmt = $this->db->prepare("UPDATE user_points_balance SET total_points = ? WHERE user_id = ?");
        $stmt->execute([$newBalance, $userId]);

        // 트랜잭션 기록 (차감은 음수로 기록)
        $stmt = $this->db->prepare("INSERT INTO user_points_transactions (user_id, transaction_type, points, balance_after, description) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $transactionType, -$points, $newBalance, $description]);

        return $newBalance;
    }

    /**
     * 설정값 조회
     */
    private function getConfigValue($configKey)
    {
        $stmt = $this->db->prepare("SELECT config_value FROM points_system_config WHERE config_key = ?");
        $stmt->execute([$configKey]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        return $result ? $result['config_value'] : 0;
    }

    /**
     * 사용자 포인트 내역 조회
     */
    public function getUserPointsHistory($userId, $limit = 50)
    {
        $stmt = $this->db->prepare("
            SELECT transaction_type, points, balance_after, description, created_at
            FROM user_points_transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$userId, $limit]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}