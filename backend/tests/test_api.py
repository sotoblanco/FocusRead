import os
import pytest
import time
from fastapi.testclient import TestClient

# Set env var BEFORE importing app/database to override DB URL
TEST_DB = "./test_focusread.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB}"

from main import app

@pytest.fixture(scope="module")
def client():
    # Cleanup before run
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

    # Context manager triggers lifespan (db.init_db)
    with TestClient(app) as c:
        # Create a user and login
        user_data = {"username": "testuser", "email": "test@example.com", "password": "password123"}
        response = c.post("/auth/signup", json=user_data)
        assert response.status_code == 201
        
        login_data = {"username": "testuser", "password": "password123"}
        response = c.post("/auth/login", json=login_data)
        assert response.status_code == 200
        # Cookie should be set in c.cookies automatically
        
        yield c

    # Cleanup after run
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

def test_read_main(client):
    response = client.get("/")
    assert response.status_code == 200

def test_auth_flow(client):
    # Verify we are logged in from fixture
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"

def test_ai_quiz(client):
    # AI endpoints are currently public, but good to test with client
    response = client.post("/ai/quiz", json={"chunk": "some text"})
    assert response.status_code == 200

def test_stories_crud(client):
    # 1. Create
    new_story = {
        "id": "test-uuid-1",
        "title": "Test Story",
        "chunks": [{"text": "Chunk 1", "id": 0}],
        "currentIndex": 0,
        "stats": {
            "correctAnswers": 0,
            "totalQuestions": 0,
            "startTime": int(time.time()),
            "wordCount": 100
        },
        "elapsedTime": 0,
        "lastRead": int(time.time()),
        "isComplete": True # Mark complete for leaderboard
    }
    response = client.post("/stories", json=new_story)
    assert response.status_code == 201
    
    # 2. Get All
    response = client.get("/stories")
    assert response.status_code == 200
    assert len(response.json()) >= 1
    
    # 3. Update
    new_story["currentIndex"] = 1
    response = client.put("/stories/test-uuid-1", json=new_story)
    assert response.status_code == 200
    
    # 4. Delete
    response = client.delete("/stories/test-uuid-1")
    assert response.status_code == 204

def test_settings_user_scoped(client):
    # Get settings for this user (should be default)
    response = client.get("/settings")
    assert response.status_code == 200
    
    # Update
    data = response.json()
    data["theme"] = "dark"
    response = client.put("/settings", json=data)
    assert response.status_code == 200
    
    # Verify
    response = client.get("/settings")
    assert response.json()["theme"] == "dark"

def test_leaderboard(client):
    # Create a story first (re-create since valid one was deleted)
    story = {
        "id": "lb-story-1",
        "title": "LB Story",
        "chunks": [],
        "currentIndex": 0,
        "stats": {"correctAnswers": 5, "totalQuestions": 5, "startTime": 0, "wordCount": 500},
        "elapsedTime": 0,
        "lastRead": 0,
        "isComplete": True
    }
    client.post("/stories", json=story)
    
    response = client.get("/leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    # Check our user is there
    user_entry = next((u for u in data if u['username'] == "testuser"), None)
    assert user_entry is not None
    assert user_entry["total_books_completed"] >= 1
    assert user_entry["total_words_read"] >= 500
