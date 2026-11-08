"""Schemas Pydantic do domínio da Equipe (estendem os schemas pessoais quando o formato é idêntico)."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

import schemas


# ----------------------------------------------------------------------------- Membros / auth
class TeamMemberCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9._-]+$")
    display_name: Optional[str] = Field(default=None, max_length=100)
    full_name: Optional[str] = Field(default=None, max_length=100)
    role_title: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)
    avatar_color: Optional[str] = Field(default="#6366f1", max_length=20)
    password: str = Field(..., min_length=8, max_length=128)
    require_device_approval: Optional[bool] = True
    must_change_password: Optional[bool] = False


class TeamMemberUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=100)
    full_name: Optional[str] = Field(default=None, max_length=100)
    role_title: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)
    username: Optional[str] = Field(default=None, min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9._-]+$")
    avatar_color: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_active: Optional[bool] = None
    require_device_approval: Optional[bool] = None
    must_change_password: Optional[bool] = None


class TeamPasswordReset(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


class TeamPasswordChange(BaseModel):
    current_password: Optional[str] = Field(default=None, min_length=1, max_length=128)
    old_password: Optional[str] = Field(default=None, min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class TeamMemberResponse(BaseModel):
    id: int
    username: str
    display_name: str
    full_name: Optional[str] = None
    role: Optional[str] = None
    role_title: Optional[str] = None
    avatar_color: Optional[str] = "#6366f1"
    require_device_approval: bool
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    devices_total: int = 0
    devices_pending: int = 0

    class Config:
        from_attributes = True


class TeamDeviceResponse(BaseModel):
    id: str
    device_name: str
    fingerprint_sha256: str
    status: str
    last_ip: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TeamLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)
    password: str = Field(..., min_length=1, max_length=128)
    device_name: Optional[str] = Field(default="Dispositivo Liderado", max_length=100)
    public_key_jwk: Optional[str] = Field(default=None, max_length=4096)
    timestamp: Optional[str] = Field(default=None, max_length=30)
    nonce: Optional[str] = Field(default=None, max_length=64)
    signature: Optional[str] = Field(default=None, max_length=1024)


class TeamAuditLogResponse(BaseModel):
    id: int
    member_id: Optional[int] = None
    actor: Optional[str] = None
    member_name: Optional[str] = None
    event_type: str
    category: Optional[str] = None
    severity: Optional[str] = None
    ip_address: Optional[str] = None
    endpoint: Optional[str] = None
    status_code: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ----------------------------------------------------------------------------- Demandas
class TeamTaskCreate(schemas.TaskCreate):
    linked_note_id: Optional[int] = None


class TeamTaskUpdate(schemas.TaskUpdate):
    member_id: Optional[int] = None
    linked_note_id: Optional[int] = None
    execution_notes: Optional[str] = Field(default=None, max_length=8000)


class TeamTaskResponse(schemas.TaskResponse):
    member_id: Optional[int] = None
    assigned_by_leader: bool = False
    linked_note_id: Optional[int] = None
    execution_notes: Optional[str] = None


# ----------------------------------------------------------------------------- Notas
class TeamWorkspaceResponse(schemas.WorkspaceResponse):
    owner_member_id: Optional[int] = None
    is_team_shared: bool = False
    allow_member_edit: bool = True


class TeamNotebookResponse(schemas.NotebookResponse):
    owner_member_id: Optional[int] = None
    is_team_shared: bool = False
    allow_member_edit: bool = True


class TeamNoteResponse(schemas.NoteResponse):
    owner_member_id: Optional[int] = None
    is_team_shared: bool = False
    allow_member_edit: bool = True


# ----------------------------------------------------------------------------- Fluxos diários
class ChecklistItem(BaseModel):
    id: Optional[str] = None
    text: str = Field(..., min_length=1, max_length=300)
    done: bool = False


class TeamRoutineCreate(schemas.RoutineTemplateCreate):
    checklist: Optional[List[ChecklistItem]] = None
    linked_note_id: Optional[int] = None


class TeamRoutineUpdate(schemas.RoutineTemplateUpdate):
    checklist: Optional[List[ChecklistItem]] = None
    linked_note_id: Optional[int] = None


class TeamRoutineResponse(schemas.RoutineTemplateResponse):
    member_id: Optional[int] = None
    assigned_by_leader: bool = False
    checklist: List[ChecklistItem] = []
    linked_note_id: Optional[int] = None


class TeamBlockChecklistUpdate(BaseModel):
    checklist: List[ChecklistItem]
