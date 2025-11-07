<?php

require_once __DIR__ . '/../services/PointsService.php';

class GalleryController
{
    private $db;
    private $pointsService;

    public function __construct($database)
    {
        $this->db = $database;
        $this->pointsService = new PointsService($database);
    }

    /**
     * 갤러리 접근 처리
     */
    public function accessGallery($userId)
    {
        try {
            // 포인트 사용 처리 (17포인트)
            $result = $this->pointsService->usePointsForGalleryAccess($userId);

            if (!$result['success']) {
                return [
                    'success' => false,
                    'message' => $result['message'],
                    'required_points' => $result['required_points'] ?? null,
                    'current_balance' => $result['current_balance'] ?? null
                ];
            }

            // 갤러리 접근 성공
            return [
                'success' => true,
                'message' => $result['message'],
                'points_used' => $result['points_used'],
                'remaining_balance' => $result['new_balance'],
                'gallery_access_granted' => true
            ];

        } catch (Exception $e) {
            return ['success' => false, 'message' => '갤러리 접근 처리 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 갤러리 목록 조회 (포인트 차감 후)
     */
    public function getGalleryList($userId, $page = 1, $limit = 20)
    {
        try {
            // 먼저 갤러리 접근 권한 확인 및 포인트 차감
            $accessResult = $this->accessGallery($userId);

            if (!$accessResult['success']) {
                return $accessResult;
            }

            // 갤러리 목록 조회 로직
            $offset = ($page - 1) * $limit;
            $stmt = $this->db->prepare("
                SELECT id, title, image_url, created_at
                FROM gallery_images
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            ");
            $stmt->execute([$limit, $offset]);
            $images = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // 전체 개수 조회
            $stmt = $this->db->prepare("SELECT COUNT(*) as total FROM gallery_images");
            $stmt->execute();
            $total = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            return [
                'success' => true,
                'images' => $images,
                'pagination' => [
                    'current_page' => $page,
                    'total_pages' => ceil($total / $limit),
                    'total_images' => $total,
                    'per_page' => $limit
                ],
                'points_info' => [
                    'points_used' => $accessResult['points_used'],
                    'remaining_balance' => $accessResult['remaining_balance']
                ]
            ];

        } catch (Exception $e) {
            return ['success' => false, 'message' => '갤러리 목록 조회 중 오류가 발생했습니다.'];
        }
    }

    /**
     * 사용자 포인트 정보 조회
     */
    public function getUserPointsInfo($userId)
    {
        try {
            $currentBalance = $this->pointsService->getUserPointsBalance($userId);
            $history = $this->pointsService->getUserPointsHistory($userId, 10);

            // 오늘 로그인 보너스 수령 여부 확인
            $today = date('Y-m-d');
            $stmt = $this->db->prepare("SELECT id FROM user_daily_login WHERE user_id = ? AND login_date = ?");
            $stmt->execute([$userId, $today]);
            $dailyBonusClaimed = $stmt->fetch() ? true : false;

            return [
                'success' => true,
                'current_balance' => $currentBalance,
                'daily_bonus_claimed' => $dailyBonusClaimed,
                'recent_history' => $history
            ];

        } catch (Exception $e) {
            return ['success' => false, 'message' => '포인트 정보 조회 중 오류가 발생했습니다.'];
        }
    }
}