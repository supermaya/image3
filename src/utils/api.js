// API 호출 유틸리티
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

// 로컬 스토리지에서 토큰 가져오기
const getToken = () => {
  return localStorage.getItem('authToken');
};

// 토큰 저장
export const saveToken = (token) => {
  localStorage.setItem('authToken', token);
};

// 토큰 삭제
export const removeToken = () => {
  localStorage.removeItem('authToken');
};

// 기본 fetch 래퍼
const fetchWithAuth = async (url, options = {}) => {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  }

  return data;
};

// FormData용 fetch 래퍼 (파일 업로드용)
const fetchWithAuthFormData = async (url, formData, onProgress) => {
  const token = getToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // 진행률 이벤트 리스너
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error('응답 파싱 오류'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.message || '요청 실패'));
        } catch (e) {
          reject(new Error('요청 실패'));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('네트워크 오류'));
    });

    xhr.open('POST', `${API_BASE_URL}${url}`);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.send(formData);
  });
};

// ============= 인증 관련 API =============

// 회원가입
export const signup = async (email, password, role = 'user') => {
  const data = await fetchWithAuth('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, role })
  });

  // 토큰 저장
  if (data.success && data.data.token) {
    saveToken(data.data.token);
  }

  return data;
};

// 로그인
export const login = async (email, password) => {
  const data = await fetchWithAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  // 토큰 저장
  if (data.success && data.data.token) {
    saveToken(data.data.token);
  }

  return data;
};

// 로그아웃
export const logout = async () => {
  try {
    await fetchWithAuth('/auth/logout', {
      method: 'POST'
    });
  } finally {
    removeToken();
  }
};

// 로그인 상태 확인
export const checkLoginStatus = async () => {
  return await fetchWithAuth('/auth/status', {
    method: 'GET'
  });
};

// ============= 포인트 관련 API =============

// 포인트 조회
export const getPoints = async () => {
  return await fetchWithAuth('/points', {
    method: 'GET'
  });
};

// 일일 보너스 수령
export const claimDailyBonus = async () => {
  return await fetchWithAuth('/points/daily-bonus', {
    method: 'POST'
  });
};

// 포인트 사용
export const usePoints = async (amount = 17, reason = '갤러리 접근') => {
  return await fetchWithAuth('/points/use', {
    method: 'POST',
    body: JSON.stringify({ amount, reason })
  });
};

// 포인트 거래 내역 조회
export const getPointTransactions = async (limitCount = 50) => {
  return await fetchWithAuth(`/points/transactions?limitCount=${limitCount}`, {
    method: 'GET'
  });
};

// 포인트 추가 (관리자 전용)
export const addPoints = async (userId, amount, reason) => {
  return await fetchWithAuth('/points/add', {
    method: 'POST',
    body: JSON.stringify({ userId, amount, reason })
  });
};

// ============= 음악 관련 API =============

// 음악 목록 조회
export const getMusicList = async (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.category) params.append('category', filters.category);
  if (filters.classification) params.append('classification', filters.classification);
  if (filters.searchTerm) params.append('searchTerm', filters.searchTerm);
  if (filters.limitCount) params.append('limitCount', filters.limitCount);
  if (filters.orderField) params.append('orderField', filters.orderField);
  if (filters.orderDirection) params.append('orderDirection', filters.orderDirection);

  const queryString = params.toString();
  return await fetchWithAuth(`/music${queryString ? '?' + queryString : ''}`, {
    method: 'GET'
  });
};

// 특정 음악 조회
export const getMusic = async (musicId) => {
  return await fetchWithAuth(`/music/${musicId}`, {
    method: 'GET'
  });
};

// 음악 업로드
export const uploadMusic = async (musicData) => {
  return await fetchWithAuth('/music', {
    method: 'POST',
    body: JSON.stringify(musicData)
  });
};

// 음악 수정
export const updateMusic = async (musicId, musicData) => {
  return await fetchWithAuth(`/music/${musicId}`, {
    method: 'PUT',
    body: JSON.stringify(musicData)
  });
};

// 음악 삭제
export const deleteMusic = async (musicId) => {
  return await fetchWithAuth(`/music/${musicId}`, {
    method: 'DELETE'
  });
};

// 저장된 음악 목록 조회
export const getSavedMusic = async () => {
  return await fetchWithAuth('/music/saved/list', {
    method: 'GET'
  });
};

// 음악 저장
export const saveMusic = async (musicId) => {
  return await fetchWithAuth(`/music/saved/${musicId}`, {
    method: 'POST'
  });
};

// 저장된 음악 삭제
export const deleteSavedMusic = async (musicId) => {
  return await fetchWithAuth(`/music/saved/${musicId}`, {
    method: 'DELETE'
  });
};

// ============= 사용자 관련 API =============

// 프로필 조회
export const getUserProfile = async () => {
  return await fetchWithAuth('/user/profile', {
    method: 'GET'
  });
};

// 프로필 업데이트
export const updateUserProfile = async (profileData) => {
  return await fetchWithAuth('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData)
  });
};

// ============= 파일 업로드 관련 API =============

// 이미지 업로드
export const uploadImage = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('image', file);

  return await fetchWithAuthFormData('/upload/image', formData, onProgress);
};

// 오디오 업로드
export const uploadAudio = async (file, metadata = {}, onProgress) => {
  const formData = new FormData();
  formData.append('audio', file);

  // 메타데이터 추가
  if (metadata.title) formData.append('title', metadata.title);
  if (metadata.artist) formData.append('artist', metadata.artist);
  if (metadata.duration) formData.append('duration', metadata.duration);

  return await fetchWithAuthFormData('/upload/audio', formData, onProgress);
};

// 다중 이미지 업로드
export const uploadImages = async (files, onProgress) => {
  const formData = new FormData();

  // 여러 파일 추가
  Array.from(files).forEach(file => {
    formData.append('images', file);
  });

  return await fetchWithAuthFormData('/upload/images', formData, onProgress);
};

// 파일 삭제
export const deleteFile = async (filePath) => {
  return await fetchWithAuth('/upload/file', {
    method: 'DELETE',
    body: JSON.stringify({ filePath })
  });
};

export default {
  // Auth
  signup,
  login,
  logout,
  checkLoginStatus,
  // Points
  getPoints,
  claimDailyBonus,
  usePoints,
  getPointTransactions,
  addPoints,
  // Music
  getMusicList,
  getMusic,
  uploadMusic,
  updateMusic,
  deleteMusic,
  getSavedMusic,
  saveMusic,
  deleteSavedMusic,
  // User
  getUserProfile,
  updateUserProfile,
  // Upload
  uploadImage,
  uploadAudio,
  uploadImages,
  deleteFile
};
