
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileUpload } from './components/FileUpload';
import { QuizCard } from './components/QuizCard';
import { ChatInterface } from './components/ChatInterface';
import { generateQuizForChunk, formatChunkToMarkdown, sendChatMessage } from './services/geminiService';
import { AppView, Chunk, SessionStats, QuizQuestion, Chapter, LibraryItem, ReadingSettings, ChatMessage } from './types';

const STORAGE_KEY_LIBRARY = 'focusread_library_v2';
const STORAGE_KEY_SETTINGS = 'focusread_settings_v2'; 

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('upload');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Page selection state
  const [totalPages, setTotalPages] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);

  // Reading Settings
  const [settings, setSettings] = useState<ReadingSettings>({
    theme: 'light',
    fontSize: 'md',
    alignment: 'left',
    lineHeight: 'relaxed',
    width: 'standard'
  });
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Session states
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuiz, setCurrentQuiz] = useState<QuizQuestion | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false); 
  const [showQuiz, setShowQuiz] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('New Session');
  const [stats, setStats] = useState<SessionStats>({
    correctAnswers: 0,
    totalQuestions: 0,
    startTime: 0,
    wordCount: 0,
  });
  const [elapsedTime, setElapsedTime] = useState(0);

  // Chapter support
  const [availableChapters, setAvailableChapters] = useState<Chapter[]>([]);
  const [currentPdf, setCurrentPdf] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Load persistence data
  useEffect(() => {
    const savedLib = localStorage.getItem(STORAGE_KEY_LIBRARY);
    if (savedLib) {
      try { setLibrary(JSON.parse(savedLib)); } catch (e) { console.error(e); }
    }
    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
      try { 
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed })); 
      } catch (e) { console.error(e); }
    }
  }, []);

  // Sync settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // Sync active session
  useEffect(() => {
    if (view === 'reading' && activeSessionId) {
      setLibrary(prev => {
        const updated = prev.map(item => {
          if (item.id === activeSessionId) {
            return {
              ...item,
              currentIndex,
              stats,
              elapsedTime,
              lastRead: Date.now(),
              chunks: chunks 
            };
          }
          return item;
        });
        localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(updated));
        return updated;
      });
    }
  }, [currentIndex, stats, elapsedTime, view, activeSessionId, chunks]);

  const processText = (text: string, title?: string) => {
    // 1. Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n');

    // 2. Initial Split Strategy
    // Default: Split by double newline (standard paragraphs)
    let rawSegments = normalizedText.split(/\n\s*\n/);

    // Heuristic: If we have very few segments for a long text, it might be single-newline separated (common in some PDFs)
    if (rawSegments.length < 3 && normalizedText.length > 600) {
       // Split by newline ONLY if it looks like the end of a sentence (punctuation) 
       // to avoid breaking mid-sentence lines in standard PDFs.
       rawSegments = normalizedText.split(/(?<=[.!?])\s*\n/);
    }

    // 3. Process and Refine Segments for Focus Mode
    let refinedChunks: string[] = [];
    
    rawSegments.forEach(segment => {
      // Unwrap hard-wrapped lines within the paragraph
      let cleanSegment = segment
        .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with single space
        .replace(/([a-z])-\s+([a-z])/gi, '$1$2') // Fix hyphenation
        .trim();

      if (cleanSegment.length === 0) return;

      // STRICT FOCUS: If a paragraph is massive (> 1000 chars), split it into smaller logical sub-blocks.
      // This ensures the "single paragraph" view is never a daunting wall of text.
      if (cleanSegment.length > 1000) {
        // Regex looks for sentence endings.
        const sentences = cleanSegment.match(/[^.!?]+[.!?]+["']?|.+$/g) || [cleanSegment];
        let currentChunk = '';
        
        sentences.forEach(sentence => {
          if ((currentChunk + sentence).length > 600) {
            refinedChunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        });
        if (currentChunk) refinedChunks.push(currentChunk.trim());
      } else {
        refinedChunks.push(cleanSegment);
      }
    });

    // 4. Merge orphans (very short chunks)
    const finalChunks: string[] = [];
    refinedChunks.forEach((chunk, i) => {
       // If chunk is tiny (< 60 chars) and not the first one, append to previous
       // This handles weird PDF artifacts or headers/footers appearing as lines
       if (chunk.length < 60 && finalChunks.length > 0) {
         finalChunks[finalChunks.length - 1] += ' ' + chunk;
       } else {
         finalChunks.push(chunk);
       }
    });

    // Fallback if processing failed
    if (finalChunks.length === 0 && text.trim().length > 0) {
       finalChunks.push(text.trim());
    }

    const chunkObjects = finalChunks.map((text, id) => ({ text, id }));
    const name = title || (finalChunks[0]?.slice(0, 30) + "..." || "New Doc");
    const newId = crypto.randomUUID();

    const newItem: LibraryItem = {
      id: newId,
      title: name,
      chunks: chunkObjects,
      currentIndex: 0,
      stats: {
        correctAnswers: 0,
        totalQuestions: 0,
        startTime: Date.now(),
        wordCount: 0,
        title: name
      },
      elapsedTime: 0,
      lastRead: Date.now(),
      isComplete: false
    };

    setLibrary(prev => {
      const updated = [newItem, ...prev];
      localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(updated));
      return updated;
    });

    startSession(newItem);
  };

  const startSession = (item: LibraryItem) => {
    setActiveSessionId(item.id);
    setChunks(item.chunks);
    setCurrentIndex(item.currentIndex);
    setStats({
      ...item.stats,
      startTime: Date.now() - (item.elapsedTime * 1000)
    });
    setElapsedTime(item.elapsedTime);
    setSessionTitle(item.title);
    setView('reading');
    setShowQuiz(false);
    setShowSettingsMenu(false);
    setShowChat(false);
    setChatMessages([]); // Reset chat for new session
  };

  const deleteLibraryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure? This will remove the document and its focus history.")) return;
    setLibrary(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(updated));
      return updated;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setView('upload');
    }
  };

  const handleChaptersFound = (chapters: Chapter[], pdf: any, total: number) => {
    setAvailableChapters(chapters);
    setCurrentPdf(pdf);
    setTotalPages(total);
    setEndPage(total);
    setView('chapter-select');
  };

  const handlePdfLoaded = (pdf: any, total: number) => {
    setCurrentPdf(pdf);
    setTotalPages(total);
    setStartPage(1);
    setEndPage(total);
    setView('page-selection');
  };

  const selectChapter = async (chapter: Chapter, index: number) => {
    setIsExtracting(true);
    try {
      const nextChapter = availableChapters[index + 1];
      const start = chapter.pageIndex + 1;
      const end = nextChapter ? nextChapter.pageIndex : totalPages;
      
      let chapterText = '';
      for (let i = start; i <= end; i++) {
        const page = await currentPdf.getPage(i);
        const content = await page.getTextContent();
        chapterText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
      }
      processText(chapterText, chapter.title);
    } catch (err) {
      alert("Failed to extract chapter.");
    } finally {
      setIsExtracting(false);
    }
  };

  const readSelectedRange = async () => {
    if (startPage < 1 || endPage > totalPages || startPage > endPage) {
      alert("Please select a valid page range.");
      return;
    }
    
    setIsExtracting(true);
    try {
      let fullText = '';
      for (let i = startPage; i <= endPage; i++) {
        const page = await currentPdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
      }
      processText(fullText, `Pages ${startPage}-${endPage}`);
    } catch (err) {
      alert("Failed to read selection.");
    } finally {
      setIsExtracting(false);
    }
  };

  const readFullDocument = async () => {
    setIsExtracting(true);
    try {
      let fullText = '';
      for (let i = 1; i <= totalPages; i++) {
        const page = await currentPdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item: any) => item.str).join(' ') + '\n\n';
      }
      processText(fullText, "Full Document");
    } catch (err) {
      alert("Failed to read document.");
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (view === 'reading') {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - stats.startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [view, stats.startTime]);

  const fetchContent = useCallback(async () => {
    if (!chunks[currentIndex]) return;
    
    // 1. Fetch Quiz
    setIsQuizLoading(true);
    generateQuizForChunk(chunks[currentIndex].text).then(q => {
      setCurrentQuiz(q);
      setIsQuizLoading(false);
    });

    // 2. Fetch/Repair Formatting (if not already cached)
    if (!chunks[currentIndex].formattedText) {
      setIsFormatting(true);
      formatChunkToMarkdown(chunks[currentIndex].text).then(fmt => {
        setChunks(prev => {
           const newChunks = [...prev];
           newChunks[currentIndex] = { ...newChunks[currentIndex], formattedText: fmt };
           return newChunks;
        });
        setIsFormatting(false);
      });
    }

  }, [chunks, currentIndex]);

  useEffect(() => {
    if (view === 'reading') { fetchContent(); }
  }, [currentIndex, view, fetchContent]);

  const handleAnswer = (correct: boolean) => {
    setStats(prev => ({
      ...prev,
      correctAnswers: prev.correctAnswers + (correct ? 1 : 0),
      totalQuestions: prev.totalQuestions + 1,
      wordCount: prev.wordCount + chunks[currentIndex].text.split(/\s+/).length
    }));

    if (correct) {
      if (currentIndex < chunks.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setShowQuiz(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Optional: clear chat or keep history? Keeping history is usually better.
      } else {
        setLibrary(prev => {
          const updated = prev.map(item => item.id === activeSessionId ? { ...item, isComplete: true, lastRead: Date.now() } : item);
          localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(updated));
          return updated;
        });
        setView('summary');
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    setChatMessages(prev => [...prev, newUserMsg]);
    setIsChatLoading(true);
    
    // Use the raw text for context, not the formatted one, to save tokens and avoid markdown artifacts
    const currentContext = chunks[currentIndex]?.text || "";
    
    const response = await sendChatMessage(currentContext, chatMessages, text);
    
    const newAiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response, timestamp: Date.now() };
    setChatMessages(prev => [...prev, newAiMsg]);
    setIsChatLoading(false);
  };

  const lifetimeStats = useMemo(() => ({
    totalWords: library.reduce((acc, curr) => acc + (curr.stats.wordCount || 0), 0),
    avgAccuracy: library.length > 0 
      ? Math.round(library.reduce((acc, curr) => acc + (curr.stats.totalQuestions > 0 ? (curr.stats.correctAnswers / curr.stats.totalQuestions) * 100 : 0), 0) / library.length)
      : 0
  }), [library]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getThemeClass = () => `theme-${settings.theme}`;
  
  const getContainerWidthClass = () => {
    switch(settings.width) {
      case 'narrow': return 'max-w-xl';
      case 'wide': return 'max-w-4xl';
      default: return 'max-w-2xl';
    }
  };

  const getAlignmentClass = () => settings.alignment === 'justify' ? 'text-justify' : 'text-left';
  
  const getLineHeightClass = () => {
    switch(settings.lineHeight) {
      case 'tight': return 'leading-normal'; 
      case 'loose': return 'leading-loose'; 
      default: return 'leading-relaxed'; 
    }
  };

  const getFontClass = () => `fs-${settings.fontSize}`;

  const displayContent = chunks[currentIndex]?.formattedText || chunks[currentIndex]?.text;
  const isEnhancing = !chunks[currentIndex]?.formattedText && isFormatting;

  const btnBase = "flex-1 h-9 rounded-lg text-xs font-medium border transition-all flex items-center justify-center";
  const btnActive = "bg-indigo-600 text-white border-indigo-600 shadow-sm";
  const btnInactive = "bg-transparent text-gray-500 border-gray-200 hover:border-indigo-300";
  const darkBtnInactive = "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10";

  const getBtnClass = (isActive: boolean) => 
    `${btnBase} ${isActive ? btnActive : settings.theme === 'dark' ? darkBtnInactive : btnInactive}`;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${getThemeClass()}`}>
      {/* Navigation Header */}
      {view !== 'upload' && view !== 'chapter-select' && view !== 'page-selection' && (
        <header className={`sticky top-0 z-20 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between ${settings.theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-white/40 border-gray-100'}`}>
          <button onClick={() => setView('upload')} className="opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          
          <div className="flex-1 px-8 text-center hidden md:block">
            <h1 className="text-sm font-medium opacity-60 truncate max-w-sm mx-auto">{sessionTitle}</h1>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-4 text-xs font-bold tracking-widest uppercase opacity-40">
              <span>Section {currentIndex + 1} of {chunks.length}</span>
              <span className="hidden sm:inline">{formatTime(elapsedTime)}</span>
            </div>
            
            <div className="flex space-x-2">
              <button 
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-full hover:bg-black/5 transition-colors ${showChat ? 'bg-black/5 text-indigo-500' : ''}`}
                title="Ask AI"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </button>

              <button 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className={`p-2 rounded-full hover:bg-black/5 transition-colors ${showSettingsMenu ? 'bg-black/5' : ''}`}
                title="Reading Settings"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Reading Settings Dropdown */}
      {showSettingsMenu && view === 'reading' && (
        <div className={`absolute right-6 top-20 z-30 p-6 rounded-3xl shadow-2xl border animate-fade-in w-72 ${settings.theme === 'dark' ? 'bg-[#2a2a2a] border-white/10' : 'bg-white border-gray-100'}`}>
          <div className="space-y-6">
            {/* Theme */}
            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Theme</label>
              <div className="flex space-x-2">
                {(['light', 'sepia', 'dark'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setSettings(s => ({ ...s, theme: t }))}
                    className={`flex-1 h-9 rounded-lg border-2 transition-all ${settings.theme === t ? 'border-indigo-500' : 'border-transparent'} ${t === 'light' ? 'bg-white border-gray-200' : t === 'sepia' ? 'bg-[#f4ecd8]' : 'bg-[#1a1a1a]'}`}
                  />
                ))}
              </div>
            </section>

            {/* Font Size */}
            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Size</label>
              <div className="flex space-x-2">
                {(['sm', 'md', 'lg', 'xl'] as const).map(sz => (
                  <button
                    key={sz}
                    onClick={() => setSettings(s => ({ ...s, fontSize: sz }))}
                    className={getBtnClass(settings.fontSize === sz)}
                  >
                    {sz === 'sm' ? 'A' : sz === 'md' ? 'A+' : sz === 'lg' ? 'A++' : 'A#'}
                  </button>
                ))}
              </div>
            </section>

            {/* Width & Align */}
            <section className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Width</label>
                  <div className="flex space-x-1">
                     <button onClick={() => setSettings(s => ({...s, width: 'narrow'}))} className={getBtnClass(settings.width === 'narrow')}>S</button>
                     <button onClick={() => setSettings(s => ({...s, width: 'standard'}))} className={getBtnClass(settings.width === 'standard')}>M</button>
                     <button onClick={() => setSettings(s => ({...s, width: 'wide'}))} className={getBtnClass(settings.width === 'wide')}>L</button>
                  </div>
               </div>
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Align</label>
                  <div className="flex space-x-1">
                     <button onClick={() => setSettings(s => ({...s, alignment: 'left'}))} className={getBtnClass(settings.alignment === 'left')}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" /></svg>
                     </button>
                     <button onClick={() => setSettings(s => ({...s, alignment: 'justify'}))} className={getBtnClass(settings.alignment === 'justify')}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                     </button>
                  </div>
               </div>
            </section>

            {/* Line Height */}
            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 block">Line Height</label>
              <div className="flex space-x-2">
                <button onClick={() => setSettings(s => ({...s, lineHeight: 'normal'}))} className={getBtnClass(settings.lineHeight === 'normal')}>Compact</button>
                <button onClick={() => setSettings(s => ({...s, lineHeight: 'relaxed'}))} className={getBtnClass(settings.lineHeight === 'relaxed')}>Normal</button>
                <button onClick={() => setSettings(s => ({...s, lineHeight: 'loose'}))} className={getBtnClass(settings.lineHeight === 'loose')}>Relaxed</button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Chat Interface Sidebar */}
      <ChatInterface 
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        isLoading={isChatLoading}
        theme={settings.theme}
      />

      <main className="flex-1 overflow-auto flex flex-col items-center">
        {view === 'upload' && (
          <div className="w-full max-w-6xl mx-auto px-6 py-12 space-y-16">
            <FileUpload 
              onProcessed={processText} 
              onChaptersFound={handleChaptersFound}
              onPdfLoaded={handlePdfLoaded}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 pt-12 border-t border-gray-100 animate-fade-in">
              <div className="lg:col-span-1 space-y-8">
                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Focus Stats</h3>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                    <div><div className="text-3xl font-light text-indigo-600">{lifetimeStats.totalWords.toLocaleString()}</div><div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Words Read</div></div>
                    <div><div className="text-3xl font-light text-emerald-600">{lifetimeStats.avgAccuracy}%</div><div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Accuracy</div></div>
                  </div>
                </section>
              </div>

              <div className="lg:col-span-3 space-y-8">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Recent Library</h3>
                {library.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-gray-100 rounded-[2.5rem] p-20 text-center"><p className="text-gray-400 font-medium">Your library is currently empty.</p></div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {library.map((item) => (
                      <div 
                        key={item.id} 
                        onClick={() => startSession(item)}
                        className={`group bg-white border border-gray-100 p-8 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer flex flex-col justify-between ${item.id === activeSessionId ? 'ring-2 ring-indigo-500' : ''}`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="font-semibold text-lg text-gray-800 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">{item.title}</h4>
                            <button onClick={(e) => deleteLibraryItem(item.id, e)} className="text-gray-200 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                          <div className="flex items-center space-x-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">
                            <span>{new Date(item.lastRead).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{item.chunks.length} sections</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                            <span>Progress</span>
                            <span>{Math.round(((item.currentIndex + 1) / item.chunks.length) * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${((item.currentIndex + 1) / item.chunks.length) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'chapter-select' && (
          <div className="max-w-4xl mx-auto w-full p-8 py-24 animate-fade-in text-center">
             <header className="mb-12">
               <h2 className="text-3xl font-light mb-4">Table of Contents</h2>
               <p className="text-gray-500">Choose a section to focus on or select a custom range.</p>
             </header>
            
            <div className="grid gap-4 max-w-xl mx-auto mb-12">
              {availableChapters.map((chapter, idx) => (
                <button key={idx} onClick={() => selectChapter(chapter, idx)} className="group text-left bg-white border border-gray-100 p-6 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <span className="text-indigo-600 font-bold opacity-30">{idx + 1}</span>
                    <h4 className="font-semibold text-gray-800">{chapter.title}</h4>
                  </div>
                  <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
              <button onClick={() => setView('page-selection')} className="text-indigo-600 font-medium hover:underline">Select Custom Pages</button>
              <div className="w-1 h-1 bg-gray-300 rounded-full hidden sm:block"></div>
              <button onClick={readFullDocument} className="text-gray-400 hover:text-indigo-600 transition-colors font-medium">Read full document</button>
            </div>
          </div>
        )}

        {view === 'page-selection' && (
          <div className="max-w-xl mx-auto py-24 px-6 text-center animate-fade-in">
             <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
             </div>
             <h2 className="text-3xl font-light mb-2">Page Selection</h2>
             <p className="text-gray-500 mb-12">Total pages in document: <span className="font-bold text-gray-900">{totalPages}</span></p>

             <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm space-y-8 mb-12">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Start Page</label>
                    <input 
                      type="number" 
                      min="1" 
                      max={totalPages} 
                      value={startPage} 
                      onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
                      className="w-full bg-gray-50 border-none rounded-xl p-4 text-center text-xl font-semibold focus:ring-2 focus:ring-indigo-500" 
                    />
                  </div>
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">End Page</label>
                    <input 
                      type="number" 
                      min={startPage} 
                      max={totalPages} 
                      value={endPage} 
                      onChange={(e) => setEndPage(parseInt(e.target.value) || 1)}
                      className="w-full bg-gray-50 border-none rounded-xl p-4 text-center text-xl font-semibold focus:ring-2 focus:ring-indigo-500" 
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-xl text-indigo-700 text-sm font-medium">
                  Extracting {endPage - startPage + 1} pages
                </div>
             </div>

             <div className="space-y-4">
                <button 
                  onClick={readSelectedRange}
                  disabled={isExtracting}
                  className="w-full bg-indigo-600 text-white py-5 rounded-[1.5rem] font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center space-x-3"
                >
                  {isExtracting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Extracting Text...</span>
                    </>
                  ) : (
                    <span>Start Focused Session</span>
                  )}
                </button>
                <button 
                  onClick={() => setView(availableChapters.length > 0 ? 'chapter-select' : 'upload')}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
             </div>
          </div>
        )}

        {view === 'reading' && (
          <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[60vh] pb-24">
            <div className={`w-full ${getContainerWidthClass()} mx-auto px-6 md:px-10 py-12 animate-fade-in transition-all duration-300`}>
              {/* Reading Content Area */}
              <div className="flex flex-col space-y-8 relative">
                
                {/* AI Formatting Indicator */}
                {isEnhancing && (
                   <div className="absolute -top-8 left-0 flex items-center space-x-2 text-xs text-indigo-500 font-bold uppercase tracking-widest animate-pulse">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                     <span>Enhancing Layout...</span>
                   </div>
                )}

                {/* Text Renderer */}
                <div className={`serif-font ${getAlignmentClass()} ${getLineHeightClass()} ${getFontClass()} markdown-content ${isEnhancing ? 'opacity-80 transition-opacity' : ''}`}>
                  {isEnhancing && !chunks[currentIndex]?.formattedText ? (
                    // While waiting for first enhancement, show raw text with shimmer or just raw text
                     <p className="whitespace-pre-wrap">{chunks[currentIndex]?.text}</p>
                  ) : (
                     <ReactMarkdown>{displayContent}</ReactMarkdown>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center space-y-8 pt-16 mt-8 border-t border-black/5">
                {!showQuiz ? (
                  <button
                    onClick={() => setShowQuiz(true)}
                    className="group bg-indigo-600 text-white px-10 py-4 rounded-full font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-105 transition-all"
                  >
                    See next paragraph
                  </button>
                ) : (
                  <QuizCard quiz={currentQuiz!} onAnswer={handleAnswer} isLoading={isQuizLoading} />
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'summary' && (
          <div className="max-w-xl mx-auto py-24 px-6 text-center animate-fade-in">
            <div className="mb-12">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-3xl font-light mb-2">Deep Focus Achieved</h2>
              <p className="opacity-50">"{sessionTitle}" has been fully processed.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-12">
              <div className="bg-black/5 p-6 rounded-3xl">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Duration</div>
                <div className="text-2xl font-semibold">{formatTime(elapsedTime)}</div>
              </div>
              <div className="bg-black/5 p-6 rounded-3xl">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Words</div>
                <div className="text-2xl font-semibold">{stats.wordCount}</div>
              </div>
            </div>

            <button onClick={() => setView('upload')} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
              Finish Session
            </button>
          </div>
        )}
      </main>

      {/* Modern Progress Line */}
      {view === 'reading' && (
        <div className="fixed bottom-0 left-0 w-full h-1.5 bg-black/5 z-40">
          <div 
            className="h-full bg-indigo-500 transition-all duration-700 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            style={{ width: `${((currentIndex + 1) / chunks.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default App;
