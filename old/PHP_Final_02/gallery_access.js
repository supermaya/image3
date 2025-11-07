// 갤러리 접근 포인트 차감 함수
async function checkAndDeductPoints() {
    try {
        // 먼저 현재 포인트 상황을 확인
        const pointsResponse = await fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_points'
            })
        });

        const pointsData = await pointsResponse.json();

        if (!pointsData.success) {
            alert('포인트 정보를 가져올 수 없습니다: ' + pointsData.message);
            return false;
        }

        const totalPoints = pointsData.totalPoints;
        const requiredPoints = 17;

        if (totalPoints < requiredPoints) {
            alert(`포인트가 부족합니다. 필요: ${requiredPoints}P, 보유: ${totalPoints}P`);
            return false;
        }

        // 포인트 차감 요청
        const deductResponse = await fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'use_point'
            })
        });

        const deductData = await deductResponse.json();

        if (deductData.success) {
            console.log('포인트 차감 성공:', deductData.message);
            return true;
        } else {
            alert('포인트 차감 실패: ' + deductData.message);
            return false;
        }

    } catch (error) {
        console.error('갤러리 접근 오류:', error);
        alert('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        return false;
    }
}

// 갤러리 버튼 클릭 이벤트
document.addEventListener('DOMContentLoaded', function() {
    const galleryButton = document.querySelector('[onclick*="gallery"], #galleryButton, .gallery-button');

    if (galleryButton) {
        // 기존 onclick 이벤트 제거
        galleryButton.removeAttribute('onclick');

        galleryButton.addEventListener('click', async function(e) {
            e.preventDefault();

            // 로그인 상태 확인
            try {
                const loginCheckResponse = await fetch('api.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'checkLoginStatus'
                    })
                });

                const loginData = await loginCheckResponse.json();

                if (!loginData.success) {
                    alert('로그인이 필요합니다.');
                    return;
                }

                // 포인트 차감 확인
                const pointsDeducted = await checkAndDeductPoints();

                if (pointsDeducted) {
                    // 갤러리 페이지로 이동
                    window.location.href = 'gallery.html';
                }
            } catch (error) {
                console.error('로그인 상태 확인 오류:', error);
                alert('서버 오류가 발생했습니다.');
            }
        });
    }
});

// 포인트 표시 업데이트 함수
async function updatePointsDisplay() {
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_points'
            })
        });

        const data = await response.json();

        if (data.success) {
            // 포인트 표시 요소 업데이트
            const pointsElements = document.querySelectorAll('.points-display, #points-display, .user-points');
            pointsElements.forEach(element => {
                element.textContent = `포인트: ${data.totalPoints}P`;
            });

            // 일일 보너스 상태 표시
            const bonusElements = document.querySelectorAll('.daily-bonus-status, #daily-bonus-status');
            bonusElements.forEach(element => {
                if (data.dailyBonusClaimed) {
                    element.textContent = '일일 보너스: 수령 완료';
                    element.style.color = '#666';
                } else {
                    element.textContent = '일일 보너스: 미수령 (60P)';
                    element.style.color = '#007bff';
                }
            });
        }
    } catch (error) {
        console.error('포인트 표시 업데이트 오류:', error);
    }
}

// 페이지 로드 시 포인트 표시 업데이트
document.addEventListener('DOMContentLoaded', updatePointsDisplay);