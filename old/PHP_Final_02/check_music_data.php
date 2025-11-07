<?php
include 'db_config.php';

echo "<h2>Music 테이블 데이터 확인</h2>";

// music 테이블 구조 확인
echo "<h3>Music 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE music");
if ($result) {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
    echo "<tr style='background-color: #4CAF50; color: white;'><th>Field</th><th>Type</th><th>Null</th><th>Default</th></tr>";
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

// music 데이터 개수 확인
echo "<h3>Music 데이터 개수:</h3>";
$count_result = $conn->query("SELECT COUNT(*) as total FROM music");
if ($count_result) {
    $count = $count_result->fetch_assoc()['total'];
    echo "<p style='font-size: 20px;'>총 음악 수: <strong style='color: " . ($count > 0 ? 'green' : 'red') . ";'>{$count}</strong></p>";
}

// music 데이터 샘플 조회
echo "<h3>Music 데이터 샘플 (최근 20개):</h3>";
$sql = "SELECT id, name, category, recommended, uploaderId, audioSrc FROM music ORDER BY id DESC LIMIT 20";
$result = $conn->query($sql);

if ($result && $result->num_rows > 0) {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
    echo "<tr style='background-color: #4CAF50; color: white;'>";
    echo "<th>ID</th><th>Name</th><th>Category</th><th>Recommended</th><th>Uploader ID</th><th>Audio Src</th>";
    echo "</tr>";

    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>{$row['id']}</td>";
        echo "<td>" . htmlspecialchars($row['name']) . "</td>";
        echo "<td>" . ($row['category'] ?? 'NULL') . "</td>";
        echo "<td>" . ($row['recommended'] ?? '0') . "</td>";
        echo "<td>" . ($row['uploaderId'] ?? 'NULL') . "</td>";
        echo "<td>" . (strlen($row['audioSrc'] ?? '') > 50 ? substr($row['audioSrc'], 0, 50) . '...' : ($row['audioSrc'] ?? 'NULL')) . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<p style='color: red; font-size: 18px; font-weight: bold;'>⚠ music 테이블에 데이터가 없습니다!</p>";
    echo "<p>음악을 업로드해야 관리자 페이지에서 목록이 표시됩니다.</p>";
}

// categories 테이블 확인
echo "<h3>Categories 테이블 데이터:</h3>";
$cat_result = $conn->query("SELECT * FROM categories ORDER BY name");
if ($cat_result && $cat_result->num_rows > 0) {
    echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
    echo "<tr style='background-color: #4CAF50; color: white;'><th>Name</th><th>Classification</th></tr>";
    while ($row = $cat_result->fetch_assoc()) {
        echo "<tr>";
        echo "<td>{$row['name']}</td>";
        echo "<td>" . ($row['classification'] ?? 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<p style='color: orange;'>categories 테이블에 데이터가 없습니다.</p>";
}

// images 테이블 확인
echo "<h3>Images 테이블 데이터 개수:</h3>";
$img_count = $conn->query("SELECT COUNT(*) as total FROM images");
if ($img_count) {
    $img_total = $img_count->fetch_assoc()['total'];
    echo "<p>총 이미지 수: <strong>{$img_total}</strong></p>";
}

$conn->close();
?>

<style>
    body {
        font-family: Arial, sans-serif;
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
    }
    table { margin: 20px 0; }
    th { padding: 10px; }
    td { padding: 8px; }
</style>
