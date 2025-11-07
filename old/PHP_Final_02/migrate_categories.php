<?php
// 기존 music 테이블의 카테고리를 categories 테이블로 마이그레이션
include 'db_config.php';

echo "<h2>카테고리 마이그레이션 시작</h2>";

// 기존 music 테이블의 모든 고유 카테고리 가져오기
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

echo "<p>발견된 카테고리: " . count($categories) . "개</p>";
echo "<ul>";
foreach ($categories as $cat) {
    echo "<li>" . htmlspecialchars($cat) . "</li>";
}
echo "</ul>";

// categories 테이블에 삽입
$inserted = 0;
$skipped = 0;

$stmt = $conn->prepare("INSERT IGNORE INTO categories (name) VALUES (?)");

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
echo "<h3>마이그레이션 완료</h3>";
echo "<p>총 {$inserted}개 카테고리 추가됨</p>";
echo "<p>총 {$skipped}개 카테고리 건너뜀 (중복)</p>";

// 최종 확인
$result = $conn->query("SELECT COUNT(*) as count FROM categories");
$row = $result->fetch_assoc();
echo "<p><strong>현재 categories 테이블에 등록된 카테고리: {$row['count']}개</strong></p>";

$conn->close();
?>
