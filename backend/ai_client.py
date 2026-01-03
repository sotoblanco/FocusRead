import os
from google import genai

api_key = os.getenv("GEMINI_API_KEY")
client = None

if api_key:
    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        print(f"Failed to initialize Gemini Client: {e}")
else:
    print("Warning: GEMINI_API_KEY not set")

MODEL_NAME = "gemini-2.5-flash"
