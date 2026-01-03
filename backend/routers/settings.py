from fastapi import APIRouter, Depends
from models import ReadingSettings, User
from database import db
from auth_utils import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("", response_model=ReadingSettings)
async def get_settings(current_user: User = Depends(get_current_user)):
    return await db.get_settings(current_user.id)

@router.put("", response_model=ReadingSettings)
async def update_settings(settings: ReadingSettings, current_user: User = Depends(get_current_user)):
    return await db.update_settings(settings, current_user.id)
