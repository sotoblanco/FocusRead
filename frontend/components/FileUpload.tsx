import React, { useState, useRef } from 'react';
import { Chapter } from '../types';
import { api } from '../api';
import { LibraryItem } from '../types';

interface FileUploadProps {
  onProcessed: (text: string, title?: string) => void;
  onChaptersFound: (chapters: Chapter[], pdfDoc: any, totalPages: number) => void;
  onPdfLoaded: (pdfDoc: any, totalPages: number) => void;
  onStoryCreated: (story: LibraryItem) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onProcessed, onChaptersFound, onPdfLoaded, onStoryCreated }) => {
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasteSubmit = () => {
    if (text.trim()) {
      onProcessed(text, "Pasted Content");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      if (file.type === 'application/pdf') {
        try {
          const story = await api.uploadPdf(file);
          onStoryCreated(story);
        } catch (err) {
          console.error(err);
          alert("Failed to upload/process PDF.");
        } finally {
          setIsProcessing(false);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          onProcessed(e.target?.result as string, file.name);
        };
        reader.readAsText(file);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      alert("Error processing file. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-light text-gray-900 mb-2">FocusRead</h1>
        <p className="text-gray-500 text-lg">Deep reading, one paragraph at a time.</p>
      </div>

      <div className="w-full space-y-8 animate-fade-in">
        <div className="relative group max-w-3xl mx-auto">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your long-form text here..."
            className="w-full h-64 p-6 bg-white border border-gray-200 rounded-3xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 resize-none serif-font text-lg leading-relaxed placeholder:font-sans placeholder:italic"
          />
          {text && (
            <button
              onClick={handlePasteSubmit}
              className="absolute bottom-4 right-4 bg-indigo-600 text-white px-6 py-2 rounded-full font-medium shadow-lg hover:bg-indigo-700 transition-colors"
            >
              Start Reading
            </button>
          )}
        </div>

        <div className="flex items-center justify-center space-x-4">
          <div className="h-px bg-gray-200 w-full max-w-[100px]"></div>
          <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">or</span>
          <div className="h-px bg-gray-200 w-full max-w-[100px]"></div>
        </div>

        <div className="flex flex-col items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.txt"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center space-x-2 bg-white border border-gray-200 px-8 py-4 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-300 group"
          >
            <svg className="w-6 h-6 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-gray-600 font-medium group-hover:text-gray-900 transition-colors">
              {isProcessing ? 'Analyzing Document...' : 'Upload PDF or Text File'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
