import { LibraryItem, ReadingSettings, QuizQuestion, ChatMessage } from './types';

const API_BASE = ''; // Use relative path for proxy

class ApiClient {
    private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            credentials: 'include', // Important for cookies
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    // --- Auth ---

    async signup(user: { username: string; email: string; password: string }): Promise<void> {
        // Returns User object but we just need void/success to redirect to login or auto-login
        await this.request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(user),
        });
    }

    async login(user: { username: string; password: string }): Promise<void> {
        await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(user),
        });
    }

    async logout(): Promise<void> {
        await this.request('/auth/logout', { method: 'POST' });
    }

    async getMe(): Promise<import('./types').User> {
        return this.request<import('./types').User>('/auth/me');
    }

    async getLeaderboard(): Promise<import('./types').LeaderboardEntry[]> {
        return this.request<import('./types').LeaderboardEntry[]>('/leaderboard');
    }

    // --- AI Services ---

    async generateQuiz(chunk: string): Promise<QuizQuestion> {
        return this.request<QuizQuestion>('/ai/quiz', {
            method: 'POST',
            body: JSON.stringify({ chunk }),
        });
    }

    async formatChunk(chunk: string): Promise<string> {
        const res = await this.request<{ formattedText: string }>('/ai/format', {
            method: 'POST',
            body: JSON.stringify({ chunk }),
        });
        return res.formattedText;
    }

    async chatWithAI(currentText: string, history: ChatMessage[], message: string): Promise<string> {
        const res = await this.request<{ response: string }>('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ currentText, history, message }),
        });
        return res.response;
    }

    // --- Stories / Library ---

    async getStories(): Promise<LibraryItem[]> {
        return this.request<LibraryItem[]>('/stories');
    }

    async createStory(story: LibraryItem): Promise<LibraryItem> {
        return this.request<LibraryItem>('/stories', {
            method: 'POST',
            body: JSON.stringify(story),
        });
    }

    async updateStory(story: LibraryItem): Promise<LibraryItem> {
        return this.request<LibraryItem>(`/stories/${story.id}`, {
            method: 'PUT',
            body: JSON.stringify(story),
        });
    }

    async deleteStory(id: string): Promise<void> {
        return this.request<void>(`/stories/${id}`, {
            method: 'DELETE',
        });
    }

    // --- Settings ---

    async getSettings(): Promise<ReadingSettings> {
        return this.request<ReadingSettings>('/settings');
    }

    async updateSettings(settings: ReadingSettings): Promise<ReadingSettings> {
        return this.request<ReadingSettings>('/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    }
}

export const api = new ApiClient();
