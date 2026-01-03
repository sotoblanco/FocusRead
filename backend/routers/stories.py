from typing import List, Optional
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

@router.post("/{id}/process", response_model=LibraryItem)
async def process_story_batch(
    id: str, 
    batch_size: int = 5, 
    start_index: Optional[int] = None, 
    current_user: User = Depends(get_current_user)
):
    story = await db.get_story(id, current_user.id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # If start_index is provided (User Jumped), use it
    if start_index is not None:
        if start_index < 0 or start_index >= len(story.chunks):
            raise HTTPException(status_code=400, detail="Invalid start index")
        
        # Determine actual processing range. 
        # Even if start_index is "processed", we might want to ensure subsequent are.
        # But efficiently, we only process if !isProcessed.
        # Let's find the first unprocessed chunk starting from start_index
        process_start = -1
        for i in range(start_index, len(story.chunks)):
            if not story.chunks[i].isProcessed:
                process_start = i
                break
        
        if process_start == -1:
             return story # All processed from here
             
        start_index = process_start # Valid internal start index
    
    else:
        # Default: Find first unprocessed from beginning
        start_index = -1
        for i, chunk in enumerate(story.chunks):
            if not chunk.isProcessed:
                start_index = i
                break
    
    if start_index == -1:
        return story # All processed based on chunks

    # Determine range
    end_index = min(start_index + batch_size, len(story.chunks))
    
    # 1-based page numbers for PDF
    # Assuming chunk 0 is page 1
    first_page = start_index + 1
    last_page = end_index 
    # Logic check: if start_index=5 (6th chunk), page is 6. Correct.

    import os
    from pdf2image import convert_from_path
    from ai_client import client, MODEL_NAME

    UPLOAD_DIR = "/data/uploads"
    story_dir = os.path.join(UPLOAD_DIR, id)
    source_pdf_path = os.path.join(story_dir, "source.pdf")

    if not os.path.exists(source_pdf_path):
         # If source doesn't exist, we can't process. Maybe it was an imported text, not PDF.
         # Or it's a legacy upload.
         return story

    try:
        images = convert_from_path(source_pdf_path, first_page=first_page, last_page=last_page, dpi=200)
    except Exception as e:
        print(f"Batch Processing Convert Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to convert PDF batch")

    # Process
    for i, image in enumerate(images):
        chunk_idx = start_index + i
        page_num = first_page + i # or chunk_idx + 1
        
        image_filename = f"{page_num}.jpg"
        image_path = os.path.join(story_dir, image_filename)
        
        image.save(image_path, "JPEG")
        
        chunk_text = ""
        if client:
            try:
                prompt = "Transcribe the text on this page exactly. If there are diagrams or images, describe them briefly in [brackets] inline with the text. Do not use markdown code blocks for the Output."
                response = client.models.generate_content(
                    model=MODEL_NAME,
                    contents=[prompt, image]
                )
                chunk_text = response.text
            except Exception as e:
                print(f"OCR Error Page {page_num}: {e}")
                chunk_text = "[Error extracting text]"
        
        image_url = f"/uploads/{id}/{image_filename}"
        final_text = f"![Page {page_num}]({image_url})\n\n{chunk_text}"
        
        # Update Chunk in place
        story.chunks[chunk_idx].text = final_text
        story.chunks[chunk_idx].formattedText = final_text
        story.chunks[chunk_idx].isProcessed = True

    # Save updates
    updated = await db.update_story(id, story, current_user.id)
    return updated
