<?php
session_start();
include 'db_config.php';

echo "<h2>Users 테이블 진단</h2>";

// 현재 세션 정보
echo "<h3>현재 세션:</h3>";
echo "<pre>";
print_r($_SESSION);
echo "</pre>";

// 테이블 구조 확인
echo "<h3>Users 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE users");
if ($result) {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
    echo "<tr style='background-color: #4CAF50; color: white;'><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th></tr>";
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td><strong>{$row['Field']}</strong></td>";
        echo "<td>{$row['Type']}</td>";
        echo "<td>{$row['Null']}</td>";
        echo "<td>{$row['Key']}</td>";
        echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
        echo "<td>" . ($row['Extra'] ?? '') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}

// 간단한 쿼리로 사용자 수 확인
echo "<h3>테이블 데이터 확인:</h3>";
$count_result = $conn->query("SELECT COUNT(*) as total FROM users");
if ($count_result) {
    $count = $count_result->fetch_assoc()['total'];
    echo "<p>총 사용자 수: <strong>{$count}</strong></p>";
}

// 모든 컬럼 조회 시도
echo "<h3>모든 사용자 데이터:</h3>";
$all_result = $conn->query("SELECT * FROM users ORDER BY id LIMIT 10");
if ($all_result === false) {
    echo "<p style='color: red;'>SQL 에러: " . $conn->error . "</p>";
} else {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";

    // 첫 번째 행으로 컬럼명 가져오기
    if ($all_result->num_rows > 0) {
        $first_row = $all_result->fetch_assoc();

        // 헤더
        echo "<tr style='background-color: #4CAF50; color: white;'>";
        foreach ($first_row as $key => $value) {
            echo "<th>{$key}</th>";
        }
        echo "</tr>";

        // 첫 번째 행 출력
        echo "<tr>";
        foreach ($first_row as $key => $value) {
            $display_value = ($key == 'password') ? '***' : ($value ?? 'NULL');
            echo "<td>{$display_value}</td>";
        }
        echo "</tr>";

        // 나머지 행들
        while ($row = $all_result->fetch_assoc()) {
            echo "<tr>";
            foreach ($row as $key => $value) {
                $display_value = ($key == 'password') ? '***' : ($value ?? 'NULL');
                echo "<td>{$display_value}</td>";
            }
            echo "</tr>";
        }
    } else {
        echo "<tr><td colspan='100%'>데이터가 없습니다.</td></tr>";
    }
    echo "</table>";
}

// 현재 로그인한 사용자 정보 확인
if (isset($_SESSION['user_id'])) {
    echo "<h3>현재 로그인한 사용자 상세 정보:</h3>";
    $user_id = $_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $user = $result->fetch_assoc();
        echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
        foreach ($user as $key => $value) {
            $display_value = ($key == 'password') ? '***' : ($value ?? 'NULL');
            echo "<tr>";
            echo "<td><strong>{$key}</strong></td>";
            echo "<td>{$display_value}</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "<p style='color: red;'>사용자를 찾을 수 없습니다!</p>";
    }
    $stmt->close();
}

$conn->close();
?>

<style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { margin: 10px 0; }
    th, td { padding: 8px; text-align: left; }
</style>
