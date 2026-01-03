from sqlalchemy import Column, String, Integer, JSON, BigInteger, Boolean, ForeignKey
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class DBUser(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

class DBLibraryItem(Base):
    __tablename__ = "library_items"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    title = Column(String)
    # Store complex nested objects as JSON
    chunks = Column(JSON)
    chapters = Column(JSON, default=[])
    current_index = Column(Integer)
    stats = Column(JSON)
    elapsed_time = Column(Integer)
    last_read = Column(BigInteger)
    is_complete = Column(Boolean)

class DBReadingSettings(Base):
    __tablename__ = "reading_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), unique=True)
    theme = Column(String)
    font_size = Column(String)
    alignment = Column(String)
    line_height = Column(String)
    width = Column(String)
