import React, { useState, useEffect, useRef } from 'react';

interface PageSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPage: (pageIndex: number) => void;
    totalPages: number;
    currentPage: number;
}

export const PageSelector: React.FC<PageSelectorProps> = ({
    isOpen,
    onClose,
    onSelectPage,
    totalPages,
    currentPage
}) => {
    const [val, setVal] = useState(currentPage.toString());
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setVal(currentPage.toString());
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, currentPage]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(val);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            onSelectPage(page);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-scale-in">
                <h3 className="text-xl font-light text-center mb-6 text-gray-900">Go to Page</h3>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="number"
                            min="1"
                            max={totalPages}
                            value={val}
                            onChange={(e) => setVal(e.target.value)}
                            className="w-full bg-gray-50 border-none rounded-2xl p-6 text-center text-4xl font-light text-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all font-serif"
                        />
                        <div className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
                            of {totalPages}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 font-medium hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 transition-all"
                        >
                            Jump
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
