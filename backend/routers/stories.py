from typing import List
from fastapi import APIRouter, HTTPException, status, Depends
from models import LibraryItem, User
from database import db
from auth_utils import get_current_user

router = APIRouter(prefix="/stories", tags=["Stories"])

@router.get("", response_model=List[LibraryItem])
async def get_stories(current_user: User = Depends(get_current_user)):
    return await db.get_stories(current_user.id)

@router.post("", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
async def create_story(story: LibraryItem, current_user: User = Depends(get_current_user)):
    return await db.create_story(story, current_user.id)

@router.get("/{id}", response_model=LibraryItem)
async def get_story(id: str, current_user: User = Depends(get_current_user)):
    story = await db.get_story(id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story

@router.put("/{id}", response_model=LibraryItem)
async def update_story(id: str, story: LibraryItem, current_user: User = Depends(get_current_user)):
    # Ensure ID matches URL
    if story.id != id:
        raise HTTPException(status_code=400, detail="ID mismatch")
    
    updated = await db.update_story(id, story, current_user.id)
    if not updated:
        raise HTTPException(status_code=404, detail="Story not found")
    return updated

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(id: str, current_user: User = Depends(get_current_user)):
    success = await db.delete_story(id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Story not found")
