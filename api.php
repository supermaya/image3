<?php
// 디버깅을 위해 일시적으로 에러 출력 활성화
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

// 모든 PHP 파일의 맨 위에 세션을 시작합니다.
session_start();

header('Content-Type: application/json');

// 전역 에러 핸들러 설정
set_error_handler(function($severity, $message, $file, $line) {
    error_log("PHP Error: [$severity] $message in $file on line $line");
    if ($severity === E_ERROR || $severity === E_PARSE || $severity === E_CORE_ERROR || $severity === E_COMPILE_ERROR) {
        echo json_encode(["success" => false, "message" => "서버 내부 오류가 발생했습니다."]);
        exit;
    }
});

include 'db_config.php'; // 데이터베이스 연결 설정 파일을 포함합니다.

// 깨진 서러게이트 제거 함수
function removeBrokenSurrogates($data) {
    if (is_string($data)) {
        // 더 안전한 방식으로 깨진 서러게이트 제거
        // mb_convert_encoding을 사용하여 유효하지 않은 UTF-8 문자 제거
        $data = mb_convert_encoding($data, 'UTF-8', 'UTF-8');

        // 제어 문자 제거 (NULL, 백스페이스 등 JSON에서 문제가 될 수 있는 문자들)
        $data = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $data);

        return $data;
    } elseif (is_array($data)) {
        return array_map('removeBrokenSurrogates', $data);
    } elseif (is_object($data)) {
        $cleanData = new stdClass();
        foreach ($data as $key => $value) {
            $cleanData->{removeBrokenSurrogates($key)} = removeBrokenSurrogates($value);
        }
        return $cleanData;
    }
    return $data;
}

// JSON 인코딩 전에 깨진 서러게이트를 제거하는 함수
function safeJsonEncode($data, $options = 0, $depth = 512) {
    // JSON_UNESCAPED_UNICODE와 함께 사용하여 더 안전하게 처리
    $options = $options | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR;
    $cleanData = removeBrokenSurrogates($data);
    $json = json_encode($cleanData, $options, $depth);

    // JSON 인코딩이 실패했을 경우 에러 처리
    if ($json === false) {
        error_log('JSON encoding error: ' . json_last_error_msg());
        // 기본적인 에러 응답 반환
        return json_encode(['success' => false, 'message' => 'JSON encoding error']);
    }

    return $json;
}

// 데이터베이스 연결 오류를 확인하고 즉시 종료
if ($conn->connect_error) {
    echo safeJsonEncode(["success" => false, "message" => "데이터베이스 연결 실패: " . $conn->connect_error]);
    exit();
}

// 클라이언트로부터 전송된 JSON 데이터를 디코딩합니다. (FormData가 아닌 JSON 요청의 경우)
try {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? ''; // JSON 요청에서 액션을 가져옵니다.

    // 파일 업로드 요청의 경우 FormData를 사용하므로 $_POST에서 action을 가져옵니다.
    if (empty($action) && isset($_POST['action'])) {
        $action = $_POST['action'];
    }

    // 데이터베이스 연결 확인
    if (!$conn || $conn->connect_error) {
        throw new Exception("데이터베이스 연결 오류: " . ($conn->connect_error ?? "알 수 없는 오류"));
    }

switch ($action) {
    case 'signup':
        // 사용자 회원가입 처리
        $email = $conn->real_escape_string($input['email']);
        $password = $input['password'];
        $role = $conn->real_escape_string($input['role']); // user 또는 creator

        if (empty($email) || empty($password)) {
            echo safeJsonEncode(["success" => false, "message" => "이메일과 비밀번호를 입력해주세요."]);
            break;
        }

        // 비밀번호를 안전하게 해싱합니다.
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);

        // 사용자 정보를 데이터베이스에 삽입합니다.
        // users 테이블에 role 컬럼이 추가되어야 합니다.
        $stmt = $conn->prepare("INSERT INTO users (email, password, role) VALUES (?, ?, ?)");

        if (!$stmt) {
            echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
            break;
        }

        $stmt->bind_param("sss", $email, $hashed_password, $role);

        if ($stmt->execute()) {
            $newUserId = $conn->insert_id; // 새로 생성된 user의 ID 저장

            // 신규 가입 포인트 지급 (500P)
            $conn->begin_transaction();
            try {
                // 포인트 지갑 생성 (신규 가입 보너스 500P만 지급, 일일 포인트는 별도 관리)
                $stmt_wallet = $conn->prepare("INSERT INTO point_wallet (user_id, balance) VALUES (?, 500)");
                $stmt_wallet->bind_param("i", $newUserId);
                $stmt_wallet->execute();
                $stmt_wallet->close();

                // 신규 가입 포인트 지급 내역 기록
                $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'signup_bonus', 500, '신규 가입 보너스')");
                $stmt_trans->bind_param("i", $newUserId);
                $stmt_trans->execute();
                $stmt_trans->close();

                // 신규 가입 포인트 지급 여부 업데이트
                $stmt_update = $conn->prepare("UPDATE users SET signup_points_given = TRUE WHERE id = ?");
                $stmt_update->bind_param("i", $newUserId);
                $stmt_update->execute();
                $stmt_update->close();

                // 신규 가입자도 가입 당일에 즉시 데일리 60P 지급
                $today = date('Y-m-d');
                $stmt_daily = $conn->prepare("INSERT INTO user_daily_points (user_id, date, daily_bonus_claimed, daily_points_earned) VALUES (?, ?, TRUE, 60)");
                $stmt_daily->bind_param("is", $newUserId, $today);
                $stmt_daily->execute();
                $stmt_daily->close();

                // 데일리 보너스 트랜잭션 기록 추가
                $stmt_daily_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'daily_bonus', 60, '신규 가입 시 데일리 로그인 보너스')");
                $stmt_daily_trans->bind_param("i", $newUserId);
                $stmt_daily_trans->execute();
                $stmt_daily_trans->close();

                $conn->commit();

                // 회원가입 성공 후 바로 로그인 세션 설정
                $_SESSION['loggedin'] = true;
                $_SESSION['user_id'] = $newUserId;
                $_SESSION['username'] = $email; // 이메일을 username으로 사용
                $_SESSION['user_role'] = $role;
                echo safeJsonEncode(["success" => true, "message" => "회원가입 성공! 신규 가입 보너스 500P + 데일리 60P가 지급되었습니다.", "username" => $email, "userRole" => $role]);
            } catch (mysqli_sql_exception $e) {
                $conn->rollback();
                echo safeJsonEncode(["success" => false, "message" => "회원가입 실패: " . $e->getMessage()]);
            }
        } else {
            echo safeJsonEncode(["success" => false, "message" => "회원가입 실패: " . $stmt->error]);
        }
        $stmt->close();
        break;

    case 'login':
        error_log("=== LOGIN PROCESS STARTED ===");

        // 사용자 로그인 처리
        $email = $conn->real_escape_string($input['email']);
        $password = $conn->real_escape_string($input['password']);
        error_log("DEBUG: Login attempt for email: " . $email);

        if (empty($email) || empty($password)) {
            error_log("DEBUG: Empty email or password");
            echo safeJsonEncode(["success" => false, "message" => "이메일과 비밀번호를 입력해주세요."]);
            break;
        }

        // 데이터베이스에서 사용자 정보를 조회합니다.
        // role 컬럼도 함께 조회합니다.
        error_log("DEBUG: Preparing user query");
        $stmt = $conn->prepare("SELECT id, email, password, role FROM users WHERE email = ?");

        if (!$stmt) {
            error_log("ERROR: User query prepare failed: " . $conn->error);
            echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
            break;
        }

        $stmt->bind_param("s", $email);
        $stmt->execute();
        $result = $stmt->get_result();
        error_log("DEBUG: User query executed, rows found: " . $result->num_rows);

        if ($result->num_rows > 0) {
            $user = $result->fetch_assoc();
            error_log("DEBUG: User found with ID: " . $user['id']);

            // 저장된 해시 비밀번호와 입력된 비밀번호를 비교합니다.
            if (password_verify($password, $user['password'])) {
                error_log("DEBUG: Password verification successful");

                // 마스터 계정 확인
                $userRole = $user['role'];
                if ($email === 'admin@metamotion.io') {
                    $userRole = 'admin';
                    // 데이터베이스에도 업데이트
                    $stmt_update_role = $conn->prepare("UPDATE users SET role = 'admin' WHERE id = ?");
                    $stmt_update_role->bind_param("i", $user['id']);
                    $stmt_update_role->execute();
                    $stmt_update_role->close();
                    error_log("DEBUG: Master account detected - role set to admin");
                }

                $_SESSION['loggedin'] = true;
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['email'];
                $_SESSION['user_role'] = $userRole;
                error_log("DEBUG: Session variables set");

                // 로그인 성공 시 자동으로 데일리 60P 지급
                $today = date('Y-m-d');
                $dailyBonusMessage = "";
                error_log("DEBUG: Starting daily bonus check for date: " . $today);

                // 오늘 이미 보너스를 받았는지 확인
                error_log("DEBUG: Checking if bonus already claimed");
                $stmt_check = $conn->prepare("SELECT daily_bonus_claimed FROM user_daily_points WHERE user_id = ? AND date = ?");
                if (!$stmt_check) {
                    error_log("ERROR: Daily bonus check query prepare failed: " . $conn->error);
                    $dailyBonusMessage = " (데일리 보너스 확인 실패)";
                } else {
                    $stmt_check->bind_param("is", $user['id'], $today);
                    $stmt_check->execute();
                    $result_check = $stmt_check->get_result();
                    error_log("DEBUG: Daily bonus check executed, rows found: " . $result_check->num_rows);

                    $shouldGiveBonus = true;
                    if ($result_check->num_rows > 0) {
                        $row_check = $result_check->fetch_assoc();
                        if ($row_check['daily_bonus_claimed']) {
                            $shouldGiveBonus = false;
                            error_log("DEBUG: Daily bonus already claimed today");
                        }
                    }
                    $stmt_check->close();
                    error_log("DEBUG: Should give bonus: " . ($shouldGiveBonus ? "YES" : "NO"));
                }

                if ($shouldGiveBonus) {
                    $conn->begin_transaction();
                    try {
                        error_log("DEBUG: Starting daily bonus for user " . $user['id']);

                        // 먼저 user_daily_points 테이블이 존재하는지 확인
                        $check_table = $conn->query("SHOW TABLES LIKE 'user_daily_points'");
                        if ($check_table->num_rows == 0) {
                            throw new Exception("user_daily_points 테이블이 존재하지 않습니다.");
                        }

                        // 일일 포인트 기록 생성 또는 업데이트 (point_wallet에는 추가하지 않음)
                        $stmt_daily = $conn->prepare("INSERT INTO user_daily_points (user_id, date, daily_bonus_claimed, daily_points_earned) VALUES (?, ?, TRUE, 60) ON DUPLICATE KEY UPDATE daily_bonus_claimed = TRUE, daily_points_earned = daily_points_earned + 60");
                        if (!$stmt_daily) {
                            throw new Exception("user_daily_points INSERT 준비 실패: " . $conn->error);
                        }
                        $stmt_daily->bind_param("is", $user['id'], $today);
                        if (!$stmt_daily->execute()) {
                            throw new Exception("user_daily_points INSERT 실행 실패: " . $stmt_daily->error);
                        }
                        $stmt_daily->close();
                        error_log("DEBUG: Daily points record inserted/updated successfully");

                        // transactions 테이블이 존재하는지 확인
                        $check_trans_table = $conn->query("SHOW TABLES LIKE 'transactions'");
                        if ($check_trans_table->num_rows == 0) {
                            throw new Exception("transactions 테이블이 존재하지 않습니다.");
                        }

                        // 트랜잭션 기록 추가
                        $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'daily_bonus', 60, '자동 일일 로그인 보너스')");
                        if (!$stmt_trans) {
                            throw new Exception("transactions INSERT 준비 실패: " . $conn->error);
                        }
                        $stmt_trans->bind_param("i", $user['id']);
                        if (!$stmt_trans->execute()) {
                            throw new Exception("transactions INSERT 실행 실패: " . $stmt_trans->error);
                        }
                        $stmt_trans->close();
                        error_log("DEBUG: Transaction record inserted successfully");

                        $conn->commit();
                        $dailyBonusMessage = " (데일리 60P 지급완료!)";
                        error_log("DEBUG: Daily bonus completed successfully for user " . $user['id']);
                    } catch (Exception $e) {
                        $conn->rollback();
                        // 데일리 보너스 지급 실패해도 로그인은 성공으로 처리
                        $dailyBonusMessage = " (데일리 보너스 지급 실패: " . $e->getMessage() . ")";
                        error_log("Daily bonus failed for user " . $user['id'] . ": " . $e->getMessage());
                    }
                }

                echo safeJsonEncode(["success" => true, "message" => "로그인 성공" . $dailyBonusMessage, "username" => $user['email'], "userRole" => $user['role']]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "비밀번호가 올바르지 않습니다."]);
            }
        } else {
            echo safeJsonEncode(["success" => false, "message" => "존재하지 않는 이메일입니다."]);
        }
        $stmt->close();
        break;

    case 'googleLogin':
        // Google 로그인 처리 (회원가입 및 로그인)
        $email = $conn->real_escape_string($input['email']);
        $name = $conn->real_escape_string($input['name']);

        // Google 로그인 사용자는 항상 'user' (일반 회원) 역할로 설정합니다.
        $role = 'user';

        // 1. 이미 존재하는 이메일인지 확인
        $stmt = $conn->prepare("SELECT id, email, role FROM users WHERE email = ?");
        if (!$stmt) {
            echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
            exit();
        }
        $stmt->bind_param("s", $email);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            // 2-1. 존재하는 사용자: 로그인 처리
            $user = $result->fetch_assoc();

            // 마스터 계정 확인
            $userRole = $user['role'];
            if ($email === 'admin@metamotion.io') {
                $userRole = 'admin';
                // 데이터베이스에도 업데이트
                $stmt_update_role = $conn->prepare("UPDATE users SET role = 'admin' WHERE id = ?");
                $stmt_update_role->bind_param("i", $user['id']);
                $stmt_update_role->execute();
                $stmt_update_role->close();
            }

            $_SESSION['loggedin'] = true;
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['email'];
            $_SESSION['user_role'] = $userRole;

            // 로그인 성공 시 자동으로 데일리 60P 지급
            $today = date('Y-m-d');
            $dailyBonusMessage = "";

            // 오늘 이미 보너스를 받았는지 확인
            $stmt_check = $conn->prepare("SELECT daily_bonus_claimed FROM user_daily_points WHERE user_id = ? AND date = ?");
            $stmt_check->bind_param("is", $user['id'], $today);
            $stmt_check->execute();
            $result_check = $stmt_check->get_result();

            $shouldGiveBonus = true;
            if ($result_check->num_rows > 0) {
                $row_check = $result_check->fetch_assoc();
                if ($row_check['daily_bonus_claimed']) {
                    $shouldGiveBonus = false;
                }
            }
            $stmt_check->close();

            if ($shouldGiveBonus) {
                $conn->begin_transaction();
                try {
                    // 일일 포인트 기록 생성 또는 업데이트 (point_wallet에는 추가하지 않음)
                    $stmt_daily = $conn->prepare("INSERT INTO user_daily_points (user_id, date, daily_bonus_claimed, daily_points_earned) VALUES (?, ?, TRUE, 60) ON DUPLICATE KEY UPDATE daily_bonus_claimed = TRUE, daily_points_earned = daily_points_earned + 60");
                    $stmt_daily->bind_param("is", $user['id'], $today);
                    $stmt_daily->execute();
                    $stmt_daily->close();

                    // 트랜잭션 기록 추가
                    $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'daily_bonus', 60, '자동 일일 로그인 보너스')");
                    $stmt_trans->bind_param("i", $user['id']);
                    $stmt_trans->execute();
                    $stmt_trans->close();

                    $conn->commit();
                    $dailyBonusMessage = " (데일리 60P 지급완료!)";
                } catch (mysqli_sql_exception $e) {
                    $conn->rollback();
                    // 데일리 보너스 지급 실패해도 로그인은 성공으로 처리
                    $dailyBonusMessage = " (데일리 보너스 지급 실패)";
                    error_log("Daily bonus failed for Google user " . $user['id'] . ": " . $e->getMessage());
                }
            }

            echo safeJsonEncode(["success" => true, "message" => "Google 로그인 성공" . $dailyBonusMessage, "username" => $user['email'], "userRole" => $userRole]);
        } else {
            // 2-2. 새로운 사용자: 회원가입 처리
            // Google 로그인 사용자는 비밀번호가 필요 없으므로 빈 문자열로 저장합니다.
            // 회원 기록은 users DB 테이블에 저장됩니다.
            $google_password_placeholder = '';
            $stmt_insert = $conn->prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)");
            if (!$stmt_insert) {
                echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
                exit();
            }
            $stmt_insert->bind_param("ssss", $email, $google_password_placeholder, $name, $role);

            if ($stmt_insert->execute()) {
                $newUserId = $conn->insert_id;

                // Google 신규 가입자도 포인트 지급
                $conn->begin_transaction();
                try {
                    // 포인트 지갑 생성 (신규 가입 보너스 500P만 지급, 일일 포인트는 별도 관리)
                    $stmt_wallet = $conn->prepare("INSERT INTO point_wallet (user_id, balance) VALUES (?, 500)");
                    $stmt_wallet->bind_param("i", $newUserId);
                    $stmt_wallet->execute();
                    $stmt_wallet->close();

                    // 신규 가입 포인트 지급 내역 기록
                    $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'signup_bonus', 500, '신규 가입 보너스 (Google)')");
                    $stmt_trans->bind_param("i", $newUserId);
                    $stmt_trans->execute();
                    $stmt_trans->close();

                    // 신규 가입 포인트 지급 여부 업데이트
                    $stmt_update = $conn->prepare("UPDATE users SET signup_points_given = TRUE WHERE id = ?");
                    $stmt_update->bind_param("i", $newUserId);
                    $stmt_update->execute();
                    $stmt_update->close();

                    // 신규 가입자도 가입 당일에 즉시 데일리 60P 지급
                    $today = date('Y-m-d');
                    $stmt_daily = $conn->prepare("INSERT INTO user_daily_points (user_id, date, daily_bonus_claimed, daily_points_earned) VALUES (?, ?, TRUE, 60)");
                    $stmt_daily->bind_param("is", $newUserId, $today);
                    $stmt_daily->execute();
                    $stmt_daily->close();

                    // 데일리 보너스 트랜잭션 기록 추가
                    $stmt_daily_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'daily_bonus', 60, '신규 가입 시 데일리 로그인 보너스')");
                    $stmt_daily_trans->bind_param("i", $newUserId);
                    $stmt_daily_trans->execute();
                    $stmt_daily_trans->close();

                    $conn->commit();

                    $_SESSION['loggedin'] = true;
                    $_SESSION['user_id'] = $newUserId;
                    $_SESSION['username'] = $email;
                    $_SESSION['user_role'] = $role;
                    echo safeJsonEncode(["success" => true, "message" => "Google 계정으로 회원가입 및 로그인 성공! 신규 가입 보너스 500P + 데일리 60P가 지급되었습니다.", "username" => $email, "userRole" => $role]);
                } catch (mysqli_sql_exception $e) {
                    $conn->rollback();
                    echo safeJsonEncode(["success" => false, "message" => "Google 회원가입 실패: " . $e->getMessage()]);
                }
            } else {
                echo safeJsonEncode(["success" => false, "message" => "Google 회원가입 실패: " . $stmt_insert->error]);
            }
            $stmt_insert->close();
        }
        $stmt->close();
        break;

    case 'logout':
        session_unset();
        session_destroy();
        echo safeJsonEncode(["success" => true, "message" => "로그아웃 성공"]);
        break;

    case 'checkLoginStatus':
        if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true) {
            $user_role = $_SESSION['user_role'] ?? 'user';
            echo safeJsonEncode(["success" => true, "username" => $_SESSION['username'], "userRole" => $user_role]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "로그인되지 않았습니다."]);
        }
        break;

    case 'getUserInfo':
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $userId = $_SESSION['user_id'];

        // 가입일자 조회
        $stmt_user = $conn->prepare("SELECT email, created_at FROM users WHERE id = ?");
        $stmt_user->bind_param("i", $userId);
        $stmt_user->execute();
        $result_user = $stmt_user->get_result();
        $userInfo = $result_user->fetch_assoc();
        $stmt_user->close();

        if (!$userInfo) {
            echo safeJsonEncode(["success" => false, "message" => "사용자 정보를 찾을 수 없습니다."]);
            break;
        }

        // 좋아요 갯수 조회
        $stmt_likes = $conn->prepare("SELECT COUNT(*) as like_count FROM likes WHERE user_id = ?");
        if (!$stmt_likes) {
            echo safeJsonEncode(["success" => false, "message" => "쿼리 준비 실패: " . $conn->error]);
            break;
        }
        $stmt_likes->bind_param("i", $userId);
        $stmt_likes->execute();
        $result_likes = $stmt_likes->get_result();
        $likeCount = $result_likes->fetch_assoc()['like_count'];
        $stmt_likes->close();

        // 저장 목록 갯수 조회
        $stmt_saved = $conn->prepare("SELECT COUNT(*) as saved_count FROM saved_music WHERE user_id = ?");
        if (!$stmt_saved) {
            echo safeJsonEncode(["success" => false, "message" => "쿼리 준비 실패: " . $conn->error]);
            break;
        }
        $stmt_saved->bind_param("i", $userId);
        $stmt_saved->execute();
        $result_saved = $stmt_saved->get_result();
        $savedCount = $result_saved->fetch_assoc()['saved_count'];
        $stmt_saved->close();

        // 포인트 정보 조회 (point_wallet 테이블의 balance 컬럼)
        $stmt_wallet = $conn->prepare("SELECT balance FROM point_wallet WHERE user_id = ?");
        if (!$stmt_wallet) {
            echo safeJsonEncode(["success" => false, "message" => "쿼리 준비 실패: " . $conn->error]);
            break;
        }
        $stmt_wallet->bind_param("i", $userId);
        $stmt_wallet->execute();
        $result_wallet = $stmt_wallet->get_result();
        $walletPoints = 0;
        if ($result_wallet->num_rows > 0) {
            $walletPoints = $result_wallet->fetch_assoc()['balance'] ?? 0;
        }
        $stmt_wallet->close();

        // 오늘 획득한 포인트 조회 (user_daily_points 테이블)
        $today = date('Y-m-d');
        $stmt_daily = $conn->prepare("SELECT (daily_points_earned - daily_points_used) as available_daily_points FROM user_daily_points WHERE user_id = ? AND date = ?");
        if (!$stmt_daily) {
            echo safeJsonEncode(["success" => false, "message" => "쿼리 준비 실패: " . $conn->error]);
            break;
        }
        $stmt_daily->bind_param("is", $userId, $today);
        $stmt_daily->execute();
        $result_daily = $stmt_daily->get_result();
        $dailyPoints = 0;
        if ($result_daily->num_rows > 0) {
            $dailyPoints = $result_daily->fetch_assoc()['available_daily_points'] ?? 0;
        }
        $stmt_daily->close();

        echo safeJsonEncode([
            "success" => true,
            "userInfo" => [
                "email" => $userInfo['email'],
                "joinDate" => $userInfo['created_at'],
                "likeCount" => $likeCount,
                "savedCount" => $savedCount,
                "walletPoints" => $walletPoints,
                "dailyPoints" => $dailyPoints
            ]
        ]);
        break;

    case 'getPurchaseHistory':
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $userId = $_SESSION['user_id'];

        // 최근 30개의 거래 내역 조회
        $stmt = $conn->prepare("
            SELECT type, amount, description, created_at
            FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 30
        ");

        if (!$stmt) {
            echo safeJsonEncode(["success" => false, "message" => "쿼리 준비 실패: " . $conn->error]);
            break;
        }

        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        $transactions = [];
        while ($row = $result->fetch_assoc()) {
            $transactions[] = $row;
        }
        $stmt->close();

        echo safeJsonEncode([
            "success" => true,
            "transactions" => $transactions
        ]);
        break;

    case 'checkSession':
        // 세션 확인 및 역할 반환
        if (isset($_SESSION['loggedin']) && $_SESSION['loggedin'] === true) {
            $user_role = $_SESSION['user_role'] ?? 'user';
            echo safeJsonEncode([
                "success" => true,
                "loggedin" => true,
                "username" => $_SESSION['username'],
                "role" => $user_role
            ]);
        } else {
            echo safeJsonEncode([
                "success" => false,
                "loggedin" => false,
                "role" => null
            ]);
        }
        break;

    case 'uploadFile':
        // 'creator' 또는 'admin' 역할 사용자만 업로드 가능
        $userRole = $_SESSION['user_role'] ?? 'user';
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true || ($userRole !== 'creator' && $userRole !== 'admin')) {
            echo safeJsonEncode(["success" => false, "message" => "크리에이터만 파일을 업로드할 수 있습니다."]);
            exit();
        }

        $fileType = $_POST['fileType'] ?? '';
        $urls = [];
        $uploadDir = __DIR__ . '/uploads/';

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        if ($fileType === 'audio' && isset($_FILES['audioFile'])) {
            $file = $_FILES['audioFile'];
            if ($file['error'] === UPLOAD_ERR_OK) {
                $targetSubDir = 'audio/';
                $targetPath = $uploadDir . $targetSubDir;
                if (!is_dir($targetPath)) {
                    mkdir($targetPath, 0777, true);
                }
                $file_name = basename($file['name']);
                $new_file_name = uniqid() . '_' . $file_name;
                $destination = $targetPath . $new_file_name;

                if (move_uploaded_file($file['tmp_name'], $destination)) {
                    $urls[] = 'uploads/' . $targetSubDir . $new_file_name;
                } else {
                    echo safeJsonEncode(["success" => false, "message" => "파일 이동 실패: " . $file_name]);
                    exit();
                }
            } else {
                echo safeJsonEncode(["success" => false, "message" => "파일 업로드 오류: " . $file['error']]);
                exit();
            }
        } elseif ($fileType === 'image' && isset($_FILES['imageFiles'])) {
            $targetSubDir = 'images/';
            $targetPath = $uploadDir . $targetSubDir;
            if (!is_dir($targetPath)) {
                mkdir($targetPath, 0777, true);
            }

            foreach ($_FILES['imageFiles']['tmp_name'] as $key => $tmp_name) {
                if ($_FILES['imageFiles']['error'][$key] === UPLOAD_ERR_OK) {
                    $file_name = basename($_FILES['imageFiles']['name'][$key]);
                    $new_file_name = uniqid() . '_' . $file_name;
                    $destination = $targetPath . $new_file_name;

                    if (move_uploaded_file($tmp_name, $destination)) {
                        $urls[] = 'uploads/' . $targetSubDir . $new_file_name;
                    } else {
                        echo safeJsonEncode(["success" => false, "message" => "파일 이동 실패: " . $file_name]);
                        exit();
                    }
                } else {
                    echo safeJsonEncode(["success" => false, "message" => "파일 업로드 오류: " . $_FILES['imageFiles']['error'][$key]]);
                    exit();
                }
            }
        } else {
            echo safeJsonEncode(["success" => false, "message" => "유효하지 않은 파일 타입 또는 파일이 없습니다."]);
            exit();
        }
        echo safeJsonEncode(["success" => true, "message" => "파일 업로드 성공", "urls" => ($fileType === 'audio') ? $urls[0] : $urls]);
        break;

        case 'load':
            // 음원 목록 로드
            $musicList = [];
            $userId = $_SESSION['user_id'] ?? null;
            $userRole = $_SESSION['user_role'] ?? null;
    
            // 좋아요 수 기준으로 정렬하고 크리에이터 목록 필터링 기능 유지
            $sql = "
                SELECT
                    m.id,
                    m.name,
                    m.audioSrc,
                    m.uploaderId,
                    m.category,
                    m.recommended,
                    COUNT(l.id) AS totalLikes
                FROM music m
                LEFT JOIN images i ON m.id = i.musicId
                LEFT JOIN likes l ON i.id = l.image_id
            ";
            $params = [];
            $types = "";
    
            // 크리에이터인 경우 자신이 업로드한 목록만 가져오도록 WHERE 절 추가 (admin은 모든 목록 조회 가능)
            if ($userRole === 'creator') {
                $sql .= " WHERE m.uploaderId = ?";
                $params[] = $userId;
                $types = "i";
            }

            // 카테고리 필터링 기능 추가
            if (isset($input['category']) && $input['category'] !== 'all') {
                $filterCategory = $conn->real_escape_string($input['category']);
                if ($userRole === 'creator') {
                    $sql .= " AND m.category = ?";
                } else {
                    $sql .= " WHERE m.category = ?";
                }
                $params[] = $filterCategory;
                $types .= "s";
            }
    
            $sql .= " GROUP BY m.id ORDER BY m.name ASC";
            $stmt = $conn->prepare($sql);

            if ($stmt === false) {
                error_log("SQL prepare failed: " . $conn->error . " | SQL: " . $sql);
                echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
                break;
            }

            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }

            $stmt->execute();
            $result = $stmt->get_result();
    
            if ($result->num_rows > 0) {
                while ($row = $result->fetch_assoc()) {
                    $images = [];
                    // In the 'load' case, update the image query to order by display_order:
                        $sql_images = "
                        SELECT i.id, i.imageSrc,
                            (SELECT COUNT(*) FROM likes WHERE image_id = i.id) AS likeCount,
                            (SELECT COUNT(*) FROM likes WHERE image_id = i.id AND user_id = ?) AS isLiked
                        FROM images i
                        WHERE i.musicId = ?
                        ORDER BY COALESCE(i.display_order, i.id) ASC
                    ";
                    $stmt_images = $conn->prepare($sql_images);
                    $stmt_images->bind_param("ii", $userId, $row['id']);
                    $stmt_images->execute();
                    $result_images = $stmt_images->get_result();
                    while ($img_row = $result_images->fetch_assoc()) {
                        $images[] = $img_row;
                    }
                    $stmt_images->close();
                    $row['images'] = $images;
                    $musicList[] = $row;
                }
            }
    
            // 고유한 카테고리 목록 가져오기
            $categories = [];
            $categoryDetails = [];

            // categories 테이블이 있으면 사용
            $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");
            if ($table_exists && $table_exists->num_rows > 0) {
                // categories 테이블에서 name과 classification 가져오기
                $sql_categories = "SELECT name, classification FROM categories ORDER BY name ASC";
                $result_categories = $conn->query($sql_categories);
                if ($result_categories) {
                    while ($row = $result_categories->fetch_assoc()) {
                        $categories[] = $row['name'];
                        $categoryDetails[] = [
                            'name' => $row['name'],
                            'classification' => $row['classification']
                        ];
                    }
                }
            } else {
                // 기존 방식: music 테이블에서 가져오기
                $sql_categories = "SELECT DISTINCT category FROM music WHERE category IS NOT NULL AND category != '' ORDER BY category ASC";
                $result_categories = $conn->query($sql_categories);
                if ($result_categories) {
                    while ($row = $result_categories->fetch_assoc()) {
                        $categories[] = $row['category'];
                        $categoryDetails[] = [
                            'name' => $row['category'],
                            'classification' => null
                        ];
                    }
                }
            }

            echo safeJsonEncode(["success" => true, "musicList" => $musicList, "categories" => $categories, "categoryDetails" => $categoryDetails]);
    
            $stmt->close();
            break;

        case 'loadRecommended':
            // 추천 갤러리 목록 로드
            $musicList = [];
            $userId = $_SESSION['user_id'] ?? null;

            $sql = "
                SELECT
                    m.id,
                    m.name,
                    m.audioSrc,
                    m.uploaderId,
                    m.category,
                    COUNT(l.id) AS totalLikes
                FROM music m
                LEFT JOIN images i ON m.id = i.musicId
                LEFT JOIN likes l ON i.id = l.image_id
                WHERE m.recommended = 1
                GROUP BY m.id
                ORDER BY m.name ASC
            ";

            error_log("loadRecommended SQL: " . $sql);
            $result = $conn->query($sql);

            if ($result === false) {
                error_log("loadRecommended SQL error: " . $conn->error);
                echo safeJsonEncode(["success" => false, "message" => "SQL 오류: " . $conn->error]);
                break;
            }

            error_log("loadRecommended: Found " . $result->num_rows . " recommended items");

            if ($result->num_rows > 0) {
                while ($row = $result->fetch_assoc()) {
                    $images = [];
                    $sql_images = "
                        SELECT i.id, i.imageSrc,
                            (SELECT COUNT(*) FROM likes WHERE image_id = i.id) AS likeCount,
                            (SELECT COUNT(*) FROM likes WHERE image_id = i.id AND user_id = ?) AS isLiked
                        FROM images i
                        WHERE i.musicId = ?
                        ORDER BY COALESCE(i.display_order, i.id) ASC
                    ";
                    $stmt_images = $conn->prepare($sql_images);
                    $stmt_images->bind_param("ii", $userId, $row['id']);
                    $stmt_images->execute();
                    $result_images = $stmt_images->get_result();
                    while ($img_row = $result_images->fetch_assoc()) {
                        $images[] = $img_row;
                    }
                    $stmt_images->close();
                    $row['images'] = $images;
                    $musicList[] = $row;
                }
            }

            echo safeJsonEncode(["success" => true, "musicList" => $musicList, "total" => count($musicList)]);
            break;

        case 'loadAllMusic':
            // 관리자용: 모든 음악 목록 로드 (추천 상태 포함)
            $musicList = [];

            // 세션 확인 - 관리자만 접근 가능
            if (!isset($_SESSION['user_id'])) {
                error_log("loadAllMusic: user_id not in session. Session data: " . print_r($_SESSION, true));
                echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
                break;
            }

            // 사용자 role 확인
            $userId = $_SESSION['user_id'];
            $stmt_role = $conn->prepare("SELECT role FROM users WHERE id = ?");
            $stmt_role->bind_param("i", $userId);
            $stmt_role->execute();
            $result_role = $stmt_role->get_result();
            $user = $result_role->fetch_assoc();
            $stmt_role->close();

            if (!$user || $user['role'] !== 'admin') {
                error_log("loadAllMusic: Access denied. User role: " . ($user['role'] ?? 'N/A'));
                echo safeJsonEncode(["success" => false, "message" => "관리자 권한이 필요합니다. (현재 역할: " . ($user['role'] ?? 'N/A') . ")"]);
                break;
            }

            // 모든 음악 목록 조회 (카테고리 분류 정보 포함)
            $sql = "
                SELECT
                    m.id,
                    m.name,
                    m.audioSrc,
                    m.uploaderId,
                    m.category,
                    m.recommended,
                    c.classification
                FROM music m
                LEFT JOIN categories c ON m.category COLLATE utf8mb4_unicode_ci = c.name COLLATE utf8mb4_unicode_ci
                ORDER BY m.category ASC, m.name ASC
            ";

            error_log("loadAllMusic SQL: " . $sql);
            $result = $conn->query($sql);

            if ($result === false) {
                error_log("loadAllMusic SQL error: " . $conn->error);
                echo safeJsonEncode(["success" => false, "message" => "SQL 오류: " . $conn->error]);
                break;
            }

            error_log("loadAllMusic: Query returned " . $result->num_rows . " rows");

            if ($result->num_rows > 0) {
                while ($row = $result->fetch_assoc()) {
                    $musicList[] = $row;
                }
            }

            error_log("loadAllMusic: Returning " . count($musicList) . " music items to client");

            // 디버그 정보 추가
            $debugInfo = [
                "sql_rows" => $result->num_rows,
                "musicList_count" => count($musicList),
                "first_item" => count($musicList) > 0 ? $musicList[0] : null
            ];

            echo safeJsonEncode([
                "success" => true,
                "musicList" => $musicList,
                "total" => count($musicList),
                "debug" => $debugInfo
            ]);
            break;

        case 'addMusic':
            // 'creator' 또는 'admin' 역할 사용자만 음원 추가 가능
            $userRole = $_SESSION['user_role'] ?? 'user';
            if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true || ($userRole !== 'creator' && $userRole !== 'admin')) {
                echo safeJsonEncode(["success" => false, "message" => "크리에이터만 음원을 추가할 수 있습니다."]);
                break;
            }
    
            $name = $conn->real_escape_string($input['name']);
            $audioSrc = $conn->real_escape_string($input['audioSrc']);
            $category = $conn->real_escape_string($input['category'] ?? ''); // 카테고리 정보 추가
            $images = $input['images'] ?? [];
            $uploaderId = $_SESSION['user_id']; // 세션에서 uploaderId 가져오기

        // 1. music 테이블에 음원 정보 삽입
        $stmt_music = $conn->prepare("INSERT INTO music (name, audioSrc, category, uploaderId) VALUES (?, ?, ?, ?)");
        if (!$stmt_music) {
            echo safeJsonEncode(["success" => false, "message" => "음원 추가 SQL 준비 실패: " . $conn->error]);
            break;
        }

        // **수정된 부분**: category 변수를 bind_param에 추가했습니다.
        $stmt_music->bind_param("sssi", $name, $audioSrc, $category, $uploaderId);
        if (!$stmt_music->execute()) {
            echo safeJsonEncode(["success" => false, "message" => "음원 추가 실패: " . $stmt_music->error]);
            $stmt_music->close();
            break;
        }
        $musicId = $conn->insert_id; // 새로 삽입된 음악의 ID
        $stmt_music->close();

        // 2. images 테이블에 관련 이미지 삽입
        if (!empty($images)) {
            // 💡 변경: display_order를 순차적으로 증가시킬 변수 초기화
            $display_order = 1; 

            $stmt_images = $conn->prepare("INSERT INTO images (musicId, imageSrc, display_order) VALUES (?, ?, ?)");
            if (!$stmt_images) {
                // 이미지 삽입 실패 시 음악은 유지되지만 오류 로깅
                error_log("이미지 추가 SQL 준비 실패 for musicId " . $musicId . ": " . $conn->error);
                echo safeJsonEncode(["success" => true, "message" => "음원 추가 성공 (이미지 일부 또는 전체 실패)"]);
                break;
            }

            foreach ($images as $imageSrc) {
                $imageSrc_esc = $conn->real_escape_string($imageSrc);
                // 💡 변경: 'is' (integer, string) 대신 'isi' (integer, string, integer)로 변경하고 $display_order 변수 추가
                $stmt_images->bind_param("isi", $musicId, $imageSrc_esc, $display_order); 
                
                if (!$stmt_images->execute()) {
                    error_log("이미지 삽입 실패 for musicId " . $musicId . ", imageSrc " . $imageSrc_esc . ": " . $stmt_images->error);
                }
                
                // 💡 변경: 다음 이미지의 순서를 위해 변수 값 증가
                $display_order++;
            }
            $stmt_images->close();
        }
        echo safeJsonEncode(["success" => true, "message" => "음원 추가 성공"]);
        break;

        case 'updateMusic':
            $userRole = $_SESSION['user_role'] ?? 'user';
            if (!isset($_SESSION['user_id']) || ($userRole !== 'creator' && $userRole !== 'admin')) {
                echo safeJsonEncode(["success" => false, "message" => "크리에이터만 음원을 수정할 수 있습니다."]);
                break;
            }
    
            $updateData = $input['data'] ?? [];
            $musicId = $updateData['id'] ?? null;
            if (!$musicId) {
                echo safeJsonEncode(["success" => false, "message" => "음원 ID가 누락되었습니다."]);
                break;
            }
    
            $fields = [];
            $params = [];
            $types = "";
    
            if (isset($updateData['name'])) {
                $fields[] = "name = ?";
                $params[] = $updateData['name'];
                $types .= "s";
            }
    
            if (isset($updateData['category'])) {
                $fields[] = "category = ?";
                $params[] = $updateData['category'];
                $types .= "s";
            }
    
            if (isset($updateData['audioSrc'])) {
                $fields[] = "audioSrc = ?";
                $params[] = $updateData['audioSrc'];
                $types .= "s";
            }
            
            $conn->begin_transaction();
    
            try {
                if (!empty($fields)) {
                    $sql = "UPDATE music SET " . implode(", ", $fields) . " WHERE id = ?";
                    $params[] = $musicId;
                    $types .= "i";
                    
                    $stmt = $conn->prepare($sql);
                    $stmt->bind_param($types, ...$params);
                    $stmt->execute();
                    $stmt->close();
                }
    
                // ⭐ 새 이미지 추가 로직 시작
                $newImages = $updateData['newImages'] ?? [];
                $imageAddMode = $updateData['imageAddMode'] ?? null;
    
                if (!empty($newImages) && $imageAddMode === 'append') {
                    // 현재 음악의 마지막 이미지 순서(display_order)를 찾습니다.
                    $stmt_max_order = $conn->prepare("SELECT COALESCE(MAX(display_order), 0) AS max_order FROM images WHERE musicId = ?");
                    $stmt_max_order->bind_param("i", $musicId);
                    $stmt_max_order->execute();
                    $result = $stmt_max_order->get_result();
                    $row = $result->fetch_assoc();
                    $maxOrder = $row['max_order'];
                    $stmt_max_order->close();
    
                    $currentOrder = $maxOrder + 1;
                    
                    // 새 이미지들을 순서대로 DB에 추가합니다.
                    $stmt_insert_image = $conn->prepare("INSERT INTO images (musicId, imageSrc, display_order) VALUES (?, ?, ?)");
                    
                    foreach ($newImages as $imageSrc) {
                        $stmt_insert_image->bind_param("isi", $musicId, $imageSrc, $currentOrder);
                        $stmt_insert_image->execute();
                        $currentOrder++;
                    }
                    $stmt_insert_image->close();
                }
                // ⭐ 새 이미지 추가 로직 끝
    
                $conn->commit();
                echo safeJsonEncode(["success" => true, "message" => "음원이 성공적으로 수정되었습니다."]);
            } catch (mysqli_sql_exception $e) {
                $conn->rollback();
                echo safeJsonEncode(["success" => false, "message" => "음원 수정 실패: " . $e->getMessage()]);
            }
            break;

    case 'deleteMusic':
        $userRole = $_SESSION['user_role'] ?? 'user';
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true || ($userRole !== 'creator' && $userRole !== 'admin')) {
            echo safeJsonEncode(["success" => false, "message" => "크리에이터만 음원을 삭제할 수 있습니다."]);
            break;
        }

        $musicId = $input['musicId'];
        $uploaderId = $_SESSION['user_id'];

        // 1. 해당 음원에 연결된 이미지 경로들을 가져와서 실제 파일 삭제
        $sql_images = "SELECT imageSrc FROM images WHERE musicId = ?";
        $stmt_images = $conn->prepare($sql_images);
        $stmt_images->bind_param("i", $musicId);
        $stmt_images->execute();
        $result_images = $stmt_images->get_result();

        while ($row = $result_images->fetch_assoc()) {
            $filePath = __DIR__ . '/' . $row['imageSrc'];
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
        $stmt_images->close();

        // 2. 음원 파일 경로를 가져와서 실제 파일 삭제
        $sql_audio = "SELECT audioSrc FROM music WHERE id = ? AND uploaderId = ?";
        $stmt_audio = $conn->prepare($sql_audio);
        $stmt_audio->bind_param("ii", $musicId, $uploaderId);
        $stmt_audio->execute();
        $result_audio = $stmt_audio->get_result();
        $audio_row = $result_audio->fetch_assoc();

        if ($audio_row) {
            $filePath = __DIR__ . '/' . $audio_row['audioSrc'];
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
        $stmt_audio->close();

        // 3. 데이터베이스에서 좋아요, 이미지, 음원 정보 삭제 (CASCADE 설정이 되어 있지 않다면 필요)
        $conn->begin_transaction();
        try {
            $stmt_likes = $conn->prepare("DELETE FROM likes WHERE image_id IN (SELECT id FROM images WHERE musicId = ?)");
            $stmt_likes->bind_param("i", $musicId);
            $stmt_likes->execute();
            $stmt_likes->close();

            $stmt_images = $conn->prepare("DELETE FROM images WHERE musicId = ?");
            $stmt_images->bind_param("i", $musicId);
            $stmt_images->execute();
            $stmt_images->close();

            $stmt_music = $conn->prepare("DELETE FROM music WHERE id = ? AND uploaderId = ?");
            $stmt_music->bind_param("ii", $musicId, $uploaderId);
            $stmt_music->execute();
            $stmt_music->close();

            $conn->commit();
            echo safeJsonEncode(["success" => true, "message" => "음원과 관련 이미지가 성공적으로 삭제되었습니다."]);
        } catch (mysqli_sql_exception $exception) {
            $conn->rollback();
            echo safeJsonEncode(["success" => false, "message" => "삭제 실패: " . $exception->getMessage()]);
        }
        break;

    case 'toggleRecommended':
        // 관리자만 추천 상태를 변경할 수 있음
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $musicId = $input['musicId'] ?? null;
        $recommended = $input['recommended'] ?? 0;

        if (!$musicId) {
            echo safeJsonEncode(["success" => false, "message" => "음악 ID가 필요합니다."]);
            break;
        }

        $stmt = $conn->prepare("UPDATE music SET recommended = ? WHERE id = ?");
        $stmt->bind_param("ii", $recommended, $musicId);

        if ($stmt->execute()) {
            $status = $recommended ? '추천 갤러리로 설정' : '추천 갤러리에서 해제';
            echo safeJsonEncode([
                "success" => true,
                "message" => "{$status}되었습니다.",
                "recommended" => $recommended
            ]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "추천 상태 변경 실패: " . $stmt->error]);
        }
        $stmt->close();
        break;

    case 'deleteImage':
        $userRole = $_SESSION['user_role'] ?? 'user';
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true || ($userRole !== 'creator' && $userRole !== 'admin')) {
            echo safeJsonEncode(["success" => false, "message" => "크리에이터만 이미지를 삭제할 수 있습니다."]);
            break;
        }
        $imageId = $input['imageId'];
        $uploaderId = $_SESSION['user_id'];

        // 1. 해당 이미지가 삭제 권한이 있는 사용자의 소유인지 확인하고 파일 경로 가져오기
        $sql_check = "
            SELECT i.imageSrc
            FROM images i
            JOIN music m ON i.musicId = m.id
            WHERE i.id = ? AND m.uploaderId = ?
        ";
        $stmt_check = $conn->prepare($sql_check);
        $stmt_check->bind_param("ii", $imageId, $uploaderId);
        $stmt_check->execute();
        $result_check = $stmt_check->get_result();

        if ($result_check->num_rows === 0) {
            echo safeJsonEncode(["success" => false, "message" => "해당 이미지를 삭제할 권한이 없습니다."]);
            $stmt_check->close();
            break;
        }

        $imageSrc = $result_check->fetch_assoc()['imageSrc'];
        $stmt_check->close();

        // 2. 실제 파일 삭제
        $filePath = __DIR__ . '/' . $imageSrc;
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        // 3. 데이터베이스에서 이미지 정보 삭제
        $stmt_delete = $conn->prepare("DELETE FROM images WHERE id = ?");
        $stmt_delete->bind_param("i", $imageId);
        if ($stmt_delete->execute()) {
            echo safeJsonEncode(["success" => true, "message" => "이미지가 성공적으로 삭제되었습니다."]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "이미지 삭제 실패: " . $stmt_delete->error]);
        }
        $stmt_delete->close();
        break;

    case 'toggleLike':
        $userId = $_SESSION['user_id'] ?? null;
        $imageId = $input['imageId'] ?? null;

        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인해야 좋아요를 누를 수 있습니다."]);
            break;
        }
        if (!$imageId) {
            echo safeJsonEncode(["success" => false, "message" => "이미지 ID가 누락되었습니다."]);
            break;
        }

        // 이미 좋아요를 눌렀는지 확인
        $stmt_check = $conn->prepare("SELECT id FROM likes WHERE user_id = ? AND image_id = ?");
        $stmt_check->bind_param("ii", $userId, $imageId);
        $stmt_check->execute();
        $result_check = $stmt_check->get_result();

        if ($result_check->num_rows > 0) {
            // 이미 좋아요를 눌렀다면 취소
            $stmt_delete = $conn->prepare("DELETE FROM likes WHERE user_id = ? AND image_id = ?");
            $stmt_delete->bind_param("ii", $userId, $imageId);
            if ($stmt_delete->execute()) {
                echo safeJsonEncode(["success" => true, "message" => "좋아요가 취소되었습니다."]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "좋아요 취소 실패: " . $stmt_delete->error]);
            }
            $stmt_delete->close();
        } else {
            // 좋아요를 누르지 않았다면 추가
            $stmt_insert = $conn->prepare("INSERT INTO likes (user_id, image_id) VALUES (?, ?)");
            $stmt_insert->bind_param("ii", $userId, $imageId);
            if ($stmt_insert->execute()) {
                echo safeJsonEncode(["success" => true, "message" => "좋아요를 눌렀습니다."]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "좋아요 추가 실패: " . $stmt_insert->error]);
            }
            $stmt_insert->close();
        }
        $stmt_check->close();
        break;

    case 'getLikedImages':
        // 현재 사용자가 좋아요를 누른 이미지 목록 가져오기
        $userId = $_SESSION['user_id'] ?? null;

        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인해야 좋아요 목록을 볼 수 있습니다."]);
            break;
        }

        $likedImages = [];
        $sql = "
            SELECT
                i.id,
                i.imageSrc,
                i.musicId,
                m.name AS musicName,
                m.audioSrc AS audioSrc,
                (SELECT COUNT(*) FROM likes WHERE image_id = i.id) AS likeCount
            FROM images i
            JOIN likes l ON i.id = l.image_id
            JOIN music m ON i.musicId = m.id
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC
        ";

        $stmt = $conn->prepare($sql);
        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                $likedImages[] = $row;
            }
            echo safeJsonEncode(["success" => true, "likedImages" => $likedImages]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "아직 좋아요를 누른 음악이 없습니다."]);
        }
        $stmt->close();
        break;

    case 'toggleSave':
        // 음악 목록 저장/해제 기능
        $userId = $_SESSION['user_id'] ?? null;
        $musicId = $input['musicId'] ?? null;

        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인해야 목록에 저장할 수 있습니다."]);
            break;
        }
        if (!$musicId) {
            echo safeJsonEncode(["success" => false, "message" => "음악 ID가 누락되었습니다."]);
            break;
        }

        // 이미 저장했는지 확인
        $stmt_check = $conn->prepare("SELECT id FROM saved_music WHERE user_id = ? AND music_id = ?");
        $stmt_check->bind_param("ii", $userId, $musicId);
        $stmt_check->execute();
        $result_check = $stmt_check->get_result();

        if ($result_check->num_rows > 0) {
            // 이미 저장했다면 해제
            $stmt_delete = $conn->prepare("DELETE FROM saved_music WHERE user_id = ? AND music_id = ?");
            $stmt_delete->bind_param("ii", $userId, $musicId);
            if ($stmt_delete->execute()) {
                echo safeJsonEncode(["success" => true, "message" => "목록에서 제거되었습니다."]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "목록 제거 실패: " . $stmt_delete->error]);
            }
            $stmt_delete->close();
        } else {
            // 저장하지 않았다면 추가
            $stmt_insert = $conn->prepare("INSERT INTO saved_music (user_id, music_id) VALUES (?, ?)");
            $stmt_insert->bind_param("ii", $userId, $musicId);
            if ($stmt_insert->execute()) {
                echo safeJsonEncode(["success" => true, "message" => "목록에 저장되었습니다."]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "목록 저장 실패: " . $stmt_insert->error]);
            }
            $stmt_insert->close();
        }
        $stmt_check->close();
        break;

    case 'getSavedMusic':
        // 현재 사용자가 저장한 음악 목록 가져오기
        $userId = $_SESSION['user_id'] ?? null;

        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인해야 저장 목록을 볼 수 있습니다."]);
            break;
        }

        $savedMusic = [];
        $sql = "
            SELECT
                m.id,
                m.name,
                m.audioSrc,
                m.category,
                m.uploaderId,
                sm.created_at AS savedAt
            FROM saved_music sm
            JOIN music m ON sm.music_id = m.id
            WHERE sm.user_id = ?
            ORDER BY sm.created_at DESC
        ";

        $stmt = $conn->prepare($sql);

        if ($stmt === false) {
            error_log("loadSavedMusic SQL prepare failed: " . $conn->error);
            echo safeJsonEncode(["success" => false, "message" => "SQL 준비 실패: " . $conn->error]);
            break;
        }

        $stmt->bind_param("i", $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                // 각 음악의 이미지도 함께 로드
                $images = [];
                $sql_images = "
                    SELECT i.id, i.imageSrc,
                        (SELECT COUNT(*) FROM likes WHERE image_id = i.id) AS likeCount,
                        (SELECT COUNT(*) FROM likes WHERE image_id = i.id AND user_id = ?) AS isLiked
                    FROM images i
                    WHERE i.musicId = ?
                    ORDER BY COALESCE(i.display_order, i.id) ASC
                ";
                $stmt_images = $conn->prepare($sql_images);
                $stmt_images->bind_param("ii", $userId, $row['id']);
                $stmt_images->execute();
                $result_images = $stmt_images->get_result();
                while ($img_row = $result_images->fetch_assoc()) {
                    $images[] = $img_row;
                }
                $stmt_images->close();
                $row['images'] = $images;
                $savedMusic[] = $row;
            }
            echo safeJsonEncode(["success" => true, "savedMusic" => $savedMusic]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "아직 저장한 음악이 없습니다."]);
        }
        $stmt->close();
        break;

    // 🚀 댓글 기능 추가된 부분
    case 'submitComment':
        $userId = $_SESSION['user_id'] ?? null;
        $musicId = $input['musicId'] ?? null;
        $content = $input['content'] ?? null;

        if (!$userId || !$musicId || !$content) {
            echo safeJsonEncode(["success" => false, "message" => "로그인 후 댓글을 작성해주세요."]);
            break;
        }

        $stmt = $conn->prepare("INSERT INTO comments (musicId, user_id, content) VALUES (?, ?, ?)");
        $stmt->bind_param("iis", $musicId, $userId, $content);

        if ($stmt->execute()) {
            echo safeJsonEncode(["success" => true, "message" => "댓글이 성공적으로 등록되었습니다."]);
        } else {
            echo safeJsonEncode(["success" => false, "message" => "댓글 등록 실패: " . $stmt->error]);
        }
        $stmt->close();
        break;

    case 'getComments':
        $musicId = $input['musicId'] ?? null;

        if (!$musicId) {
            echo safeJsonEncode(["success" => false, "message" => "음악 ID가 누락되었습니다."]);
            break;
        }

        $sql = "SELECT c.*, u.name, u.email, u.picture FROM comments c JOIN users u ON c.user_id = u.id WHERE c.musicId = ? ORDER BY c.created_at DESC";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("i", $musicId);
        $stmt->execute();
        $result = $stmt->get_result();

        $comments = [];
        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                $comments[] = $row;
            }
        }
        echo safeJsonEncode(["success" => true, "comments" => $comments]);
        $stmt->close();
        break;

        case 'reorderImageByNumber':
            $imageId = $input['imageId'] ?? null;
            $newOrder = $input['newOrder'] ?? null;
            $userId = $_SESSION['user_id'] ?? null;
        
            if (!$imageId || !$newOrder || !$userId) {
                echo safeJsonEncode(["success" => false, "message" => "필수 매개변수가 누락되었습니다."]);
                break;
            }
            
            $conn->begin_transaction();
            try {
                // 현재 이미지의 정보와 소유권 확인
                $stmt = $conn->prepare("SELECT id, musicId, display_order FROM images WHERE id = ?");
                $stmt->bind_param("i", $imageId);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentImage = $result->fetch_assoc();
                $stmt->close();
                
                if (!$currentImage) {
                    $conn->rollback();
                    echo safeJsonEncode(["success" => false, "message" => "이미지를 찾을 수 없습니다."]);
                    break;
                }
        
                $currentMusicId = $currentImage['musicId'];
                $currentOrder = $currentImage['display_order'];
                
                // 해당 음악의 이미지 총 개수 확인
                $stmt = $conn->prepare("SELECT COUNT(*) AS count FROM images WHERE musicId = ?");
                $stmt->bind_param("i", $currentMusicId);
                $stmt->execute();
                $result = $stmt->get_result();
                $imageCount = $result->fetch_assoc()['count'];
                $stmt->close();
        
                // 새 순서 번호 유효성 검사
                if ($newOrder < 1 || $newOrder > $imageCount) {
                    $conn->rollback();
                    echo safeJsonEncode(["success" => false, "message" => "유효하지 않은 순서 번호입니다."]);
                    break;
                }
        
                if ($currentOrder == $newOrder) {
                    $conn->rollback();
                    echo safeJsonEncode(["success" => true, "message" => "이미 같은 순서입니다."]);
                    break;
                }
        
                // 이미지 순서를 조정합니다.
                // 순서 변경에 따라 다른 이미지들의 순서를 변경
                if ($newOrder > $currentOrder) {
                    // 이미지가 아래로 이동
                    $stmt = $conn->prepare("UPDATE images SET display_order = display_order - 1 WHERE musicId = ? AND display_order > ? AND display_order <= ?");
                    $stmt->bind_param("iii", $currentMusicId, $currentOrder, $newOrder);
                    $stmt->execute();
                    $stmt->close();
                } else {
                    // 이미지가 위로 이동
                    $stmt = $conn->prepare("UPDATE images SET display_order = display_order + 1 WHERE musicId = ? AND display_order >= ? AND display_order < ?");
                    $stmt->bind_param("iii", $currentMusicId, $newOrder, $currentOrder);
                    $stmt->execute();
                    $stmt->close();
                }
        
                // 선택된 이미지의 순서를 새 번호로 업데이트
                $stmt = $conn->prepare("UPDATE images SET display_order = ? WHERE id = ?");
                $stmt->bind_param("ii", $newOrder, $imageId);
                $stmt->execute();
                $stmt->close();
        
                $conn->commit();
                echo safeJsonEncode(["success" => true, "message" => "이미지 순서가 성공적으로 변경되었습니다."]);
                
            } catch (Exception $e) {
                $conn->rollback();
                echo safeJsonEncode(["success" => false, "message" => "이미지 순서 변경 실패: " . $e->getMessage()]);
            }
            break;

    case 'auto_daily_bonus':
        // 로그인 시 자동 일일 포인트 지급 (60P)
        $userId = $_SESSION['user_id'] ?? null;
        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $today = date('Y-m-d');

        // 오늘 이미 보너스를 받았는지 확인
        $stmt_check = $conn->prepare("SELECT daily_bonus_claimed FROM user_daily_points WHERE user_id = ? AND date = ?");
        $stmt_check->bind_param("is", $userId, $today);
        $stmt_check->execute();
        $result = $stmt_check->get_result();

        $alreadyClaimed = false;
        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            if ($row['daily_bonus_claimed']) {
                $alreadyClaimed = true;
            }
        }
        $stmt_check->close();

        if ($alreadyClaimed) {
            echo safeJsonEncode(["success" => true, "pointsAwarded" => 0, "message" => "오늘 이미 포인트를 받으셨습니다."]);
            break;
        }

        $conn->begin_transaction();
        try {
            // 일일 포인트 기록 생성 또는 업데이트 (60포인트로 변경)
            $stmt_daily = $conn->prepare("INSERT INTO user_daily_points (user_id, date, daily_bonus_claimed, daily_points_earned) VALUES (?, ?, TRUE, 60) ON DUPLICATE KEY UPDATE daily_bonus_claimed = TRUE, daily_points_earned = daily_points_earned + 60");
            $stmt_daily->bind_param("is", $userId, $today);
            $stmt_daily->execute();
            $stmt_daily->close();

            // 트랜잭션 기록 추가
            $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'daily_bonus', 60, '일일 로그인 보너스')");
            $stmt_trans->bind_param("i", $userId);
            $stmt_trans->execute();
            $stmt_trans->close();

            $conn->commit();
            echo safeJsonEncode(["success" => true, "pointsAwarded" => 60, "message" => "일일 로그인 보너스 60P가 지급되었습니다!"]);
        } catch (mysqli_sql_exception $e) {
            $conn->rollback();
            echo safeJsonEncode(["success" => false, "message" => "보너스 지급 실패: " . $e->getMessage()]);
        }
        break;

    case 'use_point':
        // 갤러리 진입 시 포인트 차감 (17P)
        $userId = $_SESSION['user_id'] ?? null;
        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $pointsNeeded = 17;
        $today = date('Y-m-d');

        // 데이터베이스 연결 확인
        if (!$conn || $conn->connect_error) {
            echo safeJsonEncode(["success" => false, "message" => "데이터베이스 연결 오류입니다. 잠시 후 다시 시도해주세요."]);
            break;
        }

        $conn->begin_transaction();
        try {
            // 사용자 존재 여부 확인
            $stmt_user = $conn->prepare("SELECT id FROM users WHERE id = ?");
            $stmt_user->bind_param("i", $userId);
            $stmt_user->execute();
            $result_user = $stmt_user->get_result();

            if ($result_user->num_rows === 0) {
                $stmt_user->close();
                throw new Exception("사용자 정보를 찾을 수 없습니다.");
            }
            $stmt_user->close();

            // 오늘 보유한 일일 포인트 확인
            $stmt_daily = $conn->prepare("SELECT daily_points_earned - daily_points_used AS available_daily_points FROM user_daily_points WHERE user_id = ? AND date = ?");
            $stmt_daily->bind_param("is", $userId, $today);
            $stmt_daily->execute();
            $result_daily = $stmt_daily->get_result();

            $availableDailyPoints = 0;
            if ($result_daily->num_rows > 0) {
                $availableDailyPoints = $result_daily->fetch_assoc()['available_daily_points'] ?? 0;
            }
            $stmt_daily->close();

            // 지갑의 유상 포인트 확인
            $stmt_wallet = $conn->prepare("SELECT balance FROM point_wallet WHERE user_id = ?");
            $stmt_wallet->bind_param("i", $userId);
            $stmt_wallet->execute();
            $result_wallet = $stmt_wallet->get_result();

            $walletBalance = 0;
            if ($result_wallet->num_rows > 0) {
                $walletBalance = $result_wallet->fetch_assoc()['balance'] ?? 0;
            } else {
                // 기존 사용자를 위해 포인트 지갑이 없으면 생성 (0P로 시작)
                $stmt_create_wallet = $conn->prepare("INSERT IGNORE INTO point_wallet (user_id, balance) VALUES (?, 0)");
                $stmt_create_wallet->bind_param("i", $userId);
                $stmt_create_wallet->execute();
                $stmt_create_wallet->close();
                $walletBalance = 0;
            }
            $stmt_wallet->close();

            // 총 사용 가능한 포인트 확인
            $totalAvailable = $availableDailyPoints + $walletBalance;
            if ($totalAvailable < $pointsNeeded) {
                throw new Exception("포인트가 부족합니다. (필요: {$pointsNeeded}P, 보유: {$totalAvailable}P)");
            }

            // 포인트 차감 (우선순위: 일일 포인트 → 지갑 포인트)
            $dailyPointsUsed = min($availableDailyPoints, $pointsNeeded);
            $walletPointsUsed = $pointsNeeded - $dailyPointsUsed;

            // 일일 포인트 차감
            if ($dailyPointsUsed > 0) {
                $stmt_update_daily = $conn->prepare("UPDATE user_daily_points SET daily_points_used = daily_points_used + ? WHERE user_id = ? AND date = ?");
                $stmt_update_daily->bind_param("iis", $dailyPointsUsed, $userId, $today);
                $stmt_update_daily->execute();
                $stmt_update_daily->close();
            }

            // 지갑 포인트 차감
            if ($walletPointsUsed > 0) {
                $stmt_update_wallet = $conn->prepare("UPDATE point_wallet SET balance = balance - ? WHERE user_id = ?");
                $stmt_update_wallet->bind_param("ii", $walletPointsUsed, $userId);
                $stmt_update_wallet->execute();
                $stmt_update_wallet->close();
            }

            // 트랜잭션 기록
            $stmt_trans = $conn->prepare("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'deduct', ?, '갤러리 이용료')");
            $stmt_trans->bind_param("ii", $userId, $pointsNeeded);
            $stmt_trans->execute();
            $stmt_trans->close();

            $conn->commit();
            echo safeJsonEncode(["success" => true, "message" => "갤러리 이용료 {$pointsNeeded}P가 차감되었습니다."]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("포인트 사용 오류 - 사용자 ID: {$userId}, 오류: " . $e->getMessage());
            echo safeJsonEncode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    case 'get_points':
        // 사용자 포인트 현황 조회
        $userId = $_SESSION['user_id'] ?? null;
        if (!$userId) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $today = date('Y-m-d');

        // 오늘 일일 포인트 현황
        $stmt_daily = $conn->prepare("SELECT daily_bonus_claimed, daily_points_earned - daily_points_used AS available_daily_points FROM user_daily_points WHERE user_id = ? AND date = ?");
        $stmt_daily->bind_param("is", $userId, $today);
        $stmt_daily->execute();
        $result_daily = $stmt_daily->get_result();

        $dailyBonusClaimed = false;
        $availableDailyPoints = 0;
        if ($result_daily->num_rows > 0) {
            $row = $result_daily->fetch_assoc();
            $dailyBonusClaimed = $row['daily_bonus_claimed'] ?? false;
            $availableDailyPoints = $row['available_daily_points'] ?? 0;
        }
        $stmt_daily->close();

        // 지갑 포인트 현황
        $stmt_wallet = $conn->prepare("SELECT balance FROM point_wallet WHERE user_id = ?");
        $stmt_wallet->bind_param("i", $userId);
        $stmt_wallet->execute();
        $result_wallet = $stmt_wallet->get_result();

        $walletBalance = 0;
        if ($result_wallet->num_rows > 0) {
            $walletBalance = $result_wallet->fetch_assoc()['balance'] ?? 0;
        } else {
            // 기존 사용자를 위해 포인트 지갑이 없으면 생성 (0P로 시작)
            $stmt_create_wallet = $conn->prepare("INSERT IGNORE INTO point_wallet (user_id, balance) VALUES (?, 0)");
            $stmt_create_wallet->bind_param("i", $userId);
            $stmt_create_wallet->execute();
            $stmt_create_wallet->close();
            $walletBalance = 0;
        }
        $stmt_wallet->close();

        echo safeJsonEncode([
            "success" => true,
            "dailyBonusClaimed" => $dailyBonusClaimed,
            "availableDailyPoints" => $availableDailyPoints,
            "walletBalance" => $walletBalance,
            "totalPoints" => $availableDailyPoints + $walletBalance
        ]);
        break;

    case 'expire_points':
        // 자정 cron job으로 일일 포인트 소멸 처리
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));

        $conn->begin_transaction();
        try {
            // 어제 미사용 일일 포인트들을 찾아서 소멸 처리
            $stmt_expire = $conn->prepare("
                UPDATE user_daily_points
                SET daily_points_expired = daily_points_earned - daily_points_used
                WHERE date = ? AND (daily_points_earned - daily_points_used) > 0
            ");
            $stmt_expire->bind_param("s", $yesterday);
            $stmt_expire->execute();
            $stmt_expire->close();

            // 소멸된 포인트들에 대한 트랜잭션 기록
            $stmt_trans = $conn->prepare("
                INSERT INTO transactions (user_id, type, amount, description)
                SELECT user_id, 'expire', daily_points_expired, '일일 포인트 자동 소멸'
                FROM user_daily_points
                WHERE date = ? AND daily_points_expired > 0
            ");
            $stmt_trans->bind_param("s", $yesterday);
            $stmt_trans->execute();
            $stmt_trans->close();

            $conn->commit();
            echo safeJsonEncode(["success" => true, "message" => "일일 포인트 소멸 처리 완료"]);
        } catch (mysqli_sql_exception $e) {
            $conn->rollback();
            echo safeJsonEncode(["success" => false, "message" => "포인트 소멸 처리 실패: " . $e->getMessage()]);
        }
        break;

    case 'getCategories':
        // categories 테이블이 있으면 그곳에서, 없으면 music 테이블에서 가져오기
        $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");

        if ($table_exists && $table_exists->num_rows > 0) {
            // categories 테이블 사용 (name과 classification 모두 반환)
            $sql = "SELECT name, classification FROM categories ORDER BY name ASC";
            $result = $conn->query($sql);
            $categories = [];
            $categoryDetails = [];

            if ($result) {
                while ($row = $result->fetch_assoc()) {
                    $categories[] = $row['name'];
                    $categoryDetails[] = [
                        'name' => $row['name'],
                        'classification' => $row['classification']
                    ];
                }
            }

            echo safeJsonEncode([
                "success" => true,
                "categories" => $categories,
                "categoryDetails" => $categoryDetails
            ]);
        } else {
            // 기존 방식: music 테이블에서 가져오기
            $sql = "SELECT DISTINCT category FROM music WHERE category IS NOT NULL AND category != '' ORDER BY category ASC";
            $result = $conn->query($sql);
            $categories = [];

            if ($result) {
                while ($row = $result->fetch_assoc()) {
                    $categories[] = $row['category'];
                }
            }

            echo safeJsonEncode(["success" => true, "categories" => $categories]);
        }
        break;

    case 'addCategory':
        // 관리자 권한 확인 (필요시 추가)
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $categoryName = trim($input['categoryName'] ?? '');

        if (empty($categoryName)) {
            echo safeJsonEncode(["success" => false, "message" => "카테고리명을 입력해주세요."]);
            break;
        }

        // categories 테이블이 있는지 확인
        $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");

        if ($table_exists && $table_exists->num_rows > 0) {
            // categories 테이블에 추가
            $stmt_insert = $conn->prepare("INSERT INTO categories (name) VALUES (?)");
            $stmt_insert->bind_param("s", $categoryName);

            if ($stmt_insert->execute()) {
                $stmt_insert->close();
                echo safeJsonEncode(["success" => true, "message" => "카테고리가 추가되었습니다.", "categoryName" => $categoryName]);
            } else {
                if ($conn->errno == 1062) { // Duplicate entry error
                    echo safeJsonEncode(["success" => false, "message" => "이미 존재하는 카테고리입니다."]);
                } else {
                    echo safeJsonEncode(["success" => false, "message" => "카테고리 추가 실패: " . $stmt_insert->error]);
                }
                $stmt_insert->close();
            }
        } else {
            // categories 테이블이 없으면 안내 메시지
            echo safeJsonEncode([
                "success" => false,
                "message" => "카테고리 테이블이 생성되지 않았습니다. create_categories_table.php를 실행해주세요.",
                "needSetup" => true
            ]);
        }
        break;

    case 'updateCategoryClassification':
        // 카테고리의 분류만 업데이트 (카테고리명은 유지)
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $categoryName = trim($input['categoryName'] ?? '');
        $classification = trim($input['classification'] ?? '');

        if (empty($categoryName)) {
            echo safeJsonEncode(["success" => false, "message" => "카테고리명을 입력해주세요."]);
            break;
        }

        // 유효한 분류인지 확인
        $validClassifications = ['인물', '패션', '화보', '시네마틱'];
        if (!empty($classification) && !in_array($classification, $validClassifications)) {
            echo safeJsonEncode(["success" => false, "message" => "유효하지 않은 분류입니다."]);
            break;
        }

        $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");
        if ($table_exists && $table_exists->num_rows > 0) {
            $stmt = $conn->prepare("UPDATE categories SET classification = ? WHERE name = ?");
            $classificationValue = empty($classification) ? null : $classification;
            $stmt->bind_param("ss", $classificationValue, $categoryName);

            if ($stmt->execute()) {
                $stmt->close();
                echo safeJsonEncode([
                    "success" => true,
                    "message" => "'{$categoryName}' 카테고리의 분류가 '{$classification}'(으)로 변경되었습니다.",
                    "categoryName" => $categoryName,
                    "classification" => $classification
                ]);
            } else {
                echo safeJsonEncode(["success" => false, "message" => "분류 업데이트 실패: " . $stmt->error]);
                $stmt->close();
            }
        } else {
            echo safeJsonEncode(["success" => false, "message" => "카테고리 테이블이 존재하지 않습니다."]);
        }
        break;

    case 'updateCategory':
        // 관리자 권한 확인
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $oldCategoryName = trim($input['oldCategoryName'] ?? '');
        $newCategoryName = trim($input['newCategoryName'] ?? '');
        $classification = trim($input['classification'] ?? '');

        if (empty($oldCategoryName) || empty($newCategoryName)) {
            echo safeJsonEncode(["success" => false, "message" => "카테고리명을 입력해주세요."]);
            break;
        }

        // 유효한 분류인지 확인
        $validClassifications = ['인물', '패션', '화보', '시네마틱'];
        if (!empty($classification) && !in_array($classification, $validClassifications)) {
            echo safeJsonEncode(["success" => false, "message" => "유효하지 않은 분류입니다."]);
            break;
        }

        $conn->begin_transaction();
        try {
            // categories 테이블이 있으면 업데이트
            $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");
            if ($table_exists && $table_exists->num_rows > 0) {
                $classificationValue = empty($classification) ? null : $classification;
                $stmt_cat = $conn->prepare("UPDATE categories SET name = ?, classification = ? WHERE name = ?");
                $stmt_cat->bind_param("sss", $newCategoryName, $classificationValue, $oldCategoryName);
                $stmt_cat->execute();
                $stmt_cat->close();
            }

            // 해당 카테고리를 사용하는 모든 음악의 카테고리명 변경 (이름이 바뀐 경우에만)
            if ($oldCategoryName !== $newCategoryName) {
                $stmt_update = $conn->prepare("UPDATE music SET category = ? WHERE category = ?");
                $stmt_update->bind_param("ss", $newCategoryName, $oldCategoryName);
                $stmt_update->execute();
                $affected = $stmt_update->affected_rows;
                $stmt_update->close();
            } else {
                $affected = 0;
            }

            $conn->commit();

            $message = "카테고리가 수정되었습니다.";
            if ($affected > 0) {
                $message .= " ({$affected}개 항목 업데이트)";
            }

            echo safeJsonEncode([
                "success" => true,
                "message" => $message,
                "oldCategoryName" => $oldCategoryName,
                "newCategoryName" => $newCategoryName,
                "classification" => $classification
            ]);
        } catch (Exception $e) {
            $conn->rollback();
            echo safeJsonEncode(["success" => false, "message" => "카테고리 수정 실패: " . $e->getMessage()]);
        }
        break;

    case 'deleteCategory':
        // 관리자 권한 확인
        if (!isset($_SESSION['loggedin']) || $_SESSION['loggedin'] !== true) {
            echo safeJsonEncode(["success" => false, "message" => "로그인이 필요합니다."]);
            break;
        }

        $categoryName = trim($input['categoryName'] ?? '');

        if (empty($categoryName)) {
            echo safeJsonEncode(["success" => false, "message" => "카테고리명을 입력해주세요."]);
            break;
        }

        $conn->begin_transaction();
        try {
            // categories 테이블이 있으면 삭제
            $table_exists = $conn->query("SHOW TABLES LIKE 'categories'");
            if ($table_exists && $table_exists->num_rows > 0) {
                $stmt_cat = $conn->prepare("DELETE FROM categories WHERE name = ?");
                $stmt_cat->bind_param("s", $categoryName);
                $stmt_cat->execute();
                $stmt_cat->close();
            }

            // 해당 카테고리를 사용하는 음악들의 카테고리를 빈 문자열로 설정
            $stmt_delete = $conn->prepare("UPDATE music SET category = '' WHERE category = ?");
            $stmt_delete->bind_param("s", $categoryName);
            $stmt_delete->execute();
            $affected = $stmt_delete->affected_rows;
            $stmt_delete->close();

            $conn->commit();
            echo safeJsonEncode(["success" => true, "message" => "카테고리가 삭제되었습니다. ({$affected}개 항목의 카테고리 제거)", "categoryName" => $categoryName]);
        } catch (Exception $e) {
            $conn->rollback();
            echo safeJsonEncode(["success" => false, "message" => "카테고리 삭제 실패: " . $e->getMessage()]);
        }
        break;

    default:
        echo safeJsonEncode(["success" => false, "message" => "알 수 없는 요청입니다."]);
        break;
}

} catch (Exception $e) {
    error_log("API Error: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
    echo safeJsonEncode(["success" => false, "message" => "서버 오류가 발생했습니다: " . $e->getMessage()]);
} catch (Error $e) {
    error_log("PHP Fatal Error: " . $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine());
    echo safeJsonEncode(["success" => false, "message" => "서버 내부 오류가 발생했습니다: " . $e->getMessage() . " (파일: " . $e->getFile() . ", 줄: " . $e->getLine() . ")"]);
}

if (isset($conn) && $conn) {
    $conn->close();
}

?>