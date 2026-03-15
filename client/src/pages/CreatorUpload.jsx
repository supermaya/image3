import { useState } from 'react';
import useUserStore from '../store/userStore';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function CreatorUpload() {
    const { role, user, loading: authLoading } = useUserStore();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        artist: '',
        category: 'pop',
        classification: 'general',
    });

    const [audioFile, setAudioFile] = useState(null);
    const [imageFile, setImageFile] = useState(null);

    // Firebase 인증 초기화 대기
    if (authLoading) {
        return <div className="flex h-screen items-center justify-center text-gray-500">로딩 중...</div>;
    }

    // 로그인하지 않은 경우에만 리다이렉트 (역할 무관 - 로그인만 하면 접근 가능)
    if (!user) {
        return <Navigate to="/" replace />;
    }

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!audioFile) {
            alert('오디오 파일을 선택해주세요.');
            return;
        }

        setLoading(true);
        try {
            const storage = getStorage();

            // Upload Audio
            const audioFileName = `music/${Date.now()}_${audioFile.name}`;
            const audioRef = ref(storage, audioFileName);
            await uploadBytes(audioRef, audioFile);
            const audioUrl = await getDownloadURL(audioRef);

            // Upload Image (optional but recommended)
            let imageUrl = null;
            if (imageFile) {
                const imageFileName = `covers/${Date.now()}_${imageFile.name}`;
                const imageRef = ref(storage, imageFileName);
                await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(imageRef);
            }

            // Save to Firestore
            const newDoc = {
                title: formData.title,
                artist: formData.artist,
                category: formData.category,
                classification: formData.classification,
                audioUrl,
                imageUrl,
                uploaderId: user.uid,
                uploadedByEmail: user.email,
                createdAt: serverTimestamp(),
                playCount: 0,
                likeCount: 0,
                recommended: formData.classification === 'featured'
            };

            await addDoc(collection(db, 'music'), newDoc);
            alert('성공적으로 업로드되었습니다!');
            navigate('/creator');

        } catch (error) {
            console.error('Upload Error:', error);
            alert('업로드 실패: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-700 text-white p-6 shadow-md">
                <div className="max-w-3xl mx-auto flex justify-between items-center z-50">
                    <div>
                        <h1 className="text-2xl font-bold">새 음악 업로드</h1>
                    </div>
                    <Link to="/creator" className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-bold transition z-10">
                        돌아가기
                    </Link>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-4 md:p-6 mt-6">
                <form onSubmit={handleUpload} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">제목 *</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                                placeholder="예: Midnight City"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">아티스트 *</label>
                            <input
                                type="text"
                                required
                                value={formData.artist}
                                onChange={e => setFormData({ ...formData, artist: e.target.value })}
                                className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                                placeholder="예: M83"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">카테고리</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                            >
                                <option value="pop">팝</option>
                                <option value="rock">록</option>
                                <option value="jazz">재즈</option>
                                <option value="classical">클래식</option>
                                <option value="hiphop">힙합</option>
                                <option value="electronic">일렉트로닉</option>
                                <option value="rnb">R&B</option>
                                <option value="other">기타</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">분류</label>
                            <select
                                value={formData.classification}
                                onChange={e => setFormData({ ...formData, classification: e.target.value })}
                                className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                            >
                                <option value="general">일반</option>
                                <option value="featured">추천</option>
                                <option value="new">신곡</option>
                                <option value="popular">인기</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">오디오 파일 (MP3, WAV 등) *</label>
                        <input
                            type="file"
                            accept="audio/*"
                            required
                            onChange={e => setAudioFile(e.target.files[0])}
                            className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-500 transition cursor-pointer"
                        />
                        {audioFile && <p className="text-sm text-green-600 mt-2 font-medium">✓ 선택됨: {audioFile.name}</p>}
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">앨범 커버 이미지 (선택사항)</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={e => setImageFile(e.target.files[0])}
                            className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-500 transition cursor-pointer"
                        />
                        {imageFile && <p className="text-sm text-green-600 mt-2 font-medium">✓ 선택됨: {imageFile.name}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full text-white font-bold py-4 rounded-xl mt-6 transition text-lg ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'}`}
                    >
                        {loading ? '업로드 중...' : '업로드 완료하기'}
                    </button>
                </form>
            </div>
        </div>
    );
}
