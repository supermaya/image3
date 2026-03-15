export default function ShareModal({ item, onClose }) {
    if (!item) return null;

    const shareUrl = window.location.origin + `/?music=${item.id}`;

    const copyLink = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('링크가 복사되었습니다!');
        });
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-gray-900">공유하기</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
                </div>

                {/* 썸네일 + 제목 */}
                <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl">
                    {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-14 h-14 rounded-lg object-cover" />
                    ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center text-2xl">🎵</div>
                    )}
                    <div>
                        <p className="font-bold text-gray-900 truncate">{item.title || item.name}</p>
                        <p className="text-sm text-gray-500">{item.artist}</p>
                    </div>
                </div>

                {/* 링크 복사 */}
                <div className="flex gap-2 mb-4">
                    <input
                        readOnly
                        value={shareUrl}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600 truncate"
                    />
                    <button
                        onClick={copyLink}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition"
                    >
                        복사
                    </button>
                </div>

                {/* 공유 버튼들 */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(item.title || '')}`, '_blank')}
                        className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition text-sm font-medium"
                    >
                        <span>𝕏</span> Twitter
                    </button>
                    <button
                        onClick={copyLink}
                        className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition text-sm font-medium"
                    >
                        🔗 링크 복사
                    </button>
                </div>
            </div>
        </div>
    );
}
