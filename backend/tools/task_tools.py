from datetime import datetime, timedelta
from typing import List, Optional
from database import SessionLocal
from core_scheduler import scheduler
import models

def add_task(name: str, description: Optional[str] = None, priority: str = "medium", difficulty: str = "medium", estimated_hours: float = 0.0) -> dict:
    with SessionLocal() as db:
        new_task = models.Task(
            name=name,
            description=description,
            priority=priority,
            difficulty=difficulty,
            estimated_hours=estimated_hours,
            status="pending",
            time_spent_seconds=0,
            timer_status="stopped"
        )
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        return {"success": True, "task_id": new_task.id, "message": "Demanda criada com sucesso."}

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
            return {"error": "Task not found."}
            
        if task.timer_status == "running":
            return {"error": "Timer is already running."}
            
        task.timer_status = "running"
        task.timer_started_at = datetime.utcnow()
        task.status = "in_progress"
        db.commit()
        
        if task.estimated_hours > 0:
            total_seconds = int(task.estimated_hours * 3600)
            remaining_seconds = total_seconds - task.time_spent_seconds
            
            if remaining_seconds > 0:
                milestones = [25, 50, 75]
                for p in milestones:
                    target_seconds = total_seconds * (p / 100.0)
                    if target_seconds > task.time_spent_seconds:
                        delay_seconds = target_seconds - task.time_spent_seconds
                        # O APScheduler assume timezone local para datas naive. Usamos datetime.now() aqui.
                        run_date = datetime.now() + timedelta(seconds=delay_seconds)
                        job_id = f"task_{task_id}_progress_{p}"
                        
                        scheduler.add_job(
                            _notify_task_progress,
                            'date',
                            run_date=run_date,
                            args=[task_id, p, f"Atenção: Você atingiu {p}% do tempo estimado ({task.estimated_hours}h) para a tarefa '{task.name}'."],
                            id=job_id,
                            replace_existing=True
                        )
                        
        return {"success": True, "message": "Timer iniciado/retomado e cobranças agendadas."}

def pause_task_timer(task_id: int) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Task not found."}
            
        if task.timer_status == "running" and task.timer_started_at:
            delta = datetime.utcnow() - task.timer_started_at
            task.time_spent_seconds += int(delta.total_seconds())
            
        task.timer_status = "paused"
        db.commit()
        
        for p in [25, 50, 75]:
            job_id = f"task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": f"Timer pausado. Tempo investido ate agora: {task.time_spent_seconds / 60:.1f} minutos."}

def reset_task_timer(task_id: int) -> dict:
    """Zera o tempo investido na demanda e remove agendamentos. Nao inicia o cronometro automaticamente."""
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Task not found."}
            
        task.time_spent_seconds = 0
        task.timer_status = "stopped"
        task.status = "pending"
        task.timer_started_at = None
        db.commit()
        
        # Remove active scheduled jobs
        for p in [25, 50, 75]:
            job_id = f"task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": "Cronometro zerado e tarefa redefinida para pendente."}

def complete_task(task_id: int) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Task not found."}
            
        if task.timer_status == "running" and task.timer_started_at:
            delta = datetime.utcnow() - task.timer_started_at
            task.time_spent_seconds += int(delta.total_seconds())
            
        task.timer_status = "stopped"
        task.status = "completed"
        db.commit()
        
        for p in [25, 50, 75]:
            job_id = f"task_{task_id}_progress_{p}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
                
        return {"success": True, "message": f"Tarefa concluida! Tempo total investido: {task.time_spent_seconds / 60:.1f} minutos."}

def query_tasks(status: str = "all", search_term: Optional[str] = None) -> List[dict]:
    with SessionLocal() as db:
        query = db.query(models.Task)
        if status and status.lower() != "all":
            query = query.filter(models.Task.status == status)
        if search_term:
            query = query.filter(models.Task.name.ilike(f"%{search_term}%"))
            
        tasks = query.all()
        return [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "priority": t.priority,
                "difficulty": t.difficulty,
                "estimated_hours": t.estimated_hours,
                "status": t.status,
                "time_spent_minutes": round(t.time_spent_seconds / 60, 1),
                "timer_status": t.timer_status,
                "created_at": t.created_at.isoformat() if t.created_at else None
            }
            for t in tasks
        ]

def update_task_status(task_id: int, status: str) -> dict:
    with SessionLocal() as db:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if not task:
            return {"error": "Task not found."}
            
        task.status = status
        db.commit()
        return {"success": True, "message": f"Task status updated to {status}."}
