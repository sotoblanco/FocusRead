
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface SessionStats {
  correctAnswers: number;
  totalQuestions: number;
  startTime: number;
  wordCount: number;
  endTime?: number;
  date?: string;
  title?: string;
}

export type AppView = 'upload' | 'chapter-select' | 'page-selection' | 'reading' | 'summary';

export interface Chunk {
  text: string;
  formattedText?: string; // Cache for AI-formatted markdown
  id: number;
}

export interface Chapter {
  title: string;
  pageIndex: number;
  itemCount?: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  chunks: Chunk[];
  currentIndex: number;
  stats: SessionStats;
  elapsedTime: number;
  lastRead: number;
  isComplete: boolean;
}

export interface ReadingSettings {
  theme: 'light' | 'sepia' | 'dark';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  alignment: 'left' | 'justify';
  lineHeight: 'normal' | 'relaxed' | 'loose';
  width: 'narrow' | 'standard' | 'wide';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface LeaderboardEntry {
  username: string;
  total_books_completed: number;
  total_words_read: number;
  total_correct_answers: number;
}
