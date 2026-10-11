from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Workspace Schemas
class WorkspaceBase(BaseModel):
    title: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceUpdate(WorkspaceBase):
    is_active: Optional[bool] = None
    title: Optional[str] = None

class WorkspaceResponse(WorkspaceBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Notebook Schemas
class NotebookBase(BaseModel):
    title: str
    parent_id: Optional[int] = None
    workspace_id: Optional[int] = None

class NotebookCreate(NotebookBase):
    pass

class NotebookUpdate(NotebookBase):
    is_active: Optional[bool] = None
    title: Optional[str] = None
    workspace_id: Optional[int] = None

class NotebookResponse(NotebookBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Note Schemas
class NoteBase(BaseModel):
    title: str
    content: str
    notebook_id: Optional[int] = None
    workspace_id: Optional[int] = None
    type: Optional[str] = "markdown"
    file_url: Optional[str] = None

class NoteCreate(NoteBase):
    pass

class NoteUpdate(NoteBase):
    title: Optional[str] = None
    content: Optional[str] = None
    notebook_id: Optional[int] = None
    workspace_id: Optional[int] = None
    type: Optional[str] = None
    file_url: Optional[str] = None

class NoteResponse(NoteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Comment Schemas
class CommentBase(BaseModel):
    note_id: Optional[int] = None
    notebook_id: Optional[int] = None
    is_question: Optional[bool] = False
    content: str
    selected_text: Optional[str] = None
    page_number: Optional[int] = None
    rect_x1: Optional[int] = None
    rect_y1: Optional[int] = None
    rect_x2: Optional[int] = None
    rect_y2: Optional[int] = None
    x_position: Optional[int] = None
    y_position: Optional[int] = None

class CommentCreate(CommentBase):
    pass

class CommentUpdate(BaseModel):
    content: Optional[str] = None
    page_number: Optional[int] = None
    rect_x1: Optional[int] = None
    rect_y1: Optional[int] = None
    rect_x2: Optional[int] = None
    rect_y2: Optional[int] = None
    x_position: Optional[int] = None
    y_position: Optional[int] = None
    notebook_id: Optional[int] = None
    is_question: Optional[bool] = None

class CommentResponse(CommentBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Comment Connection Schemas
class CommentConnectionBase(BaseModel):
    source_comment_id: int
    target_comment_id: int
    observation: Optional[str] = None

class CommentConnectionCreate(CommentConnectionBase):
    pass

class CommentConnectionUpdate(BaseModel):
    observation: Optional[str] = None

class CommentConnectionResponse(CommentConnectionBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Task Schemas
class TaskBase(BaseModel):
    name: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"
    difficulty: Optional[str] = "medium"
    estimated_hours: Optional[int] = 0
    status: Optional[str] = "pending"
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_hours: Optional[int] = None
    status: Optional[str] = None
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    time_spent_seconds: Optional[int] = None
    timer_status: Optional[str] = None

class TaskResponse(TaskBase):
    id: int
    time_spent_seconds: int
    timer_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Event Schemas
class EventBase(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    attendees: Optional[str] = None

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    attendees: Optional[str] = None

class EventResponse(EventBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Notification Schemas
class NotificationBase(BaseModel):
    message: str
    scheduled_for: datetime
    is_sent: Optional[bool] = False

class NotificationCreate(NotificationBase):
    pass

class NotificationUpdate(BaseModel):
    message: Optional[str] = None
    scheduled_for: Optional[datetime] = None
    is_sent: Optional[bool] = None

class NotificationResponse(NotificationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
