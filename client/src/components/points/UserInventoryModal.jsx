import { useEffect, useRef, useState } from 'react';

import { doc, getDoc, deleteDoc, collection, getDocs, query, orderBy, limit, where, updateDoc, increment, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import useUserStore from '../../store/userStore';
import usePointsStore from '../../store/pointsStore';
import useUserMusicStore from '../../store/userMusicStore';
import { getTransactionHistory, redeemImageForPoints, deductPointsForGalleryCreate, GALLERY_CREATE_COST, GALLERY_CREATE_FREE_LIMIT } from '../../services/points';
import { logoutUser } from '../../services/auth';
import { createUserMusicGallery } from '../../services/comfyService';

// ─── UserMp3 폴더 동기화 (Vite import.meta.glob) ─────────────────────────────
const _mp3Modules = import.meta.glob('/src/assets/UserMp3/*.mp3', { eager: true, query: '?url', import: 'default' });
const MUSIC_LIST = Object.entries(_mp3Modules).map(([path, url]) => ({
    name: path.split('/').pop().replace(/\.mp3$/i, ''),
    url: String(url),
}));


export default function UserInventoryModal({ onClose, asPanel = false }) {
    const { user, role } = useUserStore();
    const { dailyPoints, walletBalance, applyAddition } = usePointsStore();

    const [userData, setUserData] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [myGallery, setMyGallery] = useState([]);
    const [tab, setTab] = useState('overview');
    const [slideInterval, setSlideInterval] = useState(
        () => Number(localStorage.getItem('slideInterval') || 5000)
    );
    const [loading, setLoading] = useState(true);
    const [userGalleries, setUserGalleries] = useState([]);
    const [galleryImages, setGalleryImages] = useState({});

    useEffect(() => {
        if (!user) return;
        loadData();
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            // ─ 모든 독립 쿼리를 병렬 실행 (순차→병렬: ~80% 시간 단축) ─
            const [userSnap, hist, galSnap, imgSnap, catSnap, musicSnap] = await Promise.all([
                getDoc(doc(db, 'users', user.uid)).catch(() => null),
                getTransactionHistory(user.uid, 30).catch(() => []),
                getDocs(query(collection(db, 'users', user.uid, 'userGalleries'), orderBy('createdAt', 'asc'))).catch(() => null),
                getDocs(query(collection(db, 'users', user.uid, 'galleries'), orderBy('createdAt', 'desc'))).catch(() => null),
                getDocs(query(collection(db, 'categories'), where('name', '==', 'UserGen'))).catch(() => null),
                getDocs(query(collection(db, 'music'), where('uploaderId', '==', user.uid))).catch(() => null),
            ]);

            // 결과 처리
            if (userSnap?.exists()) setUserData(userSnap.data());
            setTransactions(hist);

            const gals = galSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
            const categoryId = catSnap?.docs[0]?.id || null;
            const myMusicDocs = (musicSnap?.docs || [])
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.isUserGenerated);

            // 이미지 그룹화
            const allImages = imgSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
            const grouped = {};
            allImages.forEach(img => {
                const gid = img.galleryId || '__none__';
                if (!grouped[gid]) grouped[gid] = [];
                grouped[gid].push(img);
            });

            // 쓰레기 기본 갤러리명 감지 (동기 처리 - updateDoc은 백그라운드)
            const displayName = user.displayName || user.email?.split('@')[0] || '';
            if (displayName) {
                const isJunkName = (name) => {
                    if (!name) return true;
                    if (/^[_\d]+$/.test(name)) return true;
                    if (/^[A-Za-z0-9]{20,}$/.test(name)) return true;
                    return false;
                };
                gals.forEach(gal => {
                    if (gal.isDefault && isJunkName(gal.name)) {
                        gal.name = displayName;
                        updateDoc(doc(db, 'users', user.uid, 'userGalleries', gal.id), { name: displayName }).catch(() => {});
                    }
                });
            }

            // ── UI 즉시 표시 (reads 완료 시점에 loading 종료) ──
            setUserGalleries(gals);
            setGalleryImages(grouped);
            setLoading(false); // ← 여기서 스피너 종료 (sync 기다리지 않음)

            // ── 백그라운드 동기화 (UI 차단 없음) ──
            if (categoryId) {
                setTimeout(async () => {
                    try {
                        const usedMusicIds = new Set();

                        // music/{id}/images 서브컬렉션 재작성 (imageCount 변경 시에만)
                        const syncMusicImages = async (musicDocId, galImages, oldImageCount) => {
                            // 이미지 수가 동일하면 skip
                            if (galImages.length === oldImageCount) return;
                            try {
                                const subCol = collection(db, 'music', musicDocId, 'images');
                                const oldSnap = await getDocs(subCol).catch(() => null);
                                if (oldSnap && !oldSnap.empty) {
                                    await Promise.all(oldSnap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
                                }
                                await Promise.all(galImages.map(img =>
                                    addDoc(subCol, { imageSrc: img.url, createdAt: img.createdAt || serverTimestamp() }).catch(() => {})
                                ));
                            } catch (e) {
                                console.warn('[syncMusicImages] 실패:', musicDocId, e.message);
                            }
                        };

                        await Promise.all(gals.map(async gal => {
                            const galImages = grouped[gal.id] || [];
                            const latestImageUrl = galImages[0]?.url || '';
                            const imageCount = galImages.length;
                            let resolvedMusicId = null;

                            // 5-a. musicDocId로 매칭
                            if (gal.musicDocId) {
                                const existing = myMusicDocs.find(m => m.id === gal.musicDocId);
                                if (existing) {
                                    resolvedMusicId = gal.musicDocId;
                                    usedMusicIds.add(resolvedMusicId);
                                    const needsUpdate = existing.imageUrl !== latestImageUrl ||
                                        existing.imageCount !== imageCount || existing.name !== gal.name ||
                                        existing.userGalleryId !== gal.id;
                                    if (needsUpdate) {
                                        await updateDoc(doc(db, 'music', resolvedMusicId), {
                                            name: gal.name, imageUrl: latestImageUrl, imageCount,
                                            userGalleryId: gal.id, updatedAt: serverTimestamp(),
                                        }).catch(() => {});
                                    }
                                    await syncMusicImages(resolvedMusicId, galImages, existing.imageCount);
                                }
                            }

                            // 5-b. 이름으로 매칭
                            if (!resolvedMusicId) {
                                const byName = myMusicDocs.find(m => m.name === gal.name && !usedMusicIds.has(m.id));
                                if (byName) {
                                    resolvedMusicId = byName.id;
                                    usedMusicIds.add(resolvedMusicId);
                                    gal.musicDocId = resolvedMusicId;
                                    await updateDoc(doc(db, 'users', user.uid, 'userGalleries', gal.id), { musicDocId: resolvedMusicId }).catch(() => {});
                                    await updateDoc(doc(db, 'music', resolvedMusicId), {
                                        name: gal.name, imageUrl: latestImageUrl, imageCount,
                                        userGalleryId: gal.id, updatedAt: serverTimestamp(),
                                    }).catch(() => {});
                                    await syncMusicImages(resolvedMusicId, galImages, byName.imageCount);
                                }
                            }

                            // 5-c. 신규 생성
                            if (!resolvedMusicId) {
                                try {
                                    const newDoc = await addDoc(collection(db, 'music'), {
                                        name: gal.name, category: categoryId, topSection: 'visual-mode',
                                        recommended: false, isUserGenerated: true,
                                        uploaderId: user.uid, userGalleryId: gal.id,
                                        imageUrl: latestImageUrl, imageCount, musicUrl: '',
                                        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                                    });
                                    resolvedMusicId = newDoc.id;
                                    gal.musicDocId = resolvedMusicId;
                                    usedMusicIds.add(resolvedMusicId);
                                    await updateDoc(doc(db, 'users', user.uid, 'userGalleries', gal.id), { musicDocId: resolvedMusicId }).catch(() => {});
                                    await syncMusicImages(resolvedMusicId, galImages, -1);
                                } catch (e) {
                                    console.warn('[sync] music doc 생성 실패:', gal.name, e.message);
                                }
                            }
                        }));

                        // orphan 삭제
                        const orphans = myMusicDocs.filter(m => !usedMusicIds.has(m.id));
                        await Promise.all(orphans.map(m => deleteDoc(doc(db, 'music', m.id)).catch(() => {})));
                        if (orphans.length > 0) console.log('[sync] 🗑️ orphan 삭제:', orphans.map(m => m.name));
                    } catch (e) {
                        console.warn('[bg-sync] 오류:', e.message);
                    }
                }, 0); // 백그라운드 실행
            }

        } catch (e) {
            console.error('UserInventory load error:', e);
            setLoading(false);
        }
    };





    const handleLogout = async () => {
        await logoutUser();
        onClose();
    };

    const formatDate = (val) => {
        if (!val) return '-';
        const d = val?.toDate ? val.toDate() : new Date(val);
        return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const formatDateTime = (val) => {
        if (!val) return '-';
        const d = val?.toDate ? val.toDate() : new Date(val);
        return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const roleLabel = { admin: '관리자', creator: '크리에이터', user: '일반 회원' }[role] || '일반 회원';
    const roleBadge = {
        admin: 'bg-red-100 text-red-700',
        creator: 'bg-indigo-100 text-indigo-700',
        user: 'bg-gray-100 text-gray-600',
    }[role] || 'bg-gray-100 text-gray-600';

    if (asPanel) {
        return (
            <div className="flex flex-col h-full bg-white overflow-hidden">
                {/* 프로필 헤더 */}
                <div className="bg-gradient-to-br from-slate-800 to-indigo-900 px-5 py-5 text-white shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-bold tracking-tight">My Page</h2>
                        <button onClick={onClose} className="text-white/60 hover:text-white text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 transition">
                            ← 갤러리
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="avatar" className="w-11 h-11 rounded-full ring-2 ring-white/30 object-cover" />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-indigo-500 flex items-center justify-center text-xl font-bold">
                                {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="font-bold text-sm leading-tight">{user?.displayName || '사용자'}</p>
                            <p className="text-white/60 text-xs mt-0.5">{user?.email}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge}`}>{roleLabel}</span>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="bg-white/10 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-white/60 mb-0.5">⚡ 일일 포인트</p>
                            <p className="text-xl font-black text-amber-300">{dailyPoints.toLocaleString()}P</p>
                        </div>
                        <div className="bg-white/10 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-white/60 mb-0.5">💎 지갑 포인트</p>
                            <p className="text-xl font-black text-emerald-300">{walletBalance.toLocaleString()}P</p>
                        </div>
                    </div>
                </div>

                {/* 탭 */}
                <div className="flex border-b border-gray-100 shrink-0 overflow-x-auto">
                    {[['overview', '📊 요약'], ['my-gallery', '🖼 내 갤러리'], ['history', '📋 내역'], ['settings', '⚙️ 설정']].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === key ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* 콘텐츠 */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                        </div>
                    ) : tab === 'overview' ? (
                        <OverviewTab dailyPoints={dailyPoints} walletBalance={walletBalance} userData={userData} />
                    ) : tab === 'my-gallery' ? (
                        <MyGalleryTab userGalleries={userGalleries} galleryImages={galleryImages} uid={user?.uid} onRefresh={loadData} />
                    ) : tab === 'history' ? (
                        <HistoryTab transactions={transactions} formatDateTime={formatDateTime} />
                    ) : (
                        <SettingsTab slideInterval={slideInterval} onChange={(v) => {
                            setSlideInterval(v);
                            localStorage.setItem('slideInterval', String(v));
                            window.dispatchEvent(new CustomEvent('slideIntervalChanged'));
                        }} />
                    )}
                </div>

                {/* 하단 */}
                <div className="px-4 py-3 border-t border-gray-100 shrink-0">
                    <button onClick={handleLogout} className="w-full py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-xl transition">
                        로그아웃
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                {/* 프로필 헤더 */}
                <div className="bg-gradient-to-br from-slate-800 to-indigo-900 px-6 py-6 text-white shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold tracking-tight">My Page</h2>
                        <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">&times;</button>
                    </div>
                    <div className="flex items-center gap-4">
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="avatar" className="w-14 h-14 rounded-full ring-2 ring-white/30 object-cover" />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-indigo-500 flex items-center justify-center text-2xl font-bold">
                                {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="font-bold text-base leading-tight">{user?.displayName || '사용자'}</p>
                            <p className="text-white/60 text-xs mt-0.5">{user?.email}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge}`}>{roleLabel}</span>
                                {userData?.createdAt && (
                                    <span className="text-white/40 text-[10px]">가입 {formatDate(userData.createdAt)}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                        <div className="bg-white/10 rounded-xl px-4 py-3">
                            <p className="text-[11px] text-white/60 mb-1">⚡ 일일 포인트</p>
                            <p className="text-2xl font-black text-amber-300">{dailyPoints.toLocaleString()}P</p>
                        </div>
                        <div className="bg-white/10 rounded-xl px-4 py-3">
                            <p className="text-[11px] text-white/60 mb-1">💎 지갑 포인트</p>
                            <p className="text-2xl font-black text-emerald-300">{walletBalance.toLocaleString()}P</p>
                        </div>
                    </div>
                </div>

                {/* 탭 */}
                <div className="flex border-b border-gray-100 shrink-0 overflow-x-auto">
                    {[['overview', '📊 요약'], ['my-gallery', '🖼 내 갤러리'], ['history', '📋 내역'], ['settings', '⚙️ 설정']].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === key
                                ? 'text-indigo-700 border-b-2 border-indigo-600'
                                : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* 콘텐츠 */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                        </div>
                    ) : tab === 'overview' ? (
                        <OverviewTab dailyPoints={dailyPoints} walletBalance={walletBalance} userData={userData} />
                    ) : tab === 'my-gallery' ? (
                        <MyGalleryTab
                            userGalleries={userGalleries}
                            galleryImages={galleryImages}
                            uid={user?.uid}
                            onRefresh={loadData}
                        />
                    ) : tab === 'history' ? (
                        <HistoryTab transactions={transactions} formatDateTime={formatDateTime} />
                    ) : (
                        <SettingsTab slideInterval={slideInterval} onChange={(v) => {
                            setSlideInterval(v);
                            localStorage.setItem('slideInterval', String(v));
                            window.dispatchEvent(new CustomEvent('slideIntervalChanged'));
                        }} />
                    )}
                </div>

                {/* 하단 */}
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                    <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                        닫기
                    </button>
                    <button onClick={handleLogout} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition">
                        로그아웃
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ────── 요약 탭 ────── */
function OverviewTab({ dailyPoints, walletBalance, userData }) {
    const likedCount = userData?.likedItems?.length ?? 0;
    const stats = [
        { icon: '⚡', label: '일일 포인트', value: `${dailyPoints.toLocaleString()}P`, color: 'text-amber-500', bg: 'bg-amber-50' },
        { icon: '💎', label: '지갑 포인트', value: `${walletBalance.toLocaleString()}P`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { icon: '🎯', label: '총 포인트', value: `${(dailyPoints + walletBalance).toLocaleString()}P`, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { icon: '❤️', label: '좋아요한 콘텐츠', value: `${likedCount}개`, color: 'text-rose-500', bg: 'bg-rose-50' },
    ];
    return (
        <div className="p-6">
            <div className="grid grid-cols-2 gap-3 mb-6">
                {stats.map((s) => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
                        <div className="text-2xl mb-1">{s.icon}</div>
                        <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <p className="font-semibold text-gray-700 mb-2">💡 포인트 안내</p>
                <ul className="space-y-1 text-xs text-gray-500">
                    <li>• 갤러리 1회 접근 = <span className="text-indigo-600 font-semibold">17P</span> 차감</li>
                    <li>• 일일 로그인 보너스 = <span className="text-amber-500 font-semibold">100P</span> (매일 1회)</li>
                    <li>• ⚡ 일일 포인트 먼저 소진 → 💎 지갑 포인트</li>
                </ul>
            </div>
        </div>
    );
}

/* ────── 거래내역 탭 ────── */
function HistoryTab({ transactions, formatDateTime }) {
    const typeLabel = {
        daily_bonus:    { label: '일일 보너스',   color: 'text-amber-500',   icon: '⚡' },
        gallery_access: { label: '갤러리 접근',   color: 'text-red-500',     icon: '🖼️' },
        purchase:       { label: '포인트 구매',   color: 'text-emerald-600', icon: '💳' },
        ad_reward:      { label: '광고 보상',     color: 'text-blue-500',    icon: '📺' },
        admin_grant:    { label: '관리자 지급',   color: 'text-purple-600',  icon: '🎁' },
        image_redeem:   { label: '이미지 환전',   color: 'text-amber-600',   icon: '🔄' },
    };
    if (transactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="text-5xl mb-3">📋</div>
                <p className="text-sm">거래 내역이 없습니다</p>
            </div>
        );
    }
    return (
        <div className="divide-y divide-gray-50">
            {transactions.map((tx) => {
                const meta = typeLabel[tx.type] || { label: tx.type, color: 'text-gray-600', icon: '•' };
                const isPositive = tx.amount > 0;
                return (
                    <div key={tx.id} className="flex items-center justify-between px-6 py-3.5">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">{meta.icon}</span>
                            <div>
                                <p className="text-sm font-medium text-gray-800">{tx.description || meta.label}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(tx.createdAt)}</p>
                            </div>
                        </div>
                        <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{tx.amount}P
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/* ────── 설정 탭 ────── */
function SettingsTab({ slideInterval, onChange }) {
    const options = [3, 5, 7, 9, 15, 30];
    return (
        <div className="p-6 space-y-5">
            <div>
                <p className="text-sm font-bold text-gray-700 mb-3">🖼️ 이미지 자동전환 속도</p>
                <div className="flex flex-wrap gap-2">
                    {options.map(s => (
                        <button
                            key={s}
                            onClick={() => onChange(s * 1000)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition border-2 ${
                                slideInterval === s * 1000
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-400'
                            }`}
                        >
                            {s}초
                        </button>
                    ))}
                </div>
                <p className="text-xs text-gray-400 mt-3">현재: <span className="font-semibold text-indigo-600">{slideInterval / 1000}초</span>마다 다음 이미지로 전환</p>
            </div>
        </div>
    );
}

/* ────── 내 갤러리 탭 ─ 다중 갤러리 관리 ────── */
function MyGalleryTab({ userGalleries, galleryImages, uid, onRefresh }) {
    const [selectedGalId, setSelectedGalId] = useState(userGalleries[0]?.id || null);
    const [selected, setSelected]   = useState(null);   // 라이트박스용 단건
    const [showCreate, setShowCreate] = useState(false);
    const [newGalName, setNewGalName] = useState('');
    const [renaming, setRenaming]   = useState(null);
    const [moveTarget, setMoveTarget] = useState('');
    const [busy, setBusy] = useState(false);

    const [selectMode, setSelectMode] = useState(false);
    const [checkedIds, setCheckedIds] = useState(new Set());

    // ── MP3 선택 ──
    const [showMusicPicker, setShowMusicPicker] = useState(false);
    const [createError, setCreateError] = useState('');
    const { setSelectedTrack } = useUserMusicStore();
    const { dailyPoints, walletBalance, applyDeduction } = usePointsStore();
    const totalPoints = dailyPoints + walletBalance;

    // default.mp3 URL (MUSIC_LIST에서 파일명으로 찾기)
    const defaultMp3 = MUSIC_LIST.find(m => m.name.toLowerCase() === 'default') || MUSIC_LIST[0] || null;



    /* MP3 선택 저장 */
    const handleMusicSelect = async (track) => {
        if (busy || !currentGal) return;
        setBusy(true);
        try {
            const newUrl = track ? track.url : (defaultMp3?.url || '');
            // userGalleries 문서 업데이트
            await updateDoc(doc(db, 'users', uid, 'userGalleries', currentGal.id), { musicUrl: newUrl });
            // 연결된 music doc musicUrl 동기화
            if (currentGal.musicDocId) {
                await updateDoc(doc(db, 'music', currentGal.musicDocId), { musicUrl: newUrl, updatedAt: serverTimestamp() }).catch(() => {});
            }
            // 현재 재생 중인 갤러리라면 오디오 즉시 교체
            setSelectedTrack({ url: newUrl, name: track?.name || 'default' });
            setShowMusicPicker(false);
            await onRefresh();
        } finally { setBusy(false); }
    };

    useEffect(() => {
        if (!selectedGalId && userGalleries.length > 0) setSelectedGalId(userGalleries[0].id);
    }, [userGalleries]);

    // 갤러리 탭 바꿀 때 선택 초기화
    const switchGallery = (id) => {
        setSelectedGalId(id);
        setCheckedIds(new Set());
        setSelectMode(false);
        setSelected(null);
    };

    const currentImages  = galleryImages[selectedGalId] || [];
    const otherGalleries = userGalleries.filter(g => g.id !== selectedGalId);
    const currentGal     = userGalleries.find(g => g.id === selectedGalId);

    // 현재 갤러리에 배정된 mp3 URL (currentGal 정의 이후)
    const currentMusicUrl = currentGal?.musicUrl || defaultMp3?.url || '';
    // 이미 다른 갤러리에서 사용 중인 musicUrl set (중복 방지)
    const usedMusicUrls = new Set(
        userGalleries.filter(g => g.id !== selectedGalId && g.musicUrl).map(g => g.musicUrl)
    );

    /* 체크박스 토글 */
    const toggleCheck = (id) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (checkedIds.size === currentImages.length) setCheckedIds(new Set());
        else setCheckedIds(new Set(currentImages.map(i => i.id)));
    };

    /* 갤러리 생성 */
    const handleCreate = async () => {
        if (!newGalName.trim() || busy) return;
        setCreateError('');

        // 무료 한도(3개) 초과 시 포인트 체크
        const needsPay = userGalleries.length >= GALLERY_CREATE_FREE_LIMIT;
        if (needsPay && totalPoints < GALLERY_CREATE_COST) {
            setCreateError(`포인트가 부족합니다. 갤러리 추가에 ${GALLERY_CREATE_COST}P가 필요합니다. (현재 ${totalPoints}P)`);
            return;
        }

        setBusy(true);
        try {
            // 4번째 이상이면 포인트 차감
            if (needsPay) {
                const result = await deductPointsForGalleryCreate(uid);
                if (!result.success) {
                    setCreateError(`포인트 차감 실패. 잔액을 확인해주세요.`);
                    return;
                }
                // Zustand UI 즉시 반영
                applyDeduction(GALLERY_CREATE_COST);
            }

            const trimmedName = newGalName.trim();
            // 1. UserGen 카테고리 music 문서 먼저 생성 (musicDocId 확보)
            const mId = await createUserMusicGallery(uid, trimmedName);
            // 2. userGalleries 서브컬렉션에 musicDocId 함께 저장
            const newRef = await addDoc(collection(db, 'users', uid, 'userGalleries'), {
                name: trimmedName, isDefault: false, imageCount: 0,
                musicDocId: mId || null,
                createdAt: serverTimestamp(),
            });
            setSelectedGalId(newRef.id);
            setNewGalName(''); setShowCreate(false);
            await onRefresh();
        } finally { setBusy(false); }
    };

    /* 이름 변경 */
    const handleRename = async () => {
        if (!renaming?.name.trim() || busy) return;
        setBusy(true);
        try {
            const newName = renaming.name.trim();
            // 1. userGalleries 이름 업데이트
            await updateDoc(doc(db, 'users', uid, 'userGalleries', renaming.id), { name: newName });
            // 2. 연결된 music doc이 있으면 이름도 동기화
            const galData = userGalleries.find(g => g.id === renaming.id);
            if (galData?.musicDocId) {
                await updateDoc(doc(db, 'music', galData.musicDocId), { name: newName, updatedAt: serverTimestamp() }).catch(() => {});
            }
            setRenaming(null);
            await onRefresh();
        } finally { setBusy(false); }
    };

    /* 갤러리 삭제 */
    const handleDelete = async (gal) => {
        const cnt = (galleryImages[gal.id] || []).length;
        if (cnt > 0) {
            alert(`"${gal.name}" 갤러리에 이미지 ${cnt}장이 남아있습니다.\n이미지를 먼저 이동하거나 삭제한 후 갤러리를 삭제해주세요.`);
            return;
        }
        if (!window.confirm(`"${gal.name}" 갤러리를 삭제하시겠습니까?`)) return;
        setBusy(true);
        try {
            // 1. userGalleries 삭제
            await deleteDoc(doc(db, 'users', uid, 'userGalleries', gal.id));
            // 2. 연결된 music doc도 삭제
            if (gal.musicDocId) {
                await deleteDoc(doc(db, 'music', gal.musicDocId)).catch(() => {});
            }
            if (selectedGalId === gal.id) setSelectedGalId(userGalleries.find(g => g.id !== gal.id)?.id || null);

            // 3. 좌측 패널(GalleryGrid) 즉시 동기화
            if (gal.musicDocId) {
                window.dispatchEvent(new CustomEvent('user-gallery-deleted', { detail: { musicDocId: gal.musicDocId } }));
            }

            await onRefresh();
        } finally { setBusy(false); }
    };


    /* 단건 이미지 이동 (라이트박스) */
    const handleMove = async (img) => {
        if (!moveTarget || moveTarget === selectedGalId || busy) return;
        setBusy(true);
        try {
            await updateDoc(doc(db, 'users', uid, 'galleries', img.id), { galleryId: moveTarget });
            await updateDoc(doc(db, 'users', uid, 'userGalleries', selectedGalId), { imageCount: increment(-1) }).catch(() => {});
            await updateDoc(doc(db, 'users', uid, 'userGalleries', moveTarget), { imageCount: increment(1) }).catch(() => {});
            setSelected(null); setMoveTarget('');
            await onRefresh();
        } finally { setBusy(false); }
    };

    /* 다중 이미지 일괄 이동 */
    const handleBulkMove = async () => {
        if (!moveTarget || checkedIds.size === 0 || busy) return;
        setBusy(true);
        try {
            const ids = [...checkedIds];
            await Promise.all(ids.map(id =>
                updateDoc(doc(db, 'users', uid, 'galleries', id), { galleryId: moveTarget })
            ));
            const cnt = ids.length;
            await updateDoc(doc(db, 'users', uid, 'userGalleries', selectedGalId), { imageCount: increment(-cnt) }).catch(() => {});
            await updateDoc(doc(db, 'users', uid, 'userGalleries', moveTarget), { imageCount: increment(cnt) }).catch(() => {});
            setCheckedIds(new Set()); setMoveTarget(''); setSelectMode(false);
            await onRefresh();
        } finally { setBusy(false); }
    };

    return (
        <div className="p-3 flex flex-col gap-3">

            {/* ── 갤러리 탭 바 ── */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {userGalleries.map(gal => (
                    <div key={gal.id} className="flex items-center shrink-0 gap-0.5">
                        <button
                            onClick={() => switchGallery(gal.id)}
                            className={`px-3 py-1.5 rounded-l-lg text-xs font-semibold transition ${
                                selectedGalId === gal.id
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {gal.isDefault ? '🗂️ ' : '📂 '}{gal.name}
                            <span className="ml-1 opacity-60">({(galleryImages[gal.id] || []).length})</span>
                        </button>
                        {selectedGalId === gal.id && (
                            <div className="flex bg-indigo-100 rounded-r-lg overflow-hidden">
                                <button onClick={() => setRenaming({ id: gal.id, name: gal.name })}
                                    className="px-2 py-1.5 text-indigo-500 hover:bg-indigo-200 text-xs transition" title="이름 변경">✏️</button>
                                {!gal.isDefault && (
                                    <button onClick={() => handleDelete(gal)}
                                        className="px-2 py-1.5 text-red-400 hover:bg-red-100 text-xs transition" title="갤러리 삭제">🗑️</button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => setShowCreate(v => !v)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition">
                    + 새 갤러리
                </button>
            </div>

            {/* 갤러리 생성 폼 */}
            {showCreate && (
                <div className="flex flex-col gap-1.5">
                    {userGalleries.length >= GALLERY_CREATE_FREE_LIMIT && (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            💰 4번째 이상 갤러리는 <strong>{GALLERY_CREATE_COST}P</strong> 차감됩니다.
                            (보유: <strong>{totalPoints}P</strong>)
                        </p>
                    )}
                    {createError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">⚠️ {createError}</p>
                    )}
                    <div className="flex gap-2">
                        <input type="text" value={newGalName} onChange={e => setNewGalName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="갤러리 이름" autoFocus
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <button onClick={handleCreate} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">✓</button>
                        <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>
                    </div>
                </div>
            )}

            {/* 이름 변경 폼 */}
            {renaming && (
                <div className="flex gap-2">
                    <input type="text" value={renaming.name}
                        onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus
                        className="flex-1 border border-indigo-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <button onClick={handleRename} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">✓ 저장</button>
                    <button onClick={() => setRenaming(null)} className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>
                </div>
            )}

            {/* ── 배경음악 선택 ── */}
            {currentGal && (
                <div className="flex flex-col gap-1.5">
                    <button
                        onClick={() => setShowMusicPicker(v => !v)}
                        className={`flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                            showMusicPicker
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-400'
                        }`}
                    >
                        🎵 {currentGal.musicUrl
                            ? (MUSIC_LIST.find(m => m.url === currentGal.musicUrl)?.name || '배경음악')
                            : (defaultMp3 ? `${defaultMp3.name} (기본)` : '배경음악 없음')}
                    </button>
                    {showMusicPicker && (
                        <div className="bg-white border border-indigo-100 rounded-xl shadow-lg p-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
                            <p className="text-xs font-bold text-gray-500 mb-1">🎵 배경음악 선택 <span className="font-normal text-gray-400">(중복 배정 불가)</span></p>
                            {defaultMp3 && (
                                <button
                                    onClick={() => handleMusicSelect(null)}
                                    disabled={!currentGal.musicUrl || busy}
                                    className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                                        !currentGal.musicUrl ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                >
                                    <span>🎵</span>
                                    <span className="flex-1">{defaultMp3.name} <span className="text-gray-400">(기본)</span></span>
                                    {!currentGal.musicUrl && <span className="text-indigo-500">✓</span>}
                                </button>
                            )}
                            {MUSIC_LIST.filter(m => m.name.toLowerCase() !== 'default').map(track => {
                                const isSelected = currentGal.musicUrl === track.url;
                                const isUsed = usedMusicUrls.has(track.url);
                                return (
                                    <button
                                        key={track.url}
                                        onClick={() => !isUsed && handleMusicSelect(track)}
                                        disabled={isUsed || busy}
                                        className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                                            isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                            : isUsed ? 'opacity-40 cursor-not-allowed text-gray-400'
                                            : 'hover:bg-gray-50 text-gray-700'
                                        }`}
                                    >
                                        <span>{isUsed ? '🔒' : '🎵'}</span>
                                        <span className="flex-1">{track.name}{isUsed ? ' (다른 갤러리 사용 중)' : ''}</span>
                                        {isSelected && <span className="text-indigo-500">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 이미지 그리드 헤더 */}
            <div className="flex items-center justify-between px-1">
                <p className="text-xs text-gray-400">
                    {currentGal ? `"${currentGal.name}"` : '갤러리'} — {currentImages.length}장
                    {selectMode && checkedIds.size > 0 && <span className="ml-2 text-indigo-600 font-semibold">{checkedIds.size}개 선택</span>}
                </p>
                {currentImages.length > 0 && otherGalleries.length > 0 && (
                    <div className="flex gap-2">
                        {selectMode && (
                            <button onClick={toggleAll}
                                className="text-xs text-gray-500 hover:text-gray-700 underline">
                                {checkedIds.size === currentImages.length ? '전체 해제' : '전체 선택'}
                            </button>
                        )}
                        <button onClick={() => { setSelectMode(v => !v); setCheckedIds(new Set()); }}
                            className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition ${
                                selectMode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                            {selectMode ? '선택 취소' : '✂️ 다중 선택'}
                        </button>
                    </div>
                )}
            </div>

            {/* 이미지 그리드 */}
            {userGalleries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="text-5xl mb-3">🗂️</div>
                    <p className="text-sm">이미지를 생성하면 기본 갤러리가 자동 생성됩니다</p>
                </div>
            ) : currentImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="text-5xl mb-3">🖼️</div>
                    <p className="text-sm">이 갤러리에 이미지가 없습니다</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-1.5 pb-20">
                    {currentImages.map(img => {
                        const isChecked = checkedIds.has(img.id);
                        return (
                            <button
                                key={img.id}
                                onClick={() => {
                                    if (selectMode) { toggleCheck(img.id); }
                                    else { setSelected(img); setMoveTarget(''); }
                                }}
                                className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 transition ${
                                    isChecked
                                        ? 'ring-2 ring-indigo-500 ring-offset-1'
                                        : 'hover:opacity-90'
                                }`}
                            >
                                <img src={img.url} alt={img.prompt?.slice(0, 30) || 'AI 이미지'}
                                    className="w-full h-full object-cover" />
                                {/* 선택 모드 체크 오버레이 */}
                                {selectMode && (
                                    <div className={`absolute inset-0 flex items-start justify-end p-1.5 ${isChecked ? 'bg-indigo-600/20' : 'bg-black/10'}`}>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-300'
                                        }`}>
                                            {isChecked ? '✓' : ''}
                                        </div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── 다중 선택 시 하단 플로팅 액션바 ── */}
            {selectMode && checkedIds.size > 0 && otherGalleries.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-[55] bg-white border-t border-gray-200 shadow-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-semibold text-indigo-700 shrink-0">
                        {checkedIds.size}장 선택됨
                    </span>
                    <select
                        value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                        <option value="">📂 이동할 갤러리 선택...</option>
                        {otherGalleries.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleBulkMove}
                        disabled={!moveTarget || busy}
                        className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition"
                    >
                        {busy ? '이동 중...' : '이동'}
                    </button>
                </div>
            )}

            {/* 라이트박스 (단건) */}
            {selected && !selectMode && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setSelected(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <img src={selected.url} alt="원본" className="w-full object-cover max-h-64" />
                        <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-[11px] text-gray-400">
                                <span>{selected.workflowName || '-'}</span>
                                <span>{selected.aspectRatio || '-'}</span>
                                <span>{selected.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || '-'}</span>
                            </div>

                            {otherGalleries.length > 0 && (
                                <div className="flex gap-2">
                                    <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                        <option value="">📂 갤러리로 이동...</option>
                                        {otherGalleries.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                    <button onClick={() => handleMove(selected)} disabled={!moveTarget || busy}
                                        className="px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition">
                                        이동
                                    </button>
                                </div>
                            )}

                            <a href={selected.url} download target="_blank" rel="noreferrer"
                                className="block text-center py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition">
                                다운로드
                            </a>
                            <button onClick={() => setSelected(null)}
                                className="w-full py-2 border border-gray-200 text-sm text-gray-500 rounded-xl hover:bg-gray-50">
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



