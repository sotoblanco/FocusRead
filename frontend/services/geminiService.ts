import { api } from "../api";
import { QuizQuestion, ChatMessage } from "../types";

export const generateQuizForChunk = async (chunk: string): Promise<QuizQuestion> => {
  try {
    return await api.generateQuiz(chunk);
  } catch (error) {
    console.error("Error generating quiz:", error);
    return {
      question: "Did you read the section above carefully?",
      options: ["Yes", "No", "Partially", "I'm not sure"],
      correctIndex: 0
    };
  }
};

export const formatChunkToMarkdown = async (chunk: string): Promise<string> => {
  try {
    return await api.formatChunk(chunk);
  } catch (error) {
    console.warn("Formatting failed, returning raw text", error);
    return chunk;
  }
};

export const sendChatMessage = async (currentText: string, history: ChatMessage[], userMessage: string): Promise<string> => {
  try {
    return await api.chatWithAI(currentText, history, userMessage);
  } catch (error) {
    console.error("Chat error:", error);
    return "Sorry, I'm having trouble connecting to the assistant right now.";
  }
};
