import { useState, useEffect } from 'react';
import useUserStore from '../store/userStore';
import { Navigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function Creator() {
    const { role, user, loading: authLoading } = useUserStore();
    const [musicList, setMusicList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modals state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingMusic, setEditingMusic] = useState(null);

    useEffect(() => {
        if (!user || (role !== 'creator' && role !== 'admin')) return;
        loadMusicList();
    }, [user, role]);

    const loadMusicList = async () => {
        setLoading(true);
        try {
            let q;
            if (role === 'admin') {
                q = query(collection(db, 'music'), orderBy('createdAt', 'desc'));
            } else {
                q = query(collection(db, 'music'), where('uploaderId', '==', user.uid), orderBy('createdAt', 'desc'));
            }

            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMusicList(list);
        } catch (error) {
            console.error('Error loading music list:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, title) => {
        if (!window.confirm(`"${title}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        try {
            await deleteDoc(doc(db, 'music', id));
            setMusicList(prev => prev.filter(m => m.id !== id));
            alert('음악이 삭제되었습니다.');
        } catch (error) {
            console.error('Delete error:', error);
            alert('삭제 실패: ' + error.message);
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const musicRef = doc(db, 'music', editingMusic.id);
            await updateDoc(musicRef, editingMusic);
            setEditModalOpen(false);
            loadMusicList();
            alert('음악 정보가 수정되었습니다.');
        } catch (error) {
            console.error('Edit error:', error);
            alert('수정 실패: ' + error.message);
        }
    };

    // Firebase 인증 초기화 대기
    if (authLoading) {
        return <div className="flex h-screen items-center justify-center text-gray-500">로딩 중...</div>;
    }

    if (!user || (role !== 'creator' && role !== 'admin')) {
        return <Navigate to="/" replace />;
    }

    const filteredList = musicList.filter(m =>
        (m.title && m.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.artist && m.artist.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const totalPlays = musicList.reduce((sum, item) => sum + (item.playCount || 0), 0);
    const totalLikes = musicList.reduce((sum, item) => sum + (item.likeCount || 0), 0);

    return (
        <div className="bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-700 text-white p-6 shadow-md">
                <div className="max-w-6xl mx-auto flex justify-between items-center z-50">
                    <div>
                        <h1 className="text-2xl font-bold">🎵 음악 관리</h1>
                        <p className="opacity-90 mt-1 text-sm">{user.email}</p>
                    </div>
                    <div className="flex gap-3 relative z-10">
                        <Link to="/upload" className="bg-white text-indigo-600 px-4 py-2 flex rounded-lg font-bold shadow-sm hover:-translate-y-0.5 transition-transform z-10">
                            + 새 음악 업로드
                        </Link>
                        <Link to="/" className="bg-white/20 hover:bg-white/30 text-white px-4 flex py-2 rounded-lg font-bold transition z-10">
                            메인으로
                        </Link>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto p-4 md:p-6 mt-6">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-gray-500 text-sm font-semibold mb-2">총 음악</h3>
                        <div className="text-3xl font-bold text-indigo-600">{musicList.length}</div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-gray-500 text-sm font-semibold mb-2">총 재생</h3>
                        <div className="text-3xl font-bold text-indigo-600">{totalPlays.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-gray-500 text-sm font-semibold mb-2">총 좋아요</h3>
                        <div className="text-3xl font-bold text-indigo-600">{totalLikes.toLocaleString()}</div>
                    </div>
                </div>

                {/* Search */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                    <input
                        type="text"
                        placeholder="🔍 음악 제목 또는 아티스트 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-3 border-2 border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition"
                    />
                </div>

                {/* List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="text-center p-12 text-gray-500 animate-pulse">데이터를 불러오는 중...</div>
                    ) : filteredList.length === 0 ? (
                        <div className="text-center p-16 text-gray-400">
                            <div className="text-6xl mb-4">🎵</div>
                            <p>아직 업로드한 음악이 없거나 검색 결과가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredList.map((music) => (
                                <div key={music.id} className="grid grid-cols-[80px_1fr_auto] gap-4 p-4 items-center hover:bg-gray-50 transition">
                                    <img
                                        src={music.imageUrl || 'https://via.placeholder.com/80?text=No+Image'}
                                        alt={music.title}
                                        className="w-20 h-20 rounded-lg object-cover bg-gray-200"
                                    />
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-lg">{music.title}</h4>
                                        <p className="text-gray-600 text-sm mb-2">{music.artist}</p>
                                        <div className="flex gap-3 text-xs text-gray-500">
                                            <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">{music.category || '기타'}</span>
                                            {music.recommended && <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-medium">추천</span>}
                                            <span className="flex items-center">재생 {music.playCount || 0}</span>
                                            <span className="flex items-center">좋아요 {music.likeCount || 0}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setEditingMusic(music); setEditModalOpen(true); }}
                                            className="w-10 h-10 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white flex items-center justify-center transition"
                                            title="수정"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={() => handleDelete(music.id, music.title)}
                                            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition"
                                            title="삭제"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editModalOpen && editingMusic && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">음악 정보 수정</h2>
                            <button onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-black text-3xl leading-none">&times;</button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">제목</label>
                                <input
                                    type="text"
                                    value={editingMusic.title || ''}
                                    onChange={e => setEditingMusic({ ...editingMusic, title: e.target.value })}
                                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">아티스트</label>
                                <input
                                    type="text"
                                    value={editingMusic.artist || ''}
                                    onChange={e => setEditingMusic({ ...editingMusic, artist: e.target.value })}
                                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">카테고리</label>
                                <select
                                    value={editingMusic.category || 'other'}
                                    onChange={e => setEditingMusic({ ...editingMusic, category: e.target.value })}
                                    className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-indigo-500"
                                >
                                    <option value="pop">팝</option>
                                    <option value="rock">록</option>
                                    <option value="jazz">재즈</option>
                                    <option value="other">기타</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl mt-4 transition">
                                저장하기
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
