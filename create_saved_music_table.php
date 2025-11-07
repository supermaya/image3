<?php
include 'db_config.php';

echo "<h2>Saved Music 테이블 생성</h2>";

// saved_music 테이블 생성
$sql = "CREATE TABLE IF NOT EXISTS saved_music (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    music_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_id) REFERENCES music(id) ON DELETE CASCADE,
    UNIQUE KEY unique_save (user_id, music_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

if ($conn->query($sql) === TRUE) {
    echo "<p style='color: green; font-weight: bold;'>✓ saved_music 테이블이 성공적으로 생성되었습니다!</p>";

    // 인덱스 생성
    echo "<h3>인덱스 생성:</h3>";

    $indexes = [
        "CREATE INDEX IF NOT EXISTS idx_user_id ON saved_music(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_music_id ON saved_music(music_id)",
        "CREATE INDEX IF NOT EXISTS idx_created_at ON saved_music(created_at)"
    ];

    foreach ($indexes as $index_sql) {
        if ($conn->query($index_sql) === TRUE) {
            echo "<p style='color: green;'>✓ 인덱스 생성 성공</p>";
        } else {
            echo "<p style='color: orange;'>⚠ 인덱스 생성: " . $conn->error . "</p>";
        }
    }

    // 테이블 구조 확인
    echo "<h3>Saved Music 테이블 구조:</h3>";
    $result = $conn->query("DESCRIBE saved_music");
    if ($result) {
        echo "<table border='1' cellpadding='5' style='border-collapse: collapse;'>";
        echo "<tr style='background-color: #4CAF50; color: white;'><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th></tr>";
        while ($row = $result->fetch_assoc()) {
            echo "<tr>";
            echo "<td>{$row['Field']}</td>";
            echo "<td>{$row['Type']}</td>";
            echo "<td>{$row['Null']}</td>";
            echo "<td>{$row['Key']}</td>";
            echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
            echo "</tr>";
        }
        echo "</table>";
    }

    echo "<hr>";
    echo "<h3>완료!</h3>";
    echo "<p>이제 목록 저장 기능을 사용할 수 있습니다.</p>";
    echo "<p><a href='index.html' style='display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;'>메인 페이지로 이동</a></p>";

} else {
    echo "<p style='color: red;'>⚠ 테이블 생성 실패: " . $conn->error . "</p>";
}

$conn->close();
?>

<style>
    body {
        font-family: Arial, sans-serif;
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;
    }
    table { margin: 20px 0; }
    th { padding: 10px; }
    td { padding: 8px; }
</style>
