<?php
// categories 테이블에 classification 컬럼 추가 및 기존 데이터 복원
include 'db_config.php';

echo "<h2>카테고리 테이블 업데이트</h2>";

// 1. classification 컬럼 추가
$sql_add_column = "ALTER TABLE categories ADD COLUMN classification VARCHAR(50) DEFAULT NULL";

if ($conn->query($sql_add_column) === TRUE) {
    echo "<p style='color: green;'>✓ classification 컬럼이 추가되었습니다.</p>";
} else {
    if ($conn->errno == 1060) {
        echo "<p style='color: orange;'>⊙ classification 컬럼이 이미 존재합니다.</p>";
    } else {
        echo "<p style='color: red;'>⚠ 컬럼 추가 중 오류: " . $conn->error . "</p>";
    }
}

echo "<hr>";
echo "<h3>기존 카테고리 데이터 복원</h3>";

// 2. music 테이블에서 모든 고유 카테고리 가져오기
$sql = "SELECT DISTINCT category FROM music WHERE category IS NOT NULL AND category != '' ORDER BY category ASC";
$result = $conn->query($sql);

if (!$result) {
    echo "<p style='color: red;'>⚠ 카테고리 조회 실패: " . $conn->error . "</p>";
    exit;
}

$categories = [];
while ($row = $result->fetch_assoc()) {
    $categories[] = $row['category'];
}

echo "<p>music 테이블에서 발견된 카테고리: " . count($categories) . "개</p>";
echo "<ul>";
foreach ($categories as $cat) {
    echo "<li>" . htmlspecialchars($cat) . "</li>";
}
echo "</ul>";

// 3. categories 테이블에 삽입 (중복 무시)
$inserted = 0;
$skipped = 0;

$stmt = $conn->prepare("INSERT IGNORE INTO categories (name, classification) VALUES (?, NULL)");

foreach ($categories as $category) {
    $stmt->bind_param("s", $category);
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            $inserted++;
            echo "<p style='color: green;'>✓ '{$category}' 추가됨</p>";
        } else {
            $skipped++;
            echo "<p style='color: orange;'>⊙ '{$category}' 이미 존재함 (건너뜀)</p>";
        }
    } else {
        echo "<p style='color: red;'>⚠ '{$category}' 추가 실패: " . $stmt->error . "</p>";
    }
}

$stmt->close();

echo "<hr>";
echo "<h3>복원 완료</h3>";
echo "<p>총 {$inserted}개 카테고리 추가됨</p>";
echo "<p>총 {$skipped}개 카테고리 건너뜀 (이미 존재)</p>";

// 4. 최종 확인
$result = $conn->query("SELECT name, classification FROM categories ORDER BY name ASC");
echo "<h3>현재 등록된 카테고리</h3>";
echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
echo "<tr><th>카테고리명</th><th>분류</th></tr>";

$total = 0;
while ($row = $result->fetch_assoc()) {
    $total++;
    $classification = $row['classification'] ? htmlspecialchars($row['classification']) : '<span style="color: gray;">미분류</span>';
    echo "<tr><td>" . htmlspecialchars($row['name']) . "</td><td>{$classification}</td></tr>";
}

echo "</table>";
echo "<p><strong>총 {$total}개의 카테고리가 등록되어 있습니다.</strong></p>";

$conn->close();
?>
