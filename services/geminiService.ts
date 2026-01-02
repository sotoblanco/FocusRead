
import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, ChatMessage } from "../types";

// Fixed: Correctly initialize GoogleGenAI using only the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateQuizForChunk = async (chunk: string): Promise<QuizQuestion> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a multiple choice question to test comprehension of the following text: "${chunk}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description: "A clear, concise question about the core message of the text.",
            },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 distinct plausible options.",
            },
            correctIndex: {
              type: Type.INTEGER,
              description: "The 0-based index of the correct option.",
            },
          },
          required: ["question", "options", "correctIndex"],
        },
      },
    });

    const result = JSON.parse(response.text?.trim() || '{}');
    return result as QuizQuestion;
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
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are an expert typography and formatting engine. 
      Analyze the following text which comes from a raw PDF extraction.
      Your goal is to reformat it into clean, readable Markdown.
      
      Rules:
      1. Detect headings and format them with #, ##, etc.
      2. Detect lists (numbered or bullet) and format them properly.
      3. Fix broken line breaks (join lines that shouldn't be broken).
      4. Bold key terms or concepts if appropriate for emphasis.
      5. Do NOT summarize. Keep the content exactly the same, just improve the presentation.
      
      Input Text:
      "${chunk}"`,
    });

    return response.text?.trim() || chunk;
  } catch (error) {
    console.warn("Formatting failed, returning raw text", error);
    return chunk;
  }
};

export const sendChatMessage = async (currentText: string, history: ChatMessage[], userMessage: string): Promise<string> => {
  try {
    // We construct a specific prompt that gives the model the current paragraph as immediate context.
    const systemContext = `
      You are a helpful AI reading assistant. The user is currently reading a specific section of a document.
      
      CURRENT READING SECTION:
      """
      ${currentText}
      """
      
      Answer the user's question based primarily on this section. If the answer isn't in the section, you can use general knowledge but mention that it's not in the text.
      Keep answers concise and helpful.
    `;

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      history: history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      })),
      config: {
        systemInstruction: "You are a helpful, knowledgeable reading tutor helping a student understand a text."
      }
    });

    // We prepend the context to the user's message invisibly to ensure the model focuses on the current text
    const response = await chat.sendMessage({ 
      message: `${systemContext}\n\nUser Question: ${userMessage}` 
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Chat error:", error);
    return "Sorry, I'm having trouble connecting to the assistant right now.";
  }
};
