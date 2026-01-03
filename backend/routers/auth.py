import uuid
import os
from fastapi import APIRouter, HTTPException, status, Response, Depends
from models import User, UserCreate, UserLogin
from db_models import DBUser
from database import db
from auth_utils import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/signup", response_model=User, status_code=status.HTTP_201_CREATED)
async def signup(user: UserCreate):
    existing_user = await db.get_user_by_username(user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pw = get_password_hash(user.password)
    new_user = DBUser(
        id=str(uuid.uuid4()),
        username=user.username,
        email=user.email,
        hashed_password=hashed_pw
    )
    
    return await db.create_user(new_user)

@router.post("/login")
async def login(response: Response, user: UserLogin):
    print(f"DEBUG_LOGIN: Attempting login for username: {user.username}")
    db_user = await db.get_user_by_username(user.username)
    if not db_user:
        print("DEBUG_LOGIN: User not found in DB")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    is_valid = verify_password(user.password, db_user.hashed_password)
    print(f"DEBUG_LOGIN: Password verification result: {is_valid}")
    
    if not is_valid:
        print("DEBUG_LOGIN: Password invalid")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": db_user.username})
    
    # Set HttpOnly Cookie
    is_production = os.getenv("ENVIRONMENT") == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax", 
        secure=is_production, # True in production
        max_age=60 * 60 * 24 * 7 
    )
    return {"message": "Login successful"}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
