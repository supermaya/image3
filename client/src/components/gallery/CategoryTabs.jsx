import { useEffect, useState } from 'react';
import { fetchCategories } from '../../services/firestore';

// 카테고리별 색상 팔레트 (순환 사용)
const COLORS = [
    { bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-500', idle: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' },
    { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500', idle: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' },
    { bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-500', idle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
    { bg: 'bg-green-600', text: 'text-white', border: 'border-green-600', idle: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
    { bg: 'bg-teal-600', text: 'text-white', border: 'border-teal-600', idle: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100' },
    { bg: 'bg-cyan-600', text: 'text-white', border: 'border-cyan-600', idle: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100' },
    { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-600', idle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
    { bg: 'bg-indigo-600', text: 'text-white', border: 'border-indigo-600', idle: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
    { bg: 'bg-violet-600', text: 'text-white', border: 'border-violet-600', idle: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' },
    { bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-600', idle: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
    { bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-500', idle: 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100' },
    { bg: 'bg-fuchsia-600', text: 'text-white', border: 'border-fuchsia-600', idle: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-100' },
];

export default function CategoryTabs({ activeMode, activeCategory, setActiveCategory }) {
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetchCategories().then(cats => {
            // 현재 모드(topSection)에 해당하는 카테고리만 표시
            const forMode = cats
                .filter(c => c.topSection === activeMode)
                .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'ko'));
            setCategories(forMode);
        });
    }, [activeMode]);

    return (
        <div className="flex flex-wrap gap-1.5 py-1">
            {/* 전체 탭 — 다크 */}
            <button
                onClick={() => setActiveCategory('all')}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-all duration-200 shadow-sm ${activeCategory === 'all'
                    ? 'bg-gray-900 text-white border-gray-900 shadow-gray-400/30 shadow-md'
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
            >
                전체
            </button>

            {categories.map((cat, i) => {
                const color = COLORS[i % COLORS.length];
                const isActive = activeCategory === cat.id;
                return (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-all duration-200 shadow-sm ${isActive
                            ? `${color.bg} ${color.text} ${color.border} shadow-md scale-105`
                            : `${color.idle} border`
                            }`}
                    >
                        {cat.name || cat.id}
                    </button>
                );
            })}
        </div>
    );
}
