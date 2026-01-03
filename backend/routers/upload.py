import os
import uuid
import tempfile
import shutil
from typing import List
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, status
from pdf2image import convert_from_path
from models import LibraryItem, Chunk, SessionStats, User
from auth_utils import get_current_user
from database import db
from ai_client import client, MODEL_NAME
from PIL import Image

router = APIRouter(prefix="/upload", tags=["Upload"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")

@router.post("/pdf", response_model=LibraryItem)
async def upload_pdf(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    story_id = str(uuid.uuid4())
    story_dir = os.path.join(UPLOAD_DIR, story_id)
    os.makedirs(story_dir, exist_ok=True)

    # Save uploaded PDF to persistent source file
    source_pdf_path = os.path.join(story_dir, "source.pdf")
    with open(source_pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        from pdf2image import pdfinfo_from_path
        info = pdfinfo_from_path(source_pdf_path)
        total_pages = info["Pages"]
    except Exception as e:
        print(f"PDF Info Error: {e}")
        # Fallback: convert all (danger for large files) or fail
        raise HTTPException(status_code=500, detail="Failed to read PDF info")

    chunks: List[Chunk] = []
    
    # Process Method: Lazy
    # Batch 1: Pages 1 to 5
    BATCH_SIZE = 5
    initial_pages = min(total_pages, BATCH_SIZE)
    
    try:
        images = convert_from_path(source_pdf_path, first_page=1, last_page=initial_pages, dpi=200)
    except Exception as e:
        print(f"PDF Conversion Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to convert PDF initial batch")

    # 1. Process Initial Batch
    for i, image in enumerate(images):
        page_num = i + 1
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
        
        image_url = f"/uploads/{story_id}/{image_filename}"
        final_text = f"![Page {page_num}]({image_url})\n\n{chunk_text}"
        
        chunks.append(Chunk(
            id=i, 
            text=final_text, 
            formattedText=final_text,
            isProcessed=True
        ))

    # 2. Create Placeholders for Remaining
    for i in range(initial_pages, total_pages):
        page_num = i + 1
        # No image yet
        chunks.append(Chunk(
            id=i,
            text=f"Page {page_num} is generating...",
            isProcessed=False
        ))

    # Extract Chapters (Outline)
    chapters_list: List[Chapter] = []
    try:
        from pypdf import PdfReader
        from models import Chapter
        
        reader = PdfReader(source_pdf_path)
        
        # Recursive function to parse outline
        def parse_outline(outline, level=0):
            items = []
            for item in outline:
                if isinstance(item, list):
                     items.extend(parse_outline(item, level + 1))
                else:
                    # pypdf outline item
                    try:
                        title = item.title
                        # page_number is 0-indexed using reader.get_destination_page_number
                        # But item might just have /Page object reference
                        page_index = reader.get_destination_page_number(item)
                        if page_index is not None:
                            items.append(Chapter(title=title, pageIndex=page_index))
                    except Exception:
                         continue
            return items

        if reader.outline:
            chapters_list = parse_outline(reader.outline)
            
    except Exception as e:
        print(f"Chapter Extraction Error: {e}")

    # Create LibraryItem
    new_story = LibraryItem(
        id=story_id,
        title=file.filename.replace(".pdf", ""),
        chunks=chunks,
        chapters=chapters_list,
        currentIndex=0,
        stats=SessionStats(
            correctAnswers=0, 
            totalQuestions=0, 
            startTime=0, 
            wordCount=0 
        ),
        elapsedTime=0,
        lastRead=0,
        isComplete=False
    )

    await db.create_story(new_story, current_user.id)
    
    return new_story
