<?php
session_start();
include 'db_config.php';

echo "<h2>음악 목록 테스트</h2>";

// 세션 정보 확인
echo "<h3>세션 정보:</h3>";
echo "로그인 여부: " . (isset($_SESSION['loggedin']) ? 'Yes' : 'No') . "<br>";
echo "사용자 ID: " . ($_SESSION['user_id'] ?? 'N/A') . "<br>";
echo "사용자명: " . ($_SESSION['username'] ?? 'N/A') . "<br>";
echo "역할: " . ($_SESSION['user_role'] ?? 'N/A') . "<br>";

// music 테이블 구조 확인
echo "<h3>music 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE music");
if ($result) {
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Default</th></tr>";
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>{$row['Field']}</td>";
        echo "<td>{$row['Type']}</td>";
        echo "<td>{$row['Null']}</td>";
        echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}

// 음악 목록 조회
echo "<h3>등록된 음악 목록:</h3>";
$sql = "SELECT id, name, category, recommended FROM music ORDER BY id DESC LIMIT 10";
$result = $conn->query($sql);

if ($result && $result->num_rows > 0) {
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>ID</th><th>Name</th><th>Category</th><th>Recommended</th></tr>";
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>{$row['id']}</td>";
        echo "<td>{$row['name']}</td>";
        echo "<td>{$row['category']}</td>";
        echo "<td>{$row['recommended']}</td>";
        echo "</tr>";
    }
    echo "</table>";
    echo "<p>총 {$result->num_rows}개의 음악이 표시되었습니다.</p>";
} else {
    echo "<p style='color: red;'>등록된 음악이 없습니다.</p>";
}

$conn->close();
?>
