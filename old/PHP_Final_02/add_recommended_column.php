<?php
// music 테이블에 recommended 컬럼 추가
include 'db_config.php';

echo "<h2>추천 갤러리 기능 추가</h2>";

// recommended 컬럼 추가
$sql = "ALTER TABLE music ADD COLUMN recommended TINYINT(1) DEFAULT 0";

if ($conn->query($sql) === TRUE) {
    echo "<p style='color: green;'>✓ recommended 컬럼이 성공적으로 추가되었습니다.</p>";
} else {
    if ($conn->errno == 1060) {
        echo "<p style='color: orange;'>⊙ recommended 컬럼이 이미 존재합니다.</p>";
    } else {
        echo "<p style='color: red;'>⚠ 컬럼 추가 실패: " . $conn->error . "</p>";
    }
}

// 테이블 구조 확인
echo "<h3>현재 music 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE music");
if ($result) {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th></tr>";
    while ($row = $result->fetch_assoc()) {
        $rowColor = ($row['Field'] == 'recommended') ? 'background-color: #e6ffe6;' : '';
        echo "<tr style='{$rowColor}'>";
        echo "<td>{$row['Field']}</td>";
        echo "<td>{$row['Type']}</td>";
        echo "<td>{$row['Null']}</td>";
        echo "<td>{$row['Key']}</td>";
        echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}

$conn->close();
?>
