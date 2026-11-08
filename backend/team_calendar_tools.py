"""GERADO a partir de tools/calendar_tools.py para o domínio ISOLADO da Equipe (synaptix_team.db).
As sessões usam TeamSessionLocal (escopo por contextvar). Ver team_scope.py."""
import json
import uuid
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from team_database import TeamSessionLocal as SessionLocal
from core_scheduler import scheduler
from security.crypto import sanitize_html_content
import team_task_tools as task_tools
import team_models as models

PRIORITY_RANK = {
    "Crítica": 5,
    "Alta": 4,
    "Média": 3,
    "Baixa": 2,
    "Muito Baixa": 1,
}

CATEGORY_COLORS = {
    "Compromisso": "#f59e0b",
    "Reunião": "#3b82f6",
    "Foco": "#8b5cf6",
    "Estudo": "#06b6d4",
    "Saúde": "#10b981",
    "Pessoal": "#ec4899",
    "Prazo": "#ef4444",
}

BLOCK_TYPE_COLORS = {
    "event": "#f59e0b",
    "task": "#3b82f6",
    "goal": "#10b981",
    "routine": "#6366f1",
    "focus": "#8b5cf6",
    "break": "#64748b",
}


def parse_checklist(raw) -> list:
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        return []
    out = []
    for it in data if isinstance(data, list) else []:
        if isinstance(it, dict) and str(it.get("text", "")).strip():
            out.append({
                "id": str(it.get("id") or uuid.uuid4().hex[:8]),
                "text": str(it["text"]).strip()[:300],
                "done": bool(it.get("done", False)),
            })
    return out


def _clean_text(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    cleaned = sanitize_html_content(str(val).strip())
    return cleaned if cleaned is not None else ""


def time_str_to_minutes(time_str: str) -> int:
    """Converte 'HH:MM' em minutos do dia (0 a 1440)."""
    if not time_str:
        return 0
    s = time_str.strip()
    if s in ("24:00", "23:59"):
        return 1440 if s == "24:00" else 1439
    parts = s.split(":")
    h = max(0, min(24, int(parts[0])))
    m = max(0, min(59, int(parts[1]))) if len(parts) > 1 else 0
    return min(1440, h * 60 + m)


def minutes_to_time_str(minutes: int) -> str:
    """Converte minutos (0 a 1440) em 'HH:MM'."""
    clamped = max(0, min(1440, int(minutes)))
    if clamped == 1440:
        return "24:00"
    h = clamped // 60
    m = clamped % 60
    return f"{h:02d}:{m:02d}"


def _parse_iso_dt(dt_str: str) -> datetime:
    cleaned = dt_str.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def _notify_calendar_item(message: str):
    with SessionLocal() as db:
        notif = models.Notification(
            message=_clean_text(message) or "Lembrete do Calendário Synaptix",
            scheduled_for=datetime.utcnow(),
            is_sent=False,
        )
        db.add(notif)
        db.commit()


def _schedule_event_reminder(event_id: int, title: str, start_time: datetime, reminder_minutes: int = 15):
    job_id = f"team_calendar_event_reminder_{event_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if reminder_minutes is None or reminder_minutes < 0:
        return

    trigger_dt = start_time - timedelta(minutes=int(reminder_minutes))
    now = datetime.now()
    if trigger_dt > now:
        scheduler.add_job(
            _notify_calendar_item,
            "date",
            run_date=trigger_dt,
            args=[f"📅 Lembrete de Evento em {reminder_minutes} min: '{title}' às {start_time.strftime('%H:%M')}."],
            id=job_id,
            replace_existing=True,
        )


def serialize_event(e: models.Event, occurrence_start: Optional[datetime] = None, occurrence_end: Optional[datetime] = None) -> dict:
    st = occurrence_start or e.start_time
    et = occurrence_end or e.end_time
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "location": e.location,
        "start_time": st.isoformat() if st else None,
        "end_time": et.isoformat() if et else None,
        "attendees": e.attendees,
        "category": e.category or "Compromisso",
        "color": e.color or CATEGORY_COLORS.get(e.category or "Compromisso", "#f59e0b"),
        "is_all_day": bool(e.is_all_day),
        "recurrence_rule": e.recurrence_rule or "none",
        "recurrence_until": e.recurrence_until.isoformat() if e.recurrence_until else None,
        "reminder_minutes": e.reminder_minutes if e.reminder_minutes is not None else 15,
        "status": e.status or "scheduled",
        "goal_id": e.goal_id,
        "is_recurring_instance": occurrence_start is not None and occurrence_start != e.start_time,
        "assigned_by_leader": bool(e.assigned_by_leader),
        "is_team_shared": bool(e.is_team_shared),
        "member_id": e.member_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _expand_event_occurrences(e: models.Event, range_start: datetime, range_end: datetime) -> List[dict]:
    if not e.start_time or not e.end_time:
        return []
    rule = (e.recurrence_rule or "none").lower()
    duration = max(timedelta(minutes=15), e.end_time - e.start_time)

    if rule == "none" or not rule:
        if e.end_time >= range_start and e.start_time <= range_end:
            return [serialize_event(e)]
        return []

    results = []
    until_dt = e.recurrence_until or range_end
    effective_end = min(range_end, until_dt)
    cur_start = e.start_time
    max_iterations = 400
    iterations = 0

    while cur_start <= effective_end and iterations < max_iterations:
        iterations += 1
        cur_end = cur_start + duration
        if cur_end >= range_start and cur_start <= effective_end:
            if rule == "weekdays":
                if cur_start.weekday() < 5:
                    results.append(serialize_event(e, cur_start, cur_end))
            else:
                results.append(serialize_event(e, cur_start, cur_end))

        if rule in ("daily", "weekdays"):
            cur_start += timedelta(days=1)
        elif rule == "weekly":
            cur_start += timedelta(days=7)
        elif rule == "monthly":
            year = cur_start.year + (cur_start.month // 12)
            month = (cur_start.month % 12) + 1
            day = min(cur_start.day, 28)
            cur_start = cur_start.replace(year=year, month=month, day=day)
        else:
            break

    return results


# ==============================================================================
# 1. Ferramentas de Eventos do Calendário
# ==============================================================================
def read_calendar(start_date: str, end_date: str, category: Optional[str] = None) -> List[dict]:
    """
    Lista eventos da agenda entre duas datas (formato ISO: YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS),
    expandindo eventos recorrentes automaticamente.
    """
    try:
        if len(start_date.strip()) == 10:
            start = datetime.fromisoformat(f"{start_date.strip()}T00:00:00")
        else:
            start = _parse_iso_dt(start_date)

        if len(end_date.strip()) == 10:
            end = datetime.fromisoformat(f"{end_date.strip()}T23:59:59")
        else:
            end = _parse_iso_dt(end_date)
    except ValueError:
        return [{"error": "Formato de data inválido. Use YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS"}]

    with SessionLocal() as db:
        all_events = db.query(models.Event).filter(models.Event.status != "cancelled").all()
        expanded: List[dict] = []
        for ev in all_events:
            if category and category.lower() not in ("all", "todas", "todos"):
                if (ev.category or "Compromisso").lower() != category.strip().lower():
                    continue
            expanded.extend(_expand_event_occurrences(ev, start, end))

        expanded.sort(key=lambda x: x.get("start_time") or "")
        return expanded


def create_event(
    title: str,
    start_time: str,
    end_time: str,
    attendees: Optional[str] = None,
    description: Optional[str] = None,
    location: Optional[str] = None,
    category: str = "Compromisso",
    color: Optional[str] = None,
    is_all_day: bool = False,
    recurrence_rule: str = "none",
    recurrence_until: Optional[str] = None,
    reminder_minutes: int = 15,
    goal_id: Optional[int] = None,
) -> dict:
    """
    Cria um novo evento no calendário com suporte a categorias, local, lembretes e recorrência.
    """
    try:
        start = _parse_iso_dt(start_time)
        end = _parse_iso_dt(end_time)
        if end <= start:
            end = start + timedelta(hours=1)
        until_dt = _parse_iso_dt(recurrence_until) if recurrence_until else None
    except ValueError:
        return {"error": "Formato de data inválido. Use o formato ISO (YYYY-MM-DDTHH:MM:SS)"}

    clean_title = _clean_text(title) or "Evento Sem Título"
    clean_cat = _clean_text(category) or "Compromisso"
    final_color = color or CATEGORY_COLORS.get(clean_cat, "#f59e0b")
    clean_rule = (recurrence_rule or "none").strip().lower()
    if clean_rule not in ("none", "daily", "weekdays", "weekly", "monthly"):
        clean_rule = "none"

    with SessionLocal() as db:
        new_event = models.Event(
            title=clean_title,
            description=_clean_text(description),
            location=_clean_text(location),
            start_time=start,
            end_time=end,
            attendees=_clean_text(attendees),
            category=clean_cat,
            color=final_color,
            is_all_day=bool(is_all_day),
            recurrence_rule=clean_rule,
            recurrence_until=until_dt,
            reminder_minutes=reminder_minutes if reminder_minutes is not None else 15,
            status="scheduled",
            goal_id=goal_id,
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)

        _schedule_event_reminder(new_event.id, new_event.title, new_event.start_time, new_event.reminder_minutes)

        # Sincroniza o evento também como bloco na timeline de 24h da data de início se atribuído a um liderado específico
        if new_event.member_id:
            date_str = start.strftime("%Y-%m-%d")
            st_min = start.hour * 60 + start.minute
            et_min = max(st_min + 15, end.hour * 60 + end.minute) if end.date() == start.date() else 1440
            existing_block = (
                db.query(models.TimelineBlock)
                .filter(
                    models.TimelineBlock.date_str == date_str,
                    models.TimelineBlock.event_id == new_event.id,
                )
                .first()
            )
            if not existing_block:
                ev_block = models.TimelineBlock(
                    date_str=date_str,
                    title=new_event.title,
                    notes=new_event.description or new_event.location,
                    block_type="event",
                    start_minute=st_min,
                    end_minute=min(1440, et_min),
                    color=final_color,
                    priority="Alta",
                    status="planned",
                    is_locked=True,
                    is_auto_generated=False,
                    event_id=new_event.id,
                    goal_id=new_event.goal_id,
                )
                db.add(ev_block)
                db.commit()

        return {
            "success": True,
            "event_id": new_event.id,
            "event": serialize_event(new_event),
            "message": f"Evento '{new_event.title}' agendado para {start.strftime('%d/%m/%Y das %H:%M')} às {end.strftime('%H:%M')} ({clean_cat}).",
        }


def update_cancel_event(
    event_id: int,
    action: str = "update",
    new_title: Optional[str] = None,
    new_start: Optional[str] = None,
    new_end: Optional[str] = None,
    new_description: Optional[str] = None,
    new_location: Optional[str] = None,
    new_category: Optional[str] = None,
    new_recurrence_rule: Optional[str] = None,
    new_status: Optional[str] = None,
) -> dict:
    """
    Atualiza ou cancela ('cancel') um evento existente pelo ID, sincronizando a timeline de 24h.
    """
    with SessionLocal() as db:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return {"error": "Evento não encontrado na agenda."}

        if action.lower() in ["cancel", "cancelar", "excluir", "delete"]:
            title_backup = event.title
            db.query(models.TimelineBlock).filter(models.TimelineBlock.event_id == event_id).delete()
            job_id = f"team_calendar_event_reminder_{event_id}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
            db.delete(event)
            db.commit()
            return {"success": True, "message": f"Evento '{title_backup}' cancelado e removido da agenda."}

        if new_title is not None:
            event.title = _clean_text(new_title) or event.title
        if new_description is not None:
            event.description = _clean_text(new_description)
        if new_location is not None:
            event.location = _clean_text(new_location)
        if new_category is not None:
            event.category = _clean_text(new_category) or event.category
            event.color = CATEGORY_COLORS.get(event.category, event.color or "#f59e0b")
        if new_recurrence_rule is not None:
            event.recurrence_rule = new_recurrence_rule.strip().lower()
        if new_status is not None:
            event.status = new_status.strip().lower()
        if new_start:
            event.start_time = _parse_iso_dt(new_start)
        if new_end:
            event.end_time = _parse_iso_dt(new_end)
            if event.end_time <= event.start_time:
                event.end_time = event.start_time + timedelta(hours=1)

        db.commit()
        db.refresh(event)

        # Atualiza blocos vinculados na timeline
        blocks = db.query(models.TimelineBlock).filter(models.TimelineBlock.event_id == event.id).all()
        for b in blocks:
            b.title = event.title
            b.date_str = event.start_time.strftime("%Y-%m-%d")
            b.start_minute = event.start_time.hour * 60 + event.start_time.minute
            b.end_minute = min(1440, max(b.start_minute + 15, event.end_time.hour * 60 + event.end_time.minute))
            b.color = event.color or "#f59e0b"
            if event.status == "completed":
                b.status = "completed"
        db.commit()

        _schedule_event_reminder(event.id, event.title, event.start_time, event.reminder_minutes)
        return {
            "success": True,
            "event": serialize_event(event),
            "message": f"Evento '{event.title}' atualizado com sucesso.",
        }


# ==============================================================================
# 2. Ferramentas de Metas do Calendário (CalendarGoal)
# ==============================================================================
def serialize_goal(db, g: models.CalendarGoal) -> dict:
    _base = _serialize_goal_base(db, g)
    _base["assigned_by_leader"] = bool(g.assigned_by_leader)
    _base["is_team_shared"] = bool(g.is_team_shared)
    return _base


def _serialize_goal_base(db, g: models.CalendarGoal) -> dict:
    try:
        raw_milestones = json.loads(g.milestones_json or "[]")
        if not isinstance(raw_milestones, list):
            raw_milestones = []
    except Exception:
        raw_milestones = []

    linked_tasks = db.query(models.Task).filter(models.Task.goal_id == g.id).all()
    completed_tasks = [t for t in linked_tasks if t.status == "completed"]

    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "horizon": g.horizon or "weekly",
        "target_date": g.target_date,
        "priority": g.priority or "Média",
        "category": g.category or "Geral",
        "color": g.color or "#10b981",
        "target_hours": float(g.target_hours or 0.0),
        "logged_hours": round(float(g.logged_hours or 0.0), 2),
        "progress_percent": int(g.progress_percent or 0),
        "milestones": raw_milestones,
        "status": g.status or "pending",
        "workspace_id": g.workspace_id,
        "notebook_id": g.notebook_id,
        "linked_tasks_count": len(linked_tasks),
        "completed_tasks_count": len(completed_tasks),
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


def _recalculate_goal_progress(g: models.CalendarGoal, milestones: Optional[ list ] = None):
    if milestones is None:
        try:
            milestones = json.loads(g.milestones_json or "[]")
        except Exception:
            milestones = []

    hours_pct = 0
    if g.target_hours and g.target_hours > 0:
        hours_pct = min(100, int(round(((g.logged_hours or 0.0) / g.target_hours) * 100)))

    milestone_pct = 0
    if milestones:
        done_count = sum(1 for m in milestones if m.get("completed"))
        milestone_pct = int(round((done_count / len(milestones)) * 100))

    if milestones and g.target_hours and g.target_hours > 0:
        computed = int(round((hours_pct + milestone_pct) / 2))
    elif milestones:
        computed = milestone_pct
    else:
        computed = hours_pct

    if g.status == "completed":
        g.progress_percent = 100
    else:
        g.progress_percent = max(0, min(100, computed))
        if g.progress_percent >= 100:
            g.status = "completed"
        elif g.progress_percent > 0 or (g.logged_hours and g.logged_hours > 0):
            g.status = "in_progress"


def create_goal(
    title: str,
    horizon: str = "weekly",
    target_date: Optional[str] = None,
    priority: str = "Alta",
    target_hours: float = 5.0,
    description: Optional[str] = None,
    category: str = "Geral",
    color: str = "#10b981",
    milestones: Optional[List[str]] = None,
    workspace_id: Optional[int] = None,
    notebook_id: Optional[int] = None,
) -> dict:
    """
    Cria uma nova Meta no Calendário (diária, semanal, mensal ou por prazo/deadline).
    """
    clean_horizon = (horizon or "weekly").strip().lower()
    horizon_map = {
        "diaria": "daily",
        "diária": "daily",
        "daily": "daily",
        "semanal": "weekly",
        "weekly": "weekly",
        "mensal": "monthly",
        "monthly": "monthly",
        "prazo": "deadline",
        "deadline": "deadline",
    }
    clean_horizon = horizon_map.get(clean_horizon, "weekly")
    canonical_priority = task_tools.normalize_priority(priority)

    if not target_date:
        today = date.today()
        if clean_horizon == "daily":
            target_date = today.isoformat()
        elif clean_horizon == "weekly":
            days_until_sunday = 6 - today.weekday()
            target_date = (today + timedelta(days=days_until_sunday)).isoformat()
        elif clean_horizon == "monthly":
            next_month = today.replace(day=28) + timedelta(days=4)
            last_day = next_month - timedelta(days=next_month.day)
            target_date = last_day.isoformat()
        else:
            target_date = (today + timedelta(days=7)).isoformat()

    milestone_objs = []
    if milestones:
        for item in milestones:
            if isinstance(item, dict):
                milestone_objs.append({
                    "id": str(item.get("id") or uuid.uuid4().hex[:8]),
                    "title": _clean_text(str(item.get("title", ""))) or "Sub-meta",
                    "completed": bool(item.get("completed", False)),
                })
            elif isinstance(item, str) and item.strip():
                milestone_objs.append({
                    "id": uuid.uuid4().hex[:8],
                    "title": _clean_text(item.strip()),
                    "completed": False,
                })

    with SessionLocal() as db:
        goal = models.CalendarGoal(
            title=_clean_text(title) or "Meta Sem Título",
            description=_clean_text(description),
            horizon=clean_horizon,
            target_date=target_date,
            priority=canonical_priority,
            category=_clean_text(category) or "Geral",
            color=color or "#10b981",
            target_hours=max(0.5, float(target_hours or 5.0)),
            logged_hours=0.0,
            progress_percent=0,
            milestones_json=json.dumps(milestone_objs, ensure_ascii=False),
            status="pending",
            workspace_id=workspace_id,
            notebook_id=notebook_id,
        )
        db.add(goal)
        db.commit()
        db.refresh(goal)
        serialized = serialize_goal(db, goal)
        return {
            "success": True,
            "goal_id": goal.id,
            "goal": serialized,
            "message": f"Meta '{goal.title}' ({clean_horizon}) criada com sucesso para {target_date} ({goal.target_hours}h planejadas).",
        }


def list_goals(horizon: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
    """Lista as metas cadastradas no calendário com seu progresso atual."""
    with SessionLocal() as db:
        query = db.query(models.CalendarGoal)
        if horizon and horizon.lower() not in ("all", "todas", "todos"):
            horizon_map = {"diaria": "daily", "diária": "daily", "semanal": "weekly", "mensal": "monthly", "prazo": "deadline"}
            h_clean = horizon_map.get(horizon.lower(), horizon.lower())
            query = query.filter(models.CalendarGoal.horizon == h_clean)
        if status and status.lower() not in ("all", "todas", "todos"):
            s_clean = task_tools.STATUS_MAP.get(status.lower(), status.lower())
            query = query.filter(models.CalendarGoal.status == s_clean)

        goals = query.order_by(models.CalendarGoal.target_date.asc(), models.CalendarGoal.id.desc()).all()
        return [serialize_goal(db, g) for g in goals]


def update_goal_progress(
    goal_id: int,
    add_logged_hours: Optional[float] = None,
    progress_percent: Optional[int] = None,
    status: Optional[str] = None,
    toggle_milestone_id: Optional[str] = None,
    new_title: Optional[str] = None,
    new_target_date: Optional[str] = None,
    new_target_hours: Optional[float] = None,
) -> dict:
    """
    Atualiza o progresso, horas dedicadas, marcos (milestones) ou status (ex: 'completed') de uma Meta.
    """
    with SessionLocal() as db:
        goal = db.query(models.CalendarGoal).filter(models.CalendarGoal.id == goal_id).first()
        if not goal:
            return {"error": f"Meta #{goal_id} não encontrada."}

        if new_title:
            goal.title = _clean_text(new_title) or goal.title
        if new_target_date:
            goal.target_date = new_target_date.strip()
        if new_target_hours is not None and new_target_hours > 0:
            goal.target_hours = float(new_target_hours)

        try:
            milestones = json.loads(goal.milestones_json or "[]")
        except Exception:
            milestones = []

        if toggle_milestone_id:
            for m in milestones:
                if str(m.get("id")) == str(toggle_milestone_id):
                    m["completed"] = not bool(m.get("completed"))
            goal.milestones_json = json.dumps(milestones, ensure_ascii=False)

        if add_logged_hours is not None:
            goal.logged_hours = max(0.0, round((goal.logged_hours or 0.0) + float(add_logged_hours), 2))

        if status:
            canonical_st = task_tools.STATUS_MAP.get(status.strip().lower(), status.strip().lower())
            goal.status = canonical_st
            if canonical_st == "completed":
                goal.progress_percent = 100
                if goal.target_hours and (goal.logged_hours or 0) < goal.target_hours:
                    goal.logged_hours = goal.target_hours

        if progress_percent is not None:
            goal.progress_percent = max(0, min(100, int(progress_percent)))
            if goal.progress_percent >= 100:
                goal.status = "completed"
            elif goal.progress_percent > 0 and goal.status == "pending":
                goal.status = "in_progress"
        else:
            _recalculate_goal_progress(goal, milestones)

        db.commit()
        db.refresh(goal)
        return {
            "success": True,
            "goal": serialize_goal(db, goal),
            "message": f"Meta '{goal.title}' atualizada: {goal.progress_percent}% concluída ({goal.logged_hours:.1f}h / {goal.target_hours:.1f}h) | Status: {goal.status}.",
        }


# ==============================================================================
# 3. Perfil de Rotina Base 24h (RoutineTemplate)
# ==============================================================================
DEFAULT_ROUTINE_TEMPLATES = [
    {
        "title": "Sono & Descanso Reparador (Madrugada)",
        "description": "Período reservado para sono profundo",
        "category": "sleep",
        "start_time_str": "00:00",
        "end_time_str": "07:00",
        "days_of_week": "0,1,2,3,4,5,6",
        "color": "#475569",
    },
    {
        "title": "Café da Manhã & Ritual Matinal",
        "description": "Hidratação, café da manhã e planejamento rápido do dia",
        "category": "meal",
        "start_time_str": "07:00",
        "end_time_str": "08:00",
        "days_of_week": "0,1,2,3,4,5,6",
        "color": "#0ea5e9",
    },
    {
        "title": "Almoço & Pausa Regenerativa",
        "description": "Refeição principal e descanso visual",
        "category": "meal",
        "start_time_str": "12:00",
        "end_time_str": "13:15",
        "days_of_week": "0,1,2,3,4,5,6",
        "color": "#0ea5e9",
    },
    {
        "title": "Atividade Física & Saúde",
        "description": "Treino, caminhada ou alongamento",
        "category": "health",
        "start_time_str": "18:00",
        "end_time_str": "19:00",
        "days_of_week": "0,1,2,3,4",
        "color": "#10b981",
    },
    {
        "title": "Jantar & Descompressão",
        "description": "Refeição noturna e desconexão gradual",
        "category": "meal",
        "start_time_str": "19:30",
        "end_time_str": "20:30",
        "days_of_week": "0,1,2,3,4,5,6",
        "color": "#0ea5e9",
    },
    {
        "title": "Higiene do Sono & Descanso Noturno",
        "description": "Desligamento de telas e início do sono",
        "category": "sleep",
        "start_time_str": "23:00",
        "end_time_str": "24:00",
        "days_of_week": "0,1,2,3,4,5,6",
        "color": "#475569",
    },
]


def ensure_default_routine_templates(db):
    count = 1  # Equipe: fluxos diários são definidos pelo Líder (sem rotina-padrão pessoal)
    if count == 0:
        for item in DEFAULT_ROUTINE_TEMPLATES:
            rt = models.RoutineTemplate(
                title=item["title"],
                description=item["description"],
                category=item["category"],
                start_time_str=item["start_time_str"],
                end_time_str=item["end_time_str"],
                days_of_week=item["days_of_week"],
                color=item["color"],
                is_active=True,
            )
            db.add(rt)
        db.commit()


def manage_routine_template(
    action: str = "list",
    routine_id: Optional[int] = None,
    title: Optional[str] = None,
    start_time_str: Optional[str] = None,
    end_time_str: Optional[str] = None,
    category: str = "routine",
    days_of_week: str = "0,1,2,3,4,5,6",
    color: str = "#6366f1",
    is_active: Optional[bool] = None,
) -> dict:
    """
    Gerencia o Perfil de Rotina Base 24h (sono, refeições, saúde, blocos fixos diários).
    action pode ser: 'list', 'create', 'update', 'delete'.
    """
    act = (action or "list").strip().lower()
    with SessionLocal() as db:
        ensure_default_routine_templates(db)
        if act == "list":
            items = db.query(models.RoutineTemplate).order_by(models.RoutineTemplate.start_time_str.asc()).all()
            return {
                "success": True,
                "routines": [
                    {
                        "id": r.id,
                        "title": r.title,
                        "description": r.description,
                        "category": r.category,
                        "start_time_str": r.start_time_str,
                        "end_time_str": r.end_time_str,
                        "days_of_week": r.days_of_week,
                        "color": r.color,
                        "is_active": r.is_active,
                        "assigned_by_leader": bool(r.assigned_by_leader),
                        "member_id": r.member_id,
                        "checklist": parse_checklist(r.checklist_json),
                        "linked_note_id": r.linked_note_id,
                    }
                    for r in items
                ],
            }

        if act == "create":
            if not title or not start_time_str or not end_time_str:
                return {"error": "Para criar um bloco de rotina, informe title, start_time_str (HH:MM) e end_time_str (HH:MM)."}
            rt = models.RoutineTemplate(
                title=_clean_text(title),
                category=_clean_text(category) or "routine",
                start_time_str=start_time_str.strip(),
                end_time_str=end_time_str.strip(),
                days_of_week=days_of_week,
                color=color or "#6366f1",
                is_active=True if is_active is None else bool(is_active),
            )
            db.add(rt)
            db.commit()
            db.refresh(rt)
            return {
                "success": True,
                "routine_id": rt.id,
                "message": f"Bloco de rotina 24h '{rt.title}' ({rt.start_time_str}–{rt.end_time_str}) adicionado ao perfil.",
            }

        if not routine_id:
            return {"error": "Informe routine_id para atualizar ou excluir um bloco de rotina."}

        rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
        if not rt:
            return {"error": f"Bloco de rotina #{routine_id} não encontrado."}

        if act in ("delete", "remove", "excluir"):
            name_bak = rt.title
            db.delete(rt)
            db.commit()
            return {"success": True, "message": f"Bloco de rotina '{name_bak}' removido."}

        if title:
            rt.title = _clean_text(title)
        if start_time_str:
            rt.start_time_str = start_time_str.strip()
        if end_time_str:
            rt.end_time_str = end_time_str.strip()
        if category:
            rt.category = _clean_text(category)
        if is_active is not None:
            rt.is_active = bool(is_active)
        db.commit()
        return {"success": True, "message": f"Bloco de rotina '{rt.title}' atualizado com sucesso."}


# ==============================================================================
# 4. Motor de Geração e Execução da Timeline Diária de 24 Horas (00:00 - 23:59)
# ==============================================================================
def serialize_timeline_block(b: models.TimelineBlock, now_utc: Optional[datetime] = None) -> dict:
    now_ref = now_utc or datetime.utcnow()
    total_sec = b.actual_seconds_spent or 0
    if b.status == "in_progress" and b.timer_started_at:
        delta = max(0, int((now_ref - b.timer_started_at).total_seconds()))
        total_sec += delta

    return {
        "id": b.id,
        "date_str": b.date_str,
        "title": b.title,
        "notes": b.notes,
        "block_type": b.block_type or "focus",
        "start_minute": int(b.start_minute or 0),
        "end_minute": int(b.end_minute or 60),
        "start_time_str": minutes_to_time_str(b.start_minute or 0),
        "end_time_str": minutes_to_time_str(b.end_minute or 60),
        "duration_minutes": max(0, int((b.end_minute or 0) - (b.start_minute or 0))),
        "color": b.color or BLOCK_TYPE_COLORS.get(b.block_type or "focus", "#3b82f6"),
        "priority": b.priority or "Média",
        "status": b.status or "planned",
        "is_locked": bool(b.is_locked),
        "is_auto_generated": bool(b.is_auto_generated),
        "task_id": b.task_id,
        "goal_id": b.goal_id,
        "event_id": b.event_id,
        "timer_started_at": b.timer_started_at.isoformat() if b.timer_started_at else None,
        "actual_seconds_spent": total_sec,
        "assigned_by_leader": bool(b.assigned_by_leader),
        "member_id": b.member_id,
        "checklist": parse_checklist(b.checklist_json),
        "linked_note_id": b.linked_note_id,
        "routine_template_id": b.routine_template_id,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def _compute_free_windows(occupied: List[tuple], min_slot: int = 20) -> List[List[int]]:
    """
    Recebe intervalos ocupados [(start_min, end_min), ...] em [0, 1440]
    e retorna a lista mutável de janelas livres [[free_start, free_end], ...].
    """
    norm = sorted(
        [(max(0, min(1440, int(s))), max(0, min(1440, int(e)))) for s, e in occupied if e > s],
        key=lambda x: (x[0], x[1]),
    )
    merged = []
    for s, e in norm:
        if not merged or s > merged[-1][1]:
            merged.append([s, e])
        else:
            merged[-1][1] = max(merged[-1][1], e)

    free_windows = []
    cursor = 0
    for s, e in merged:
        if s - cursor >= min_slot:
            free_windows.append([cursor, s])
        cursor = max(cursor, e)
    if 1440 - cursor >= min_slot:
        free_windows.append([cursor, 1440])
    return free_windows


def get_daily_timeline(date_str: Optional[str] = None) -> dict:
    """
    Retorna a Timeline completa de 24 horas (00:00 a 23:59) de uma data específica,
    com métricas de ocupação das 24h, conflitos detectados e status de execução.
    """
    target_date = (date_str or datetime.now().strftime("%Y-%m-%d")).strip()[:10]
    now_utc = datetime.utcnow()

    with SessionLocal() as db:
        blocks = (
            db.query(models.TimelineBlock)
            .filter(models.TimelineBlock.date_str == target_date)
            .order_by(models.TimelineBlock.start_minute.asc(), models.TimelineBlock.id.asc())
            .all()
        )
        serialized = [serialize_timeline_block(b, now_utc) for b in blocks]

        focus_minutes = 0
        routine_minutes = 0
        event_minutes = 0
        completed_minutes = 0
        conflicts = []

        for idx, b in enumerate(serialized):
            dur = b["duration_minutes"]
            btype = b["block_type"]
            if btype in ("task", "goal", "focus"):
                focus_minutes += dur
            elif btype == "event":
                event_minutes += dur
            elif btype in ("routine", "break"):
                routine_minutes += dur

            if b["status"] == "completed":
                completed_minutes += dur

            # Verifica sobreposição com o bloco anterior
            if idx > 0:
                prev = serialized[idx - 1]
                if b["start_minute"] < prev["end_minute"]:
                    conflicts.append({
                        "block_a": prev["title"],
                        "block_b": b["title"],
                        "overlap_Time": f"{minutes_to_time_str(b['start_minute'])} - {minutes_to_time_str(min(prev['end_minute'], b['end_minute']))}",
                    })

        occupied_intervals = [(b["start_minute"], b["end_minute"]) for b in serialized if b["status"] != "skipped"]
        free_windows = _compute_free_windows(occupied_intervals, min_slot=15)
        free_minutes = sum(w[1] - w[0] for w in free_windows)

        actionable_blocks = [b for b in serialized if b["block_type"] in ("task", "goal", "focus", "event")]
        done_actionable = [b for b in actionable_blocks if b["status"] == "completed"]
        completion_rate = int(round((len(done_actionable) / len(actionable_blocks)) * 100)) if actionable_blocks else 0

        return {
            "date_str": target_date,
            "total_day_minutes": 1440,
            "focus_hours": round(focus_minutes / 60.0, 1),
            "event_hours": round(event_minutes / 60.0, 1),
            "routine_hours": round(routine_minutes / 60.0, 1),
            "free_hours": round(free_minutes / 60.0, 1),
            "completed_hours": round(completed_minutes / 60.0, 1),
            "completion_rate": completion_rate,
            "conflicts": conflicts,
            "free_windows": [
                {"start_time": minutes_to_time_str(w[0]), "end_time": minutes_to_time_str(w[1]), "minutes": w[1] - w[0]}
                for w in free_windows
            ],
            "blocks": serialized,
        }


def generate_daily_timeline(
    date_str: Optional[str] = None,
    respect_routine: bool = True,
    include_events: bool = True,
    include_pending_tasks: bool = True,
    include_active_goals: bool = True,
    focus_block_minutes: int = 90,
    break_minutes: int = 15,
    overwrite_unlocked: bool = True,
) -> dict:
    """
    Motor Híbrido Gerador da Timeline de 24 Horas (00:00 a 24:00):
    1. Preserva blocos travados (is_locked=True) ou já em andamento/concluídos.
    2. Aloca o Perfil de Rotina Base 24h (sono, refeições, saúde).
    3. Aloca os Eventos fixos e recorrentes do dia.
    4. Nos espaços livres das 24h, distribui inteligentemente as Demandas (Tasks) e Metas (Goals)
       ordenadas por Prioridade e Prazo, fatiando em blocos de foco + pausas.
    """
    target_date_str = (date_str or datetime.now().strftime("%Y-%m-%d")).strip()[:10]
    try:
        target_date_obj = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except ValueError:
        return {"error": "Data inválida. Use o formato YYYY-MM-DD."}

    weekday_str = str(target_date_obj.weekday())  # 0=Seg .. 6=Dom

    with SessionLocal() as db:
        ensure_default_routine_templates(db)

        if overwrite_unlocked:
            db.query(models.TimelineBlock).filter(
                models.TimelineBlock.date_str == target_date_str,
                models.TimelineBlock.is_locked == False,
                models.TimelineBlock.status == "planned",
                models.TimelineBlock.assigned_by_leader == False,
            ).delete()
            db.commit()

        existing_blocks = (
            db.query(models.TimelineBlock)
            .filter(models.TimelineBlock.date_str == target_date_str)
            .all()
        )
        occupied: List[tuple] = [(b.start_minute, b.end_minute) for b in existing_blocks]
        existing_event_ids = {b.event_id for b in existing_blocks if b.event_id}

        # 1. Aloca blocos da Rotina Base 24h
        if respect_routine:
            routines = (
                db.query(models.RoutineTemplate)
                .filter(models.RoutineTemplate.is_active == True)
                .order_by(models.RoutineTemplate.start_time_str.asc())
                .all()
            )
            for rt in routines:
                days = [d.strip() for d in (rt.days_of_week or "0,1,2,3,4,5,6").split(",")]
                if weekday_str not in days:
                    continue
                st_m = time_str_to_minutes(rt.start_time_str)
                et_m = time_str_to_minutes(rt.end_time_str)
                if et_m <= st_m:
                    continue
                # Evita duplicar a mesma rotina na data
                already_has = any(
                    b.block_type == "routine" and b.start_minute == st_m and b.title == rt.title
                    for b in existing_blocks
                )
                if already_has:
                    continue
                r_block = models.TimelineBlock(
                    date_str=target_date_str,
                    title=rt.title,
                    notes=rt.description,
                    block_type="routine",
                    start_minute=st_m,
                    end_minute=et_m,
                    color=rt.color or "#6366f1",
                    priority="Média",
                    status="planned",
                    is_locked=False,
                    is_auto_generated=True,
                    routine_template_id=rt.id,
                    linked_note_id=rt.linked_note_id,
                    checklist_json=json.dumps(
                        [{**it, "done": False} for it in parse_checklist(rt.checklist_json)], ensure_ascii=False
                    ),
                )
                db.add(r_block)
                occupied.append((st_m, et_m))

        # 2. Aloca Eventos do Calendário para o dia (incluindo recorrentes)
        if include_events:
            day_start = datetime.combine(target_date_obj, datetime.min.time())
            day_end = datetime.combine(target_date_obj, datetime.max.time())
            all_events = db.query(models.Event).filter(models.Event.status != "cancelled").all()
            for ev in all_events:
                occs = _expand_event_occurrences(ev, day_start, day_end)
                for occ in occs:
                    if ev.id in existing_event_ids:
                        continue
                    occ_st = _parse_iso_dt(occ["start_time"])
                    occ_et = _parse_iso_dt(occ["end_time"])
                    st_m = occ_st.hour * 60 + occ_st.minute
                    et_m = occ_et.hour * 60 + occ_et.minute if occ_et.date() == occ_st.date() else 1440
                    et_m = max(st_m + 15, min(1440, et_m))
                    ev_block = models.TimelineBlock(
                        date_str=target_date_str,
                        title=ev.title,
                        notes=ev.description or ev.location,
                        block_type="event",
                        start_minute=st_m,
                        end_minute=et_m,
                        color=ev.color or "#f59e0b",
                        priority="Alta",
                        status="completed" if ev.status == "completed" else "planned",
                        is_locked=True,
                        is_auto_generated=True,
                        event_id=ev.id,
                        goal_id=ev.goal_id,
                    )
                    db.add(ev_block)
                    occupied.append((st_m, et_m))

        db.commit()

        # 3. Calcula janelas livres nas 24 horas para alocar Demandas e Metas
        free_windows = _compute_free_windows(occupied, min_slot=25)
        work_queue: List[Dict[str, Any]] = []

        if include_pending_tasks:
            tasks = (
                db.query(models.Task)
                .filter(models.Task.status.in_(["pending", "in_progress"]))
                .all()
            )
            # Ordena: tarefas agendadas para este dia primeiro, depois por Prioridade
            tasks.sort(
                key=lambda t: (
                    0 if t.scheduled_date == target_date_str else 1,
                    -PRIORITY_RANK.get(t.priority or "Média", 3),
                    t.id,
                )
            )
            for t in tasks:
                est_min = int(max(0.5, float(t.estimated_hours or 1.0)) * 60)
                spent_min = int((t.time_spent_seconds or 0) // 60)
                rem_min = max(30, est_min - spent_min)
                # No máximo 2 blocos por tarefa no mesmo dia para distribuir o dia de forma equilibrada
                max_daily_for_task = min(rem_min, focus_block_minutes * 2)
                work_queue.append({
                    "kind": "task",
                    "title": f"Demanda: {t.name}",
                    "notes": t.description or f"Categoria: {t.category or 'Padrão'} | Dificuldade: {t.difficulty}",
                    "remaining_minutes": max_daily_for_task,
                    "priority": t.priority or "Média",
                    "color": "#3b82f6" if (t.priority != "Crítica") else "#ef4444",
                    "task_id": t.id,
                    "goal_id": t.goal_id,
                })

        if include_active_goals:
            goals = (
                db.query(models.CalendarGoal)
                .filter(models.CalendarGoal.status.in_(["pending", "in_progress"]))
                .all()
            )
            goals.sort(
                key=lambda g: (
                    0 if g.horizon == "daily" or g.target_date == target_date_str else 1,
                    -PRIORITY_RANK.get(g.priority or "Média", 3),
                    g.target_date or "9999-12-31",
                )
            )
            for g in goals:
                rem_hours = max(0.5, float(g.target_hours or 2.0) - float(g.logged_hours or 0.0))
                slice_min = min(int(rem_hours * 60), focus_block_minutes)
                work_queue.append({
                    "kind": "goal",
                    "title": f"Meta: {g.title}",
                    "notes": g.description or f"Horizonte: {g.horizon} | Meta: {g.target_hours}h",
                    "remaining_minutes": max(30, slice_min),
                    "priority": g.priority or "Alta",
                    "color": g.color or "#10b981",
                    "task_id": None,
                    "goal_id": g.id,
                })

        # Intercala Demandas e Metas por prioridade nas janelas livres das 24h
        work_queue.sort(key=lambda item: -PRIORITY_RANK.get(item["priority"], 3))

        win_idx = 0
        while win_idx < len(free_windows) and work_queue:
            w_start, w_end = free_windows[win_idx]
            avail = w_end - w_start
            if avail < 25:
                win_idx += 1
                continue

            current_item = work_queue[0]
            alloc_min = min(avail, focus_block_minutes, current_item["remaining_minutes"])
            if alloc_min < 20:
                work_queue.pop(0)
                continue

            block_end = w_start + alloc_min
            new_block = models.TimelineBlock(
                date_str=target_date_str,
                title=current_item["title"],
                notes=current_item["notes"],
                block_type=current_item["kind"],
                start_minute=w_start,
                end_minute=block_end,
                color=current_item["color"],
                priority=current_item["priority"],
                status="planned",
                is_locked=False,
                is_auto_generated=True,
                task_id=current_item["task_id"],
                goal_id=current_item["goal_id"],
            )
            db.add(new_block)

            current_item["remaining_minutes"] -= alloc_min
            if current_item["remaining_minutes"] < 20:
                work_queue.pop(0)
            else:
                # Rotaciona para dar chance a outras metas/demandas no mesmo dia
                work_queue.append(work_queue.pop(0))

            next_cursor = block_end
            # Insere pausa estratégica se ainda houver espaço suficiente na janela
            if break_minutes > 0 and (w_end - next_cursor) >= (break_minutes + 30) and alloc_min >= 60:
                brk_end = next_cursor + break_minutes
                brk_block = models.TimelineBlock(
                    date_str=target_date_str,
                    title="Pausa Estratégica & Hidratação",
                    notes="Descanso curto entre blocos de foco na timeline 24h",
                    block_type="break",
                    start_minute=next_cursor,
                    end_minute=brk_end,
                    color="#64748b",
                    priority="Baixa",
                    status="planned",
                    is_locked=False,
                    is_auto_generated=True,
                )
                db.add(brk_block)
                next_cursor = brk_end

            free_windows[win_idx][0] = next_cursor

        db.commit()

    summary = get_daily_timeline(target_date_str)
    summary["success"] = True
    summary["message"] = (
        f"Timeline de 24h gerada para {target_date_str}: "
        f"{len(summary['blocks'])} blocos alocados ({summary['focus_hours']}h de foco, "
        f"{summary['event_hours']}h de eventos, {summary['routine_hours']}h de rotina e {summary['free_hours']}h livres)."
    )
    return summary


def upsert_timeline_block(
    date_str: str,
    title: str,
    start_time_str: str,
    end_time_str: str,
    block_type: str = "focus",
    notes: Optional[str] = None,
    priority: str = "Média",
    color: Optional[str] = None,
    is_locked: bool = True,
    task_id: Optional[int] = None,
    goal_id: Optional[int] = None,
    block_id: Optional[int] = None,
) -> dict:
    """
    Cria ou atualiza manualmente um bloco específico dentro da régua de 24 horas (00:00 a 24:00) de um dia.
    """
    st_m = time_str_to_minutes(start_time_str)
    et_m = time_str_to_minutes(end_time_str)
    if et_m <= st_m:
        et_m = min(1440, st_m + 30)

    clean_type = (block_type or "focus").strip().lower()
    if clean_type not in BLOCK_TYPE_COLORS:
        clean_type = "focus"

    with SessionLocal() as db:
        if block_id:
            blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
            if not blk:
                return {"error": f"Bloco #{block_id} não encontrado na timeline."}
        else:
            blk = models.TimelineBlock(date_str=date_str.strip()[:10], status="planned")
            db.add(blk)

        blk.title = _clean_text(title) or "Bloco de Tempo"
        blk.notes = _clean_text(notes)
        blk.block_type = clean_type
        blk.start_minute = st_m
        blk.end_minute = et_m
        blk.priority = task_tools.normalize_priority(priority)
        blk.color = color or BLOCK_TYPE_COLORS.get(clean_type, "#3b82f6")
        blk.is_locked = bool(is_locked)
        if task_id is not None:
            blk.task_id = task_id
        if goal_id is not None:
            blk.goal_id = goal_id

        db.commit()
        db.refresh(blk)
        return {
            "success": True,
            "block": serialize_timeline_block(blk),
            "message": f"Bloco '{blk.title}' ({minutes_to_time_str(st_m)}–{minutes_to_time_str(et_m)}) salvo na timeline de {blk.date_str}.",
        }


def control_timeline_block(block_id: int, action: str) -> dict:
    """
    Controla a execução em tempo real de um bloco da Timeline de 24h:
    action pode ser: 'start' (Play), 'pause' (Pause), 'complete' (Concluir), 'reset' (Zerar) ou 'skip' (Pular).
    Sincroniza automaticamente com o cronômetro da Demanda (Task) e o progresso da Meta (CalendarGoal) vinculada!
    """
    act = (action or "").strip().lower()
    action_map = {
        "play": "start",
        "iniciar": "start",
        "start": "start",
        "pausar": "pause",
        "pause": "pause",
        "concluir": "complete",
        "finalizar": "complete",
        "complete": "complete",
        "reset": "reset",
        "zerar": "reset",
        "skip": "skip",
        "pular": "skip",
    }
    canonical_act = action_map.get(act, act)
    if canonical_act not in ("start", "pause", "complete", "reset", "skip"):
        return {"error": "Ação inválida. Use 'start', 'pause', 'complete', 'reset' ou 'skip'."}

    now_utc = datetime.utcnow()

    with SessionLocal() as db:
        blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
        if not blk:
            return {"error": f"Bloco #{block_id} não encontrado na Timeline."}

        job_id = f"team_timeline_block_end_{blk.id}"

        if canonical_act == "start":
            # Pausa outros blocos que estejam rodando simultaneamente
            running_others = (
                db.query(models.TimelineBlock)
                .filter(models.TimelineBlock.status == "in_progress", models.TimelineBlock.id != blk.id)
                .all()
            )
            for other in running_others:
                if other.timer_started_at:
                    other.actual_seconds_spent = (other.actual_seconds_spent or 0) + max(
                        0, int((now_utc - other.timer_started_at).total_seconds())
                    )
                other.timer_started_at = None
                other.status = "planned"
                if other.task_id:
                    task_tools.pause_task_timer(other.task_id)

            blk.status = "in_progress"
            blk.timer_started_at = now_utc
            db.commit()

            if blk.task_id:
                task_tools.start_task_timer(blk.task_id)

            planned_seconds = max(60, (blk.end_minute - blk.start_minute) * 60 - (blk.actual_seconds_spent or 0))
            run_date = datetime.now() + timedelta(seconds=planned_seconds)
            scheduler.add_job(
                _notify_calendar_item,
                "date",
                run_date=run_date,
                args=[f"⏰ Tempo do bloco '{blk.title}' ({minutes_to_time_str(blk.start_minute)}–{minutes_to_time_str(blk.end_minute)}) concluído na Timeline 24h!"],
                id=job_id,
                replace_existing=True,
            )

            db.refresh(blk)
            return {
                "success": True,
                "block": serialize_timeline_block(blk, now_utc),
                "message": f"▶️ Execução iniciada no bloco '{blk.title}' ({minutes_to_time_str(blk.start_minute)}–{minutes_to_time_str(blk.end_minute)}).",
            }

        if canonical_act == "pause":
            elapsed_delta = 0
            if blk.status == "in_progress" and blk.timer_started_at:
                elapsed_delta = max(0, int((now_utc - blk.timer_started_at).total_seconds()))
                blk.actual_seconds_spent = (blk.actual_seconds_spent or 0) + elapsed_delta
            blk.timer_started_at = None
            blk.status = "planned"
            db.commit()

            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)

            if blk.task_id:
                task_tools.pause_task_timer(blk.task_id)
            if blk.goal_id:
                task_tools._sync_goal_from_tasks(db, blk.goal_id)

            db.refresh(blk)
            return {
                "success": True,
                "block": serialize_timeline_block(blk, now_utc),
                "message": f"⏸️ Bloco '{blk.title}' pausado. Tempo acumulado no bloco: {(blk.actual_seconds_spent or 0) / 60:.1f} min.",
            }

        if canonical_act == "complete":
            if blk.status == "in_progress" and blk.timer_started_at:
                elapsed_delta = max(0, int((now_utc - blk.timer_started_at).total_seconds()))
                blk.actual_seconds_spent = (blk.actual_seconds_spent or 0) + elapsed_delta
            elif (blk.actual_seconds_spent or 0) == 0:
                # Se concluído diretamente sem timer, credita a duração planejada do bloco
                blk.actual_seconds_spent = max(60, (blk.end_minute - blk.start_minute) * 60)

            blk.timer_started_at = None
            blk.status = "completed"
            db.commit()

            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)

            if blk.task_id:
                task_tools.pause_task_timer(blk.task_id)
            if blk.goal_id:
                task_tools._sync_goal_from_tasks(db, blk.goal_id)

            db.refresh(blk)
            return {
                "success": True,
                "block": serialize_timeline_block(blk, now_utc),
                "message": f"✅ Bloco '{blk.title}' marcado como concluído na Timeline 24h!",
            }

        if canonical_act == "reset":
            blk.actual_seconds_spent = 0
            blk.timer_started_at = None
            blk.status = "planned"
            db.commit()
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
            db.refresh(blk)
            return {
                "success": True,
                "block": serialize_timeline_block(blk, now_utc),
                "message": f"🔄 Cronômetro do bloco '{blk.title}' reiniciado.",
            }

        if canonical_act == "skip":
            blk.timer_started_at = None
            blk.status = "skipped"
            db.commit()
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
            db.refresh(blk)
            return {
                "success": True,
                "block": serialize_timeline_block(blk, now_utc),
                "message": f"⏭️ Bloco '{blk.title}' marcado como pulado.",
            }
