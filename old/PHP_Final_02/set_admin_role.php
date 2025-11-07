<?php
include 'db_config.php';

echo "<h2>관리자 역할 설정</h2>";

// admin@metamotion.io 사용자의 role을 admin으로 설정
$email = 'admin@metamotion.io';

$stmt = $conn->prepare("UPDATE users SET role = 'admin' WHERE email = ?");
$stmt->bind_param("s", $email);

if ($stmt->execute()) {
    echo "<p style='color: green; font-size: 18px; font-weight: bold;'>✓ {$email} 계정의 역할이 'admin'으로 설정되었습니다!</p>";

    // 확인
    $check_stmt = $conn->prepare("SELECT id, email, name, role FROM users WHERE email = ?");
    $check_stmt->bind_param("s", $email);
    $check_stmt->execute();
    $result = $check_stmt->get_result();

    if ($result->num_rows > 0) {
        $user = $result->fetch_assoc();
        echo "<h3>업데이트된 사용자 정보:</h3>";
        echo "<table border='1' cellpadding='10' style='border-collapse: collapse;'>";
        echo "<tr><th>ID</th><th>Email</th><th>Name</th><th>Role</th></tr>";
        echo "<tr>";
        echo "<td>{$user['id']}</td>";
        echo "<td>{$user['email']}</td>";
        echo "<td>" . ($user['name'] ?? 'NULL') . "</td>";
        echo "<td style='background-color: #ffcccc; font-weight: bold;'>{$user['role']}</td>";
        echo "</tr>";
        echo "</table>";
    }
    $check_stmt->close();

    echo "<hr>";
    echo "<h3>다음 단계:</h3>";
    echo "<ol>";
    echo "<li><strong>로그아웃</strong> 버튼을 클릭하세요</li>";
    echo "<li>다시 <strong>admin@metamotion.io</strong> 계정으로 로그인하세요</li>";
    echo "<li><strong>관리자 페이지</strong> 버튼을 클릭하여 admin.html로 이동하세요</li>";
    echo "</ol>";
    echo "<p><a href='index.html' style='display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;'>메인 페이지로 이동</a></p>";

} else {
    echo "<p style='color: red;'>⚠ 역할 설정 실패: " . $stmt->error . "</p>";
}

$stmt->close();
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
    th {
        background-color: #4CAF50;
        color: white;
        padding: 10px;
    }
</style>
