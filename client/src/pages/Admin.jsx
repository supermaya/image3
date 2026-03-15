import { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
    collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc,
    query, orderBy, where, addDoc, writeBatch, serverTimestamp, increment
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { db, storage } from '../config/firebase';
import useUserStore from '../store/userStore';

const TOP_SECTIONS = [
    { value: 'visual-mode', label: 'Looks & Lines' },
    { value: 'momentary', label: 'MOMENTARY' },
    { value: 'chronicles', label: 'CHRONICLES' },
];
const CLASSIFICATIONS = ['', '인물', '패션', '화보', '시네마틱'];

const TABS = [
    { id: 'sections', label: '섹션 관리', icon: '👁️' },
    { id: 'categories', label: '카테고리 관리', icon: '🗂️' },
    { id: 'recommended', label: '추천 갤러리', icon: '⭐' },
    { id: 'content', label: '콘텐츠 관리', icon: '📋' },
    { id: 'users', label: '회원 관리', icon: '👥' },
    { id: 'hero', label: '히어로 슬라이드', icon: '🎬' },
    { id: 'cleanup', label: '데이터 정리', icon: '🔧' },
    { id: 'migration', label: '마이그레이션', icon: '🔄' },
];

function Spinner() { return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" /></div>; }
function Badge({ text, color = 'blue' }) {
    const cls = { blue: 'bg-blue-100 text-blue-800', yellow: 'bg-yellow-100 text-yellow-800', gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls[color] || cls.gray}`}>{text}</span>;
}

// ─── SECTIONS TAB ───────────────────────────────────────────────────────
const SECTION_CONFIG = 'config';
const SECTION_DOC = 'sections';

function SectionsTab() {
    const [hiddenSections, setHiddenSections] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            const snap = await getDoc(doc(db, SECTION_CONFIG, SECTION_DOC));
            if (snap.exists()) setHiddenSections(snap.data().hidden || []);
        })();
    }, []);

    const toggle = (value) => {
        setHiddenSections(prev =>
            prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
        );
        setSaved(false);
    };

    const save = async () => {
        setSaving(true);
        await setDoc(doc(db, SECTION_CONFIG, SECTION_DOC), { hidden: hiddenSections });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="space-y-4 max-w-md">
            <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="text-sm font-bold mb-1">최상위 셉션 표시/숨김</h3>
                <p className="text-xs text-gray-400 mb-4">헤큕 내비게이션에서 숨김 처리할 셉션을 선택하세요.</p>
                <div className="space-y-3">
                    {TOP_SECTIONS.map(sec => {
                        const isHidden = hiddenSections.includes(sec.value);
                        return (
                            <div key={sec.value} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50">
                                <div>
                                    <p className="text-sm font-semibold">{sec.label}</p>
                                    <p className="text-xs text-gray-400">{sec.value}</p>
                                </div>
                                <button
                                    onClick={() => toggle(sec.value)}
                                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                                        isHidden ? 'bg-gray-300' : 'bg-indigo-500'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                                        isHidden ? 'translate-x-0' : 'translate-x-6'
                                    }`} />
                                </button>
                                <span className={`ml-3 text-xs font-bold ${ isHidden ? 'text-gray-400' : 'text-indigo-600' }`}>
                                    {isHidden ? '숨김' : '표시'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    className={`mt-4 w-full py-2 rounded-xl text-sm font-bold transition ${
                        saved ? 'bg-green-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                >
                    {saving ? '저장 중...' : saved ? '✓ 저장됨' : '설정 저장'}
                </button>
            </div>
            <p className="text-xs text-gray-400 px-1">
                ⚠️ 주의: 셉션을 숨김해도 해당 셉션의 콘텐츠는 유지됩니다. 좁마 카테고리 관리에서는 여전히 사용할 수 있습니다.
            </p>
        </div>
    );
}

// ─── CATEGORIES TAB ──────────────────────────────────────────────────────────
function CategoriesTab() {
    const { user } = useUserStore();
    const [cats, setCats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');
    const [form, setForm] = useState({ name: '', topSection: 'visual-mode', classification: '' });
    const [editModal, setEditModal] = useState(null);
    const [confirmingId, setConfirmingId] = useState(null);
    const [errMsg, setErrMsg] = useState(''); // 인라인 오류 메시지

    const load = useCallback(async () => {
        setLoading(true);
        const snap = await getDocs(collection(db, 'categories'));
        setCats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const add = async e => {
        e.preventDefault();
        if (!form.name) return;
        await setDoc(doc(db, 'categories', form.name), {
            name: form.name, topSection: form.topSection,
            classification: form.classification || '기타',
            createdAt: new Date().toISOString(), createdBy: user.uid
        });
        setForm({ name: '', topSection: 'visual-mode', classification: '' });
        load();
    };

    const remove = async (id) => {
        setErrMsg('');
        try {
            const snap = await getDocs(query(collection(db, 'music'), where('category', '==', id)));
            if (snap.size > 0) {
                setErrMsg(`"${id}" 카테고리에 콘텐츠 ${snap.size}개가 있습니다. 콘텐츠를 먼저 이동하거나 삭제 후 시도하세요.`);
                setConfirmingId(null);
                return;
            }
            await deleteDoc(doc(db, 'categories', id));
            setConfirmingId(null);
            load();
        } catch (err) {
            console.error('[Admin] 카테고리 삭제 오류:', err);
            setErrMsg(`삭제 실패: ${err.message}`);
            setConfirmingId(null);
        }
    };

    const [renaming, setRenaming] = useState(false);

    const saveEdit = async () => {
        if (!editModal) return;
        const oldId = editModal.id;
        const newName = editModal.name.trim();
        if (!newName) return;

        const catData = {
            name: newName, topSection: editModal.topSection,
            classification: editModal.classification || '기타',
            updatedAt: new Date().toISOString()
        };

        if (newName !== oldId) {
            // 이름(ID) 변경 → 카스케이드 업데이트
            setRenaming(true);
            try {
                // 1) 새 카테고리 문서 생성
                await setDoc(doc(db, 'categories', newName), catData);

                // 2) 해당 카테고리를 참조하는 음악 문서 일괄 업데이트
                const musicSnap = await getDocs(query(collection(db, 'music'), where('category', '==', oldId)));
                const BATCH_SIZE = 499;
                let batch = writeBatch(db);
                let count = 0;
                for (const d of musicSnap.docs) {
                    batch.update(doc(db, 'music', d.id), { category: newName });
                    count++;
                    if (count % BATCH_SIZE === 0) { await batch.commit(); batch = writeBatch(db); }
                }
                if (count % BATCH_SIZE !== 0) await batch.commit();

                // 3) 구 카테고리 문서 삭제
                await deleteDoc(doc(db, 'categories', oldId));
            } finally {
                setRenaming(false);
            }
        } else {
            // 이름 동일 → topSection/classification만 업데이트
            await setDoc(doc(db, 'categories', oldId), catData, { merge: true });
        }

        setEditModal(null); load();
    };

    const displayed = filter === 'all' ? cats : cats.filter(c => c.topSection === filter);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="text-lg font-bold mb-4">✨ 새 카테고리 추가</h2>
                <form onSubmit={add} className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[160px]">
                        <label className="block text-sm font-semibold mb-1">최상위 섹션</label>
                        <select value={form.topSection} onChange={e => setForm(f => ({ ...f, topSection: e.target.value }))} className="w-full border rounded-lg p-2 text-sm">
                            {TOP_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                        <label className="block text-sm font-semibold mb-1">카테고리명</label>
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="카테고리명" required />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-sm font-semibold mb-1">분류</label>
                        <select value={form.classification} onChange={e => setForm(f => ({ ...f, classification: e.target.value }))} className="w-full border rounded-lg p-2 text-sm">
                            {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c || '미분류'}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-sm">추가</button>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-bold">카테고리 목록</h2>
                    <span className="text-sm text-gray-400">({displayed.length})</span>
                    <div className="ml-auto flex gap-2 flex-wrap">
                        {['all', ...TOP_SECTIONS.map(s => s.value)].map(v => (
                            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1 rounded-lg text-xs font-bold transition ${filter === v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {v === 'all' ? '전체' : TOP_SECTIONS.find(s => s.value === v)?.label}
                            </button>
                        ))}
                    </div>
                </div>
                {errMsg && (
                    <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-700">
                        <span className="text-red-500 mt-0.5">⚠️</span>
                        <span className="flex-1">{errMsg}</span>
                        <button onClick={() => setErrMsg('')} className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
                    </div>
                )}
                {loading ? <Spinner /> : (
                    <div className="space-y-2">
                        {displayed.length === 0 && <p className="text-center text-gray-400 py-8">카테고리가 없습니다.</p>}
                        {displayed.map(cat => (
                            <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{cat.name}</span>
                                    <Badge text={TOP_SECTIONS.find(s => s.value === cat.topSection)?.label || cat.topSection} />
                                    {cat.classification && <Badge text={cat.classification} color="green" />}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setEditModal({ id: cat.id, name: cat.name, topSection: cat.topSection || 'visual-mode', classification: cat.classification || '' })} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded">편집</button>
                                    {confirmingId === cat.id ? (
                                        <>
                                            <button onClick={() => remove(cat.id)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded">확인</button>
                                            <button onClick={() => setConfirmingId(null)} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded">취소</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setConfirmingId(cat.id)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded">삭제</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {editModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-bold mb-4">카테고리 편집</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1">최상위 섹션</label>
                                <select value={editModal.topSection} onChange={e => setEditModal(m => ({ ...m, topSection: e.target.value }))} className="w-full border rounded-lg p-2">
                                    {TOP_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">카테고리명</label>
                                <input value={editModal.name} onChange={e => setEditModal(m => ({ ...m, name: e.target.value }))} className="w-full border rounded-lg p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">분류</label>
                                <select value={editModal.classification} onChange={e => setEditModal(m => ({ ...m, classification: e.target.value }))} className="w-full border rounded-lg p-2">
                                    {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c || '미분류'}</option>)}
                                </select>
                            </div>
                        </div>
                        {editModal.name !== editModal.id && (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                                ⚠️ 카테고리명 변경 시 연결된 모든 콘텐츠의 카테고리가 자동 업데이트됩니다.
                            </p>
                        )}
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setEditModal(null)} disabled={renaming} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold disabled:opacity-50">취소</button>
                            <button onClick={saveEdit} disabled={renaming} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-70 flex items-center gap-2">
                                {renaming && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                                {renaming ? '업데이트 중...' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── RECOMMENDED TAB ───────────────────────────────────────────────────────
function RecommendedTab() {
    const [items, setItems] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [cats, setCats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [f, setF] = useState({ topSection: '', category: '', recommended: '' });

    const load = useCallback(async () => {
        setLoading(true);
        const [musicSnap, catSnap] = await Promise.all([
            getDocs(collection(db, 'music')),
            getDocs(collection(db, 'categories'))
        ]);
        const catMap = {};
        catSnap.docs.forEach(d => { catMap[d.id] = d.data(); });
        const list = musicSnap.docs.map(d => ({ id: d.id, ...d.data(), _catData: catMap[d.data().category] }));
        setItems(list); setFiltered(list); setCats(Object.keys(catMap));
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const applyFilter = useCallback(() => {
        setFiltered(items.filter(m => {
            if (f.category && m.category !== f.category) return false;
            if (f.recommended !== '' && String(m.recommended || 0) !== f.recommended) return false;
            if (f.topSection && m._catData?.topSection !== f.topSection) return false;
            return true;
        }));
    }, [items, f]);

    useEffect(() => { applyFilter(); }, [applyFilter]);

    const toggleRec = async (id, current) => {
        const newVal = current ? 0 : 1;
        await updateDoc(doc(db, 'music', id), { recommended: newVal, updatedAt: new Date().toISOString() });
        setItems(prev => prev.map(m => m.id === id ? { ...m, recommended: newVal } : m));
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-semibold mb-1">섹션</label>
                    <select value={f.topSection} onChange={e => setF(p => ({ ...p, topSection: e.target.value }))} className="border rounded-lg p-2 text-sm">
                        <option value="">전체</option>
                        {TOP_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold mb-1">카테고리</label>
                    <select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} className="border rounded-lg p-2 text-sm">
                        <option value="">전체</option>
                        {cats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold mb-1">추천 상태</label>
                    <select value={f.recommended} onChange={e => setF(p => ({ ...p, recommended: e.target.value }))} className="border rounded-lg p-2 text-sm">
                        <option value="">전체</option>
                        <option value="1">추천됨</option>
                        <option value="0">미추천</option>
                    </select>
                </div>
                <button onClick={() => setF({ topSection: '', category: '', recommended: '' })} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold">초기화</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="text-lg font-bold mb-3">음악 목록 <span className="text-sm font-normal text-gray-400">({filtered.length})</span></h2>
                {loading ? <Spinner /> : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {filtered.map(m => (
                            <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">{m.name || m.title || '제목없음'}</span>
                                    {m.category && <Badge text={m.category} color="blue" />}
                                    {m.recommended == 1 && <Badge text="⭐ 추천" color="yellow" />}
                                </div>
                                <button
                                    onClick={() => toggleRec(m.id, m.recommended)}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg ${m.recommended ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}`}
                                >
                                    {m.recommended ? '추천 해제' : '추천 추가'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── CONTENT TAB ─────────────────────────────────────────────────────────────
function ContentTab() {
    const [items, setItems] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [cats, setCats] = useState([]);
    const [catMap, setCatMap] = useState({}); // { catId → topSection }
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterSection, setFilterSection] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [sortField, setSortField] = useState('sortOrder'); // 기본: sortOrder 순
    const [sortDir, setSortDir] = useState('asc');

    // isUserGenerated 갤러리: 편집 시 서브컬렉션 이미지 로드
    const [subColImages, setSubColImages] = useState([]); // { id, imageSrc }
    const [subColLoading, setSubColLoading] = useState(false);
    const [subColDeleting, setSubColDeleting] = useState(null); // 삭제 중인 doc id

    useEffect(() => {
        if (!editItem?.id || !editItem?.isUserGenerated) {
            setSubColImages([]);
            return;
        }
        setSubColLoading(true);
        const q = query(collection(db, 'music', editItem.id, 'images'), orderBy('createdAt', 'desc'));
        getDocs(q).then(snap => {
            setSubColImages(snap.docs.map(d => ({ id: d.id, imageSrc: d.data().imageSrc })).filter(d => d.imageSrc));
        }).catch(() => setSubColImages([])).finally(() => setSubColLoading(false));
    }, [editItem?.id, editItem?.isUserGenerated]);

    const deleteSubColImage = async (docId) => {
        if (!editItem?.id || !confirm('이 이미지를 삭제하시겠습니까?')) return;
        setSubColDeleting(docId);
        try {
            // 1. 서브컬렉션에서 삭제
            await deleteDoc(doc(db, 'music', editItem.id, 'images', docId));

            // 2. 로컬 상태 업데이트
            const newImages = subColImages.filter(img => img.id !== docId);
            setSubColImages(newImages);

            // 3. music 문서 동기화 — imageUrl & imageCount
            const nextThumb = newImages[0]?.imageSrc || '';
            await updateDoc(doc(db, 'music', editItem.id), {
                imageUrl: nextThumb,
                imageCount: increment(-1),
                updatedAt: new Date().toISOString(),
            }).catch(e => console.warn('[Admin] music doc 업데이트 실패:', e.code));

            // 4. editItem 썸네일도 즉시 갱신
            setEditItem(prev => ({ ...prev, imageUrl: nextThumb }));
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        } finally {
            setSubColDeleting(null);
        }
    };

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    // sortOrder 모드일 때는 load()에서 이미 정렬된 순서를 보존
    const getSorted = (list) => {
        if (sortField === 'sortOrder') return list; // 기본 순서 유지
        return [...list].sort((a, b) => {
            const av = (a[sortField] || '').toString().toLowerCase();
            const bv = (b[sortField] || '').toString().toLowerCase();
            return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    };

    const load = useCallback(async () => {
        setLoading(true);
        const [snap, catSnap] = await Promise.all([getDocs(collection(db, 'music')), getDocs(collection(db, 'categories'))]);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(d => !d.isUserGenerated) // 유저 생성 갤러리 제외
            .sort((a, b) => {
                const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
                const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
                if (aHas && bHas) return a.sortOrder - b.sortOrder;
                if (aHas) return -1;
                if (bHas) return 1;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
        const map = {};
        catSnap.docs.forEach(d => {
            const data = d.data();
            map[d.id] = { topSection: data.topSection || '', name: data.name || d.id };
        });
        setCatMap(map);
        setItems(list); setFiltered(list);
        setCats(catSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.id, topSection: d.data().topSection || '' })));
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const getItemSection = (c) => c.topSection || catMap[c.category]?.topSection || '';

    const applyFilter = (kw = keyword, cat = filterCat, sec = filterSection) => {
        setFiltered(items.filter(c => {
            if (kw && !(c.name || c.title || '').toLowerCase().includes(kw.toLowerCase())) return false;
            if (cat && c.category !== cat) return false;
            if (sec && getItemSection(c) !== sec) return false;
            return true;
        }));
    };

    const saveEdit = async () => {
        if (!editItem) return;
        const cleanImages = (editItem.images || []).filter(img => (img.imageSrc || '').trim());
        await updateDoc(doc(db, 'music', editItem.id), {
            name: editItem.name, title: editItem.name,
            category: editItem.category,
            topSection: editItem.topSection || '',
            recommended: editItem.recommended ? 1 : 0,
            musicUrl: editItem.musicUrl || '', music: editItem.musicUrl || '',
            audioUrl: editItem.musicUrl || '',
            images: cleanImages,
            imageUrl: cleanImages[0]?.imageSrc || editItem.imageUrl || '',
            updatedAt: new Date().toISOString()
        });
        setEditItem(null); load();
    };

    const EMPTY_ITEM = { name: '', topSection: '', category: '', recommended: false, musicUrl: '', music: '', images: [] };
    const [createItem, setCreateItem] = useState(null); // null = 모달 닫힘

    const createContent = async () => {
        if (!createItem) return;
        const cleanImages = (createItem.images || []).filter(img => (img.imageSrc || '').trim());
        const docRef = await addDoc(collection(db, 'music'), {
            name: createItem.name || '새 콘텐츠',
            title: createItem.name || '새 콘텐츠',
            category: createItem.category || '',
            topSection: createItem.topSection || '',
            recommended: createItem.recommended ? 1 : 0,
            musicUrl: createItem.musicUrl || '', music: createItem.musicUrl || '',
            images: cleanImages,
            imageUrl: cleanImages[0]?.imageSrc || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        setCreateItem(null);
        load();
        return docRef.id;
    };

    const imgAdd = url => setEditItem(m => ({ ...m, images: [...(m.images || []), { imageSrc: url.trim() }] }));
    const imgRemove = idx => setEditItem(m => ({ ...m, images: (m.images || []).filter((_, i) => i !== idx) }));
    const imgUp = idx => setEditItem(m => {
        const arr = [...(m.images || [])];
        if (idx === 0) return m;
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        return { ...m, images: arr };
    });
    const imgDown = idx => setEditItem(m => {
        const arr = [...(m.images || [])];
        if (idx === arr.length - 1) return m;
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        return { ...m, images: arr };
    });

    const [imgUploading, setImgUploading] = useState(false);
    const [imgDragOver, setImgDragOver] = useState(false);
    const [imgUploadError, setImgUploadError] = useState('');

    const uploadImages = async (files) => {
        if (!files?.length) return;
        if (!editItem?.id) {
            setImgUploadError('먼저 콘텐츠를 저장한 후 파일을 업로드해주세요.');
            return;
        }
        setImgUploading(true);
        setImgUploadError('');
        try {
            // Custom Claims 포함 최신 토큰 강제 갱신 (Storage Rules 통과 보장)
            const auth = getAuth();
            if (auth.currentUser) await auth.currentUser.getIdToken(true);

            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                const path = `music/${editItem.id}/img_${Date.now()}_${file.name}`;
                const storageRef = ref(storage, path);
                const snap = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snap.ref);
                imgAdd(url);
            }
        } catch (err) {
            console.error('[Admin] 이미지 업로드 오류:', err);
            setImgUploadError(`업로드 실패: ${err.code || err.message}`);
        } finally {
            setImgUploading(false);
        }
    };

    const [audioUploading, setAudioUploading] = useState(false);
    const [audioDragOver, setAudioDragOver] = useState(false);
    const [audioUploadError, setAudioUploadError] = useState('');

    const uploadAudio = async (files) => {
        const file = Array.from(files || []).find(f => f.type.startsWith('audio/'));
        if (!file) return;
        if (!editItem?.id) {
            setAudioUploadError('먼저 콘텐츠를 저장한 후 파일을 업로드해주세요.');
            return;
        }
        setAudioUploading(true);
        setAudioUploadError('');
        try {
            // Custom Claims 포함 최신 토큰 강제 갱신 (Storage Rules 통과 보장)
            const auth = getAuth();
            if (auth.currentUser) await auth.currentUser.getIdToken(true);

            const path = `music/${editItem.id}/audio_${Date.now()}_${file.name}`;
            const storageRef = ref(storage, path);
            const snap = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snap.ref);
            setEditItem(m => ({ ...m, musicUrl: url, music: url }));
        } catch (err) {
            console.error('[Admin] 음원 업로드 오류:', err);
            setAudioUploadError(`업로드 실패: ${err.code || err.message}`);
        } finally {
            setAudioUploading(false);
        }
    };

    const deleteContent = async (id, name) => {
        if (!confirm(`"${name}" 삭제? 이미지 파일은 별도로 삭제해야 합니다.`)) return;
        await deleteDoc(doc(db, 'music', id));
        load();
    };

    /* ── 순서 이동: 인접 항목과 sortOrder 교환 ── */
    const reorderItem = async (item, dir) => {
        // 현재 표시 순서(sortOrder 우선) 기준 인덱스
        const sorted = [...items].sort((a, b) => {
            const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
            const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
            if (aHas && bHas) return a.sortOrder - b.sortOrder;
            if (aHas) return -1; if (bHas) return 1;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        const idx = sorted.findIndex(i => i.id === item.id);
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= sorted.length) return;

        // sortOrder가 없는 항목에 현재 인덱스 기반 값 부여
        const ensureOrder = (it, pos) => it.sortOrder !== undefined && it.sortOrder !== null ? it.sortOrder : pos + 1;
        const A = { id: sorted[idx].id, order: ensureOrder(sorted[idx], idx) };
        const B = { id: sorted[swapIdx].id, order: ensureOrder(sorted[swapIdx], swapIdx) };

        // 교환
        await Promise.all([
            updateDoc(doc(db, 'music', A.id), { sortOrder: B.order }),
            updateDoc(doc(db, 'music', B.id), { sortOrder: A.order }),
        ]);
        load();
    };

    return (
        <div className="space-y-4">
            {/* 최상위 섹션 탭 버튼 */}
            <div className="bg-white rounded-xl shadow-sm p-4 border">
                <label className="block text-xs font-semibold mb-2 text-gray-500">최상위 섹션</label>
                <div className="flex flex-wrap gap-2">
                    {[{ value: '', label: '전체' }, ...TOP_SECTIONS].map(s => (
                        <button
                            key={s.value}
                            onClick={() => {
                                setFilterSection(s.value);
                                applyFilter(keyword, filterCat, s.value);
                            }}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${filterSection === s.value ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 카테고리 탭 버튼 */}
            <div className="bg-white rounded-xl shadow-sm p-4 border">
                <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-gray-500">카테고리</label>
                    <button
                        onClick={() => { setFilterCat(''); setFilterSection(''); setFiltered(items); }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >초기화</button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: '', label: '전체' },
                        ...cats
                            .filter(c => !filterSection || c.topSection === filterSection)
                            .map(c => ({ id: c.id, label: c.name }))
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setFilterCat(id);
                                applyFilter(keyword, id, filterSection);
                            }}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${filterCat === id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>



            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-bold">콘텐츠 목록 <span className="text-sm font-normal text-gray-400">({filtered.length})</span></h2>
                    <button
                        onClick={() => setCreateItem({ ...EMPTY_ITEM })}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg"
                    >
                        + 새 콘텐츠
                    </button>
                </div>
                {loading ? <Spinner /> : (
                    <div className="overflow-x-auto max-h-[60vh]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    {[{ label: '순서', field: null }, { label: '썸네일', field: null }, { label: '제목', field: 'name' }, { label: '카테고리', field: 'category' }, { label: '추천', field: 'recommended' }, { label: '업로드일', field: 'createdAt' }, { label: '작업', field: null }].map(({ label, field }) => (
                                        <th
                                            key={label}
                                            onClick={field ? () => toggleSort(field) : undefined}
                                            className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 ${field ? 'cursor-pointer hover:text-gray-800 select-none' : ''}`}
                                        >
                                            {label}{field && sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                 {getSorted(filtered).map((c, idx) => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        {/* 순서 */}
                                        <td className="px-3 py-3 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="text-xs font-bold text-indigo-600 w-6 text-center">{String(idx + 1).padStart(2, '0')}</span>
                                                <button onClick={() => reorderItem(c, 'up')} disabled={idx === 0} className="text-gray-400 hover:text-indigo-600 disabled:opacity-20 text-xs leading-none">▲</button>
                                                <button onClick={() => reorderItem(c, 'down')} disabled={idx === getSorted(filtered).length - 1} className="text-gray-400 hover:text-indigo-600 disabled:opacity-20 text-xs leading-none">▼</button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {(() => {
                                                const src = c.imageUrl || c.images?.[0]?.imageSrc || c.thumbnailUrl || c.thumbnail || null;
                                                return src
                                                    ? <img src={src} className="w-14 h-14 object-cover rounded bg-gray-100" onError={e => { e.target.style.display = 'none'; }} alt="" />
                                                    : <div className="w-14 h-14 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-xs">No img</div>;
                                            })()}
                                        </td>
                                        <td className="px-4 py-3 font-medium max-w-[200px] truncate">{c.name || c.title || '제목없음'}</td>
                                        <td className="px-4 py-3">{c.category ? <Badge text={catMap[c.category]?.name || c.category} /> : '-'}</td>
                                        <td className="px-4 py-3">{c.recommended ? <Badge text="⭐" color="yellow" /> : ''}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{(() => {
                                            const v = c.createdAt;
                                            if (!v) return '-';
                                            // Firestore Timestamp 객체
                                            if (v?.seconds) return new Date(v.seconds * 1000).toLocaleDateString('ko-KR');
                                            // ISO string or number
                                            const d = new Date(v);
                                            return isNaN(d) ? '-' : d.toLocaleDateString('ko-KR');
                                        })()}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => setEditItem({ ...c, musicUrl: c.musicUrl || c.audioUrl || c.audioSrc || c.music || '', topSection: c.topSection || '', recommended: !!c.recommended })} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded">편집</button>
                                                <button onClick={() => deleteContent(c.id, c.name || c.title)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded">삭제</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 새 콘텐츠 생성 모달 */}
            {createItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b flex-shrink-0">
                            <h3 className="text-lg font-bold">✨ 새 콘텐츠 추가</h3>
                            <button onClick={() => setCreateItem(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
                        </div>
                        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">제목</label>
                                    <input
                                        value={createItem.name || ''}
                                        onChange={e => setCreateItem(m => ({ ...m, name: e.target.value }))}
                                        className="w-full border rounded-lg p-2 text-sm"
                                        placeholder="콘텐츠 제목..."
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">최상위 섹션</label>
                                    <select value={createItem.topSection || ''} onChange={e => setCreateItem(m => ({ ...m, topSection: e.target.value }))} className="w-full border rounded-lg p-2 text-sm">
                                        <option value="">섹션 없음</option>
                                        {TOP_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">카테고리</label>
                                    <select value={createItem.category || ''} onChange={e => setCreateItem(m => ({ ...m, category: e.target.value }))} className="w-full border rounded-lg p-2 text-sm">
                                        <option value="">카테고리 없음</option>
                                        {(createItem.topSection ? cats.filter(c => c.topSection === createItem.topSection) : cats).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-end pb-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={!!createItem.recommended} onChange={e => setCreateItem(m => ({ ...m, recommended: e.target.checked }))} className="w-4 h-4" />
                                        <span className="text-sm font-semibold">추천 콘텐츠</span>
                                    </label>
                                </div>
                            </div>

                            {/* 이미지 URL 추가 */}
                            <div>
                                <h4 className="text-sm font-bold mb-2">🖼️ 이미지 URL 추가</h4>
                                <div className="flex gap-2">
                                    <input
                                        id="create-img-url"
                                        className="flex-1 border rounded-lg p-2 text-sm"
                                        placeholder="이미지 URL 입력 후 Enter 또는 + 추가"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                setCreateItem(m => ({ ...m, images: [...(m.images || []), { imageSrc: e.target.value.trim() }] }));
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const inp = document.getElementById('create-img-url');
                                            if (inp?.value.trim()) {
                                                setCreateItem(m => ({ ...m, images: [...(m.images || []), { imageSrc: inp.value.trim() }] }));
                                                inp.value = '';
                                            }
                                        }}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg"
                                    >+ 추가</button>
                                </div>
                                {(createItem.images || []).length > 0 && (
                                    <div className="mt-2 grid grid-cols-4 gap-2">
                                        {createItem.images.map((img, idx) => (
                                            <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 border">
                                                <img src={img.imageSrc} className="w-full h-full object-cover" alt="" onError={e => e.target.style.display = 'none'} />
                                                <span className="absolute top-1 left-1 bg-black/60 text-white text-xs rounded px-1">{idx + 1}</span>
                                                <button onClick={() => setCreateItem(m => ({ ...m, images: m.images.filter((_, i) => i !== idx) }))} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold">✕ 삭제</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 음악 URL */}
                            <div>
                                <label className="block text-sm font-semibold mb-1">음악 URL</label>
                                <input value={createItem.musicUrl || ''} onChange={e => setCreateItem(m => ({ ...m, musicUrl: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="https://..." />
                                {createItem.musicUrl && <audio key={createItem.musicUrl} controls className="w-full mt-2 rounded-lg" src={createItem.musicUrl} />}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
                            <button onClick={() => setCreateItem(null)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold">취소</button>
                            <button onClick={createContent} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">생성</button>
                        </div>
                    </div>
                </div>
            )}

            {editItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                        {/* 헤더 */}
                        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b flex-shrink-0">
                            <h3 className="text-lg font-bold">콘텐츠 편집</h3>
                            <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
                        </div>

                        <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
                            {/* 기본 정보 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">제목</label>
                                    <input value={editItem.name || ''} onChange={e => setEditItem(m => ({ ...m, name: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">최상위 섹션</label>
                                    <select value={editItem.topSection || ''} onChange={e => {
                                        const sec = e.target.value;
                                        const firstCat = cats.find(c => c.topSection === sec)?.id || '';
                                        setEditItem(m => ({ ...m, topSection: sec, category: firstCat }));
                                    }} className="w-full border rounded-lg p-2 text-sm">
                                        <option value="">섹션 없음</option>
                                        {TOP_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">카테고리</label>
                                    <select value={editItem.category || ''} onChange={e => setEditItem(m => ({ ...m, category: e.target.value }))} className="w-full border rounded-lg p-2 text-sm">
                                        <option value="">카테고리 없음</option>
                                        {(editItem.topSection ? cats.filter(c => c.topSection === editItem.topSection) : cats).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold mb-1">음악</label>
                                    {editItem.musicUrl ? (
                                        <div className="space-y-2">
                                            <audio key={editItem.musicUrl} controls className="w-full rounded-lg" src={editItem.musicUrl} />
                                            <button
                                                onClick={() => setEditItem(m => ({ ...m, musicUrl: '', music: '' }))}
                                                className="text-xs text-red-500 hover:text-red-700 underline"
                                            >
                                                ✕ 음원 교체 (현재 음원 제거)
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${audioDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
                                                }`}
                                            onDragOver={e => { e.preventDefault(); setAudioDragOver(true); }}
                                            onDragLeave={() => setAudioDragOver(false)}
                                            onDrop={e => { e.preventDefault(); setAudioDragOver(false); uploadAudio(e.dataTransfer.files); }}
                                        >
                                            {audioUploading ? (
                                                <div className="flex items-center justify-center gap-2 text-blue-600">
                                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                                                    <span className="text-sm font-semibold">업로드 중...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-sm text-gray-500 mb-2">🎵 음원 파일을 드래그&amp;드롭</p>
                                                    <label className="cursor-pointer inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg">
                                                        📁 파일 탐색기로 선택
                                                        <input
                                                            type="file"
                                                            accept="audio/*"
                                                            className="hidden"
                                                            onChange={e => { uploadAudio(e.target.files); e.target.value = ''; }}
                                                        />
                                                    </label>
                                                    <p className="text-xs text-gray-400 mt-2">MP3, M4A, WAV, OGG 등</p>
                                                </>
                                            )}
                                            {audioUploadError && (
                                                <p className="mt-2 text-xs text-red-600 font-semibold">⚠️ {audioUploadError}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={!!editItem.recommended} onChange={e => setEditItem(m => ({ ...m, recommended: e.target.checked }))} className="w-4 h-4" />
                                <span className="text-sm font-semibold">추천 콘텐츠</span>
                            </label>

                            {/* 이미지 관리 */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-bold">🖼️ 연결 이미지 ({(editItem.images || []).length}개)</h4>
                                    <span className="text-xs text-gray-400">첫 번째 이미지 = 주요 썸네일</span>
                                </div>

                                {/* AI 생성 이미지 (서브컬렉션) — isUserGenerated 전용 */}
                                {editItem.isUserGenerated && (
                                    <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <h5 className="text-sm font-bold text-violet-800">✨ AI 생성 이미지 (서브컬렉션: {subColImages.length}장)</h5>
                                            {subColLoading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-500 border-t-transparent" />}
                                        </div>
                                        {subColImages.length === 0 && !subColLoading && (
                                            <p className="text-xs text-violet-400 text-center py-4">서브컬렉션에 이미지가 없습니다</p>
                                        )}
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                                            {subColImages.map(img => (
                                                <div key={img.id} className="relative group rounded-lg overflow-hidden bg-gray-200 aspect-square border border-violet-200">
                                                    <img src={img.imageSrc} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display = 'none'; }} />
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button
                                                            onClick={() => deleteSubColImage(img.id)}
                                                            disabled={subColDeleting === img.id}
                                                            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded disabled:opacity-50"
                                                        >
                                                            {subColDeleting === img.id ? '...' : '✕ 삭제'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-violet-400 mt-2">※ AI 생성 이미지 삭제는 Firestore 서브컬렉션에서만 제거됩니다 (Storage 파일은 별도 관리)</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                                    {(editItem.images || []).length === 0 && (
                                        <p className="col-span-4 text-center text-gray-400 text-sm py-8">연결된 이미지가 없습니다</p>
                                    )}
                                    {(editItem.images || []).map((img, idx) => (
                                        <div key={idx} className="relative group rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-400 bg-gray-200 aspect-square">
                                            {/* 썸네일 */}
                                            {img.imageSrc
                                                ? <img src={img.imageSrc} className="w-full h-full object-cover" alt="" onError={e => { e.target.style.display = 'none'; }} />
                                                : <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500 text-xs">No img</div>
                                            }
                                            {/* 순서 번호 */}
                                            <span className="absolute top-1 left-1 bg-black/60 text-white text-xs font-bold rounded px-1.5 py-0.5">{idx + 1}</span>
                                            {/* 호버 오버레이 — 버튼들 */}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                                <div className="flex gap-1">
                                                    <button onClick={() => imgUp(idx)} disabled={idx === 0} className="px-2 py-1 bg-white/80 hover:bg-white text-gray-800 text-xs font-bold rounded disabled:opacity-30">◀</button>
                                                    <button onClick={() => imgDown(idx)} disabled={idx === (editItem.images || []).length - 1} className="px-2 py-1 bg-white/80 hover:bg-white text-gray-800 text-xs font-bold rounded disabled:opacity-30">▶</button>
                                                </div>
                                                <button onClick={() => imgRemove(idx)} className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded">✕ 삭제</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>


                                {/* 이미지 추가: 드래그앤드롭 / 파일 선택 / URL */}
                                <div
                                    className={`mt-3 border-2 border-dashed rounded-xl p-4 text-center transition-colors ${imgDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
                                    onDragOver={e => { e.preventDefault(); setImgDragOver(true); }}
                                    onDragLeave={() => setImgDragOver(false)}
                                    onDrop={e => { e.preventDefault(); setImgDragOver(false); uploadImages(e.dataTransfer.files); }}
                                >
                                    {imgUploading ? (
                                        <div className="flex items-center justify-center gap-2 text-blue-600 py-2">
                                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                                            <span className="text-sm font-semibold">업로드 중...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-sm text-gray-500 mb-2">여기에 이미지 파일을 드래그&amp;드롭</p>
                                            <label className="cursor-pointer inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg">
                                                📁 파일 탐색기로 선택
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    className="hidden"
                                                    onChange={e => { uploadImages(e.target.files); e.target.value = ''; }}
                                                />
                                            </label>
                                            <p className="text-xs text-gray-400 mt-2">JPG, PNG, WEBP 등 여러 장 동시 선택 가능</p>
                                        </>
                                    )}
                                    {imgUploadError && (
                                        <p className="mt-2 text-xs text-red-600 font-semibold">⚠️ {imgUploadError}</p>
                                    )}
                                </div>

                                {/* URL 직접 입력 */}
                                <div className="mt-2 flex gap-2">
                                    <input
                                        id="new-img-url"
                                        className="flex-1 border rounded-lg p-2 text-sm"
                                        placeholder="또는 이미지 URL 직접 입력 후 Enter / + 추가"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                imgAdd(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const inp = document.getElementById('new-img-url');
                                            if (inp?.value.trim()) { imgAdd(inp.value); inp.value = ''; }
                                        }}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg whitespace-nowrap"
                                    >
                                        + 추가
                                    </button>
                                </div>

                            </div>
                        </div>

                        {/* 푸터 */}
                        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
                            <button onClick={() => setEditItem(null)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold">취소</button>
                            <button onClick={saveEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// ─── USERS TAB ────────────────────────────────────────────────────────────────
function UsersTab() {
    const [users, setUsers] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [editUser, setEditUser] = useState(null);
    const [galleryUser, setGalleryUser] = useState(null); // 갤러리 조회 대상 회원
    const [grantAmount, setGrantAmount] = useState('');
    const [grantMsg, setGrantMsg] = useState('');
    const [granting, setGranting] = useState(false);

    const load = async () => {
        setLoading(true);
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setUsers(list); setFiltered(list); setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const doSearch = () => {
        const kw = search.toLowerCase();
        setFiltered(users.filter(u => (u.email || '').toLowerCase().includes(kw) || (u.displayName || '').toLowerCase().includes(kw)));
    };

    const saveUser = async () => {
        if (!editUser) return;
        await updateDoc(doc(db, 'users', editUser.uid), {
            role: editUser.role || 'user',
            walletBalance: Number(editUser.walletBalance) || 0,
            updatedAt: new Date().toISOString()
        });
        setEditUser(null); load();
    };

    // Daily Point 지급/차감
    const grantPoints = async () => {
        const amount = parseInt(grantAmount, 10);
        if (!editUser || isNaN(amount) || amount === 0) return;
        setGranting(true);
        setGrantMsg('');
        try {
            const userRef = doc(db, 'users', editUser.uid);
            const snap = await getDoc(userRef);
            const cur = snap.exists() ? snap.data().dailyPoints || 0 : 0;
            const newVal = Math.max(0, cur + amount);
            await updateDoc(userRef, { dailyPoints: newVal, updatedAt: new Date().toISOString() });

            // 거래 기록
            await addDoc(collection(db, 'pointTransactions'), {
                userId: editUser.uid,
                type: 'admin_grant',
                amount,
                description: `관리자 ${amount > 0 ? '지급' : '차감'}: ${Math.abs(amount)}P`,
                createdAt: serverTimestamp(),
            });

            setGrantMsg(`✓ ${amount > 0 ? '+' : ''}${amount}P 지급 완료 (현재 ${newVal}P)`);
            setGrantAmount('');
            setEditUser(u => ({ ...u, dailyPoints: newVal }));
        } catch (e) {
            setGrantMsg('❌ 오류: ' + e.message);
        } finally {
            setGranting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border flex gap-3">
                <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="이메일 검색..." className="flex-1 border rounded-lg p-2 text-sm" />
                <button onClick={doSearch} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">검색</button>
                <button onClick={() => { setSearch(''); setFiltered(users); }} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-bold">전체</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b"><h2 className="text-lg font-bold">회원 목록 <span className="text-sm font-normal text-gray-400">({filtered.length})</span></h2></div>
                {loading ? <Spinner /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>{['이메일', '역할', '일일P', '지갑P', '가입일', '작업'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.map(u => (
                                    <tr key={u.uid} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">{u.email || u.displayName || u.uid.slice(0, 8)}</td>
                                        <td className="px-4 py-3"><Badge text={u.role || 'user'} color={u.role === 'admin' ? 'red' : u.role === 'creator' ? 'blue' : 'gray'} /></td>
                                        <td className="px-4 py-3 font-semibold text-amber-600">{u.dailyPoints || 0}P</td>
                                        <td className="px-4 py-3 font-semibold">{u.walletBalance || 0}P</td>
                                        <td className="px-4 py-3 text-gray-500">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko-KR') : '-'}</td>
                                        <td className="px-4 py-3 flex gap-1">
                                            <button onClick={() => { setEditUser({ ...u }); setGrantAmount(''); setGrantMsg(''); }} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold rounded">편집</button>
                                            <button onClick={() => setGalleryUser(u)} className="px-3 py-1 bg-violet-100 hover:bg-violet-200 text-violet-800 text-xs font-bold rounded">🖼 갤러리</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">회원 편집</h3>
                            <button onClick={() => setEditUser(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
                        </div>
                        <p className="text-sm text-gray-600 break-all">{editUser.email || editUser.uid}</p>

                        {/* Daily Point 지급/차감 */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-sm font-bold text-amber-800 mb-1">⚡ Daily Point 지급/차감</p>
                            <p className="text-xs text-amber-600 mb-3">현재 잔액: <strong>{editUser.dailyPoints || 0}P</strong> (음수 입력 시 차감)</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={grantAmount}
                                    onChange={e => { setGrantAmount(e.target.value); setGrantMsg(''); }}
                                    placeholder="예: 100 또는 -50"
                                    className="flex-1 border border-amber-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <button
                                    onClick={grantPoints}
                                    disabled={granting || !grantAmount}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-lg text-sm font-bold transition"
                                >
                                    {granting ? '처리 중' : '지급'}
                                </button>
                            </div>
                            {grantMsg && (
                                <p className={`text-xs mt-2 font-semibold ${grantMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{grantMsg}</p>
                            )}
                        </div>

                        {/* 역할 / 지갑 포인트 편집 */}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1">역할</label>
                                <select value={editUser.role || 'user'} onChange={e => setEditUser(u => ({ ...u, role: e.target.value }))} className="w-full border rounded-lg p-2">
                                    <option value="user">user</option>
                                    <option value="creator">creator</option>
                                    <option value="admin">admin</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">지갑 포인트 (직접 설정)</label>
                                <input type="number" value={editUser.walletBalance || 0} onChange={e => setEditUser(u => ({ ...u, walletBalance: e.target.value }))} className="w-full border rounded-lg p-2" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-bold">취소</button>
                            <button onClick={saveUser} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">저장</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 회원 갤러리 조회 모달 */}
            {galleryUser && (
                <AdminUserGalleryModal user={galleryUser} onClose={() => setGalleryUser(null)} />
            )}
        </div>
    );
}

// ─── ADMIN USER GALLERY MODAL ─────────────────────────────────────────────────
function AdminUserGalleryModal({ user, onClose }) {
    const [galleries, setGalleries] = useState([]);
    const [images, setImages] = useState([]);
    const [selectedGalId, setSelectedGalId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const galSnap = await getDocs(
                    query(collection(db, 'users', user.uid, 'userGalleries'), orderBy('createdAt', 'asc'))
                ).catch(() => null);
                const gals = galSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || [];
                setGalleries(gals);
                if (gals.length > 0) setSelectedGalId(gals[0].id);

                const imgSnap = await getDocs(
                    query(collection(db, 'users', user.uid, 'galleries'), orderBy('createdAt', 'desc'))
                ).catch(() => null);
                setImages(imgSnap?.docs.map(d => ({ id: d.id, ...d.data() })) || []);
            } finally {
                setLoading(false);
            }
        })();
    }, [user.uid]);

    const currentImages = selectedGalId
        ? images.filter(img => img.galleryId === selectedGalId)
        : images;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h3 className="text-base font-bold">🖼 회원 갤러리</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{user.email || user.displayName || user.uid}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-4 border-violet-500 border-t-transparent" /></div>
                ) : galleries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <div className="text-5xl mb-3">🗂️</div>
                        <p className="text-sm">생성된 갤러리가 없습니다</p>
                        <p className="text-xs mt-1 text-gray-300">{images.length > 0 ? `이미지 ${images.length}장 (갤러리 미분류)` : ''}</p>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* 갤러리 탭 */}
                        <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b bg-gray-50">
                            <button
                                onClick={() => setSelectedGalId(null)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!selectedGalId ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-100'}`}
                            >
                                전체 ({images.length})
                            </button>
                            {galleries.map(gal => (
                                <button key={gal.id} onClick={() => setSelectedGalId(gal.id)}
                                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${selectedGalId === gal.id ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-100'}`}
                                >
                                    {gal.isDefault ? '🗂️ ' : '📂 '}{gal.name} ({images.filter(i => i.galleryId === gal.id).length})
                                </button>
                            ))}
                        </div>

                        {/* 이미지 그리드 */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <p className="text-xs text-gray-400 mb-3">이미지 {currentImages.length}장</p>
                            {currentImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <div className="text-4xl mb-2">🖼️</div>
                                    <p className="text-sm">이 갤러리에 이미지가 없습니다</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2">
                                    {currentImages.map(img => (
                                        <button key={img.id} onClick={() => setPreview(img)}
                                            className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-violet-400 transition">
                                            <img src={img.url} alt={img.prompt?.slice(0, 20) || ''} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 이미지 미리보기 */}
            {preview && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4"
                    onClick={() => setPreview(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-md w-full shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <img src={preview.url} alt="" className="w-full object-cover max-h-72" />
                        <div className="p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                                {preview.workflowName && <span className="bg-gray-100 px-2 py-0.5 rounded">{preview.workflowName}</span>}
                                {preview.aspectRatio && <span className="bg-gray-100 px-2 py-0.5 rounded">{preview.aspectRatio}</span>}
                            </div>
                            {preview.prompt && <p className="text-xs text-gray-500 line-clamp-3">{preview.prompt}</p>}
                            <div className="flex gap-2">
                                <a href={preview.url} target="_blank" rel="noreferrer" download
                                    className="flex-1 text-center py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition">
                                    다운로드
                                </a>
                                <button onClick={() => setPreview(null)}
                                    className="flex-1 py-2 border text-sm text-gray-500 rounded-xl hover:bg-gray-50">닫기</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── HERO SLIDES TAB ─────────────────────────────────────────────────────────
function HeroTab() {
    const [slides, setSlides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: '', subtitle: '', link: '', order: 0, active: true });
    const [imageFile, setImageFile] = useState(null);

    const load = async () => {
        setLoading(true);
        const snap = await getDocs(query(collection(db, 'heroSlides'), orderBy('order', 'asc')));
        setSlides(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const add = async e => {
        e.preventDefault();
        setUploading(true);
        try {
            let imageUrl = '';
            if (imageFile) {
                const storageRef = ref(storage, `heroSlides/${Date.now()}_${imageFile.name}`);
                const snap = await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(snap.ref);
            }
            await addDoc(collection(db, 'heroSlides'), {
                ...form, imageUrl, createdAt: serverTimestamp()
            });
            setForm({ title: '', subtitle: '', link: '', order: 0, active: true });
            setImageFile(null);
            load();
        } finally { setUploading(false); }
    };

    const remove = async (id, imageUrl) => {
        if (!confirm('슬라이드를 삭제하시겠습니까?')) return;
        await deleteDoc(doc(db, 'heroSlides', id));
        if (imageUrl) { try { await deleteObject(ref(storage, imageUrl)); } catch { } }
        load();
    };

    const toggleActive = async (id, current) => {
        await updateDoc(doc(db, 'heroSlides', id), { active: !current });
        load();
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="text-lg font-bold mb-4">🎬 새 슬라이드 추가</h2>
                <form onSubmit={add} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold mb-1">제목</label>
                            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="슬라이드 제목" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1">부제목</label>
                            <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="부제목" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1">링크 (선택)</label>
                            <input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} className="w-full border rounded-lg p-2 text-sm" placeholder="https://..." />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1">순서</label>
                            <input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} className="w-full border rounded-lg p-2 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1">이미지 (권장: 1920×1080)</label>
                        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} className="w-full border rounded-lg p-2 text-sm" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4" />
                        <span className="text-sm font-semibold">활성화</span>
                    </label>
                    <button type="submit" disabled={uploading} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:bg-gray-400">
                        {uploading ? '업로드 중...' : '슬라이드 추가'}
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">슬라이드 목록</h2>
                    <button onClick={load} className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-bold rounded">새로고침</button>
                </div>
                {loading ? <Spinner /> : (
                    <div className="space-y-3">
                        {slides.length === 0 && <p className="text-center text-gray-400 py-8">등록된 슬라이드가 없습니다.</p>}
                        {slides.map(s => (
                            <div key={s.id} className={`flex items-center gap-4 p-4 border rounded-lg ${s.active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                                {s.imageUrl && <img src={s.imageUrl} className="w-20 h-12 object-cover rounded" alt="" />}
                                <div className="flex-1">
                                    <p className="font-semibold">{s.title}</p>
                                    {s.subtitle && <p className="text-sm text-gray-500">{s.subtitle}</p>}
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge text={`순서: ${s.order}`} color="gray" />
                                        <Badge text={s.active ? '활성' : '비활성'} color={s.active ? 'green' : 'gray'} />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => toggleActive(s.id, s.active)} className="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-xs font-bold rounded">{s.active ? '비활성화' : '활성화'}</button>
                                    <button onClick={() => remove(s.id, s.imageUrl)} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded">삭제</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── CLEANUP TAB ─────────────────────────────────────────────────────────────
function CleanupTab() {
    const [status, setStatus] = useState('');
    const [oldCat, setOldCat] = useState('');
    const [newCat, setNewCat] = useState('');

    const checkStatus = async () => {
        setStatus('로딩 중...');
        const [catSnap, musicSnap] = await Promise.all([getDocs(collection(db, 'categories')), getDocs(collection(db, 'music'))]);
        const usage = {};
        musicSnap.docs.forEach(d => { const c = d.data().category; if (c) usage[c] = (usage[c] || 0) + 1; });
        const cats = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        let out = `📁 카테고리: ${cats.length}개\n\n`;
        cats.forEach(c => { out += `  ${c.id}: ${usage[c.id] || 0}개\n`; });
        out += `\n🎵 총 음악: ${musicSnap.size}개\n`;
        const unused = cats.filter(c => !usage[c.id]);
        if (unused.length) out += `\n⚠️ 미사용 카테고리 (${unused.length}개): ${unused.map(c => c.id).join(', ')}`;
        setStatus(out);
    };

    const bulkUpdate = async () => {
        if (!oldCat || !newCat) { alert('두 카테고리 모두 입력해주세요.'); return; }
        if (!confirm(`"${oldCat}" → "${newCat}" 일괄 변경?`)) return;
        const snap = await getDocs(query(collection(db, 'music'), where('category', '==', oldCat)));
        for (let i = 0; i < snap.docs.length; i += 500) {
            const batch = writeBatch(db);
            snap.docs.slice(i, i + 500).forEach(d => batch.update(d.ref, { category: newCat }));
            await batch.commit();
        }
        alert(`${snap.size}개 변경 완료`);
        setOldCat(''); setNewCat('');
    };

    const cleanup = async () => {
        if (!confirm('미사용 카테고리를 모두 삭제?')) return;
        const [catSnap, musicSnap] = await Promise.all([getDocs(collection(db, 'categories')), getDocs(collection(db, 'music'))]);
        const used = new Set(musicSnap.docs.map(d => d.data().category).filter(Boolean));
        const unused = catSnap.docs.filter(d => !used.has(d.id));
        for (const d of unused) await deleteDoc(d.ref);
        alert(`${unused.length}개 삭제 완료: ${unused.map(d => d.id).join(', ')}`);
    };

    // 유효하지 않은 topSection 카테고리 일괄 삭제
    const deleteGarbage = async () => {
        const VALID = new Set(['visual-mode', 'momentary', 'chronicles']);
        const snap = await getDocs(collection(db, 'categories'));
        const garbage = snap.docs.filter(d => !VALID.has(d.data().topSection));
        if (garbage.length === 0) { alert('삭제할 가비지 카테고리가 없습니다. ✅'); return; }
        const names = garbage.map(d => `- ${d.id}  (topSection: "${d.data().topSection || '없음'}")`).join('\n');
        if (!confirm(`다음 ${garbage.length}개 카테고리를 삭제합니다:\n\n${names}\n\n계속하시겠습니까?`)) return;
        let deleted = 0;
        for (const d of garbage) {
            const musicSnap = await getDocs(query(collection(db, 'music'), where('category', '==', d.id)));
            for (let i = 0; i < musicSnap.docs.length; i += 500) {
                const batch = writeBatch(db);
                musicSnap.docs.slice(i, i + 500).forEach(m => batch.update(m.ref, { category: '' }));
                await batch.commit();
            }
            await deleteDoc(d.ref);
            deleted++;
        }
        alert(`완료! ${deleted}개 가비지 카테고리 삭제됨.`);
        checkStatus();
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="text-lg font-bold mb-4">📊 DB 상태 확인</h2>
                <button onClick={checkStatus} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg mb-3">상태 확인</button>
                {status && <pre className="bg-gray-50 border rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">{status}</pre>}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="text-lg font-bold mb-3">🗂️ 카테고리 일괄 변경</h2>
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-semibold mb-1">기존 카테고리</label>
                        <input value={oldCat} onChange={e => setOldCat(e.target.value)} className="w-full border rounded-lg p-2 text-sm" placeholder="기존명" />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-semibold mb-1">새 카테고리</label>
                        <input value={newCat} onChange={e => setNewCat(e.target.value)} className="w-full border rounded-lg p-2 text-sm" placeholder="새 카테고리명" />
                    </div>
                    <button onClick={bulkUpdate} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg">일괄 변경</button>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
                <h2 className="text-lg font-bold mb-2">🧹 미사용 카테고리 정리</h2>
                <p className="text-sm text-gray-500 mb-3">음악에서 사용되지 않는 카테고리를 자동으로 삭제합니다.</p>
                <button onClick={cleanup} className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg">미사용 카테고리 정리</button>
            </div>
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
                <h2 className="text-lg font-bold text-red-700 mb-2">🗑️ 가비지 카테고리 삭제</h2>
                <p className="text-sm text-red-600 mb-1">유효한 섹션: <strong>Looks &amp; Lines (visual-mode)</strong> · <strong>MOMENTARY</strong> · <strong>CHRONICLES</strong></p>
                <p className="text-sm text-gray-600 mb-3">위 3개 섹션에 속하지 않는 모든 카테고리(topSection 없음 포함)를 삭제합니다. 해당 카테고리를 사용하던 음악의 카테고리 필드도 초기화됩니다.</p>
                <button onClick={deleteGarbage} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg">🗑️ 가비지 카테고리 삭제 실행</button>
            </div>
        </div>
    );
}

// ─── MIGRATION TAB ──────────────────────────────────────────────────────────
function MigrationTab() {
    const [log, setLog] = useState('로그가 여기에 표시됩니다...');
    const [ready, setReady] = useState(false);

    const checkStatus = async () => {
        const snap = await getDocs(collection(db, 'categories'));
        let output = '=== 카테고리 상태 ===\n\n';
        const withoutSection = [];
        snap.docs.forEach(d => { if (!d.data().topSection) withoutSection.push(d.id); });
        output += `전체: ${snap.size}개\ntopSection 없음: ${withoutSection.length}개\n`;
        if (withoutSection.length) output += `\n대상:\n${withoutSection.map(n => `  - ${n}`).join('\n')}`;
        setLog(output); setReady(withoutSection.length > 0);
    };

    const runMigration = async () => {
        if (!confirm('topSection 없는 카테고리에 "visual-mode" 추가?')) return;
        const snap = await getDocs(collection(db, 'categories'));
        let count = 0;
        for (const d of snap.docs) {
            if (!d.data().topSection) {
                await updateDoc(d.ref, { topSection: 'visual-mode' });
                count++;
                setLog(p => p + `\n✓ ${d.id} 업데이트됨`);
            }
        }
        setLog(p => p + `\n\n완료! ${count}개 업데이트됨`);
        setReady(false);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h2 className="text-lg font-bold mb-3">🔄 카테고리 데이터 마이그레이션</h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-sm text-yellow-800">
                ⚠️ topSection이 없는 카테고리에 기본값 <strong>visual-mode</strong>를 설정합니다. 이미 값이 있는 카테고리는 건너뜁니다.
            </div>
            <div className="flex gap-3 mb-4">
                <button onClick={checkStatus} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg">1️⃣ 상태 확인</button>
                <button onClick={runMigration} disabled={!ready} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed">2️⃣ 마이그레이션 실행</button>
            </div>
            <pre className="bg-gray-50 border rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">{log}</pre>
        </div>
    );
}

// ─── MAIN ADMIN PAGE ─────────────────────────────────────────────────────────
export default function Admin() {
    const { role, user, loading: authLoading } = useUserStore();
    const [activeTab, setActiveTab] = useState('categories');

    if (authLoading) return <div className="flex h-screen items-center justify-center text-gray-500 bg-gray-50">로딩 중...</div>;
    if (!user || role !== 'admin') return <Navigate to="/" replace />;

    const tabContent = {
        sections: <SectionsTab />,
        categories: <CategoriesTab />,
        recommended: <RecommendedTab />,
        content: <ContentTab />,
        users: <UsersTab />,
        hero: <HeroTab />,
        cleanup: <CleanupTab />,
        migration: <MigrationTab />,
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-gray-900 text-white shadow-md">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">🛠 관리자 대시보드</h1>
                        <p className="text-gray-400 text-sm mt-0.5">{user.email}</p>
                    </div>
                    <Link to="/" className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition">
                        메인으로 →
                    </Link>
                </div>
            </div>

            {/* Tab bar */}
            <div className="bg-white border-b shadow-sm">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex overflow-x-auto">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition ${activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                {tabContent[activeTab]}
            </div>
        </div>
    );
}
