from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    notebooks = relationship("Notebook", back_populates="workspace")
    notes = relationship("Note", back_populates="workspace")

class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    workspace = relationship("Workspace", back_populates="notebooks")
    children = relationship("Notebook", remote_side=[id], backref="parent")
    notes = relationship("Note", back_populates="notebook")

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    type = Column(String, default="markdown")
    file_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="notes")
    notebook = relationship("Notebook", back_populates="notes")
    comments = relationship("Comment", back_populates="note", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    is_question = Column(Boolean, default=False)
    content = Column(Text)
    selected_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    rect_x1 = Column(Integer, nullable=True)
    rect_y1 = Column(Integer, nullable=True)
    rect_x2 = Column(Integer, nullable=True)
    rect_y2 = Column(Integer, nullable=True)
    x_position = Column(Integer, nullable=True)
    y_position = Column(Integer, nullable=True)
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

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    priority = Column(String, default="medium")
    difficulty = Column(String, default="medium")
    estimated_hours = Column(Integer, default=0)
    status = Column(String, default="pending")
    time_spent_seconds = Column(Integer, default=0)
    timer_status = Column(String, default="stopped")
    timer_started_at = Column(DateTime, nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    start_time = Column(DateTime, index=True)
    end_time = Column(DateTime, index=True)
    attendees = Column(Text, nullable=True) # comma separated list of emails/names
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    date = Column(String, primary_key=True, index=True) # Formato YYYY-MM-DD
    messages_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(Text)
    scheduled_for = Column(DateTime, index=True)
    is_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
