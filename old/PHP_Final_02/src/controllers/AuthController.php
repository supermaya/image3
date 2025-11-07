<?php

require_once __DIR__ . '/../services/PointsService.php';

class AuthController
{
    private $db;
    private $pointsService;

    public function __construct($database)
    {
        $this->db = $database;
        $this->pointsService = new PointsService($database);
    }

    /**
     * 사용자 로그인 처리
     */
    public function login($email, $password)
    {
        try {
            // 사용자 인증 로직 (기존 로직 유지)
            $stmt = $this->db->prepare("SELECT id, email, password FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || !password_verify($password, $user['password'])) {
                return ['success' => false, 'message' => '이메일 또는 비밀번호가 올바르지 않습니다.'];
            }

            // 세션 설정
            session_start();
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_email'] = $user['email'];

            // 일일 로그인 보너스 지급 시도
            $bonusResult = $this->pointsService->grantDailyLoginBonus($user['id']);

            // 현재 포인트 잔액 조회
            $currentBalance = $this->pointsService->getUserPointsBalance($user['id']);

            return [
                'success' => true,
                'message' => '로그인되었습니다.',
                'user_id' => $user['id'],
                'current_balance' => $currentBalance,
                'bonus_result' => $bonusResult
            ];

        } catch (Exception $e) {
            return ['success' => false, 'message' => '로그인 처리 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 사용자 회원가입 처리
     */
    public function register($email, $password, $name = null)
    {
        try {
            $this->db->beginTransaction();

            // 이메일 중복 확인
            $stmt = $this->db->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);

            if ($stmt->fetch()) {
                $this->db->rollBack();
                return ['success' => false, 'message' => '이미 사용 중인 이메일입니다.'];
            }

            // 사용자 생성
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $this->db->prepare("INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, NOW())");
            $stmt->execute([$email, $hashedPassword, $name]);

            $userId = $this->db->lastInsertId();

            // 가입축하 보너스 지급
            $welcomeBonusResult = $this->pointsService->grantWelcomeBonus($userId);

            $this->db->commit();

            return [
                'success' => true,
                'message' => '회원가입이 완료되었습니다.',
                'user_id' => $userId,
                'welcome_bonus' => $welcomeBonusResult
            ];

        } catch (Exception $e) {
            $this->db->rollBack();
            return ['success' => false, 'message' => '회원가입 처리 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 로그아웃 처리
     */
    public function logout()
    {
        session_start();
        session_destroy();
        return ['success' => true, 'message' => '로그아웃되었습니다.'];
    }
}