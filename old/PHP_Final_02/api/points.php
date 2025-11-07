<?php
/**
 * 포인트 관련 API 엔드포인트
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../src/services/PointsService.php';
require_once __DIR__ . '/../src/controllers/GalleryController.php';

session_start();

try {
    // 데이터베이스 연결
    $pdo = new PDO($dsn, $username, $password, $options);
    $pointsService = new PointsService($pdo);
    $galleryController = new GalleryController($pdo);

    // 요청 메서드 확인
    $method = $_SERVER['REQUEST_METHOD'];
    $path = $_GET['action'] ?? '';

    // 사용자 인증 확인
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '로그인이 필요합니다.']);
        exit;
    }

    $userId = $_SESSION['user_id'];

    switch ($method) {
        case 'GET':
            switch ($path) {
                case 'balance':
                    // 포인트 잔액 조회
                    $balance = $pointsService->getUserPointsBalance($userId);
                    echo json_encode(['success' => true, 'balance' => $balance]);
                    break;

                case 'history':
                    // 포인트 내역 조회
                    $limit = $_GET['limit'] ?? 50;
                    $history = $pointsService->getUserPointsHistory($userId, $limit);
                    echo json_encode(['success' => true, 'history' => $history]);
                    break;

                case 'info':
                    // 포인트 전체 정보 조회
                    $result = $galleryController->getUserPointsInfo($userId);
                    echo json_encode($result);
                    break;

                default:
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => '존재하지 않는 엔드포인트입니다.']);
            }
            break;

        case 'POST':
            switch ($path) {
                case 'daily_bonus':
                    // 일일 로그인 보너스 수령
                    $result = $pointsService->grantDailyLoginBonus($userId);
                    echo json_encode($result);
                    break;

                case 'gallery_access':
                    // 갤러리 접근 포인트 사용
                    $result = $pointsService->usePointsForGalleryAccess($userId);
                    echo json_encode($result);
                    break;

                default:
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => '존재하지 않는 엔드포인트입니다.']);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => '지원하지 않는 메서드입니다.']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '서버 오류가 발생했습니다.']);
}