"""GERADO por scratch/gen_team_routes.py a partir dos handlers de main.py.
Rotas ESCOPADAS da Equipe (demandas, notas, calendário). O mesmo router é montado em
/team-portal (liderado) e /team-admin (Líder); o escopo vem da dependência de autenticação
e é imposto no ORM (team_scope.py). Não editar manualmente: regenerar pelo script."""
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

import team_calendar_tools as calendar_tools
import team_models as models
import team_schemas as ts
import schemas
import team_task_tools as task_tools
from security.crypto import sanitize_html_content
from security.team_auth import get_team_db, log_team_event
import uuid

router = APIRouter()


def log_activity_event(db, request, event_type, details, category="SYSTEM", severity="INFO", status_code=200):
    scope = db.info.get("scope")
    member_id = getattr(scope, "member_id", None)
    member_name = None
    if member_id:
        try:
            m = db.query(models.TeamMember).filter(models.TeamMember.id == member_id).first()
            member_name = m.display_name if m else None
        except Exception:
            member_name = None
    log_team_event(
        db, event_type, details, request=request, actor=getattr(scope, "role", "system"),
        member_id=member_id, member_name=member_name, category=category, severity=severity,
        status_code=status_code,
    )


@router.get("/tasks", response_model=List[ts.TeamTaskResponse])
def get_all_tasks(db: Session = Depends(get_team_db)):
    tasks = db.query(models.Task).all()
    for t in tasks:
        if not t.category or not str(t.category).strip():
            t.category = "Padrão"
    return tasks


@router.get("/tasks/active", response_model=List[ts.TeamTaskResponse])
def get_active_tasks(db: Session = Depends(get_team_db)):
    tasks = db.query(models.Task).filter(models.Task.timer_status == "running").all()
    for t in tasks:
        if not t.category or not str(t.category).strip():
            t.category = "Padrão"
    return tasks


@router.post("/tasks", response_model=ts.TeamTaskResponse)
def create_task(task_in: ts.TeamTaskCreate, request: Request, db: Session = Depends(get_team_db)):
    canonical_category = task_tools.normalize_category(task_in.category)
    canonical_priority = task_tools.normalize_priority(task_in.priority)
    canonical_difficulty = task_tools.normalize_difficulty(task_in.difficulty)
    final_hours = task_tools.get_default_hours_for_difficulty(canonical_difficulty, task_in.estimated_hours)

    db_task = models.Task(
        name=sanitize_html_content(task_in.name) or task_in.name,
        description=sanitize_html_content(task_in.description) if task_in.description else None,
        category=canonical_category,
        priority=canonical_priority,
        difficulty=canonical_difficulty,
        estimated_hours=final_hours,
        status=task_tools.STATUS_MAP.get((task_in.status or "pending").lower(), "pending"),
        workspace_id=task_in.workspace_id,
        notebook_id=task_in.notebook_id,
        goal_id=task_in.goal_id,
        scheduled_date=task_in.scheduled_date,
        linked_note_id=task_in.linked_note_id,
        time_spent_seconds=0,
        timer_status="stopped",
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    log_activity_event(
        db,
        request,
        "TASK_CREATED",
        f"Demanda criada: '{db_task.name}' (ID #{db_task.id} | Categoria: {db_task.category} | Prioridade: {db_task.priority} | Dificuldade: {db_task.difficulty} | Estimativa: {db_task.estimated_hours}h).",
        category="TASKS",
        severity="SUCCESS",
    )
    return db_task


@router.put("/tasks/{task_id}", response_model=ts.TeamTaskResponse)
def update_task_endpoint(task_id: int, task_in: ts.TeamTaskUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")

    update_data = task_in.model_dump(exclude_unset=True)
    if "category" in update_data and update_data["category"] is not None:
        update_data["category"] = task_tools.normalize_category(update_data["category"])

    if "priority" in update_data and update_data["priority"] is not None:
        update_data["priority"] = task_tools.normalize_priority(update_data["priority"])

    if "difficulty" in update_data and update_data["difficulty"] is not None:
        canonical_diff = task_tools.normalize_difficulty(update_data["difficulty"])
        update_data["difficulty"] = canonical_diff
        if "estimated_hours" not in update_data or update_data["estimated_hours"] is None:
            update_data["estimated_hours"] = task_tools.get_default_hours_for_difficulty(canonical_diff)

    if "status" in update_data and update_data["status"] is not None:
        update_data["status"] = task_tools.STATUS_MAP.get(update_data["status"].lower(), update_data["status"])

    if update_data.get("name"):
        update_data["name"] = sanitize_html_content(update_data["name"]) or update_data["name"]
    if update_data.get("description"):
        update_data["description"] = sanitize_html_content(update_data["description"])
    if update_data.get("execution_notes"):
        update_data["execution_notes"] = sanitize_html_content(update_data["execution_notes"])
    for key, value in update_data.items():
        setattr(db_task, key, value)

    if not db_task.category:
        db_task.category = "Padrão"

    db.commit()
    db.refresh(db_task)

    changed_fields = ", ".join(update_data.keys()) if update_data else "nenhum"
    log_activity_event(
        db,
        request,
        "TASK_UPDATED",
        f"Demanda #{task_id} ('{db_task.name}') editada. Campos alterados: {changed_fields}.",
        category="TASKS",
        severity="INFO",
    )
    return db_task


@router.delete("/tasks/{task_id}")
def delete_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_team_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    task_name = db_task.name
    db.delete(db_task)
    db.commit()

    log_activity_event(
        db,
        request,
        "TASK_DELETED",
        f"Demanda #{task_id} ('{task_name}') excluída permanentemente.",
        category="TASKS",
        severity="WARNING",
    )
    return {"message": "Demanda excluída com sucesso"}


@router.post("/tasks/{task_id}/start")
def start_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_team_db)):
    result = task_tools.start_task_timer(task_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    t_name = db_task.name if db_task else f"#{task_id}"
    log_activity_event(
        db,
        request,
        "TASK_TIMER_STARTED",
        f"Cronômetro iniciado na demanda #{task_id} ('{t_name}').",
        category="TASKS",
        severity="INFO",
    )
    return result


@router.post("/tasks/{task_id}/pause")
def pause_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_team_db)):
    result = task_tools.pause_task_timer(task_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    t_name = db_task.name if db_task else f"#{task_id}"
    log_activity_event(
        db,
        request,
        "TASK_TIMER_PAUSED",
        f"Cronômetro pausado na demanda #{task_id} ('{t_name}').",
        category="TASKS",
        severity="INFO",
    )
    return result


@router.post("/tasks/{task_id}/reset")
def reset_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_team_db)):
    result = task_tools.reset_task_timer(task_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    t_name = db_task.name if db_task else f"#{task_id}"
    log_activity_event(
        db,
        request,
        "TASK_TIMER_RESET",
        f"Cronômetro zerado na demanda #{task_id} ('{t_name}').",
        category="TASKS",
        severity="WARNING",
    )
    return result


@router.post("/tasks/{task_id}/complete")
def complete_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_team_db)):
    result = task_tools.complete_task(task_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    t_name = db_task.name if db_task else f"#{task_id}"
    log_activity_event(
        db,
        request,
        "TASK_COMPLETED",
        f"Demanda #{task_id} ('{t_name}') finalizada e marcada como concluída.",
        category="TASKS",
        severity="SUCCESS",
    )
    return result




# Workspace Endpoints
@router.post("/workspaces", response_model=ts.TeamWorkspaceResponse)
def create_workspace(workspace: schemas.WorkspaceCreate, request: Request, db: Session = Depends(get_team_db)):
    db_workspace = models.Workspace(**workspace.model_dump())
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)

    log_activity_event(
        db,
        request,
        "WORKSPACE_CREATED",
        f"Espaço de trabalho criado: '{db_workspace.title}' (ID #{db_workspace.id}).",
        category="WORKSPACES",
        severity="SUCCESS",
    )
    return db_workspace


@router.get("/workspaces", response_model=List[ts.TeamWorkspaceResponse])
def get_workspaces(db: Session = Depends(get_team_db)):
    return db.query(models.Workspace).filter(models.Workspace.is_active == True).all()


@router.put("/workspaces/{workspace_id}", response_model=ts.TeamWorkspaceResponse)
def update_workspace(workspace_id: int, workspace: schemas.WorkspaceUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not db_workspace:
        raise HTTPException(status_code=404, detail="Espaço de trabalho não encontrado")

    update_data = workspace.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_workspace, key, value)

    db.commit()
    db.refresh(db_workspace)

    log_activity_event(
        db,
        request,
        "WORKSPACE_UPDATED",
        f"Espaço de trabalho #{workspace_id} ('{db_workspace.title}') atualizado.",
        category="WORKSPACES",
        severity="INFO",
    )
    return db_workspace


@router.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: int, request: Request, db: Session = Depends(get_team_db)):
    db_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not db_workspace:
        raise HTTPException(status_code=404, detail="Espaço de trabalho não encontrado")
    ws_title = db_workspace.title
    db_workspace.is_active = False
    db.commit()

    log_activity_event(
        db,
        request,
        "WORKSPACE_DELETED",
        f"Espaço de trabalho #{workspace_id} ('{ws_title}') inativado/excluído.",
        category="WORKSPACES",
        severity="WARNING",
    )
    return {"message": "Espaço de trabalho inativado com sucesso"}


# Notebook Endpoints
@router.post("/notebooks", response_model=ts.TeamNotebookResponse)
def create_notebook(notebook: schemas.NotebookCreate, request: Request, db: Session = Depends(get_team_db)):
    nb_data = notebook.model_dump()
    raw_pwd = nb_data.pop("password", None)
    if raw_pwd and raw_pwd.strip():
        if len(raw_pwd.strip()) < 4:
            raise HTTPException(status_code=400, detail="A senha do caderno deve ter pelo menos 4 caracteres")
        nb_data["password_hash"] = hash_password(raw_pwd.strip())
    db_notebook = models.Notebook(**nb_data)
    db.add(db_notebook)
    db.commit()
    db.refresh(db_notebook)

    log_activity_event(
        db,
        request,
        "NOTEBOOK_CREATED",
        f"Caderno criado: '{db_notebook.title}' (ID #{db_notebook.id}, Workspace #{db_notebook.workspace_id}).",
        category="WORKSPACES",
        severity="SUCCESS",
    )
    return db_notebook


@router.get("/notebooks", response_model=List[ts.TeamNotebookResponse])
def get_notebooks(workspace_id: int = None, db: Session = Depends(get_team_db)):
    query = db.query(models.Notebook).filter(models.Notebook.is_active == True)
    if workspace_id is not None:
        query = query.filter(models.Notebook.workspace_id == workspace_id)
    return query.all()


@router.put("/notebooks/{notebook_id}", response_model=ts.TeamNotebookResponse)
def update_notebook(notebook_id: int, notebook: schemas.NotebookUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_notebook = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Caderno não encontrado")

    update_data = notebook.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_notebook, key, value)

    db.commit()
    db.refresh(db_notebook)

    action_label = "NOTEBOOK_DELETED" if update_data.get("is_active") is False else "NOTEBOOK_UPDATED"
    sev_label = "WARNING" if action_label == "NOTEBOOK_DELETED" else "INFO"
    log_activity_event(
        db,
        request,
        action_label,
        f"Caderno #{notebook_id} ('{db_notebook.title}') {'inativado/excluído' if action_label == 'NOTEBOOK_DELETED' else 'atualizado'}.",
        category="WORKSPACES",
        severity=sev_label,
    )
    return db_notebook


# Note Endpoints
@router.post("/notes", response_model=ts.TeamNoteResponse)
def create_note(note: schemas.NoteCreate, request: Request, db: Session = Depends(get_team_db)):
    note_data = note.model_dump()
    raw_pwd = note_data.pop("password", None)
    if raw_pwd and raw_pwd.strip():
        if len(raw_pwd.strip()) < 4:
            raise HTTPException(status_code=400, detail="A senha da nota deve ter pelo menos 4 caracteres")
        note_data["password_hash"] = hash_password(raw_pwd.strip())
    if note_data.get("content"):
        note_data["content"] = sanitize_html_content(note_data["content"])
    if note_data.get("notebook_id") and not note_data.get("workspace_id"):
        nb = db.query(models.Notebook).filter(models.Notebook.id == note_data["notebook_id"]).first()
        if nb and nb.workspace_id:
            note_data["workspace_id"] = nb.workspace_id
    db_note = models.Note(**note_data)
    db.add(db_note)
    db.commit()
    db.refresh(db_note)

    log_activity_event(
        db,
        request,
        "NOTE_CREATED",
        f"Nota/Documento criado: '{db_note.title}' (ID #{db_note.id} | Tipo: {db_note.type} | Caderno #{db_note.notebook_id}).",
        category="NOTES",
        severity="SUCCESS",
    )
    return db_note


@router.get("/notes", response_model=List[ts.TeamNoteResponse])
def get_notes(notebook_id: int = None, workspace_id: int = None, db: Session = Depends(get_team_db)):
    query = db.query(models.Note)
    if notebook_id is not None:
        query = query.filter(models.Note.notebook_id == notebook_id)
    if workspace_id is not None:
        query = query.outerjoin(models.Notebook, models.Note.notebook_id == models.Notebook.id).filter(
            or_(models.Note.workspace_id == workspace_id, models.Notebook.workspace_id == workspace_id)
        )
    return query.all()


@router.put("/notes/{note_id}", response_model=ts.TeamNoteResponse)
def update_note(note_id: int, note: schemas.NoteUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    update_data = note.model_dump(exclude_unset=True)
    if "content" in update_data and update_data["content"] is not None:
        update_data["content"] = sanitize_html_content(update_data["content"])

    if "notebook_id" in update_data and update_data["notebook_id"] is not None:
        if "workspace_id" not in update_data or update_data["workspace_id"] is None:
            nb = db.query(models.Notebook).filter(models.Notebook.id == update_data["notebook_id"]).first()
            if nb and nb.workspace_id:
                update_data["workspace_id"] = nb.workspace_id

    for key, value in update_data.items():
        setattr(db_note, key, value)

    db.commit()
    db.refresh(db_note)

    log_activity_event(
        db,
        request,
        "NOTE_UPDATED",
        f"Nota #{note_id} ('{db_note.title}') salva/atualizada (Caderno #{db_note.notebook_id}).",
        category="NOTES",
        severity="INFO",
    )
    return db_note


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, request: Request, db: Session = Depends(get_team_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    note_title = db_note.title
    db.delete(db_note)
    db.commit()

    log_activity_event(
        db,
        request,
        "NOTE_DELETED",
        f"Nota #{note_id} ('{note_title}') excluída permanentemente.",
        category="NOTES",
        severity="WARNING",
    )
    return {"message": "Nota excluída com sucesso"}


# Comment Endpoints
@router.post("/notes/{note_id}/comments", response_model=schemas.CommentResponse)
def create_comment(note_id: int, comment: schemas.CommentCreate, request: Request, db: Session = Depends(get_team_db)):
    if note_id != comment.note_id:
        raise HTTPException(status_code=400, detail="O note_id da rota não confere com o payload")
    comment_data = comment.model_dump()
    if comment_data.get("content"):
        comment_data["content"] = sanitize_html_content(comment_data["content"])
    db_comment = models.Comment(**comment_data)
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    label_kind = "Dúvida/Questão" if db_comment.is_question else "Comentário/Conceito Sináptico"
    log_activity_event(
        db,
        request,
        "COMMENT_CREATED",
        f"{label_kind} (#{db_comment.id}) criado na nota #{note_id}: \"{str(db_comment.content)[:100]}\"",
        category="NETWORK",
        severity="SUCCESS",
    )
    return db_comment


@router.get("/notes/{note_id}/comments", response_model=List[schemas.CommentResponse])
def get_comments(note_id: int, db: Session = Depends(get_team_db)):
    return db.query(models.Comment).filter(models.Comment.note_id == note_id).all()


@router.put("/comments/{comment_id}", response_model=schemas.CommentResponse)
def update_comment(comment_id: int, comment: schemas.CommentUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")

    update_data = comment.model_dump(exclude_unset=True)
    if "content" in update_data and update_data["content"] is not None:
        update_data["content"] = sanitize_html_content(update_data["content"])

    for key, value in update_data.items():
        setattr(db_comment, key, value)

    db.commit()
    db.refresh(db_comment)

    log_activity_event(
        db,
        request,
        "COMMENT_UPDATED",
        f"Nó/Comentário sináptico #{comment_id} atualizado ({', '.join(update_data.keys())}).",
        category="NETWORK",
        severity="INFO",
    )
    return db_comment


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, request: Request, db: Session = Depends(get_team_db)):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")

    note_id = db_comment.note_id
    if note_id:
        db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
        if db_note and db_note.content:
            pattern = re.compile(
                rf'<mark\b[^>]*\bdata-comment-id=["\']{comment_id}["\'][^>]*>(.*?)</mark>',
                re.DOTALL | re.IGNORECASE,
            )
            db_note.content = pattern.sub(r"\1", db_note.content)

    db.delete(db_comment)
    db.commit()

    log_activity_event(
        db,
        request,
        "COMMENT_DELETED",
        f"Nó/Comentário sináptico #{comment_id} excluído (Nota #{note_id}).",
        category="NETWORK",
        severity="WARNING",
    )
    return {"message": "Comentário excluído com sucesso"}


@router.get("/notebooks/{notebook_id}/comments", response_model=List[schemas.CommentResponse])
def get_notebook_comments(notebook_id: int, db: Session = Depends(get_team_db)):
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]

    return (
        db.query(models.Comment)
        .filter((models.Comment.note_id.in_(note_ids)) | (models.Comment.notebook_id == notebook_id))
        .all()
    )


@router.post("/notebooks/{notebook_id}/questions", response_model=schemas.CommentResponse)
def create_notebook_question(notebook_id: int, comment: schemas.CommentCreate, request: Request, db: Session = Depends(get_team_db)):
    if comment.notebook_id != notebook_id:
        raise HTTPException(status_code=400, detail="O notebook_id da rota não confere com o payload")
    comment_data = comment.model_dump()
    if comment_data.get("content"):
        comment_data["content"] = sanitize_html_content(comment_data["content"])
    db_comment = models.Comment(**comment_data)
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    log_activity_event(
        db,
        request,
        "QUESTION_CREATED",
        f"Questão/Dúvida (#{db_comment.id}) adicionada na Rede Sináptica do caderno #{notebook_id}: \"{str(db_comment.content)[:100]}\"",
        category="NETWORK",
        severity="SUCCESS",
    )
    return db_comment


# Comment Connection Endpoints
@router.post("/comment-connections", response_model=schemas.CommentConnectionResponse)
def create_comment_connection(connection: schemas.CommentConnectionCreate, request: Request, db: Session = Depends(get_team_db)):
    db_conn = models.CommentConnection(**connection.model_dump())
    db.add(db_conn)
    db.commit()
    db.refresh(db_conn)

    log_activity_event(
        db,
        request,
        "CONNECTION_CREATED",
        f"Conexão sináptica (#{db_conn.id}) criada entre os conceitos #{db_conn.source_comment_id} e #{db_conn.target_comment_id}.",
        category="NETWORK",
        severity="SUCCESS",
    )
    return db_conn


@router.get("/notebooks/{notebook_id}/comment-connections", response_model=List[schemas.CommentConnectionResponse])
def get_notebook_connections(notebook_id: int, db: Session = Depends(get_team_db)):
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]
    if not note_ids:
        return []

    comments = db.query(models.Comment).filter(models.Comment.note_id.in_(note_ids)).all()
    comment_ids = [comment.id for comment in comments]
    if not comment_ids:
        return []

    return (
        db.query(models.CommentConnection)
        .filter(
            models.CommentConnection.source_comment_id.in_(comment_ids)
            | models.CommentConnection.target_comment_id.in_(comment_ids)
        )
        .all()
    )


@router.put("/comment-connections/{conn_id}", response_model=schemas.CommentConnectionResponse)
def update_comment_connection(conn_id: int, connection: schemas.CommentConnectionUpdate, request: Request, db: Session = Depends(get_team_db)):
    db_conn = db.query(models.CommentConnection).filter(models.CommentConnection.id == conn_id).first()
    if not db_conn:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")

    update_data = connection.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_conn, key, value)

    db.commit()
    db.refresh(db_conn)

    log_activity_event(
        db,
        request,
        "CONNECTION_UPDATED",
        f"Observação da conexão sináptica #{conn_id} atualizada.",
        category="NETWORK",
        severity="INFO",
    )
    return db_conn


@router.delete("/comment-connections/{conn_id}")
def delete_comment_connection(conn_id: int, request: Request, db: Session = Depends(get_team_db)):
    db_conn = db.query(models.CommentConnection).filter(models.CommentConnection.id == conn_id).first()
    if not db_conn:
        raise HTTPException(status_code=404, detail="Conexão não encontrada")
    db.delete(db_conn)
    db.commit()

    log_activity_event(
        db,
        request,
        "CONNECTION_DELETED",
        f"Conexão sináptica #{conn_id} excluída.",
        category="NETWORK",
        severity="WARNING",
    )
    return {"message": "Conexão excluída com sucesso"}




@router.get("/calendar/overview")
def get_calendar_overview(
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_team_db),
):
    from datetime import date, timedelta
    today = date.today()
    if not start_date:
        first_day = today.replace(day=1)
        start_date = (first_day - timedelta(days=7)).isoformat()
    if not end_date:
        next_month = today.replace(day=28) + timedelta(days=10)
        end_date = next_month.isoformat()

    events = calendar_tools.read_calendar(start_date, end_date)
    if events and isinstance(events[0], dict) and "error" in events[0]:
        events = []

    goals = calendar_tools.list_goals()
    routines_res = calendar_tools.manage_routine_template(action="list")

    blocks = (
        db.query(models.TimelineBlock)
        .filter(
            models.TimelineBlock.date_str >= start_date[:10],
            models.TimelineBlock.date_str <= end_date[:10],
        )
        .order_by(models.TimelineBlock.start_minute.asc())
        .all()
    )
    daily_stats = {}
    for b in blocks:
        d = b.date_str
        if d not in daily_stats:
            daily_stats[d] = {
                "date_str": d,
                "total_blocks": 0,
                "completed_blocks": 0,
                "focus_minutes": 0,
                "event_minutes": 0,
                "blocks": [],
            }
        dur = max(0, int((b.end_minute or 0) - (b.start_minute or 0)))
        daily_stats[d]["total_blocks"] += 1
        if b.status == "completed":
            daily_stats[d]["completed_blocks"] += 1
        if b.block_type in ("task", "goal", "focus"):
            daily_stats[d]["focus_minutes"] += dur
        elif b.block_type == "event":
            daily_stats[d]["event_minutes"] += dur
        daily_stats[d]["blocks"].append(calendar_tools.serialize_timeline_block(b))

    return {
        "start_date": start_date[:10],
        "end_date": end_date[:10],
        "events": events,
        "goals": goals,
        "routines": routines_res.get("routines", []),
        "daily_stats": daily_stats,
    }


@router.get("/calendar/events")
def list_calendar_events(
    start_date: str = None,
    end_date: str = None,
    category: str = None,
):
    from datetime import date, timedelta
    today = date.today()
    s_date = start_date or (today - timedelta(days=30)).isoformat()
    e_date = end_date or (today + timedelta(days=90)).isoformat()
    res = calendar_tools.read_calendar(s_date, e_date, category=category)
    if res and isinstance(res[0], dict) and "error" in res[0]:
        raise HTTPException(status_code=400, detail=res[0]["error"])
    return res


@router.post("/calendar/events")
def create_calendar_event_endpoint(
    payload: schemas.EventCreate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    res = calendar_tools.create_event(
        title=payload.title,
        start_time=payload.start_time.isoformat(),
        end_time=payload.end_time.isoformat(),
        attendees=payload.attendees,
        description=payload.description,
        location=payload.location,
        category=payload.category or "Compromisso",
        color=payload.color,
        is_all_day=bool(payload.is_all_day),
        recurrence_rule=payload.recurrence_rule or "none",
        recurrence_until=payload.recurrence_until.isoformat() if payload.recurrence_until else None,
        reminder_minutes=payload.reminder_minutes if payload.reminder_minutes is not None else 15,
        goal_id=payload.goal_id,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    log_activity_event(
        db,
        request,
        "CALENDAR_EVENT_CREATED",
        f"Evento criado no calendário: '{payload.title}' ({payload.category or 'Compromisso'}) em {payload.start_time.strftime('%d/%m/%Y %H:%M')}.",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return res["event"]


@router.put("/calendar/events/{event_id}")
def update_calendar_event_endpoint(
    event_id: int,
    payload: schemas.EventUpdate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    ev = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for k in ("title", "description", "location", "attendees", "category"):
        if k in update_data and update_data[k] is not None:
            update_data[k] = sanitize_html_content(str(update_data[k]).strip())

    for key, val in update_data.items():
        setattr(ev, key, val)

    if ev.end_time and ev.start_time and ev.end_time <= ev.start_time:
        from datetime import timedelta
        ev.end_time = ev.start_time + timedelta(hours=1)

    db.commit()
    db.refresh(ev)

    # Sincroniza blocos vinculados na timeline
    linked_blocks = db.query(models.TimelineBlock).filter(models.TimelineBlock.event_id == ev.id).all()
    for b in linked_blocks:
        b.title = ev.title
        b.notes = ev.description or ev.location
        b.date_str = ev.start_time.strftime("%Y-%m-%d")
        b.start_minute = ev.start_time.hour * 60 + ev.start_time.minute
        b.end_minute = min(1440, max(b.start_minute + 15, ev.end_time.hour * 60 + ev.end_time.minute))
        b.color = ev.color or "#f59e0b"
        if ev.status == "completed":
            b.status = "completed"
    db.commit()

    calendar_tools._schedule_event_reminder(ev.id, ev.title, ev.start_time, ev.reminder_minutes)

    log_activity_event(
        db,
        request,
        "CALENDAR_EVENT_UPDATED",
        f"Evento #{event_id} ('{ev.title}') atualizado no calendário.",
        category="CALENDAR",
        severity="INFO",
    )
    return calendar_tools.serialize_event(ev)


@router.delete("/calendar/events/{event_id}")
def delete_calendar_event_endpoint(
    event_id: int,
    request: Request,
    db: Session = Depends(get_team_db),
):
    res = calendar_tools.update_cancel_event(event_id=event_id, action="cancel")
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])

    log_activity_event(
        db,
        request,
        "CALENDAR_EVENT_DELETED",
        f"Evento #{event_id} cancelado/excluído do calendário ({res.get('message', '')}).",
        category="CALENDAR",
        severity="WARNING",
    )
    return res


@router.get("/calendar/goals", response_model=List[schemas.CalendarGoalResponse])
def list_calendar_goals_endpoint(
    horizon: str = None,
    status: str = None,
):
    return calendar_tools.list_goals(horizon=horizon, status=status)


@router.post("/calendar/goals", response_model=schemas.CalendarGoalResponse)
def create_calendar_goal_endpoint(
    payload: schemas.CalendarGoalCreate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    milestones_input = (
        [m.model_dump() for m in payload.milestones]
        if payload.milestones
        else None
    )
    res = calendar_tools.create_goal(
        title=payload.title,
        horizon=payload.horizon or "weekly",
        target_date=payload.target_date,
        priority=payload.priority or "Alta",
        target_hours=payload.target_hours if payload.target_hours is not None else 5.0,
        description=payload.description,
        category=payload.category or "Geral",
        color=payload.color or "#10b981",
        milestones=milestones_input,
        workspace_id=payload.workspace_id,
        notebook_id=payload.notebook_id,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    log_activity_event(
        db,
        request,
        "CALENDAR_GOAL_CREATED",
        f"Meta criada: '{payload.title}' (Horizonte: {payload.horizon} | Meta: {payload.target_hours}h | Prazo: {res['goal'].get('target_date')}).",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return res["goal"]


@router.put("/calendar/goals/{goal_id}", response_model=schemas.CalendarGoalResponse)
def update_calendar_goal_endpoint(
    goal_id: int,
    payload: schemas.CalendarGoalUpdate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    import json
    goal = db.query(models.CalendarGoal).filter(models.CalendarGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"] is not None:
        goal.title = sanitize_html_content(update_data["title"].strip()) or goal.title
    if "description" in update_data:
        goal.description = sanitize_html_content(update_data["description"].strip()) if update_data["description"] else None
    if "horizon" in update_data and update_data["horizon"]:
        goal.horizon = update_data["horizon"].strip().lower()
    if "target_date" in update_data:
        goal.target_date = update_data["target_date"]
    if "priority" in update_data and update_data["priority"]:
        goal.priority = task_tools.normalize_priority(update_data["priority"])
    if "category" in update_data and update_data["category"]:
        goal.category = sanitize_html_content(update_data["category"].strip()) or "Geral"
    if "color" in update_data and update_data["color"]:
        goal.color = update_data["color"]
    if "target_hours" in update_data and update_data["target_hours"] is not None:
        goal.target_hours = max(0.5, float(update_data["target_hours"]))
    if "logged_hours" in update_data and update_data["logged_hours"] is not None:
        goal.logged_hours = max(0.0, float(update_data["logged_hours"]))
    if "milestones" in update_data and update_data["milestones"] is not None:
        cleaned_ms = []
        for m in update_data["milestones"]:
            m_dict = m if isinstance(m, dict) else m.model_dump()
            cleaned_ms.append({
                "id": str(m_dict.get("id") or uuid.uuid4().hex[:8]),
                "title": sanitize_html_content(str(m_dict.get("title", "")).strip()) or "Sub-meta",
                "completed": bool(m_dict.get("completed", False)),
            })
        goal.milestones_json = json.dumps(cleaned_ms, ensure_ascii=False)
    if "status" in update_data and update_data["status"]:
        goal.status = task_tools.STATUS_MAP.get(update_data["status"].lower(), update_data["status"].lower())

    if "progress_percent" in update_data and update_data["progress_percent"] is not None:
        goal.progress_percent = max(0, min(100, int(update_data["progress_percent"])))
        if goal.progress_percent >= 100:
            goal.status = "completed"
    else:
        calendar_tools._recalculate_goal_progress(goal)

    db.commit()
    db.refresh(goal)

    log_activity_event(
        db,
        request,
        "CALENDAR_GOAL_UPDATED",
        f"Meta #{goal_id} ('{goal.title}') atualizada (Progresso: {goal.progress_percent}% | Status: {goal.status}).",
        category="CALENDAR",
        severity="INFO",
    )
    return calendar_tools.serialize_goal(db, goal)


@router.post("/calendar/goals/{goal_id}/complete", response_model=schemas.CalendarGoalResponse)
def complete_calendar_goal_endpoint(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_team_db),
):
    res = calendar_tools.update_goal_progress(goal_id=goal_id, status="completed", progress_percent=100)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])

    log_activity_event(
        db,
        request,
        "CALENDAR_GOAL_COMPLETED",
        f"Meta #{goal_id} ('{res['goal']['title']}') concluída com 100% de progresso.",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return res["goal"]


@router.delete("/calendar/goals/{goal_id}")
def delete_calendar_goal_endpoint(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_team_db),
):
    goal = db.query(models.CalendarGoal).filter(models.CalendarGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    g_title = goal.title
    # Desvincula demandas e blocos antes de remover a meta
    db.query(models.Task).filter(models.Task.goal_id == goal_id).update({"goal_id": None})
    db.query(models.TimelineBlock).filter(models.TimelineBlock.goal_id == goal_id).update({"goal_id": None})
    db.delete(goal)
    db.commit()

    log_activity_event(
        db,
        request,
        "CALENDAR_GOAL_DELETED",
        f"Meta #{goal_id} ('{g_title}') excluída.",
        category="CALENDAR",
        severity="WARNING",
    )
    return {"success": True, "message": "Meta excluída com sucesso"}


@router.get("/calendar/timeline/{date_str}")
def get_daily_timeline_endpoint(date_str: str):
    return calendar_tools.get_daily_timeline(date_str)


@router.post("/calendar/timeline/{date_str}/generate")
def generate_daily_timeline_endpoint(
    date_str: str,
    payload: schemas.GenerateTimelineRequest,
    request: Request,
    db: Session = Depends(get_team_db),
):
    res = calendar_tools.generate_daily_timeline(
        date_str=date_str,
        respect_routine=payload.respect_routine,
        include_events=payload.include_events,
        include_pending_tasks=payload.include_pending_tasks,
        include_active_goals=payload.include_active_goals,
        focus_block_minutes=payload.focus_block_minutes,
        break_minutes=payload.break_minutes,
        overwrite_unlocked=payload.overwrite_unlocked,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    log_activity_event(
        db,
        request,
        "TIMELINE_24H_GENERATED",
        f"Timeline Diária de 24h gerada para {date_str}: {len(res.get('blocks', []))} blocos ({res.get('focus_hours', 0)}h foco, {res.get('event_hours', 0)}h eventos, {res.get('routine_hours', 0)}h rotina).",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return res


@router.post("/calendar/timeline/{date_str}/blocks")
def create_timeline_block_endpoint(
    date_str: str,
    payload: schemas.TimelineBlockCreate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    st_str = payload.start_time_str or calendar_tools.minutes_to_time_str(payload.start_minute or 540)
    et_str = payload.end_time_str or calendar_tools.minutes_to_time_str(payload.end_minute or 600)
    res = calendar_tools.upsert_timeline_block(
        date_str=date_str,
        title=payload.title,
        start_time_str=st_str,
        end_time_str=et_str,
        block_type=payload.block_type or "focus",
        notes=payload.notes,
        priority=payload.priority or "Média",
        color=payload.color,
        is_locked=True if payload.is_locked is None else bool(payload.is_locked),
        task_id=payload.task_id,
        goal_id=payload.goal_id,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    log_activity_event(
        db,
        request,
        "TIMELINE_BLOCK_CREATED",
        f"Bloco adicionado na Timeline 24h de {date_str}: '{payload.title}' ({st_str}–{et_str}).",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return res["block"]


@router.post("/calendar/timeline/{date_str}/apply-routine/{routine_id}")
def apply_routine_to_timeline_endpoint(
    date_str: str,
    routine_id: int,
    request: Request,
    db: Session = Depends(get_team_db),
):
    target_date = date_str.strip()[:10]
    rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Fluxo diário não encontrado")

    existing = (
        db.query(models.TimelineBlock)
        .filter(
            models.TimelineBlock.date_str == target_date,
            models.TimelineBlock.routine_template_id == rt.id,
        )
        .first()
    )
    if existing:
        return {
            "success": True,
            "message": f"O fluxo '{rt.title}' já está alocado nesta data.",
            "block": calendar_tools.serialize_timeline_block(existing),
        }

    st_m = calendar_tools.time_str_to_minutes(rt.start_time_str)
    et_m = calendar_tools.time_str_to_minutes(rt.end_time_str)
    if et_m <= st_m:
        et_m = min(1440, st_m + 30)

    blk = models.TimelineBlock(
        date_str=target_date,
        title=rt.title,
        notes=rt.description,
        block_type="routine",
        start_minute=st_m,
        end_minute=et_m,
        color=rt.color or "#6366f1",
        priority="Alta",
        status="planned",
        is_locked=True,
        checklist_json=rt.checklist_json,
        routine_template_id=rt.id,
        linked_note_id=rt.linked_note_id,
    )
    db.add(blk)
    db.commit()
    db.refresh(blk)

    log_activity_event(
        db,
        request,
        "TIMELINE_ROUTINE_APPLIED",
        f"Fluxo diário '{rt.title}' inserido na timeline de {target_date}.",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return {
        "success": True,
        "message": f"Fluxo '{rt.title}' alocado com sucesso na timeline.",
        "block": calendar_tools.serialize_timeline_block(blk),
    }


@router.post("/calendar/timeline/{date_str}/apply-all-routines")
def apply_all_routines_to_timeline_endpoint(
    date_str: str,
    request: Request,
    db: Session = Depends(get_team_db),
):
    target_date = date_str.strip()[:10]
    routines = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.is_active == True).all()
    created_count = 0

    for rt in routines:
        existing = (
            db.query(models.TimelineBlock)
            .filter(
                models.TimelineBlock.date_str == target_date,
                models.TimelineBlock.routine_template_id == rt.id,
            )
            .first()
        )
        if not existing:
            st_m = calendar_tools.time_str_to_minutes(rt.start_time_str)
            et_m = calendar_tools.time_str_to_minutes(rt.end_time_str)
            if et_m <= st_m:
                et_m = min(1440, st_m + 30)

            blk = models.TimelineBlock(
                date_str=target_date,
                title=rt.title,
                notes=rt.description,
                block_type="routine",
                start_minute=st_m,
                end_minute=et_m,
                color=rt.color or "#6366f1",
                priority="Alta",
                status="planned",
                is_locked=True,
                checklist_json=rt.checklist_json,
                routine_template_id=rt.id,
                linked_note_id=rt.linked_note_id,
            )
            db.add(blk)
            created_count += 1

    if created_count > 0:
        db.commit()

    log_activity_event(
        db,
        request,
        "TIMELINE_ALL_ROUTINES_APPLIED",
        f"{created_count} fluxo(s) inserido(s) na timeline de {target_date}.",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return calendar_tools.get_daily_timeline(target_date)


@router.put("/calendar/timeline/blocks/{block_id}")
def update_timeline_block_endpoint(
    block_id: int,
    payload: schemas.TimelineBlockUpdate,
    request: Request,
    db: Session = Depends(get_team_db),
):
    blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
    if not blk:
        raise HTTPException(status_code=404, detail="Bloco não encontrado na timeline")

    scope = db.info.get("scope")
    update_data = payload.model_dump(exclude_unset=True)
    if scope and scope.role == "member" and blk.assigned_by_leader:
        if "title" in update_data and update_data["title"] and update_data["title"].strip() != blk.title:
            raise HTTPException(status_code=403, detail="Blocos definidos pelo Líder não podem ter o título alterado.")
        if "block_type" in update_data and update_data["block_type"] and update_data["block_type"] != blk.block_type:
            raise HTTPException(status_code=403, detail="Blocos definidos pelo Líder não podem ter o tipo alterado.")

    if "title" in update_data and update_data["title"] and not blk.assigned_by_leader:
        blk.title = sanitize_html_content(update_data["title"].strip()) or blk.title
    if "notes" in update_data:
        blk.notes = sanitize_html_content(update_data["notes"].strip()) if update_data["notes"] else None
    if "block_type" in update_data and update_data["block_type"] and not blk.assigned_by_leader:
        blk.block_type = update_data["block_type"]
    if "start_time_str" in update_data and update_data["start_time_str"] is not None:
        blk.start_minute = calendar_tools.time_str_to_minutes(str(update_data["start_time_str"]))
    elif "start_minute" in update_data and update_data["start_minute"] is not None:
        blk.start_minute = int(update_data["start_minute"])

    if "end_time_str" in update_data and update_data["end_time_str"] is not None:
        blk.end_minute = calendar_tools.time_str_to_minutes(str(update_data["end_time_str"]))
    elif "end_minute" in update_data and update_data["end_minute"] is not None:
        blk.end_minute = int(update_data["end_minute"])

    if blk.end_minute <= blk.start_minute:
        blk.end_minute = min(1440, blk.start_minute + 30)

    if "status" in update_data:
        new_status = update_data["status"]
        if blk.status == "in_progress" and new_status != "in_progress" and blk.timer_started_at:
            delta = max(0, int((datetime.utcnow() - blk.timer_started_at).total_seconds()))
            blk.actual_seconds_spent = (blk.actual_seconds_spent or 0) + delta
            blk.timer_started_at = None
        elif new_status == "in_progress" and blk.status != "in_progress":
            blk.timer_started_at = datetime.utcnow()

    for k in ("color", "priority", "status", "is_locked", "task_id", "goal_id"):
        if k in update_data:
            setattr(blk, k, update_data[k])

    db.commit()
    db.refresh(blk)

    log_activity_event(
        db,
        request,
        "TIMELINE_BLOCK_UPDATED",
        f"Bloco #{block_id} ('{blk.title}') atualizado na Timeline 24h de {blk.date_str}.",
        category="CALENDAR",
        severity="INFO",
    )
    return calendar_tools.serialize_timeline_block(blk)


@router.delete("/calendar/timeline/blocks/{block_id}")
def delete_timeline_block_endpoint(
    block_id: int,
    request: Request,
    db: Session = Depends(get_team_db),
):
    blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
    if not blk:
        raise HTTPException(status_code=404, detail="Bloco não encontrado na timeline")
    title_bak = blk.title
    date_bak = blk.date_str
    db.delete(blk)
    db.commit()

    log_activity_event(
        db,
        request,
        "TIMELINE_BLOCK_DELETED",
        f"Bloco #{block_id} ('{title_bak}') removido da Timeline 24h de {date_bak}.",
        category="CALENDAR",
        severity="WARNING",
    )
    return {"success": True}


@router.post("/calendar/timeline/blocks/{block_id}/{action}")
def control_timeline_block_endpoint(
    block_id: int,
    action: str,
    request: Request,
    db: Session = Depends(get_team_db),
):
    res = calendar_tools.control_timeline_block(block_id=block_id, action=action)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])

    log_activity_event(
        db,
        request,
        f"TIMELINE_BLOCK_{action.upper()}",
        res.get("message", f"Ação '{action}' executada no bloco #{block_id} da Timeline 24h."),
        category="CALENDAR",
        severity="SUCCESS" if action.lower() == "complete" else "INFO",
    )
    return res


