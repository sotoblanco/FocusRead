from typing import List, Optional
from pydantic import BaseModel

# --- Shared Models (Frontend <-> Backend) ---

class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correctIndex: int

class SessionStats(BaseModel):
    correctAnswers: int
    totalQuestions: int
    startTime: int
    wordCount: int
    endTime: Optional[int] = None
    date: Optional[str] = None
    title: Optional[str] = None

class Chunk(BaseModel):
    text: str
    formattedText: Optional[str] = None
    id: int
    isProcessed: bool = True

class Chapter(BaseModel):
    title: str
    pageIndex: int

class LibraryItem(BaseModel):
    id: str
    title: str
    chunks: List[Chunk]
    chapters: List[Chapter] = []
    currentIndex: int
    stats: SessionStats
    elapsedTime: int
    lastRead: int
    isComplete: bool

class ReadingSettings(BaseModel):
    theme: str # 'light' | 'sepia' | 'dark'
    fontSize: str # 'sm' | 'md' | 'lg' | 'xl'
    alignment: str # 'left' | 'justify'
    lineHeight: str # 'normal' | 'relaxed' | 'loose'
    width: str # 'narrow' | 'standard' | 'wide'

class ChatMessage(BaseModel):
    id: str
    role: str # 'user' | 'model'
    text: str
    timestamp: int

# --- AI Models ---

class QuizRequest(BaseModel):
    chunk: str

class FormatRequest(BaseModel):
    chunk: str

class FormatResponse(BaseModel):
    formattedText: str

class ChatRequest(BaseModel):
    currentText: str
    history: List[ChatMessage]
    message: str

class ChatResponse(BaseModel):
    response: str

# --- Auth Models ---

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(UserBase):
    id: str
    model_config = {"from_attributes": True}
