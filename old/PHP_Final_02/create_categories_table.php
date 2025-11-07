<?php
// 카테고리 테이블 생성 스크립트
include 'db_config.php';

// categories 테이블 생성
$sql = "CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

if ($conn->query($sql) === TRUE) {
    echo "✓ categories 테이블이 성공적으로 생성되었습니다.\n";

    // 기존 music 테이블의 카테고리들을 categories 테이블로 마이그레이션
    $migrate_sql = "INSERT IGNORE INTO categories (name)
                    SELECT DISTINCT category
                    FROM music
                    WHERE category IS NOT NULL AND category != ''";

    if ($conn->query($migrate_sql) === TRUE) {
        echo "✓ 기존 카테고리 데이터가 성공적으로 마이그레이션되었습니다.\n";

        $result = $conn->query("SELECT COUNT(*) as count FROM categories");
        $row = $result->fetch_assoc();
        echo "총 {$row['count']}개의 카테고리가 등록되었습니다.\n";
    } else {
        echo "⚠ 카테고리 마이그레이션 중 오류: " . $conn->error . "\n";
    }
} else {
    echo "⚠ 테이블 생성 중 오류: " . $conn->error . "\n";
}

$conn->close();
?>
