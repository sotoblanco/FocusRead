import modal
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Define the image
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("poppler-utils")
    .pip_install(
        "fastapi",
        "uvicorn",
        "pydantic",
        "sqlalchemy",
        "aiosqlite",
        "pyjwt",
        "passlib[bcrypt]",
        "python-multipart",
        "google-genai",
        "pdf2image",
        "pypdf"
    )
    .env({"ENVIRONMENT": "production"})
    .add_local_dir("backend", remote_path="/root/backend")
    .add_local_dir("frontend/dist", remote_path="/root/frontend_dist")
)

app = modal.App("focusread-app")
volume = modal.Volume.from_name("focusread-data", create_if_missing=True)

@app.function(
    image=image,
    volumes={"/data": volume},
    secrets=[modal.Secret.from_name("gemini-secret")]
)
@modal.asgi_app()
def fastapi_app():
    import sys
    sys.path.append("/root/backend")  # Add backend to path
    
    # Set DB URL before importing main/database
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:////data/focusread.db"

    from main import app as api_app

    # Mount frontend static assets
    api_app.mount("/assets", StaticFiles(directory="/root/frontend_dist/assets"), name="assets")
    
    # Mount uploads directory from Volume
    # Ensure directory exists
    if not os.path.exists("/data/uploads"):
        os.makedirs("/data/uploads", exist_ok=True)
    api_app.mount("/uploads", StaticFiles(directory="/data/uploads"), name="uploads")
    
    @api_app.get("/")
    async def read_index():
        return FileResponse("/root/frontend_dist/index.html")
        
    # Catch-all for SPA routing (must be last)
    # Note: custom_404_handler works for exceptions, but for normal routing fallbacks
    # FastAPI doesn't have a specific "fallback route" mechanism other than {path:path}
    # But since we are using the main app, adding a catch-all at the end is risky if API routes aren't matched first.
    # FastAPI matches in order. Since API routes are included in 'main', we should add this LAST.
    
    # Ideally, we should check if the path starts with /api or /auth...
    # But for SPA, we just want to serve index.html for non-api routes.
    
    # Let's try to add a catch-all route at the end.
    # However, 'api_app' already includes routes.
    
    @api_app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        # Allow API routes to pass through if they weren't matched? 
        # No, if we are here, it means no other route matched (because this is declared last... wait, imports happen before)
        # Actually, 'api_app' routes are already defined in 'main.py'.
        # Since we import 'app' from 'main', those routes are already registered.
        # So this new route will be appended to the END of the list.
        # If a request matches an existing API route, it will be handled there.
        # If not, it falls through to here.
        if full_path.startswith("api/") or full_path.startswith("auth/") or full_path.startswith("stories/") or full_path.startswith("leaderboard/") or full_path.startswith("settings/") or full_path.startswith("ai/"):
             # If it looks like an API route but wasn't matched (404), return 404 JSON?
             # Or just let it serve index.html?
             # Usually return 404 for API.
             return FileResponse("/root/frontend_dist/index.html") # Just return index for now to be safe, or 404.
        
        # Check if file exists in frontend_dist (e.g. favicon.ico)
        possible_file = f"/root/frontend_dist/{full_path}"
        if os.path.exists(possible_file) and os.path.isfile(possible_file):
            return FileResponse(possible_file)

        return FileResponse("/root/frontend_dist/index.html")

    return api_app
