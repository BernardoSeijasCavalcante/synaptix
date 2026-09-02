from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    children = relationship("Notebook", remote_side=[id], backref="parent")
    notes = relationship("Note", back_populates="notebook")

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    type = Column(String, default="markdown")
    file_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    notebook = relationship("Notebook", back_populates="notes")
    comments = relationship("Comment", back_populates="note", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"))
    content = Column(Text)
    selected_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    rect_x1 = Column(Integer, nullable=True)
    rect_y1 = Column(Integer, nullable=True)
    rect_x2 = Column(Integer, nullable=True)
    rect_y2 = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    note = relationship("Note", back_populates="comments")
    
    # Relações para as conexões (Mind Map)
    connections_out = relationship("CommentConnection", foreign_keys="CommentConnection.source_comment_id", back_populates="source_comment", cascade="all, delete-orphan")
    connections_in = relationship("CommentConnection", foreign_keys="CommentConnection.target_comment_id", back_populates="target_comment", cascade="all, delete-orphan")

class CommentConnection(Base):
    __tablename__ = "comment_connections"
    
    id = Column(Integer, primary_key=True, index=True)
    source_comment_id = Column(Integer, ForeignKey("comments.id"))
    target_comment_id = Column(Integer, ForeignKey("comments.id"))
    observation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    source_comment = relationship("Comment", foreign_keys=[source_comment_id], back_populates="connections_out")
    target_comment = relationship("Comment", foreign_keys=[target_comment_id], back_populates="connections_in")
