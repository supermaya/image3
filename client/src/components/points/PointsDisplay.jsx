import { useState } from 'react';
import usePointsStore from '../../store/pointsStore';

export default function PointsDisplay({ onOpenPurchase }) {
    const { dailyPoints, walletBalance } = usePointsStore();
    const [hovered, setHovered] = useState(false);

    return (
        <button
            onClick={onOpenPurchase}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title="포인트 채우기"
            className={`
                flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200
                ${hovered
                    ? 'bg-indigo-50 border-indigo-300 shadow-md scale-105'
                    : 'bg-white border-gray-200 shadow-sm'}
            `}
        >
            {/* 일일 포인트 */}
            <span className="flex items-center gap-1">
                <span className="text-base leading-none">⚡</span>
                <span className={`text-xs font-bold ${dailyPoints > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {dailyPoints.toLocaleString()}P
                </span>
            </span>

            <span className="text-gray-300 text-xs">|</span>

            {/* 지갑 포인트 */}
            <span className="flex items-center gap-1">
                <span className="text-base leading-none">💎</span>
                <span className={`text-xs font-bold ${walletBalance > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {walletBalance.toLocaleString()}P
                </span>
            </span>
        </button>
    );
}
