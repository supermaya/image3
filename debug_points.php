<?php
session_start();

// 디버깅을 위해 에러 출력 활성화
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

include 'db_config.php';

// 현재 세션 상태 확인
echo json_encode([
    'session_status' => [
        'loggedin' => $_SESSION['loggedin'] ?? false,
        'user_id' => $_SESSION['user_id'] ?? null,
        'username' => $_SESSION['username'] ?? null,
        'user_role' => $_SESSION['user_role'] ?? null
    ],
    'database_connection' => [
        'connected' => !$conn->connect_error,
        'error' => $conn->connect_error ?? null
    ],
    'tables_check' => [
        'users' => checkTable($conn, 'users'),
        'user_daily_points' => checkTable($conn, 'user_daily_points'),
        'point_wallet' => checkTable($conn, 'point_wallet'),
        'transactions' => checkTable($conn, 'transactions')
    ]
], JSON_PRETTY_PRINT);

function checkTable($conn, $tableName) {
    $result = $conn->query("SHOW TABLES LIKE '$tableName'");
    return [
        'exists' => $result->num_rows > 0,
        'count' => $result->num_rows > 0 ? getTableCount($conn, $tableName) : 0
    ];
}

function getTableCount($conn, $tableName) {
    $result = $conn->query("SELECT COUNT(*) as count FROM $tableName");
    return $result ? $result->fetch_assoc()['count'] : 0;
}

$conn->close();
?>