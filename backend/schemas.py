from pydantic import BaseModel, Field
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

class ItemPasswordSet(BaseModel):
    password: str
    current_password: Optional[str] = None

class ItemPasswordVerify(BaseModel):
    password: str

class PasswordActionResponse(BaseModel):
    success: bool
    message: str
    is_password_protected: bool

class NotebookCreate(NotebookBase):
    password: Optional[str] = None

class NotebookUpdate(NotebookBase):
    is_active: Optional[bool] = None
    title: Optional[str] = None
    workspace_id: Optional[int] = None

class NotebookResponse(NotebookBase):
    id: int
    is_active: bool
    is_password_protected: bool = False
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
    password: Optional[str] = None

class NoteUpdate(NoteBase):
    title: Optional[str] = None
    content: Optional[str] = None
    notebook_id: Optional[int] = None
    workspace_id: Optional[int] = None
    type: Optional[str] = None
    file_url: Optional[str] = None

class NoteResponse(NoteBase):
    id: int
    is_password_protected: bool = False
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
    category: Optional[str] = "Padrão"
    priority: Optional[str] = "Média"
    difficulty: Optional[str] = "Média"
    estimated_hours: Optional[float] = 3.0
    status: Optional[str] = "pending"
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    goal_id: Optional[int] = None
    scheduled_date: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: Optional[str] = None
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    goal_id: Optional[int] = None
    scheduled_date: Optional[str] = None
    time_spent_seconds: Optional[int] = None
    timer_status: Optional[str] = None

class TaskResponse(TaskBase):
    id: int
    time_spent_seconds: int
    timer_status: str
    timer_started_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Event Schemas
class EventBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    location: Optional[str] = Field(default=None, max_length=300)
    start_time: datetime
    end_time: datetime
    attendees: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default="Compromisso", max_length=60)
    color: Optional[str] = Field(default="#f59e0b", max_length=20)
    is_all_day: Optional[bool] = False
    recurrence_rule: Optional[str] = Field(default="none", max_length=30)
    recurrence_until: Optional[datetime] = None
    reminder_minutes: Optional[int] = 15
    status: Optional[str] = Field(default="scheduled", max_length=30)
    goal_id: Optional[int] = None

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    location: Optional[str] = Field(default=None, max_length=300)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    attendees: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=60)
    color: Optional[str] = Field(default=None, max_length=20)
    is_all_day: Optional[bool] = None
    recurrence_rule: Optional[str] = Field(default=None, max_length=30)
    recurrence_until: Optional[datetime] = None
    reminder_minutes: Optional[int] = None
    status: Optional[str] = Field(default=None, max_length=30)
    goal_id: Optional[int] = None

class EventResponse(EventBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Calendar Goal Schemas
class GoalMilestoneItem(BaseModel):
    id: Optional[str] = None
    title: str
    completed: bool = False


class CalendarGoalBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    horizon: Optional[str] = Field(default="weekly", max_length=30)
    target_date: Optional[str] = Field(default=None, max_length=20)
    priority: Optional[str] = Field(default="Média", max_length=30)
    category: Optional[str] = Field(default="Geral", max_length=60)
    color: Optional[str] = Field(default="#10b981", max_length=20)
    target_hours: Optional[float] = 5.0
    logged_hours: Optional[float] = 0.0
    progress_percent: Optional[int] = 0
    milestones: Optional[List[GoalMilestoneItem]] = None
    status: Optional[str] = Field(default="pending", max_length=30)
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None


class CalendarGoalCreate(CalendarGoalBase):
    pass


class CalendarGoalUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=240)
    description: Optional[str] = Field(default=None, max_length=4000)
    horizon: Optional[str] = Field(default=None, max_length=30)
    target_date: Optional[str] = Field(default=None, max_length=20)
    priority: Optional[str] = Field(default=None, max_length=30)
    category: Optional[str] = Field(default=None, max_length=60)
    color: Optional[str] = Field(default=None, max_length=20)
    target_hours: Optional[float] = None
    logged_hours: Optional[float] = None
    progress_percent: Optional[int] = None
    milestones: Optional[List[GoalMilestoneItem]] = None
    status: Optional[str] = Field(default=None, max_length=30)
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None


class CalendarGoalResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    horizon: str
    target_date: Optional[str] = None
    priority: str
    category: str
    color: str
    target_hours: float
    logged_hours: float
    progress_percent: int
    milestones: List[GoalMilestoneItem] = []
    status: str
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    linked_tasks_count: Optional[int] = 0
    completed_tasks_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Routine Template Schemas (24h Base Profile)
class RoutineTemplateBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default="routine", max_length=40)
    start_time_str: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time_str: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    days_of_week: Optional[str] = Field(default="0,1,2,3,4,5,6", max_length=30)
    color: Optional[str] = Field(default="#6366f1", max_length=20)
    is_active: Optional[bool] = True


class RoutineTemplateCreate(RoutineTemplateBase):
    pass


class RoutineTemplateUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=40)
    start_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    days_of_week: Optional[str] = Field(default=None, max_length=30)
    color: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None


class RoutineTemplateResponse(RoutineTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Timeline Block Schemas (24h Daily Time Management: 00:00 - 23:59)
class TimelineBlockBase(BaseModel):
    date_str: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    title: str = Field(..., min_length=1, max_length=240)
    notes: Optional[str] = Field(default=None, max_length=2000)
    block_type: Optional[str] = Field(default="task", max_length=30)
    start_minute: int = Field(..., ge=0, le=1440)
    end_minute: int = Field(..., ge=0, le=1440)
    color: Optional[str] = Field(default="#3b82f6", max_length=20)
    priority: Optional[str] = Field(default="Média", max_length=30)
    status: Optional[str] = Field(default="planned", max_length=30)
    is_locked: Optional[bool] = False
    is_auto_generated: Optional[bool] = False
    task_id: Optional[int] = None
    goal_id: Optional[int] = None
    event_id: Optional[int] = None


class TimelineBlockCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=240)
    notes: Optional[str] = Field(default=None, max_length=2000)
    block_type: Optional[str] = Field(default="focus", max_length=30)
    start_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    end_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    start_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    color: Optional[str] = Field(default="#3b82f6", max_length=20)
    priority: Optional[str] = Field(default="Média", max_length=30)
    is_locked: Optional[bool] = True
    task_id: Optional[int] = None
    goal_id: Optional[int] = None
    event_id: Optional[int] = None


class TimelineBlockUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=240)
    notes: Optional[str] = Field(default=None, max_length=2000)
    block_type: Optional[str] = Field(default=None, max_length=30)
    start_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    end_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    start_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time_str: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    color: Optional[str] = Field(default=None, max_length=20)
    priority: Optional[str] = Field(default=None, max_length=30)
    status: Optional[str] = Field(default=None, max_length=30)
    is_locked: Optional[bool] = None
    task_id: Optional[int] = None
    goal_id: Optional[int] = None
    event_id: Optional[int] = None


class TimelineBlockResponse(TimelineBlockBase):
    id: int
    start_time_str: str
    end_time_str: str
    duration_minutes: int
    timer_started_at: Optional[datetime] = None
    actual_seconds_spent: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GenerateTimelineRequest(BaseModel):
    respect_routine: bool = True
    include_events: bool = True
    include_pending_tasks: bool = True
    include_active_goals: bool = True
    focus_block_minutes: int = Field(default=90, ge=15, le=360)
    break_minutes: int = Field(default=15, ge=0, le=60)
    overwrite_unlocked: bool = True

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


# ==============================================================================
# Security & Device Authorization Schemas
# ==============================================================================
class BootstrapRegisterRequest(BaseModel):
    bootstrap_token: str = Field(..., min_length=8, max_length=256)
    device_name: str = Field(..., min_length=2, max_length=100)
    public_key_jwk: str = Field(..., min_length=20, max_length=2048)


class EnrollmentCreateResponse(BaseModel):
    enrollment_id: str
    enrollment_code: str
    expires_at: datetime
    ttl_seconds: int


class EnrollmentClaimRequest(BaseModel):
    enrollment_code: str = Field(..., min_length=6, max_length=128)
    device_name: str = Field(..., min_length=2, max_length=100)
    public_key_jwk: str = Field(..., min_length=20, max_length=2048)


class EnrollmentStatusResponse(BaseModel):
    enrollment_id: str
    status: str
    sas_code: Optional[str] = None
    candidate_device_name: Optional[str] = None
    candidate_fingerprint: Optional[str] = None
    candidate_ip: Optional[str] = None
    expires_at: datetime
    device_id: Optional[str] = None


class EnrollmentDecisionRequest(BaseModel):
    sas_code_confirmed: str = Field(..., min_length=6, max_length=16)


class AuthorizedDeviceResponse(BaseModel):
    id: str
    device_name: str
    fingerprint_sha256: str
    is_genesis: bool
    approved_by_device_id: Optional[str] = None
    last_ip: Optional[str] = None
    last_seen_at: datetime
    is_revoked: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SecurityAuditLogResponse(BaseModel):
    id: int
    event_type: str
    category: Optional[str] = "SYSTEM"
    severity: Optional[str] = "INFO"
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    http_method: Optional[str] = None
    endpoint: Optional[str] = None
    status_code: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EventTrackRequest(BaseModel):
    event_type: str = Field(..., min_length=2, max_length=80)
    category: Optional[str] = Field(default="NAVIGATION", max_length=40)
    severity: Optional[str] = Field(default="INFO", max_length=20)
    endpoint: Optional[str] = Field(default=None, max_length=256)
    details: str = Field(..., min_length=1, max_length=1000)


class EventMonitorSummaryResponse(BaseModel):
    total_events: int
    events_today: int
    security_alerts: int
    active_devices: int
    categories_breakdown: dict
    events: List[SecurityAuditLogResponse]


# ==============================================================================
# Guided Study (Sessão de Estudo Guiado) Schemas
# ==============================================================================
class GuidedStudySubconceptItem(BaseModel):
    id: str
    title: str
    source_note_id: Optional[int] = None
    source_title: Optional[str] = None
    page_numbers: List[int] = []
    covered_pages: List[int] = []
    attempts: int = 0
    surface_passed: bool = False
    depth_passed: bool = False

class GuidedStudySlideReference(BaseModel):
    note_id: Optional[int] = None
    source_title: Optional[str] = None
    page_number: Optional[int] = None
    slide_excerpt: Optional[str] = None

class GuidedStudyConstructionFeedback(BaseModel):
    what_was_right: Optional[str] = None
    what_is_missing: Optional[str] = None
    attempt_number: int = 1
    max_attempts: int = 2

class GuidedStudyTopicItem(BaseModel):
    id: str
    title: str
    summary: str
    surface_status: str = "pending"  # pending, in_progress, validated
    depth_status: str = "locked"     # locked, pending, in_progress, validated
    key_concept: Optional[str] = None
    deep_angle: Optional[str] = None
    current_subconcept_index: int = 0
    subconcepts: List[GuidedStudySubconceptItem] = []
    source_refs: List[dict] = []

class GuidedStudyDoubtMessage(BaseModel):
    id: str
    role: str  # user, assistant
    content: str
    slide_reference: Optional[GuidedStudySlideReference] = None
    covered_pages: List[int] = []
    diagram_mermaid: Optional[str] = None
    timestamp: str

class GuidedStudyDoubtThread(BaseModel):
    id: str
    parent_message_id: str
    topic_id: Optional[str] = None
    subconcept_id: Optional[str] = None
    title: str
    status: str = "open"  # open, resolved
    messages: List[GuidedStudyDoubtMessage] = []
    created_at: str
    updated_at: str

class GuidedStudyMessageItem(BaseModel):
    id: str
    role: str  # assistant, user
    phase: str = "surface"  # surface, depth, synthesis
    topic_id: Optional[str] = None
    subconcept_id: Optional[str] = None
    student_intent: Optional[str] = None  # doubt_or_question, incomplete_or_incorrect, mastered_subconcept
    contextualization: Optional[str] = None
    explanation: Optional[str] = None
    question: Optional[str] = None
    content: str
    slide_reference: Optional[GuidedStudySlideReference] = None
    covered_pages: List[int] = []
    construction_feedback: Optional[GuidedStudyConstructionFeedback] = None
    diagram_mermaid: Optional[str] = None
    step_by_step_example: Optional[str] = None
    visual_image_url: Optional[str] = None
    student_synthesis: Optional[str] = None
    topic_validated: Optional[bool] = False
    chapter_surface_completed: Optional[bool] = False
    synapse_comment_id: Optional[int] = None
    doubt_threads: List[GuidedStudyDoubtThread] = []
    timestamp: str

class GuidedStudySourceMeta(BaseModel):
    source_type: str  # note, pdf, raw_text, upload
    title: str
    note_id: Optional[int] = None
    file_name: Optional[str] = None
    char_count: Optional[int] = 0

class GuidedStudySessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=240)
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    target_note_id: Optional[int] = None
    source_note_ids: List[int] = []
    raw_text: Optional[str] = None
    depth_persona: Optional[str] = "Cientista da Computação"
    surface_pace: Optional[str] = "standard"  # fast, standard, detailed
    auto_create_synapses: Optional[bool] = True

class GuidedStudyTurnRequest(BaseModel):
    user_message: str = Field(..., min_length=1)
    action: Optional[str] = "answer"  # answer, ask_hint, advance_phase, recap, skip_block
    auto_create_synapse: Optional[bool] = True

class GuidedStudySessionUpdate(BaseModel):
    title: Optional[str] = None
    target_note_id: Optional[int] = None
    depth_persona: Optional[str] = None
    surface_pace: Optional[str] = None
    auto_create_synapses: Optional[bool] = None
    current_phase: Optional[str] = None
    status: Optional[str] = None

class RebuildRoadmapRequest(BaseModel):
    surface_pace: Optional[str] = "standard"  # fast, standard, detailed

class GuidedStudyJumpRequest(BaseModel):
    topic_index: int = Field(..., ge=0)
    subconcept_index: int = Field(default=0, ge=0)
    phase: Optional[str] = None  # surface, depth

class CrystallizeSynapseRequest(BaseModel):
    message_id: str
    custom_observation: Optional[str] = None

class GenerateVisualRequest(BaseModel):
    message_id: str
    prompt_hint: Optional[str] = None

class GuidedStudyRaiseHandRequest(BaseModel):
    parent_message_id: str
    doubt_text: str = Field(..., min_length=1)
    thread_id: Optional[str] = None

class GuidedStudyResolveDoubtRequest(BaseModel):
    parent_message_id: str
    thread_id: str

class ExtractFileResponse(BaseModel):
    filename: str
    extracted_text: str
    char_count: int
    page_count: Optional[int] = None

class GuidedStudySessionResponse(BaseModel):
    id: int
    title: str
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    target_note_id: Optional[int] = None
    depth_persona: str
    surface_pace: Optional[str] = "standard"
    current_phase: str
    current_topic_index: int
    big_insight: Optional[str] = None
    sources_meta: List[GuidedStudySourceMeta] = []
    roadmap: List[GuidedStudyTopicItem] = []
    messages: List[GuidedStudyMessageItem] = []
    last_synapse_comment_id: Optional[int] = None
    auto_create_synapses: bool
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class GuidedStudySessionSummaryResponse(BaseModel):
    id: int
    title: str
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    target_note_id: Optional[int] = None
    depth_persona: str
    surface_pace: Optional[str] = "standard"
    current_phase: str
    current_topic_index: int
    total_topics: int = 0
    validated_surface_topics: int = 0
    validated_depth_topics: int = 0
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

