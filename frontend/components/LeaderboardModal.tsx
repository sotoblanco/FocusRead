import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { LeaderboardEntry } from '../types';

interface LeaderboardModalProps {
    onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose }) => {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        api.getLeaderboard()
            .then(data => {
                setEntries(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Leaderboard</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-auto">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">No data yet. Get reading!</div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="text-xs text-gray-400 uppercase tracking-wider font-bold">
                                <tr>
                                    <th className="pb-4">Rank</th>
                                    <th className="pb-4">User</th>
                                    <th className="pb-4 text-right">Books</th>
                                    <th className="pb-4 text-right">Words</th>
                                    <th className="pb-4 text-right">Quiz Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {entries.map((entry, index) => (
                                    <tr key={entry.username} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="py-4 font-bold text-gray-400 w-12 text-center">
                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                                        </td>
                                        <td className="py-4 font-medium text-gray-900 dark:text-gray-100">{entry.username}</td>
                                        <td className="py-4 text-right text-gray-600 dark:text-gray-300 font-mono">{entry.total_books_completed}</td>
                                        <td className="py-4 text-right text-gray-600 dark:text-gray-300 font-mono">{entry.total_words_read.toLocaleString()}</td>
                                        <td className="py-4 text-right text-indigo-600 font-mono font-bold">{entry.total_correct_answers}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
