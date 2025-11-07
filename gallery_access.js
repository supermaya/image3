// API 유틸리티 임포트
import { getPoints, usePoints, getUserProfile } from './src/utils/api.js';

// 갤러리 접근 포인트 차감 함수
async function checkAndDeductPoints() {
    try {
        // 사용자 프로필 확인 (크리에이터 여부 체크)
        const profileData = await getUserProfile();

        if (!profileData.success) {
            alert('사용자 정보를 가져올 수 없습니다: ' + profileData.message);
            return false;
        }

        const userRole = profileData.data.role;

        // 크리에이터 또는 관리자는 포인트 차감 없이 갤러리 접근 가능
        if (userRole === 'creator' || userRole === 'admin') {
            console.log('크리에이터/관리자 - 포인트 차감 없이 갤러리 접근');
            return true;
        }

        // 일반 사용자는 포인트 차감 필요
        // 먼저 현재 포인트 상황을 확인
        const pointsData = await getPoints();

        if (!pointsData.success) {
            alert('포인트 정보를 가져올 수 없습니다: ' + pointsData.message);
            return false;
        }

        const totalPoints = pointsData.data.totalPoints;
        const requiredPoints = 17;

        if (totalPoints < requiredPoints) {
            alert(`포인트가 부족합니다. 필요: ${requiredPoints}P, 보유: ${totalPoints}P`);
            return false;
        }

        // 포인트 차감 요청
        const deductData = await usePoints(requiredPoints, '갤러리 접근');

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
                const { checkLoginStatus } = await import('./src/utils/api.js');
                const loginData = await checkLoginStatus();

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
        const data = await getPoints();

        if (data.success) {
            // 포인트 표시 요소 업데이트
            const pointsElements = document.querySelectorAll('.points-display, #points-display, .user-points');
            pointsElements.forEach(element => {
                element.textContent = `포인트: ${data.data.totalPoints}P`;
            });

            // 일일 보너스 상태 표시
            const bonusElements = document.querySelectorAll('.daily-bonus-status, #daily-bonus-status');
            bonusElements.forEach(element => {
                if (data.data.dailyBonusClaimed) {
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