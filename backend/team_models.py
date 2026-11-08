"""
Modelos do domínio ISOLADO da Equipe (synaptix_team.db). Sem qualquer FK/relação com o banco pessoal.
Os nomes de classe e colunas espelham models.py (pessoal) para reaproveitar o motor de
demandas/calendário, acrescidos das colunas de governança do Líder.
"""
import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from security.crypto import TeamEncryptedText as EncryptedText
from team_database import TeamBase as Base


# ==============================================================================
# Identidade, dispositivos e auditoria dos liderados
# ==============================================================================
class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(EncryptedText)
    role_title = Column(EncryptedText, nullable=True)
    avatar_color = Column(String, default="#6366f1")
    password_hash = Column(String, nullable=False)
    require_device_approval = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True, index=True)
    token_version = Column(Integer, default=1)
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)


class TeamMemberDevice(Base):
    __tablename__ = "team_member_devices"

    id = Column(String, primary_key=True, index=True)  # UUIDv4
    member_id = Column(Integer, ForeignKey("team_members.id"), index=True)
    device_name = Column(EncryptedText)
    public_key_jwk = Column(Text)
    fingerprint_sha256 = Column(String, unique=True, index=True)
    status = Column(String, default="pending_approval", index=True)  # approved | pending_approval | revoked
    user_agent = Column(EncryptedText, nullable=True)
    last_ip = Column(EncryptedText, nullable=True)
    last_seen_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class TeamAuditLog(Base):
    __tablename__ = "team_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, nullable=True, index=True)
    actor = Column(String, default="system", index=True)  # 'leader' | 'member' | 'system'
    member_name = Column(EncryptedText, nullable=True)
    event_type = Column(String, index=True)
    category = Column(String, default="TEAM", index=True)
    severity = Column(String, default="INFO", index=True)
    ip_address = Column(EncryptedText, nullable=True)
    http_method = Column(String, nullable=True)
    endpoint = Column(EncryptedText, nullable=True)
    status_code = Column(Integer, nullable=True)
    details = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)


class Upload(Base):
    """Registro de quem enviou cada arquivo do cofre da equipe (controle de acesso)."""
    __tablename__ = "team_uploads"

    filename = Column(String, primary_key=True)
    uploaded_by_member_id = Column(Integer, nullable=True, index=True)
    uploaded_by_role = Column(String, default="member")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Notification(Base):
    __tablename__ = "team_notifications"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(EncryptedText)
    scheduled_for = Column(DateTime, index=True)
    is_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ==============================================================================
# Notas, cadernos e comentários (individuais ou compartilhados com a equipe)
# ==============================================================================
class Workspace(Base):
    __tablename__ = "team_workspaces"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    is_active = Column(Boolean, default=True)
    owner_member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    is_team_shared = Column(Boolean, default=False, index=True)
    allow_member_edit = Column(Boolean, default=True)
    created_by_leader = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    notebooks = relationship("Notebook", back_populates="workspace")
    notes = relationship("Note", back_populates="workspace")


class Notebook(Base):
    __tablename__ = "team_notebooks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    parent_id = Column(Integer, ForeignKey("team_notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("team_workspaces.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    owner_member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    is_team_shared = Column(Boolean, default=False, index=True)
    allow_member_edit = Column(Boolean, default=True)
    created_by_leader = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="notebooks")
    children = relationship("Notebook", remote_side=[id], backref="parent")
    notes = relationship("Note", back_populates="notebook")


class Note(Base):
    __tablename__ = "team_notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    content = Column(EncryptedText)
    notebook_id = Column(Integer, ForeignKey("team_notebooks.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("team_workspaces.id"), nullable=True)
    type = Column(String, default="markdown")
    file_url = Column(EncryptedText, nullable=True)
    owner_member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    is_team_shared = Column(Boolean, default=False, index=True)
    allow_member_edit = Column(Boolean, default=True)
    created_by_leader = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="notes")
    notebook = relationship("Notebook", back_populates="notes")
    comments = relationship("Comment", back_populates="note", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "team_comments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("team_notes.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("team_notebooks.id"), nullable=True)
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
    __tablename__ = "team_comment_connections"

    id = Column(Integer, primary_key=True, index=True)
    source_comment_id = Column(Integer, ForeignKey("team_comments.id"))
    target_comment_id = Column(Integer, ForeignKey("team_comments.id"))
    observation = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    source_comment = relationship("Comment", foreign_keys=[source_comment_id], back_populates="connections_out")
    target_comment = relationship("Comment", foreign_keys=[target_comment_id], back_populates="connections_in")


# ==============================================================================
# Demandas, metas, eventos e fluxos diários
# ==============================================================================
class CalendarGoal(Base):
    __tablename__ = "team_calendar_goals"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    horizon = Column(String, default="weekly", index=True)
    target_date = Column(String, index=True, nullable=True)
    priority = Column(String, default="Média")
    category = Column(String, default="Geral")
    color = Column(String, default="#10b981")
    target_hours = Column(Float, default=5.0)
    logged_hours = Column(Float, default=0.0)
    progress_percent = Column(Integer, default=0)
    milestones_json = Column(EncryptedText, default="[]")
    status = Column(String, default="pending", index=True)
    workspace_id = Column(Integer, ForeignKey("team_workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("team_notebooks.id"), nullable=True)
    member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    is_team_shared = Column(Boolean, default=False, index=True)
    assigned_by_leader = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Task(Base):
    __tablename__ = "team_tasks"

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
    workspace_id = Column(Integer, ForeignKey("team_workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("team_notebooks.id"), nullable=True)
    goal_id = Column(Integer, ForeignKey("team_calendar_goals.id"), nullable=True)
    scheduled_date = Column(String, nullable=True, index=True)
    member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    assigned_by_leader = Column(Boolean, default=False)
    linked_note_id = Column(Integer, ForeignKey("team_notes.id"), nullable=True)
    execution_notes = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Event(Base):
    __tablename__ = "team_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    location = Column(EncryptedText, nullable=True)
    start_time = Column(DateTime, index=True)
    end_time = Column(DateTime, index=True)
    attendees = Column(EncryptedText, nullable=True)
    category = Column(String, default="Compromisso", index=True)
    color = Column(String, default="#f59e0b")
    is_all_day = Column(Boolean, default=False)
    recurrence_rule = Column(String, default="none")
    recurrence_until = Column(DateTime, nullable=True)
    reminder_minutes = Column(Integer, default=15)
    status = Column(String, default="scheduled", index=True)
    goal_id = Column(Integer, ForeignKey("team_calendar_goals.id"), nullable=True)
    member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    is_team_shared = Column(Boolean, default=False, index=True)
    assigned_by_leader = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class RoutineTemplate(Base):
    """Fluxo diário recorrente que o liderado deve seguir (com checklist e POP vinculado)."""
    __tablename__ = "team_routine_templates"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(EncryptedText)
    description = Column(EncryptedText, nullable=True)
    category = Column(String, default="routine", index=True)
    start_time_str = Column(String, default="07:00")
    end_time_str = Column(String, default="08:00")
    days_of_week = Column(String, default="0,1,2,3,4,5,6")
    color = Column(String, default="#6366f1")
    is_active = Column(Boolean, default=True, index=True)
    member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    assigned_by_leader = Column(Boolean, default=False)
    checklist_json = Column(EncryptedText, default="[]")
    linked_note_id = Column(Integer, ForeignKey("team_notes.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class TimelineBlock(Base):
    __tablename__ = "team_timeline_blocks"

    id = Column(Integer, primary_key=True, index=True)
    date_str = Column(String, index=True)
    title = Column(EncryptedText)
    notes = Column(EncryptedText, nullable=True)
    block_type = Column(String, default="task", index=True)
    start_minute = Column(Integer, index=True)
    end_minute = Column(Integer, index=True)
    color = Column(String, default="#3b82f6")
    priority = Column(String, default="Média")
    status = Column(String, default="planned", index=True)
    is_locked = Column(Boolean, default=False)
    is_auto_generated = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("team_tasks.id"), nullable=True)
    goal_id = Column(Integer, ForeignKey("team_calendar_goals.id"), nullable=True)
    event_id = Column(Integer, ForeignKey("team_events.id"), nullable=True)
    timer_started_at = Column(DateTime, nullable=True)
    actual_seconds_spent = Column(Integer, default=0)
    member_id = Column(Integer, ForeignKey("team_members.id"), nullable=True, index=True)
    assigned_by_leader = Column(Boolean, default=False)
    routine_template_id = Column(Integer, ForeignKey("team_routine_templates.id"), nullable=True)
    checklist_json = Column(EncryptedText, default="[]")
    linked_note_id = Column(Integer, ForeignKey("team_notes.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
