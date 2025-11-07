<?php
// 카테고리 테이블 데이터 확인
include 'db_config.php';

echo "<h2>카테고리 테이블 데이터 확인</h2>";

// categories 테이블 데이터 조회
$result = $conn->query("SELECT name, classification FROM categories ORDER BY name ASC");

if ($result) {
    echo "<table border='1' cellpadding='10' style='border-collapse: collapse; width: 100%; max-width: 800px;'>";
    echo "<tr style='background-color: #f0f0f0;'>";
    echo "<th>카테고리명</th>";
    echo "<th>분류 (classification)</th>";
    echo "<th>상태</th>";
    echo "</tr>";

    $total = 0;
    $withClassification = 0;
    $withoutClassification = 0;

    while ($row = $result->fetch_assoc()) {
        $total++;
        $classification = $row['classification'];
        $status = '';
        $rowColor = '';

        if (empty($classification)) {
            $classificationDisplay = '<span style="color: red; font-weight: bold;">미분류 (NULL)</span>';
            $status = '⚠ 분류 필요';
            $rowColor = 'background-color: #ffe6e6;';
            $withoutClassification++;
        } else {
            $colors = [
                '인물' => '#3B82F6',
                '패션' => '#EC4899',
                '화보' => '#10B981',
                '시네마틱' => '#8B5CF6'
            ];
            $color = $colors[$classification] ?? '#6B7280';
            $classificationDisplay = "<span style='color: {$color}; font-weight: bold;'>{$classification}</span>";
            $status = '✓ 정상';
            $rowColor = 'background-color: #e6ffe6;';
            $withClassification++;
        }

        echo "<tr style='{$rowColor}'>";
        echo "<td>" . htmlspecialchars($row['name']) . "</td>";
        echo "<td style='text-align: center;'>{$classificationDisplay}</td>";
        echo "<td style='text-align: center;'>{$status}</td>";
        echo "</tr>";
    }

    echo "</table>";

    echo "<hr>";
    echo "<h3>통계</h3>";
    echo "<ul>";
    echo "<li>전체 카테고리: <strong>{$total}개</strong></li>";
    echo "<li>분류 지정됨: <strong style='color: green;'>{$withClassification}개</strong></li>";
    echo "<li>미분류: <strong style='color: red;'>{$withoutClassification}개</strong></li>";
    echo "</ul>";

    if ($withoutClassification > 0) {
        echo "<p style='color: red; font-weight: bold;'>⚠ 미분류 카테고리가 있습니다. admin_categories.html 페이지에서 각 카테고리의 분류를 지정해주세요.</p>";
    } else {
        echo "<p style='color: green; font-weight: bold;'>✓ 모든 카테고리에 분류가 지정되었습니다!</p>";
    }
} else {
    echo "<p style='color: red;'>⚠ 카테고리 조회 실패: " . $conn->error . "</p>";
}

$conn->close();
?>
