import os
from contextlib import asynccontextmanager
from typing import List, Optional

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, update, delete

from models import LibraryItem, ReadingSettings
from db_models import Base, DBLibraryItem, DBReadingSettings, DBUser

# Default to local SQLite if not provided
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./focusread.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Database:
    """
    Database interface using SQLAlchemy AsyncSession.
    """
    async def init_db(self):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await self._migrate_db()

    async def _migrate_db(self):
        # Simple migration system for SQLite
        from sqlalchemy import text
        async with engine.begin() as conn:
            try:
                # Check for chapters column in library_items
                result = await conn.execute(text("PRAGMA table_info(library_items)"))
                columns = [row[1] for row in result.fetchall()]
                
                if "library_items" in columns: # Wait, logic error. table name? No, PRAGMA returns columns of the table.
                     pass 

                if columns and "chapters" not in columns:
                    print("Migrating: Adding 'chapters' column to library_items")
                    await conn.execute(text("ALTER TABLE library_items ADD COLUMN chapters JSON DEFAULT '[]'"))
            except Exception as e:
                print(f"Migration error (ignored): {e}")

    async def get_stories(self, user_id: str) -> List[LibraryItem]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(DBLibraryItem).where(DBLibraryItem.user_id == user_id))
            db_items = result.scalars().all()
            return [self._to_pydantic_library_item(item) for item in db_items]

    async def create_story(self, story: LibraryItem, user_id: str) -> LibraryItem:
        async with AsyncSessionLocal() as session:
            db_item = DBLibraryItem(
                id=story.id,
                user_id=user_id,
                title=story.title,
                chunks=[c.model_dump() for c in story.chunks],
                chapters=[c.model_dump() for c in story.chapters],
                current_index=story.currentIndex,
                stats=story.stats.model_dump(),
                elapsed_time=story.elapsedTime,
                last_read=story.lastRead,
                is_complete=story.isComplete
            )
            session.add(db_item)
            await session.commit()
            return story

    async def get_story(self, story_id: str, user_id: str) -> Optional[LibraryItem]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DBLibraryItem).where(DBLibraryItem.id == story_id, DBLibraryItem.user_id == user_id)
            )
            db_item = result.scalar_one_or_none()
            return self._to_pydantic_library_item(db_item) if db_item else None

    async def update_story(self, story_id: str, story: LibraryItem, user_id: str) -> Optional[LibraryItem]:
        async with AsyncSessionLocal() as session:
            # We must filter by user_id to ensure ownership
            stmt = update(DBLibraryItem).where(
                DBLibraryItem.id == story_id, 
                DBLibraryItem.user_id == user_id
            ).values(
                title=story.title,
                chunks=[c.model_dump() for c in story.chunks],
                chapters=[c.model_dump() for c in story.chapters],
                current_index=story.currentIndex,
                stats=story.stats.model_dump(),
                elapsed_time=story.elapsedTime,
                last_read=story.lastRead,
                is_complete=story.isComplete
            )
            result = await session.execute(stmt)
            await session.commit()
            if result.rowcount > 0:
                return story
            return None

    async def delete_story(self, story_id: str, user_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            stmt = delete(DBLibraryItem).where(
                DBLibraryItem.id == story_id,
                DBLibraryItem.user_id == user_id
            )
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount > 0

    async def get_settings(self, user_id: str) -> ReadingSettings:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(DBReadingSettings).where(DBReadingSettings.user_id == user_id).limit(1))
            db_settings = result.scalar_one_or_none()
            if db_settings:
                return self._to_pydantic_settings(db_settings)
            
            return ReadingSettings(
                theme='light',
                fontSize='md',
                alignment='left',
                lineHeight='normal',
                width='standard'
            )

    async def update_settings(self, settings: ReadingSettings, user_id: str) -> ReadingSettings:
        async with AsyncSessionLocal() as session:
            # Check if settings exist for this user
            result = await session.execute(select(DBReadingSettings).where(DBReadingSettings.user_id == user_id).limit(1))
            db_settings = result.scalar_one_or_none()
            
            if db_settings:
                db_settings.theme = settings.theme
                db_settings.font_size = settings.fontSize
                db_settings.alignment = settings.alignment
                db_settings.line_height = settings.lineHeight
                db_settings.width = settings.width
            else:
                db_settings = DBReadingSettings(
                    user_id=user_id,
                    theme=settings.theme,
                    font_size=settings.fontSize,
                    alignment=settings.alignment,
                    line_height=settings.lineHeight,
                    width=settings.width
                )
                session.add(db_settings)
            
            await session.commit()
            return settings

    def _to_pydantic_library_item(self, db_item: DBLibraryItem) -> LibraryItem:
        from models import Chunk, SessionStats, Chapter
        chunks = [Chunk(**c) for c in db_item.chunks] if db_item.chunks else []
        chapters = [Chapter(**c) for c in db_item.chapters] if db_item.chapters else []
        stats = SessionStats(**db_item.stats) if db_item.stats else SessionStats(correctAnswers=0, totalQuestions=0, startTime=0, wordCount=0)
        
        return LibraryItem(
            id=db_item.id,
            title=db_item.title,
            chunks=chunks,
            chapters=chapters,
            currentIndex=db_item.current_index,
            stats=stats,
            elapsedTime=db_item.elapsed_time,
            lastRead=db_item.last_read,
            isComplete=db_item.is_complete
        )

    def _to_pydantic_settings(self, db_settings: DBReadingSettings) -> ReadingSettings:
        return ReadingSettings(
            theme=db_settings.theme,
            fontSize=db_settings.font_size,
            alignment=db_settings.alignment,
            lineHeight=db_settings.line_height,
            width=db_settings.width
        )

    # --- Auth ---

    async def get_user_by_username(self, username: str) -> Optional[DBUser]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(DBUser).where(DBUser.username == username))
            return result.scalar_one_or_none()

    async def create_user(self, user_data: DBUser) -> DBUser:
        async with AsyncSessionLocal() as session:
            session.add(user_data)
            await session.commit()
            return user_data

# Global instance
db = Database()
