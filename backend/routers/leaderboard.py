from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, desc
from db_models import DBLibraryItem, DBUser
from database import AsyncSessionLocal

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])

class LeaderboardEntry(BaseModel):
    username: str
    total_books_completed: int
    total_words_read: int
    total_correct_answers: int

@router.get("", response_model=List[LeaderboardEntry])
async def get_leaderboard():
    async with AsyncSessionLocal() as session:
        # We need to aggregate stats per user
        # For simplicity in this SQL-light version, we'll fetch all items and aggregate in Python
        # In a real heavy-load scenario, we would write a GROUP BY query
        
        # Join User to get usernames
        stmt = select(DBLibraryItem, DBUser).join(DBUser, DBLibraryItem.user_id == DBUser.id)
        result = await session.execute(stmt)
        rows = result.all()
        
        user_stats = {}
        
        for item, user in rows:
            if user.username not in user_stats:
                user_stats[user.username] = {
                    "username": user.username,
                    "total_books_completed": 0,
                    "total_words_read": 0,
                    "total_correct_answers": 0
                }
            
            stats = item.stats # JSON dict
            if stats:
                user_stats[user.username]["total_words_read"] += stats.get("wordCount", 0)
                user_stats[user.username]["total_correct_answers"] += stats.get("correctAnswers", 0)
            
            if item.is_complete:
                user_stats[user.username]["total_books_completed"] += 1
        
        # Convert to list
        leaderboard = list(user_stats.values())
        
        # Sort by books completed, then words read
        leaderboard.sort(key=lambda x: (x["total_books_completed"], x["total_words_read"]), reverse=True)
        
        return leaderboard
