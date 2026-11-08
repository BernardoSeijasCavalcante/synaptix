"""GERADO a partir de tools/task_tools.py para o domínio ISOLADO da Equipe (synaptix_team.db).
As sessões usam TeamSessionLocal (escopo por contextvar). Ver team_scope.py."""
from datetime import datetime, timedelta
from typing import List, Optional
from team_database import TeamSessionLocal as SessionLocal
from core_scheduler import scheduler
import team_models as models

DIFFICULTY_HOURS_MAP = {
    "crítica": 12.0,
    "critica": 12.0,
    "alta": 6.0,
    "média": 3.0,
    "media": 3.0,
    "baixa": 1.0,
    "simples": 0.5,
}

PRIORITY_CANONICAL = {
    "crítica": "Crítica",
    "critica": "Crítica",
    "critical": "Crítica",
    "alta": "Alta",
    "high": "Alta",
    "média": "Média",
    "media": "Média",
    "medium": "Média",
    "baixa": "Baixa",
    "low": "Baixa",
    "muito baixa": "Muito Baixa",
    "muitobaixa": "Muito Baixa",
    "very low": "Muito Baixa",
    "very_low": "Muito Baixa",
}

DIFFICULTY_CANONICAL = {
    "crítica": "Crítica",
    "critica": "Crítica",
    "critical": "Crítica",
    "alta": "Alta",
    "high": "Alta",
    "hard": "Alta",
    "média": "Média",
    "media": "Média",
    "medium": "Média",
    "baixa": "Baixa",
    "low": "Baixa",
    "easy": "Baixa",
    "simples": "Simples",
    "simple": "Simples",
}

STATUS_MAP = {
    "pending": "pending",
    "pendente": "pending",
    "in_progress": "in_progress",
    "em andamento": "in_progress",
    "em_andamento": "in_progress",
    "completed": "completed",
    "concluida": "completed",
    "concluída": "completed",
    "finalizada": "completed",
}

def normalize_priority(priority: Optional[str]) -> str:
    if not priority:
        return "Média"
    cleaned = priority.strip().lower()
    return PRIORITY_CANONICAL.get(cleaned, priority.strip().title())

def normalize_difficulty(difficulty: Optional[str]) -> str:
    if not difficulty:
        return "Média"
    cleaned = difficulty.strip().lower()
    return DIFFICULTY_CANONICAL.get(cleaned, difficulty.strip().title())

def normalize_category(category: Optional[str]) -> str:
    if not category or not category.strip():
        return "Padrão"
    cleaned = category.strip()
    if cleaned.lower() in ["padrao", "padrão", "default", "geral", "generica", "genérica"]:
        return "Padrão"
    # Preserva siglas em maiúsculas (ex: TI, RH, UI/UX) ou capitaliza adequadamente
    if cleaned.isupper() and len(cleaned) <= 5:
        return cleaned
    return cleaned[0].upper() + cleaned[1:]

def get_default_hours_for_difficulty(difficulty: str, user_estimated_hours: Optional[float] = None) -> float:
    normalized = normalize_difficulty(difficulty)
    # Se a dificuldade for Simples e o usuário forneceu um tempo exato > 0, usamos o tempo exato:
    if normalized == "Simples" and user_estimated_hours is not None and user_estimated_hours > 0:
        return float(user_estimated_hours)
    # Caso contrário, a classificação de dificuldade já define o tempo:
    return DIFFICULTY_HOURS_MAP.get(normalized.lower(), 3.0)

def _sync_goal_from_tasks(db, goal_id: Optional[int]):
    if not goal_id:
        return
    goal = db.query(models.CalendarGoal).filter(models.CalendarGoal.id == goal_id).first()
    if not goal:
        return
    linked_tasks = db.query(models.Task).filter(models.Task.goal_id == goal_id).all()
    linked_blocks = db.query(models.TimelineBlock).filter(models.TimelineBlock.goal_id == goal_id).all()
    task_seconds = sum((t.time_spent_seconds or 0) for t in linked_tasks)
    block_only_seconds = sum(
        (b.actual_seconds_spent or 0)
        for b in linked_blocks
        if not b.task_id
    )
    total_hours = round((task_seconds + block_only_seconds) / 3600.0, 2)
    if total_hours > (goal.logged_hours or 0.0):
        goal.logged_hours = total_hours
    if goal.target_hours and goal.target_hours > 0:
        computed_pct = min(100, int(round((goal.logged_hours / goal.target_hours) * 100)))
        if goal.status != "completed":
            goal.progress_percent = max(goal.progress_percent or 0, computed_pct)
            if goal.progress_percent >= 100:
                goal.status = "completed"
            elif goal.progress_percent > 0:
                goal.status = "in_progress"
    db.commit()


def add_task(
    name: str,
    description: Optional[str] = None,
    category: str = "Padrão",
    priority: str = "Média",
    difficulty: str = "Média",
    estimated_hours: Optional[float] = None,
    goal_id: Optional[int] = None,
    scheduled_date: Optional[str] = None,
) -> dict:
    canonical_category = normalize_category(category)
    canonical_priority = normalize_priority(priority)
    canonical_difficulty = normalize_difficulty(difficulty)
    final_hours = get_default_hours_for_difficulty(canonical_difficulty, estimated_hours)

    with SessionLocal() as db:
        new_task = models.Task(
            name=name,
            description=description,
            category=canonical_category,
            priority=canonical_priority,
            difficulty=canonical_difficulty,
            estimated_hours=final_hours,
            status="pending",
            time_spent_seconds=0,
            timer_status="stopped",
            goal_id=goal_id,
            scheduled_date=scheduled_date,
        )
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        return {
            "success": True,
            "task_id": new_task.id,
            "name": new_task.name,
            "category": new_task.category,
            "priority": new_task.priority,
            "difficulty": new_task.difficulty,
            "estimated_hours": new_task.estimated_hours,
            "goal_id": new_task.goal_id,
            "scheduled_date": new_task.scheduled_date,
            "message": f"Demanda '{new_task.name}' criada com sucesso! Categoria: {new_task.category}, Prioridade: {new_task.priority}, Dificuldade: {new_task.difficulty}, Tempo estimado: {new_task.estimated_hours}h."
        }

def _notify_task_progress(task_id: int, percentage: int, message: str):
    with SessionLocal() as db:
        dt = datetime.utcnow()
        new_notification = models.Notification(
            message=message,
            scheduled_for=dt,
            is_sent=False
        )
        db.add(new_notification)
        db.commit()

def start_task_timer(task_id: int) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}
            
        if task.timer_status == "running":
            return {"error": "O cronômetro já está em execução."}
            
        task.timer_status = "running"
        task.timer_started_at = datetime.utcnow()
        task.status = "in_progress"
        db.commit()
        
        if task.estimated_hours and task.estimated_hours > 0:
            total_seconds = int(task.estimated_hours * 3600)
            remaining_seconds = total_seconds - task.time_spent_seconds
            
            if remaining_seconds > 0:
                milestones = [25, 50, 75]
                for p in milestones:
                    target_seconds = total_seconds * (p / 100.0)
                    if target_seconds > task.time_spent_seconds:
                        delay_seconds = target_seconds - task.time_spent_seconds
                        run_date = datetime.now() + timedelta(seconds=delay_seconds)
                        job_id = f"team_task_{task_id}_progress_{p}"
                        
                        scheduler.add_job(
                            _notify_task_progress,
                            'date',
                            run_date=run_date,
                            args=[task_id, p, f"Atenção: Você atingiu {p}% do tempo estimado ({task.estimated_hours}h) para a demanda '{task.name}'."],
                            id=job_id,
                            replace_existing=True
                        )
                        
        return {"success": True, "message": f"Cronômetro iniciado para a demanda '{task.name}'. Alertas de tempo agendados."}

def pause_task_timer(task_id: int) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}
            
        if task.timer_status == "running" and task.timer_started_at:
            delta = datetime.utcnow() - task.timer_started_at
            task.time_spent_seconds += int(delta.total_seconds())
            
        task.timer_status = "paused"
        db.commit()
        _sync_goal_from_tasks(db, task.goal_id)
        
        for p in [25, 50, 75]:
            job_id = f"team_task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": f"Cronômetro pausado. Tempo investido até o momento: {task.time_spent_seconds / 60:.1f} minutos."}

def reset_task_timer(task_id: int) -> dict:
    """Zera o tempo investido na demanda e remove agendamentos."""
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}
            
        task.time_spent_seconds = 0
        task.timer_status = "stopped"
        task.status = "pending"
        task.timer_started_at = None
        db.commit()
        
        for p in [25, 50, 75]:
            job_id = f"team_task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": f"Cronômetro da demanda '{task.name}' zerado e status redefinido para pendente."}

def complete_task(task_id: int) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}
            
        if task.timer_status == "running" and task.timer_started_at:
            delta = datetime.utcnow() - task.timer_started_at
            task.time_spent_seconds += int(delta.total_seconds())
            
        task.timer_status = "stopped"
        task.status = "completed"
        db.commit()
        _sync_goal_from_tasks(db, task.goal_id)
        
        for p in [25, 50, 75]:
            job_id = f"team_task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": f"Demanda '{task.name}' concluída com sucesso! Tempo total investido: {task.time_spent_seconds / 60:.1f} minutos."}

def query_tasks(status: str = "all", search_term: Optional[str] = None, category: Optional[str] = None) -> List[dict]:
    with SessionLocal() as db:
        query = db.query(models.Task)
        if status and status.lower() not in ["all", "todas", "todos"]:
            canonical_status = STATUS_MAP.get(status.lower(), status.lower())
            query = query.filter(models.Task.status == canonical_status)
            
        tasks = query.all()
        if category and category.lower() not in ["all", "todas", "todos"]:
            cat_lower = category.strip().lower()
            tasks = [
                t for t in tasks
                if (t.category or "Padrão").strip().lower() == cat_lower
            ]
        if search_term:
            term_lower = search_term.lower()
            tasks = [
                t for t in tasks
                if term_lower in (t.name or "").lower()
                or term_lower in (t.description or "").lower()
                or term_lower in (t.category or "Padrão").lower()
            ]
        now_utc = datetime.utcnow()
        results = []
        for t in tasks:
            total_seconds = t.time_spent_seconds or 0
            if t.timer_status == "running" and t.timer_started_at:
                delta = now_utc - t.timer_started_at
                total_seconds += max(0, int(delta.total_seconds()))
            results.append({
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "category": t.category or "Padrão",
                "priority": t.priority,
                "difficulty": t.difficulty,
                "estimated_hours": t.estimated_hours,
                "status": t.status,
                "goal_id": t.goal_id,
                "scheduled_date": t.scheduled_date,
                "time_spent_minutes": round(total_seconds / 60, 1),
                "timer_status": t.timer_status,
                "created_at": t.created_at.isoformat() if t.created_at else None
            })
        return results

def update_task_status(task_id: int, status: str) -> dict:
    canonical_status = STATUS_MAP.get(status.lower(), status.lower())
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}
            
        task.status = canonical_status
        db.commit()
        return {"success": True, "message": f"Status da demanda atualizado para {canonical_status}."}

def update_task_category(task_id: int, category: str) -> dict:
    canonical_category = normalize_category(category)
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Demanda não encontrada."}

        task.category = canonical_category
        db.commit()
        return {
            "success": True,
            "task_id": task.id,
            "name": task.name,
            "category": task.category,
            "message": f"Categoria da demanda '{task.name}' atualizada para '{canonical_category}'."
        }

