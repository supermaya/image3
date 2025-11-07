<?php
session_start();
include 'db_config.php';

echo "<h2>관리자 역할 수정</h2>";

// 현재 세션 정보 확인
echo "<h3>현재 세션 정보:</h3>";
echo "로그인 여부: " . (isset($_SESSION['loggedin']) ? 'Yes' : 'No') . "<br>";
echo "사용자 ID: " . ($_SESSION['user_id'] ?? 'N/A') . "<br>";
echo "사용자명: " . ($_SESSION['username'] ?? 'N/A') . "<br>";
echo "세션 역할: " . ($_SESSION['user_role'] ?? 'N/A') . "<br>";

// users 테이블 구조 확인
echo "<h3>users 테이블 구조:</h3>";
$result = $conn->query("DESCRIBE users");
if ($result) {
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Default</th></tr>";
    while ($row = $result->fetch_assoc()) {
        $highlight = ($row['Field'] == 'role') ? 'background-color: #ffffcc;' : '';
        echo "<tr style='{$highlight}'>";
        echo "<td>{$row['Field']}</td>";
        echo "<td>{$row['Type']}</td>";
        echo "<td>{$row['Null']}</td>";
        echo "<td>" . ($row['Default'] ?? 'NULL') . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}

// 모든 사용자 목록 및 역할 확인
echo "<h3>등록된 사용자 목록:</h3>";
$sql = "SELECT id, name, email, role FROM users ORDER BY id";
$result = $conn->query($sql);
if ($result === false) {
    echo "<p style='color: red;'>SQL 에러: " . $conn->error . "</p>";
    echo "<p>실행한 SQL: " . $sql . "</p>";
} elseif ($result->num_rows > 0) {
    echo "<table border='1' cellpadding='5'>";
    echo "<tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr>";
    while ($row = $result->fetch_assoc()) {
        $roleColor = '';
        if ($row['role'] == 'admin') $roleColor = 'background-color: #ffcccc;';
        elseif ($row['role'] == 'creator') $roleColor = 'background-color: #ccffcc;';

        echo "<tr style='{$roleColor}'>";
        echo "<td>{$row['id']}</td>";
        echo "<td>" . ($row['name'] ?? '(empty)') . "</td>";
        echo "<td>{$row['email']}</td>";
        echo "<td>" . ($row['role'] ?? '(empty)') . "</td>";
        echo "<td>";
        echo "<form method='POST' style='display:inline;'>";
        echo "<input type='hidden' name='user_id' value='{$row['id']}'>";
        echo "<select name='new_role'>";
        echo "<option value='user' " . ($row['role'] == 'user' ? 'selected' : '') . ">user</option>";
        echo "<option value='creator' " . ($row['role'] == 'creator' ? 'selected' : '') . ">creator</option>";
        echo "<option value='admin' " . ($row['role'] == 'admin' ? 'selected' : '') . ">admin</option>";
        echo "</select>";
        echo " <button type='submit' name='update_role'>변경</button>";
        echo "</form>";
        echo "</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<p style='color: red;'>등록된 사용자가 없습니다.</p>";
}

// 역할 업데이트 처리
if (isset($_POST['update_role'])) {
    $user_id = intval($_POST['user_id']);
    $new_role = $_POST['new_role'];

    $stmt = $conn->prepare("UPDATE users SET role = ? WHERE id = ?");
    $stmt->bind_param("si", $new_role, $user_id);

    if ($stmt->execute()) {
        echo "<p style='color: green; font-weight: bold;'>✓ 사용자 ID {$user_id}의 역할이 '{$new_role}'로 변경되었습니다.</p>";
        echo "<p><a href='fix_admin_role.php'>새로고침</a></p>";

        // 현재 로그인한 사용자의 역할을 변경한 경우 세션도 업데이트
        if (isset($_SESSION['user_id']) && $_SESSION['user_id'] == $user_id) {
            $_SESSION['user_role'] = $new_role;
            echo "<p style='color: blue;'>세션 역할도 업데이트되었습니다. 페이지를 새로고침하세요.</p>";
        }
    } else {
        echo "<p style='color: red;'>⚠ 역할 변경 실패: " . $stmt->error . "</p>";
    }
    $stmt->close();
}

$conn->close();
?>

<style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { border-collapse: collapse; margin: 10px 0; }
    th { background-color: #4CAF50; color: white; padding: 8px; }
    td { padding: 8px; }
    form { margin: 0; }
</style>
