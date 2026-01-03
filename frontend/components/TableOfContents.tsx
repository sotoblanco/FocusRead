import React from 'react';
import { Chapter } from '../types';

interface TableOfContentsProps {
    chapters: Chapter[];
    currentChunkIndex: number;
    onSelectChapter: (pageIndex: number) => void;
    onClose: () => void;
    isOpen: boolean;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
    chapters,
    currentChunkIndex,
    onSelectChapter,
    onClose,
    isOpen
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Sidebar */}
            <div className="relative w-80 h-full bg-white shadow-2xl p-6 overflow-y-auto animate-slide-in-right">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-light text-gray-900">Contents</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-2">
                    {chapters.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-10">No chapters found.</p>
                    ) : (
                        chapters.map((chapter, i) => {
                            const isActive = currentChunkIndex >= chapter.pageIndex &&
                                (chapters[i + 1] ? currentChunkIndex < chapters[i + 1].pageIndex : true);

                            return (
                                <button
                                    key={i}
                                    onClick={() => {
                                        onSelectChapter(chapter.pageIndex);
                                        onClose();
                                    }}
                                    className={`w-full text-left p-4 rounded-xl transition-all ${isActive
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                            : 'hover:bg-gray-50 text-gray-600 border border-transparent'
                                        }`}
                                >
                                    <div className="flex items-start space-x-3">
                                        <span className={`text-xs font-bold mt-1 ${isActive ? 'text-indigo-400' : 'text-gray-300'}`}>
                                            {chapter.pageIndex + 1}
                                        </span>
                                        <span className="text-sm font-medium leading-relaxed">
                                            {chapter.title}
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
