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
