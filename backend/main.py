from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import ai, stories, settings, auth, leaderboard

from contextlib import asynccontextmanager
from database import db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield

app = FastAPI(
    title="FocusRead API",
    description="Backend for FocusRead application",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
# In production, allow_origins should be restricted to the frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000"
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(stories.router)
app.include_router(settings.router)
app.include_router(leaderboard.router)

