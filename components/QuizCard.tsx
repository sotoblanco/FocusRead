
import React, { useState } from 'react';
import { QuizQuestion } from '../types';

interface QuizCardProps {
  quiz: QuizQuestion;
  onAnswer: (correct: boolean) => void;
  isLoading: boolean;
}

export const QuizCard: React.FC<QuizCardProps> = ({ quiz, onAnswer, isLoading }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-gray-500 font-medium">Preparing your comprehension check...</p>
      </div>
    );
  }

  const handleOptionClick = (index: number) => {
    if (selectedIndex !== null) return;
    setSelectedIndex(index);
    const correct = index === quiz.correctIndex;
    setIsCorrect(correct);
    setTimeout(() => {
      onAnswer(correct);
      setSelectedIndex(null);
      setIsCorrect(null);
    }, 1200);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm animate-fade-in max-w-2xl mx-auto w-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-6 leading-relaxed">
        {quiz.question}
      </h3>
      <div className="grid gap-3">
        {quiz.options.map((option, index) => {
          let statusStyle = "border-gray-200 hover:border-indigo-400 hover:bg-indigo-50";
          if (selectedIndex === index) {
            statusStyle = index === quiz.correctIndex 
              ? "border-green-500 bg-green-50 text-green-700" 
              : "border-red-500 bg-red-50 text-red-700";
          } else if (selectedIndex !== null && index === quiz.correctIndex) {
            statusStyle = "border-green-500 bg-green-50 text-green-700";
          }

          return (
            <button
              key={index}
              disabled={selectedIndex !== null}
              onClick={() => handleOptionClick(index)}
              className={`text-left p-4 rounded-lg border transition-all duration-200 ${statusStyle}`}
            >
              <div className="flex items-center">
                <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold mr-3 shrink-0">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm font-medium">{option}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
