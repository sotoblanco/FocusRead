import os
import json
import re
from google import genai
from fastapi import APIRouter, HTTPException
from models import (
    QuizRequest, QuizQuestion, 
    FormatRequest, FormatResponse, 
    ChatRequest, ChatResponse
)

from ai_client import client, MODEL_NAME

router = APIRouter(prefix="/ai", tags=["AI"])

def extract_json(text: str) -> dict:
    """Helper to extract JSON from response text"""
    try:
        # Try to find JSON within code blocks first
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Fallback: try to find the first '{' and last '}'
            first_brace = text.find("{")
            last_brace = text.rfind("}")
            if first_brace != -1 and last_brace != -1:
                json_str = text[first_brace : last_brace + 1]
            else:
                json_str = text
        return json.loads(json_str)
    except Exception as e:
        print(f"JSON Parse Error: {e}")
        return None

@router.post("/quiz", response_model=QuizQuestion)
async def generate_quiz(request: QuizRequest):
    if not client:
        return QuizQuestion(
            question="API Key Missing. What is the capital of France?",
            options=["London", "Berlin", "Paris", "Madrid"],
            correctIndex=2
        )

    prompt = f"""
    Based on the following text, generate a single multiple-choice question to test reading comprehension.
    Return ONLY a raw JSON object (no markdown formatting) with the following structure:
    {{
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0 // index of the correct option (0-3)
    }}

    Text:
    {request.chunk}
    """

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )
        
        data = extract_json(response.text)
        if not data:
            raise ValueError("Failed to parse JSON from AI response")
            
        return QuizQuestion(**data)
    except Exception as e:
        print(f"Quiz Gen Error: {e}")
        # Fallback or error
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

@router.post("/format", response_model=FormatResponse)
async def format_chunk(request: FormatRequest):
    if not client:
        return FormatResponse(formattedText=f"**API Key Missing**\n\n{request.chunk}")

    prompt = f"""
    You are an expert editor. Format the following text into clean, readable Markdown.
    - Fix any OCR errors or broken words (e.g. "th e" -> "the").
    - Use appropriate headers, bullet points, and bold text to improve readability.
    - Do NOT summarize; preserve the full content but make it beautiful.
    
    Text:
    {request.chunk}
    """

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt
        )
        return FormatResponse(formattedText=response.text)
    except Exception as e:
        print(f"Format Gen Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to format text")

@router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    if not client:
        return ChatResponse(response="API Key Missing.")

    try:
        # Construct history
        # New SDK might handle history differently, but for generate_content we send 'contents' list
        # We can construct a list of Content objects or just dicts.
        # Format: [{'role': 'user'|'model', 'parts': [{'text': ...}]}]
        
        contents = []
        
        # Add context as system Instruction or first user content?
        # gemini-2.0 often supports system instructions better but let's stick to user prompt for Context
        context_msg = f"Context from text:\n{request.currentText}\n\n"
        
        # Rebuild history
        # Note: 'role' in new SDK is strictly 'user' or 'model'
        for msg in request.history:
            role = 'user' if msg.role == 'user' else 'model'
            contents.append({'role': role, 'parts': [{'text': msg.text}]})
        
        # Append current user message with context if this is the first message or just append context
        if not contents:
             contents.append({'role': 'user', 'parts': [{'text': context_msg + request.message}]})
        else:
             # Just append user message, context might have been established? 
             # For stateless specific questions, valid context is crucial.
             # Let's prepend context to the LAST user message?
             # Or just append a new user message.
             contents.append({'role': 'user', 'parts': [{'text': context_msg + request.message}]})

        # Actually, new SDK usually supports 'chats.create' for multi-turn.
        # But 'generate_content' with a list of contents works as multi-turn input.
        
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents
        )
        
        return ChatResponse(response=response.text)

    except Exception as e:
        print(f"Chat Error: {e}")
        return ChatResponse(response="Sorry, I encountered an error.")
