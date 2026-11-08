from sqlalchemy import Boolean, Column, ForeignKey, Integer, Float, String, Text, DateTime
from sqlalchemy.orm import relationship
from database import Base
from security.crypto import EncryptedText
import datetime


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    notebooks = relationship("Notebook", back_populates="workspace")
    notes = relationship("Note", back_populates="workspace")


class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    parent_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    workspace = relationship("Workspace", back_populates="notebooks")
    children = relationship("Notebook", remote_side=[id], backref="parent")
    notes = relationship("Note", back_populates="notebook")

    @property
    def is_password_protected(self) -> bool:
        return bool(self.password_hash)


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    content = Column(EncryptedText)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    password_hash = Column(String, nullable=True)
    type = Column(String, default="markdown")
    file_url = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="notes")
    notebook = relationship("Notebook", back_populates="notes")
    comments = relationship("Comment", back_populates="note", cascade="all, delete-orphan")

    @property
    def is_password_protected(self) -> bool:
        return bool(self.password_hash)



class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    is_question = Column(Boolean, default=False)
    content = Column(EncryptedText)
    selected_text = Column(EncryptedText, nullable=True)
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
    connections_out = relationship(
        "CommentConnection",
        foreign_keys="CommentConnection.source_comment_id",
        back_populates="source_comment",
        cascade="all, delete-orphan",
    )
    connections_in = relationship(
        "CommentConnection",
        foreign_keys="CommentConnection.target_comment_id",
        back_populates="target_comment",
        cascade="all, delete-orphan",
    )


class CommentConnection(Base):
    __tablename__ = "comment_connections"

    id = Column(Integer, primary_key=True, index=True)
    source_comment_id = Column(Integer, ForeignKey("comments.id"))
    target_comment_id = Column(Integer, ForeignKey("comments.id"))
    observation = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    source_comment = relationship("Comment", foreign_keys=[source_comment_id], back_populates="connections_out")
    target_comment = relationship("Comment", foreign_keys=[target_comment_id], back_populates="connections_in")


class CalendarGoal(Base):
    __tablename__ = "calendar_goals"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    horizon = Column(String, default="weekly", index=True)  # daily, weekly, monthly, deadline
    target_date = Column(String, index=True, nullable=True)  # YYYY-MM-DD
    priority = Column(String, default="Média")
    category = Column(String, default="Geral")
    color = Column(String, default="#10b981")
    target_hours = Column(Float, default=5.0)
    logged_hours = Column(Float, default=0.0)
    progress_percent = Column(Integer, default=0)
    milestones_json = Column(EncryptedText, default="[]")
    status = Column(String, default="pending", index=True)  # pending, in_progress, completed
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    category = Column(EncryptedText, default="Padrão")
    priority = Column(String, default="Média")
    difficulty = Column(String, default="Média")
    estimated_hours = Column(Float, default=3.0)
    status = Column(String, default="pending")
    time_spent_seconds = Column(Integer, default=0)
    timer_status = Column(String, default="stopped")
    timer_started_at = Column(DateTime, nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    goal_id = Column(Integer, ForeignKey("calendar_goals.id"), nullable=True)
    scheduled_date = Column(String, nullable=True, index=True)  # YYYY-MM-DD
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    location = Column(EncryptedText, nullable=True)
    start_time = Column(DateTime, index=True)
    end_time = Column(DateTime, index=True)
    attendees = Column(EncryptedText, nullable=True)  # comma separated list of emails/names
    category = Column(String, default="Compromisso", index=True)
    color = Column(String, default="#f59e0b")
    is_all_day = Column(Boolean, default=False)
    recurrence_rule = Column(String, default="none")  # none, daily, weekdays, weekly, monthly
    recurrence_until = Column(DateTime, nullable=True)
    reminder_minutes = Column(Integer, default=15)
    status = Column(String, default="scheduled", index=True)  # scheduled, completed, cancelled
    goal_id = Column(Integer, ForeignKey("calendar_goals.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class RoutineTemplate(Base):
    __tablename__ = "routine_templates"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    category = Column(String, default="routine", index=True)  # sleep, meal, health, break, routine
    start_time_str = Column(String, default="07:00")  # HH:MM
    end_time_str = Column(String, default="08:00")    # HH:MM
    days_of_week = Column(String, default="0,1,2,3,4,5,6")  # 0=Seg .. 6=Dom
    color = Column(String, default="#6366f1")
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class TimelineBlock(Base):
    __tablename__ = "timeline_blocks"

    id = Column(Integer, primary_key=True, index=True)
    date_str = Column(String, index=True)  # YYYY-MM-DD
    title = Column(EncryptedText)
    notes = Column(EncryptedText, nullable=True)
    block_type = Column(String, default="task", index=True)  # event, task, goal, routine, focus, break
    start_minute = Column(Integer, index=True)  # 0..1440
    end_minute = Column(Integer, index=True)    # 0..1440
    color = Column(String, default="#3b82f6")
    priority = Column(String, default="Média")
    status = Column(String, default="planned", index=True)  # planned, in_progress, completed, skipped
    is_locked = Column(Boolean, default=False)
    is_auto_generated = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    goal_id = Column(Integer, ForeignKey("calendar_goals.id"), nullable=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    timer_started_at = Column(DateTime, nullable=True)
    actual_seconds_spent = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    date = Column(String, primary_key=True, index=True)  # Formato YYYY-MM-DD
    messages_json = Column(EncryptedText, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(EncryptedText)
    scheduled_for = Column(DateTime, index=True)
    is_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class GuidedStudySession(Base):
    __tablename__ = "guided_study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True, index=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True, index=True)
    target_note_id = Column(Integer, ForeignKey("notes.id"), nullable=True, index=True)
    depth_persona = Column(EncryptedText, default="Cientista da Computação")
    surface_pace = Column(String, default="standard")  # fast, standard, detailed
    current_phase = Column(String, default="surface", index=True)  # surface, depth, completed
    current_topic_index = Column(Integer, default=0)
    big_insight = Column(EncryptedText, nullable=True)
    source_material_text = Column(EncryptedText)
    sources_meta_json = Column(EncryptedText, default="[]")
    roadmap_json = Column(EncryptedText, default="[]")
    messages_json = Column(EncryptedText, default="[]")
    last_synapse_comment_id = Column(Integer, nullable=True)
    auto_create_synapses = Column(Boolean, default=True)
    status = Column(String, default="active", index=True)  # active, paused, completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==============================================================================
# Modelos de Segurança Zero-Trust e Governança de Dispositivos
# ==============================================================================
class SystemSecurityState(Base):
    __tablename__ = "system_security_state"

    id = Column(Integer, primary_key=True, index=True)
    bootstrap_locked = Column(Boolean, default=False)
    bootstrap_token_hash = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class AuthorizedDevice(Base):
    __tablename__ = "authorized_devices"

    id = Column(String, primary_key=True, index=True)  # UUIDv4
    device_name = Column(EncryptedText)
    public_key_jwk = Column(Text)
    fingerprint_sha256 = Column(String, unique=True, index=True)
    is_genesis = Column(Boolean, default=False)
    approved_by_device_id = Column(String, ForeignKey("authorized_devices.id"), nullable=True)
    user_agent = Column(EncryptedText, nullable=True)
    last_ip = Column(EncryptedText, nullable=True)
    last_seen_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_revoked = Column(Boolean, default=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_device_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DeviceEnrollmentRequest(Base):
    __tablename__ = "device_enrollment_requests"

    id = Column(String, primary_key=True, index=True)  # UUIDv4
    enrollment_code_hash = Column(String, unique=True, index=True)
    created_by_device_id = Column(String, ForeignKey("authorized_devices.id"))
    candidate_device_id = Column(String, nullable=True)
    candidate_device_name = Column(EncryptedText, nullable=True)
    candidate_public_key_jwk = Column(Text, nullable=True)
    candidate_fingerprint = Column(String, nullable=True)
    candidate_ip = Column(EncryptedText, nullable=True)
    candidate_user_agent = Column(EncryptedText, nullable=True)
    sas_code = Column(String, nullable=True)
    status = Column(String, default="awaiting_claim", index=True)
    expires_at = Column(DateTime, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)


class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, index=True)
    category = Column(String, default="SYSTEM", index=True)
    severity = Column(String, default="INFO", index=True)
    device_id = Column(String, nullable=True, index=True)
    device_name = Column(EncryptedText, nullable=True)
    ip_address = Column(EncryptedText, nullable=True)
    http_method = Column(String, nullable=True)
    endpoint = Column(EncryptedText, nullable=True)
    status_code = Column(Integer, nullable=True)
    details = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

