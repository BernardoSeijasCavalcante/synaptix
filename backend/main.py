import os
import re
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv()

import uuid
import logging
import mimetypes
import filetype
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import (
    FastAPI,
    APIRouter,
    Depends,
    HTTPException,
    File,
    UploadFile,
    Request,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
import schemas
from database import engine, get_db
from core_scheduler import scheduler
import agent_core
from tools import task_tools, calendar_tools
from vector_db import init_vector_db
from security.crypto import (
    encrypt_bytes,
    read_decrypted_file,
    sanitize_html_content,
    hash_password,
    verify_password,
)

from security.auth import (
    router as auth_router,
    verify_authorized_device,
    init_security_bootstrap,
    check_ip_ban_and_rate_limit,
    log_security_event,
    log_activity_event,
    get_client_ip,
)
from database import SessionLocal

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Start Background Scheduler
if not scheduler.running:
    scheduler.start()

# Create DB tables
models.Base.metadata.create_all(bind=engine)

# Initialize vector tables
init_vector_db()

# Initialize Zero-Trust Device Bootstrap state
init_security_bootstrap()

# Initialize ISOLATED Team database (synaptix_team.db + uploads_team/)
from team_database import init_team_database
init_team_database()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
FRONTEND_DIST_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))
os.makedirs(UPLOADS_DIR, exist_ok=True)

MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_UPLOAD_MIMES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
SAFE_FILENAME_REGEX = re.compile(r"^[a-fA-F0-9\-]{8,64}\.(pdf|png|jpg|jpeg|webp|gif)$")


def cleanup_orphan_comment_marks():
    db = next(get_db())
    try:
        valid_comment_ids = set(str(c[0]) for c in db.query(models.Comment.id).all())
        notes = db.query(models.Note).all()
        updated = False
        for note in notes:
            if not note.content:
                continue

            def replace_mark(match):
                cid = match.group(1)
                text = match.group(2)
                if cid not in valid_comment_ids:
                    return text
                return match.group(0)

            new_content = re.sub(
                r'<mark\b[^>]*\bdata-comment-id=["\'](\d+)["\'][^>]*>(.*?)</mark>',
                replace_mark,
                note.content,
                flags=re.DOTALL | re.IGNORECASE,
            )
            if new_content != note.content:
                note.content = new_content
                updated = True
        if updated:
            db.commit()
            logger.info("Marcas de comentários órfãos limpas com sucesso no banco de dados.")
    except Exception as e:
        logger.error(f"Erro ao limpar marcas de comentários órfãos: {e}")
    finally:
        db.close()


# Desabilita documentação pública automática (/docs, /redoc, /openapi.json) por padrão
enable_docs = os.environ.get("SYNAPTIX_ENABLE_DOCS", "false").lower() == "true"
app = FastAPI(
    title="Synaptix Zero-Trust API",
    docs_url="/docs" if enable_docs else None,
    redoc_url="/redoc" if enable_docs else None,
    openapi_url="/openapi.json" if enable_docs else None,
)


def ensure_task_and_calendar_columns():
    from sqlalchemy import text
    from security.crypto import encrypt_string, is_encrypted_string
    try:
        models.Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            task_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(tasks)")).fetchall()]
            if "category" not in task_cols:
                default_encrypted = encrypt_string("Padrão")
                conn.execute(text("ALTER TABLE tasks ADD COLUMN category VARCHAR"))
                conn.execute(
                    text("UPDATE tasks SET category = :cat WHERE category IS NULL OR TRIM(category) = ''"),
                    {"cat": default_encrypted},
                )
                conn.commit()
            else:
                rows = conn.execute(text("SELECT id, category FROM tasks")).fetchall()
                default_encrypted = encrypt_string("Padrão")
                updated = False
                for task_id, cat_val in rows:
                    if not cat_val or not str(cat_val).strip():
                        conn.execute(
                            text("UPDATE tasks SET category = :cat WHERE id = :id"),
                            {"cat": default_encrypted, "id": task_id},
                        )
                        updated = True
                    elif isinstance(cat_val, str) and not is_encrypted_string(cat_val):
                        conn.execute(
                            text("UPDATE tasks SET category = :cat WHERE id = :id"),
                            {"cat": encrypt_string(cat_val.strip()), "id": task_id},
                        )
                        updated = True
                if updated:
                    conn.commit()

            if "goal_id" not in task_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN goal_id INTEGER"))
                conn.commit()
            if "scheduled_date" not in task_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN scheduled_date VARCHAR"))
                conn.commit()

            event_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(events)")).fetchall()]
            event_migrations = [
                ("description", "TEXT"),
                ("location", "TEXT"),
                ("category", "VARCHAR DEFAULT 'Compromisso'"),
                ("color", "VARCHAR DEFAULT '#f59e0b'"),
                ("is_all_day", "BOOLEAN DEFAULT 0"),
                ("recurrence_rule", "VARCHAR DEFAULT 'none'"),
                ("recurrence_until", "DATETIME"),
                ("reminder_minutes", "INTEGER DEFAULT 15"),
                ("status", "VARCHAR DEFAULT 'scheduled'"),
                ("goal_id", "INTEGER"),
            ]
            for col_name, col_type in event_migrations:
                if col_name not in event_cols:
                    conn.execute(text(f"ALTER TABLE events ADD COLUMN {col_name} {col_type}"))

            nb_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(notebooks)")).fetchall()]
            if "password_hash" not in nb_cols:
                conn.execute(text("ALTER TABLE notebooks ADD COLUMN password_hash VARCHAR"))

            note_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(notes)")).fetchall()]
            if "password_hash" not in note_cols:
                conn.execute(text("ALTER TABLE notes ADD COLUMN password_hash VARCHAR"))

            conn.commit()


        with SessionLocal() as db:
            calendar_tools.ensure_default_routine_templates(db)
    except Exception as e:
        logger.error(f"Erro ao garantir migração de colunas de tasks/calendar: {e}")


ensure_task_and_calendar_columns()


@app.on_event("startup")
def startup_event():
    ensure_task_and_calendar_columns()
    cleanup_orphan_comment_marks()


@app.on_event("shutdown")
def shutdown_event():
    if scheduler.running:
        scheduler.shutdown()


@app.middleware("http")
async def zero_trust_security_middleware(request: Request, call_next):
    logger.info(f"Receiving request: {request.method} {request.url.path}")
    try:
        # Limite de tamanho do corpo HTTP contra ataques de exaustão de memória (30 MB)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 30 * 1024 * 1024:
            return JSONResponse(
                status_code=413,
                content={"detail": "Payload excede o limite máximo permitido."},
            )

        # Se for uma navegação direta de página pelo navegador (ex: F5, colar URL ou abrir favoritos
        # em /notes ou /tasks), serve o index.html da SPA em vez de retornar o payload JSON bruto da API.
        if (
            os.path.isdir(FRONTEND_DIST_DIR)
            and request.method.upper() in ("GET", "HEAD")
            and (
                request.url.path in ("/notes", "/tasks", "/calendar", "/network", "/monitor", "/team-management", "/equipe")
                or request.url.path.startswith("/equipe/")
            )
        ):
            sec_fetch_mode = (request.headers.get("sec-fetch-mode") or "").lower()
            sec_fetch_dest = (request.headers.get("sec-fetch-dest") or "").lower()
            accept_hdr = (request.headers.get("accept") or "").lower()
            has_api_sig = bool(
                request.headers.get("X-Synaptix-Signature")
                or request.headers.get("X-Synaptix-Device-Id")
            )
            is_browser_navigation = (
                sec_fetch_mode == "navigate"
                or sec_fetch_dest == "document"
                or ("text/html" in accept_hdr and not has_api_sig)
            )
            if is_browser_navigation:
                index_html = os.path.join(FRONTEND_DIST_DIR, "index.html")
                if os.path.isfile(index_html):
                    response = FileResponse(
                        index_html,
                        headers={
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            "Pragma": "no-cache",
                            "Expires": "0",
                        },
                    )
                else:
                    response = await call_next(request)
            else:
                response = await call_next(request)
        else:
            response = await call_next(request)

        # Garantia Zero-Trust de Monitoramento Integral: qualquer mutação que não tenha
        # gerado evento semântico explícito é auditada automaticamente pelo middleware.
        if (
            request.method.upper() in ("POST", "PUT", "DELETE", "PATCH")
            and not getattr(request.state, "event_logged", False)
            and not request.url.path.startswith("/events/track")
            and not request.url.path.startswith("/auth/events/track")
            and not request.url.path.startswith("/team-portal")
            and not request.url.path.startswith("/team-auth")
        ):
            try:
                with SessionLocal() as audit_db:
                    log_security_event(
                        db=audit_db,
                        event_type=f"HTTP_{request.method.upper()}_ACTION",
                        ip_address=get_client_ip(request),
                        details=f"Operação {request.method.upper()} executada em {request.url.path} (HTTP {response.status_code}).",
                        category="SYSTEM",
                        severity="INFO" if response.status_code < 400 else "WARNING",
                        http_method=request.method.upper(),
                        endpoint=request.url.path,
                        status_code=response.status_code,
                        request=request,
                    )
            except Exception as audit_err:
                logger.error(f"Erro no middleware de auditoria: {audit_err}")

        # Cabeçalhos HTTP de Blindagem (Hardening)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://unpkg.com blob:; "
            "worker-src 'self' blob: https://unpkg.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https: http:; "
            "font-src 'self' data:; "
            "connect-src 'self' blob: https://unpkg.com https: http:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        return response
    except Exception as e:
        logger.error(f"Error handling request: {e}", exc_info=True)
        # Nunca vaza stack trace ou detalhes internos do sistema/banco para o cliente
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno no processamento seguro da requisição."},
        )


# Configuração estrita de CORS
allowed_origins_env = os.environ.get(
    "SYNAPTIX_ALLOWED_ORIGINS",
    "http://localhost:6080,http://127.0.0.1:6080,http://localhost:8000,http://127.0.0.1:8000,https://synaptix.amtheinner.com,http://synaptix.amtheinner.com",
)
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://([a-zA-Z0-9\-]+\.)?amtheinner\.com$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Synaptix-Device-Id",
        "X-Synaptix-Timestamp",
        "X-Synaptix-Nonce",
        "X-Synaptix-Signature",
        "X-Synaptix-Public-Key-Jwk",
        "X-Synaptix-Device-Name",
        "X-Synaptix-Team-Device-Id",
        "X-Synaptix-Team-Timestamp",
        "X-Synaptix-Team-Nonce",
        "X-Synaptix-Team-Signature",
        "X-Team-Scope",
    ],
)

# 1. Rotas de Autenticação e Pareamento de Dispositivos (/auth/*)
app.include_router(auth_router)

# 2. Roteador Protegido: TODAS as rotas abaixo exigem Dispositivo Autorizado (Zero-Trust)
protected_router = APIRouter(dependencies=[Depends(verify_authorized_device)])


class ChatRequest(BaseModel):
    messages: List[dict]


@protected_router.get("/chat/sessions")
def get_all_chat_sessions(db: Session = Depends(get_db)):
    sessions = db.query(models.ChatSession.date).order_by(models.ChatSession.date.desc()).all()
    return [s[0] for s in sessions]


@protected_router.get("/chat/session/{date}")
def get_chat_session_by_date(date: str, request: Request, db: Session = Depends(get_db)):
    import json
    log_activity_event(
        db,
        request,
        "CHAT_HISTORY_VIEWED",
        f"Histórico de conversa da data '{date}' consultado na Secretária Executiva.",
        category="CHAT",
        severity="INFO",
    )
    session = db.query(models.ChatSession).filter(models.ChatSession.date == date).first()
    if not session or not session.messages_json:
        return []
    try:
        return json.loads(session.messages_json)
    except Exception:
        return []


@protected_router.get("/chat/session")
def get_chat_session(db: Session = Depends(get_db)):
    import json
    today = datetime.now().strftime("%Y-%m-%d")
    session = db.query(models.ChatSession).filter(models.ChatSession.date == today).first()
    if not session:
        session = models.ChatSession(date=today, messages_json="[]")
        db.add(session)
        db.commit()
    if not session.messages_json:
        return []
    try:
        return json.loads(session.messages_json)
    except Exception:
        return []


@protected_router.post("/chat/session/clear")
def clear_chat_session(request: Request, db: Session = Depends(get_db)):
    today = datetime.now().strftime("%Y-%m-%d")
    session = db.query(models.ChatSession).filter(models.ChatSession.date == today).first()
    if session:
        session.messages_json = "[]"
        db.commit()
    log_activity_event(
        db,
        request,
        "CHAT_SESSION_CLEARED",
        f"Histórico de conversa do dia ({today}) foi limpo.",
        category="CHAT",
        severity="WARNING",
    )
    return {"success": True}


@protected_router.post("/chat")
def chat_endpoint(request: Request, chat_req: ChatRequest, db: Session = Depends(get_db)):
    import json
    check_ip_ban_and_rate_limit(request, bucket_type="chat_ai", limit_per_min=20)
    try:
        last_user_msg = ""
        for m in reversed(chat_req.messages):
            if m.get("role") == "user" and m.get("content"):
                last_user_msg = str(m.get("content"))[:160]
                break

        result = agent_core.chat_with_agent(chat_req.messages)

        today = datetime.now().strftime("%Y-%m-%d")
        session = db.query(models.ChatSession).filter(models.ChatSession.date == today).first()
        if not session:
            session = models.ChatSession(date=today)
            db.add(session)

        session.messages_json = json.dumps(result["messages"])
        db.commit()

        # Registra a mensagem enviada ao chat
        log_activity_event(
            db,
            request,
            "CHAT_MESSAGE_SENT",
            f"Mensagem enviada à Secretária IA: \"{last_user_msg}\"",
            category="CHAT",
            severity="INFO",
        )

        # Registra cada ferramenta executada pela IA durante o turno ReAct
        for tool_exec in result.get("tools_results", []):
            t_name = tool_exec.get("name", "unknown_tool")
            t_args = json.dumps(tool_exec.get("args", {}), ensure_ascii=False)[:220]
            log_activity_event(
                db,
                request,
                "AI_TOOL_EXECUTED",
                f"Secretária IA executou a ferramenta '{t_name}' com parâmetros: {t_args}",
                category="AI_AGENT",
                severity="SUCCESS",
            )

        return result
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar mensagem com o agente IA.")


@protected_router.get("/notifications/unread")
def get_unread_notifications(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    notifications = (
        db.query(models.Notification)
        .filter(
            models.Notification.is_sent == False,
            models.Notification.scheduled_for <= now,
        )
        .all()
    )
    return notifications


@protected_router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, request: Request, db: Session = Depends(get_db)):
    notification = (
        db.query(models.Notification)
        .filter(models.Notification.id == notification_id)
        .first()
    )
    if notification:
        notification.is_sent = True
        db.commit()
        log_activity_event(
            db,
            request,
            "NOTIFICATION_READ",
            f"Notificação #{notification_id} ('{str(notification.message)[:80]}') marcada como lida.",
            category="SYSTEM",
            severity="INFO",
        )
    return {"success": True}


@protected_router.get("/tasks", response_model=List[schemas.TaskResponse])
def get_all_tasks(db: Session = Depends(get_db)):
    tasks = db.query(models.Task).all()
    for t in tasks:
        if not t.category or not str(t.category).strip():
            t.category = "Padrão"
    return tasks


@protected_router.get("/tasks/active", response_model=List[schemas.TaskResponse])
def get_active_tasks(db: Session = Depends(get_db)):
    tasks = db.query(models.Task).filter(models.Task.timer_status == "running").all()
    for t in tasks:
        if not t.category or not str(t.category).strip():
            t.category = "Padrão"
    return tasks


@protected_router.post("/tasks", response_model=schemas.TaskResponse)
def create_task(task_in: schemas.TaskCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.put("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task_endpoint(task_id: int, task_in: schemas.TaskUpdate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.delete("/tasks/{task_id}")
def delete_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/tasks/{task_id}/start")
def start_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/tasks/{task_id}/pause")
def pause_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/tasks/{task_id}/reset")
def reset_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/tasks/{task_id}/complete")
def complete_task_endpoint(task_id: int, request: Request, db: Session = Depends(get_db)):
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


# ==============================================================================
# Cofre Criptografado de Arquivos (Upload & Leitura Autenticada AES-256-GCM)
# ==============================================================================
@protected_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    if len(raw_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo excede o tamanho máximo permitido de 25 MB.",
        )

    kind = filetype.guess(raw_bytes)
    mime = kind.mime if kind else None
    if not mime:
        # Fallback de validação de assinatura para PDFs
        if raw_bytes.startswith(b"%PDF-") or (b"%PDF-" in raw_bytes[:1024]):
            mime = "application/pdf"

    if not mime or mime not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(
            status_code=400,
            detail="Tipo de arquivo não permitido por segurança. Apenas PDF e imagens (PNG, JPG, WEBP, GIF) são aceitos.",
        )

    safe_ext = ALLOWED_UPLOAD_MIMES[mime]
    unique_filename = f"{uuid.uuid4()}{safe_ext}"
    file_location = os.path.join(UPLOADS_DIR, unique_filename)

    # Criptografa os bytes do arquivo com AES-256-GCM antes de persistir em disco
    encrypted_payload = encrypt_bytes(raw_bytes)
    with open(file_location, "wb") as file_object:
        file_object.write(encrypted_payload)

    size_kb = len(raw_bytes) / 1024.0
    log_activity_event(
        db,
        request,
        "FILE_UPLOADED",
        f"Arquivo enviado e criptografado com AES-256-GCM: '{file.filename}' -> '{unique_filename}' ({mime}, {size_kb:.1f} KB).",
        category="FILES",
        severity="SUCCESS",
    )

    return {"file_url": f"/uploads/{unique_filename}"}


@protected_router.get("/uploads/{filename}")
def get_encrypted_upload(filename: str, request: Request, db: Session = Depends(get_db)):
    clean_name = os.path.basename(filename)
    if clean_name != filename or not SAFE_FILENAME_REGEX.match(clean_name):
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    file_path = os.path.join(UPLOADS_DIR, clean_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    try:
        decrypted_bytes = read_decrypted_file(file_path)
    except Exception as e:
        logger.error(f"Erro ao descriptografar arquivo {clean_name}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao descriptografar arquivo.")

    log_activity_event(
        db,
        request,
        "FILE_ACCESSED",
        f"Arquivo do cofre criptografado '{clean_name}' descriptografado e aberto para visualização.",
        category="FILES",
        severity="INFO",
    )

    mime_type, _ = mimetypes.guess_type(clean_name)
    return Response(
        content=decrypted_bytes,
        media_type=mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{clean_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store, max-age=0",
        },
    )


# Workspace Endpoints
@protected_router.post("/workspaces", response_model=schemas.WorkspaceResponse)
def create_workspace(workspace: schemas.WorkspaceCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/workspaces", response_model=List[schemas.WorkspaceResponse])
def get_workspaces(db: Session = Depends(get_db)):
    return db.query(models.Workspace).filter(models.Workspace.is_active == True).all()


@protected_router.put("/workspaces/{workspace_id}", response_model=schemas.WorkspaceResponse)
def update_workspace(workspace_id: int, workspace: schemas.WorkspaceUpdate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: int, request: Request, db: Session = Depends(get_db)):
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
@protected_router.post("/notebooks", response_model=schemas.NotebookResponse)
def create_notebook(notebook: schemas.NotebookCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/notebooks", response_model=List[schemas.NotebookResponse])
def get_notebooks(workspace_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Notebook).filter(models.Notebook.is_active == True)
    if workspace_id is not None:
        query = query.filter(models.Notebook.workspace_id == workspace_id)
    return query.all()


@protected_router.put("/notebooks/{notebook_id}", response_model=schemas.NotebookResponse)
def update_notebook(notebook_id: int, notebook: schemas.NotebookUpdate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/notebooks/{notebook_id}/set-password", response_model=schemas.PasswordActionResponse)
def set_notebook_password(
    notebook_id: int,
    payload: schemas.ItemPasswordSet,
    request: Request,
    db: Session = Depends(get_db)
):
    db_notebook = db.query(models.Notebook).filter(models.Notebook.id == notebook_id, models.Notebook.is_active == True).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Caderno não encontrado")

    new_pwd = (payload.password or "").strip()
    if len(new_pwd) < 4:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 4 caracteres")

    if db_notebook.is_password_protected:
        if not payload.current_password or not verify_password(payload.current_password, db_notebook.password_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")

    db_notebook.password_hash = hash_password(new_pwd)
    db.commit()

    log_activity_event(
        db,
        request,
        "NOTEBOOK_PASSWORD_SET",
        f"Senha {'alterada' if payload.current_password else 'definida'} para o caderno #{notebook_id} ('{db_notebook.title}').",
        category="WORKSPACES",
        severity="INFO",
    )
    return schemas.PasswordActionResponse(
        success=True,
        message="Senha do caderno configurada com sucesso.",
        is_password_protected=True
    )


@protected_router.post("/notebooks/{notebook_id}/remove-password", response_model=schemas.PasswordActionResponse)
def remove_notebook_password(
    notebook_id: int,
    payload: schemas.ItemPasswordVerify,
    request: Request,
    db: Session = Depends(get_db)
):
    db_notebook = db.query(models.Notebook).filter(models.Notebook.id == notebook_id, models.Notebook.is_active == True).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Caderno não encontrado")

    if not db_notebook.is_password_protected:
        raise HTTPException(status_code=400, detail="Este caderno não possui senha configurada")

    if not verify_password(payload.password, db_notebook.password_hash):
        raise HTTPException(status_code=400, detail="Senha incorreta")

    db_notebook.password_hash = None
    db.commit()

    log_activity_event(
        db,
        request,
        "NOTEBOOK_PASSWORD_REMOVED",
        f"Proteção por senha removida do caderno #{notebook_id} ('{db_notebook.title}').",
        category="WORKSPACES",
        severity="WARNING",
    )
    return schemas.PasswordActionResponse(
        success=True,
        message="Senha removida com sucesso.",
        is_password_protected=False
    )


@protected_router.post("/notebooks/{notebook_id}/unlock")
def unlock_notebook(
    notebook_id: int,
    payload: schemas.ItemPasswordVerify,
    request: Request,
    db: Session = Depends(get_db)
):
    db_notebook = db.query(models.Notebook).filter(models.Notebook.id == notebook_id, models.Notebook.is_active == True).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Caderno não encontrado")

    if db_notebook.is_password_protected:
        if not verify_password(payload.password, db_notebook.password_hash):
            raise HTTPException(status_code=401, detail="Senha incorreta")

    log_activity_event(
        db,
        request,
        "NOTEBOOK_UNLOCKED",
        f"Caderno #{notebook_id} ('{db_notebook.title}') desbloqueado com sucesso.",
        category="WORKSPACES",
        severity="INFO",
    )
    return {"success": True, "message": "Caderno desbloqueado com sucesso"}


# Note Endpoints
@protected_router.post("/notes", response_model=schemas.NoteResponse)
def create_note(note: schemas.NoteCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/notes", response_model=List[schemas.NoteResponse])
def get_notes(notebook_id: int = None, workspace_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Note)
    if notebook_id is not None:
        query = query.filter(models.Note.notebook_id == notebook_id)
    if workspace_id is not None:
        query = query.outerjoin(models.Notebook, models.Note.notebook_id == models.Notebook.id).filter(
            or_(models.Note.workspace_id == workspace_id, models.Notebook.workspace_id == workspace_id)
        )
    raw_notes = query.all()
    res = []
    for n in raw_notes:
        if n.is_password_protected:
            res.append(schemas.NoteResponse(
                id=n.id,
                title=n.title,
                content="",
                notebook_id=n.notebook_id,
                workspace_id=n.workspace_id,
                type=n.type,
                file_url=None,
                is_password_protected=True,
                created_at=n.created_at,
                updated_at=n.updated_at,
            ))
        else:
            res.append(n)
    return res


@protected_router.post("/notes/{note_id}/set-password", response_model=schemas.PasswordActionResponse)
def set_note_password(
    note_id: int,
    payload: schemas.ItemPasswordSet,
    request: Request,
    db: Session = Depends(get_db)
):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    new_pwd = (payload.password or "").strip()
    if len(new_pwd) < 4:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 4 caracteres")

    if db_note.is_password_protected:
        if not payload.current_password or not verify_password(payload.current_password, db_note.password_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")

    db_note.password_hash = hash_password(new_pwd)
    db.commit()

    log_activity_event(
        db,
        request,
        "NOTE_PASSWORD_SET",
        f"Senha {'alterada' if payload.current_password else 'definida'} para a nota #{note_id} ('{db_note.title}').",
        category="NOTES",
        severity="INFO",
    )
    return schemas.PasswordActionResponse(
        success=True,
        message="Senha da nota configurada com sucesso.",
        is_password_protected=True
    )


@protected_router.post("/notes/{note_id}/remove-password", response_model=schemas.PasswordActionResponse)
def remove_note_password(
    note_id: int,
    payload: schemas.ItemPasswordVerify,
    request: Request,
    db: Session = Depends(get_db)
):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if not db_note.is_password_protected:
        raise HTTPException(status_code=400, detail="Esta nota não possui senha configurada")

    if not verify_password(payload.password, db_note.password_hash):
        raise HTTPException(status_code=400, detail="Senha incorreta")

    db_note.password_hash = None
    db.commit()

    log_activity_event(
        db,
        request,
        "NOTE_PASSWORD_REMOVED",
        f"Proteção por senha removida da nota #{note_id} ('{db_note.title}').",
        category="NOTES",
        severity="WARNING",
    )
    return schemas.PasswordActionResponse(
        success=True,
        message="Senha removida com sucesso.",
        is_password_protected=False
    )


@protected_router.post("/notes/{note_id}/unlock")
def unlock_note(
    note_id: int,
    payload: schemas.ItemPasswordVerify,
    request: Request,
    db: Session = Depends(get_db)
):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if db_note.is_password_protected:
        if not verify_password(payload.password, db_note.password_hash):
            raise HTTPException(status_code=401, detail="Senha incorreta")

    log_activity_event(
        db,
        request,
        "NOTE_UNLOCKED",
        f"Nota #{note_id} ('{db_note.title}') desbloqueada com sucesso.",
        category="NOTES",
        severity="INFO",
    )
    return {
        "success": True,
        "message": "Nota desbloqueada com sucesso",
        "note": schemas.NoteResponse.model_validate(db_note)
    }


@protected_router.get("/notes/{note_id}", response_model=schemas.NoteResponse)
def get_note_by_id(
    note_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if db_note.is_password_protected:
        pwd = request.headers.get("X-Item-Password")
        if not pwd or not verify_password(pwd, db_note.password_hash):
            return schemas.NoteResponse(
                id=db_note.id,
                title=db_note.title,
                content="",
                notebook_id=db_note.notebook_id,
                workspace_id=db_note.workspace_id,
                type=db_note.type,
                file_url=None,
                is_password_protected=True,
                created_at=db_note.created_at,
                updated_at=db_note.updated_at,
            )

    return db_note


@protected_router.put("/notes/{note_id}", response_model=schemas.NoteResponse)
def update_note(note_id: int, note: schemas.NoteUpdate, request: Request, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if db_note.is_password_protected:
        item_pwd = request.headers.get("X-Item-Password")
        if not item_pwd or not verify_password(item_pwd, db_note.password_hash):
            raise HTTPException(status_code=403, detail="Senha necessária para modificar esta nota protegida.")

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


@protected_router.delete("/notes/{note_id}")
def delete_note(note_id: int, request: Request, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if db_note.is_password_protected:
        item_pwd = request.headers.get("X-Item-Password")
        if not item_pwd or not verify_password(item_pwd, db_note.password_hash):
            raise HTTPException(status_code=403, detail="Senha necessária para excluir esta nota protegida.")

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
@protected_router.post("/notes/{note_id}/comments", response_model=schemas.CommentResponse)
def create_comment(note_id: int, comment: schemas.CommentCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/notes/{note_id}/comments", response_model=List[schemas.CommentResponse])
def get_comments(note_id: int, request: Request, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if db_note and db_note.is_password_protected:
        pwd = request.headers.get("X-Item-Password")
        if not pwd or not verify_password(pwd, db_note.password_hash):
            return []
    return db.query(models.Comment).filter(models.Comment.note_id == note_id).all()



@protected_router.put("/comments/{comment_id}", response_model=schemas.CommentResponse)
def update_comment(comment_id: int, comment: schemas.CommentUpdate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/notebooks/{notebook_id}/comments", response_model=List[schemas.CommentResponse])
def get_notebook_comments(notebook_id: int, db: Session = Depends(get_db)):
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]

    return (
        db.query(models.Comment)
        .filter((models.Comment.note_id.in_(note_ids)) | (models.Comment.notebook_id == notebook_id))
        .all()
    )


@protected_router.post("/notebooks/{notebook_id}/questions", response_model=schemas.CommentResponse)
def create_notebook_question(notebook_id: int, comment: schemas.CommentCreate, request: Request, db: Session = Depends(get_db)):
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
@protected_router.post("/comment-connections", response_model=schemas.CommentConnectionResponse)
def create_comment_connection(connection: schemas.CommentConnectionCreate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.get("/notebooks/{notebook_id}/comment-connections", response_model=List[schemas.CommentConnectionResponse])
def get_notebook_connections(notebook_id: int, db: Session = Depends(get_db)):
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]

    # Inclui tanto comentários das notas do caderno quanto perguntas reflexivas criadas diretamente no caderno
    comment_filters = [models.Comment.notebook_id == notebook_id]
    if note_ids:
        comment_filters.append(models.Comment.note_id.in_(note_ids))

    comments = db.query(models.Comment).filter(or_(*comment_filters)).all()
    comment_ids = [comment.id for comment in comments]
    if not comment_ids:
        return []

    return (
        db.query(models.CommentConnection)
        .filter(
            models.CommentConnection.source_comment_id.in_(comment_ids),
            models.CommentConnection.target_comment_id.in_(comment_ids)
        )
        .all()
    )


@protected_router.put("/comment-connections/{conn_id}", response_model=schemas.CommentConnectionResponse)
def update_comment_connection(conn_id: int, connection: schemas.CommentConnectionUpdate, request: Request, db: Session = Depends(get_db)):
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


@protected_router.delete("/comment-connections/{conn_id}")
def delete_comment_connection(conn_id: int, request: Request, db: Session = Depends(get_db)):
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


@protected_router.post("/analyze")
def analyze_content(payload: dict, request: Request, db: Session = Depends(get_db)):
    log_activity_event(
        db,
        request,
        "CONTENT_ANALYZED",
        "Análise semântica de conteúdo executada na Rede Sináptica.",
        category="NETWORK",
        severity="INFO",
    )
    nodes = [
        {"id": "1", "data": {"label": "Conceito Chave A"}, "position": {"x": 250, "y": 100}},
        {"id": "2", "data": {"label": "Conceito Relacionado B"}, "position": {"x": 100, "y": 250}},
        {"id": "3", "data": {"label": "Aplicação C"}, "position": {"x": 400, "y": 250}},
    ]
    edges = [
        {"id": "e1-2", "source": "1", "target": "2", "label": "depende de"},
        {"id": "e1-3", "source": "1", "target": "3", "label": "gera"},
    ]
    return {"nodes": nodes, "edges": edges}


# ==============================================================================
# Monitor Global de Eventos e Auditoria Integral (Zero-Trust Telemetry)
# ==============================================================================
@protected_router.post("/events/track", response_model=schemas.SecurityAuditLogResponse)
@protected_router.post("/auth/events/track", response_model=schemas.SecurityAuditLogResponse)
def track_frontend_event(
    payload: schemas.EventTrackRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Registra eventos de navegação e interações de interface do usuário com data e hora exatas."""
    request.state.event_logged = True
    auth_dev = getattr(request.state, "authorized_device", None)
    entry = models.SecurityAuditLog(
        event_type=payload.event_type.strip().upper(),
        category=(payload.category or "NAVIGATION").strip().upper(),
        severity=(payload.severity or "INFO").strip().upper(),
        device_id=auth_dev.id if auth_dev else None,
        device_name=auth_dev.device_name if auth_dev else None,
        ip_address=get_client_ip(request),
        http_method="UI",
        endpoint=payload.endpoint or request.url.path,
        status_code=200,
        details=payload.details.strip(),
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@protected_router.get("/events", response_model=schemas.EventMonitorSummaryResponse)
@protected_router.get("/auth/events", response_model=schemas.EventMonitorSummaryResponse)
def get_all_monitored_events(
    limit: int = 250,
    category: str = None,
    severity: str = None,
    device_id: str = None,
    search: str = None,
    db: Session = Depends(get_db),
):
    """
    Retorna o painel completo do Monitor de Eventos com métricas agregadas e histórico
    cronológico detalhado (data/hora, dispositivo, IP, categoria, rota e descrição).
    """
    safe_limit = min(max(1, limit), 1000)
    all_logs = (
        db.query(models.SecurityAuditLog)
        .order_by(models.SecurityAuditLog.created_at.desc(), models.SecurityAuditLog.id.desc())
        .limit(2000)
        .all()
    )

    today_utc = datetime.utcnow().date()
    total_events = db.query(models.SecurityAuditLog).count()
    events_today = 0
    security_alerts = 0
    categories_breakdown = {}

    # Mapa auxiliar de nomes de dispositivos para logs antigos que só tinham device_id
    devices_map = {
        d.id: d.device_name for d in db.query(models.AuthorizedDevice).all()
    }
    active_devices = (
        db.query(models.AuthorizedDevice)
        .filter(models.AuthorizedDevice.is_revoked == False)
        .count()
    )

    filtered_events = []
    search_lower = search.strip().lower() if search else None
    cat_filter = category.strip().upper() if category and category.upper() != "ALL" else None
    sev_filter = severity.strip().upper() if severity and severity.upper() != "ALL" else None
    dev_filter = device_id.strip() if device_id and device_id.upper() != "ALL" else None

    for log in all_logs:
        cat = (log.category or "SECURITY").upper()
        sev = (log.severity or "INFO").upper()
        if not log.device_name and log.device_id and log.device_id in devices_map:
            log.device_name = devices_map[log.device_id]

        categories_breakdown[cat] = categories_breakdown.get(cat, 0) + 1
        if log.created_at and log.created_at.date() == today_utc:
            events_today += 1
        if sev in ("WARNING", "CRITICAL") or log.event_type in (
            "AUTH_FAILURE",
            "IP_BANNED",
            "UNAUTHORIZED_ACCESS_ATTEMPT",
            "DEVICE_REVOKED",
        ):
            security_alerts += 1

        if cat_filter and cat != cat_filter:
            continue
        if sev_filter and sev != sev_filter:
            continue
        if dev_filter and log.device_id != dev_filter:
            continue
        if search_lower:
            haystack = " ".join(
                [
                    str(log.event_type or ""),
                    str(cat),
                    str(log.details or ""),
                    str(log.device_name or ""),
                    str(log.device_id or ""),
                    str(log.ip_address or ""),
                    str(log.endpoint or ""),
                    str(log.http_method or ""),
                ]
            ).lower()
            if search_lower not in haystack:
                continue

        if len(filtered_events) < safe_limit:
            filtered_events.append(log)

    return schemas.EventMonitorSummaryResponse(
        total_events=total_events,
        events_today=events_today,
        security_alerts=security_alerts,
        active_devices=active_devices,
        categories_breakdown=categories_breakdown,
        events=filtered_events,
    )


# ==============================================================================
# Calendário, Gestão de Metas e Timeline Diária de 24 Horas (Zero-Trust)
# ==============================================================================
@protected_router.get("/calendar/overview")
def get_calendar_overview(
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
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


@protected_router.get("/calendar/events")
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


@protected_router.post("/calendar/events")
def create_calendar_event_endpoint(
    payload: schemas.EventCreate,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.put("/calendar/events/{event_id}")
def update_calendar_event_endpoint(
    event_id: int,
    payload: schemas.EventUpdate,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.delete("/calendar/events/{event_id}")
def delete_calendar_event_endpoint(
    event_id: int,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.get("/calendar/goals", response_model=List[schemas.CalendarGoalResponse])
def list_calendar_goals_endpoint(
    horizon: str = None,
    status: str = None,
):
    return calendar_tools.list_goals(horizon=horizon, status=status)


@protected_router.post("/calendar/goals", response_model=schemas.CalendarGoalResponse)
def create_calendar_goal_endpoint(
    payload: schemas.CalendarGoalCreate,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.put("/calendar/goals/{goal_id}", response_model=schemas.CalendarGoalResponse)
def update_calendar_goal_endpoint(
    goal_id: int,
    payload: schemas.CalendarGoalUpdate,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.post("/calendar/goals/{goal_id}/complete", response_model=schemas.CalendarGoalResponse)
def complete_calendar_goal_endpoint(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.delete("/calendar/goals/{goal_id}")
def delete_calendar_goal_endpoint(
    goal_id: int,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.get("/calendar/routine", response_model=List[schemas.RoutineTemplateResponse])
def list_routine_templates_endpoint(db: Session = Depends(get_db)):
    calendar_tools.ensure_default_routine_templates(db)
    return db.query(models.RoutineTemplate).order_by(models.RoutineTemplate.start_time_str.asc()).all()


@protected_router.post("/calendar/routine", response_model=schemas.RoutineTemplateResponse)
def create_routine_template_endpoint(
    payload: schemas.RoutineTemplateCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    rt = models.RoutineTemplate(
        title=sanitize_html_content(payload.title.strip()) or payload.title,
        description=sanitize_html_content(payload.description.strip()) if payload.description else None,
        category=sanitize_html_content((payload.category or "routine").strip()) or "routine",
        start_time_str=payload.start_time_str,
        end_time_str=payload.end_time_str,
        days_of_week=payload.days_of_week or "0,1,2,3,4,5,6",
        color=payload.color or "#6366f1",
        is_active=True if payload.is_active is None else bool(payload.is_active),
    )
    db.add(rt)
    db.commit()
    db.refresh(rt)

    log_activity_event(
        db,
        request,
        "ROUTINE_TEMPLATE_CREATED",
        f"Bloco de rotina 24h criado: '{rt.title}' ({rt.start_time_str}–{rt.end_time_str}).",
        category="CALENDAR",
        severity="SUCCESS",
    )
    return rt


@protected_router.put("/calendar/routine/{routine_id}", response_model=schemas.RoutineTemplateResponse)
def update_routine_template_endpoint(
    routine_id: int,
    payload: schemas.RoutineTemplateUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Bloco de rotina não encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"]:
        update_data["title"] = sanitize_html_content(update_data["title"].strip())
    if "description" in update_data and update_data["description"]:
        update_data["description"] = sanitize_html_content(update_data["description"].strip())
    for k, v in update_data.items():
        setattr(rt, k, v)
    db.commit()
    db.refresh(rt)

    log_activity_event(
        db,
        request,
        "ROUTINE_TEMPLATE_UPDATED",
        f"Bloco de rotina 24h #{routine_id} ('{rt.title}') atualizado.",
        category="CALENDAR",
        severity="INFO",
    )
    return rt


@protected_router.delete("/calendar/routine/{routine_id}")
def delete_routine_template_endpoint(
    routine_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Bloco de rotina não encontrado")
    title_bak = rt.title
    db.delete(rt)
    db.commit()

    log_activity_event(
        db,
        request,
        "ROUTINE_TEMPLATE_DELETED",
        f"Bloco de rotina 24h #{routine_id} ('{title_bak}') excluído.",
        category="CALENDAR",
        severity="WARNING",
    )
    return {"success": True}


@protected_router.get("/calendar/timeline/{date_str}")
def get_daily_timeline_endpoint(date_str: str):
    return calendar_tools.get_daily_timeline(date_str)


@protected_router.post("/calendar/timeline/{date_str}/generate")
def generate_daily_timeline_endpoint(
    date_str: str,
    payload: schemas.GenerateTimelineRequest,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.post("/calendar/timeline/{date_str}/blocks")
def create_timeline_block_endpoint(
    date_str: str,
    payload: schemas.TimelineBlockCreate,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.put("/calendar/timeline/blocks/{block_id}")
def update_timeline_block_endpoint(
    block_id: int,
    payload: schemas.TimelineBlockUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
    if not blk:
        raise HTTPException(status_code=404, detail="Bloco não encontrado na timeline")

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"]:
        blk.title = sanitize_html_content(update_data["title"].strip()) or blk.title
    if "notes" in update_data:
        blk.notes = sanitize_html_content(update_data["notes"].strip()) if update_data["notes"] else None
    if "block_type" in update_data and update_data["block_type"]:
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

    for k in ("color", "priority", "status", "is_locked", "task_id", "goal_id", "event_id"):
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


@protected_router.delete("/calendar/timeline/blocks/{block_id}")
def delete_timeline_block_endpoint(
    block_id: int,
    request: Request,
    db: Session = Depends(get_db),
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


@protected_router.post("/calendar/timeline/blocks/{block_id}/{action}")
def control_timeline_block_endpoint(
    block_id: int,
    action: str,
    request: Request,
    db: Session = Depends(get_db),
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




# ==============================================================================
# Sessão de Estudo Guiado (Superfície & Profundeza) Endpoints
# ==============================================================================
import guided_study_engine

def serialize_guided_study_session(s: models.GuidedStudySession) -> dict:
    import json
    sources_meta = []
    roadmap = []
    messages = []
    try:
        if s.sources_meta_json:
            sources_meta = json.loads(s.sources_meta_json)
    except Exception:
        sources_meta = []
    try:
        if s.roadmap_json:
            roadmap = json.loads(s.roadmap_json)
    except Exception:
        roadmap = []
    try:
        if s.messages_json:
            messages = json.loads(s.messages_json)
    except Exception:
        messages = []

    return {
        "id": s.id,
        "title": s.title,
        "workspace_id": s.workspace_id,
        "notebook_id": s.notebook_id,
        "target_note_id": s.target_note_id,
        "depth_persona": s.depth_persona or "Cientista da Computação",
        "surface_pace": getattr(s, "surface_pace", "standard") or "standard",
        "current_phase": s.current_phase or "surface",
        "current_topic_index": s.current_topic_index or 0,
        "big_insight": s.big_insight,
        "sources_meta": sources_meta,
        "roadmap": roadmap,
        "messages": messages,
        "last_synapse_comment_id": s.last_synapse_comment_id,
        "auto_create_synapses": bool(s.auto_create_synapses),
        "status": s.status or "active",
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def serialize_guided_study_summary(s: models.GuidedStudySession) -> dict:
    import json
    roadmap = []
    try:
        if s.roadmap_json:
            roadmap = json.loads(s.roadmap_json)
    except Exception:
        roadmap = []

    val_surface = sum(1 for t in roadmap if t.get("surface_status") == "validated")
    val_depth = sum(1 for t in roadmap if t.get("depth_status") == "validated")

    return {
        "id": s.id,
        "title": s.title,
        "workspace_id": s.workspace_id,
        "notebook_id": s.notebook_id,
        "target_note_id": s.target_note_id,
        "depth_persona": s.depth_persona or "Cientista da Computação",
        "surface_pace": getattr(s, "surface_pace", "standard") or "standard",
        "current_phase": s.current_phase or "surface",
        "current_topic_index": s.current_topic_index or 0,
        "total_topics": len(roadmap),
        "validated_surface_topics": val_surface,
        "validated_depth_topics": val_depth,
        "status": s.status or "active",
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


@protected_router.post("/guided-study/extract-file", response_model=schemas.ExtractFileResponse)
async def extract_guided_study_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite máximo permitido de 25 MB.")

    try:
        extracted_data = guided_study_engine.extract_uploaded_file_text(file.filename, raw_bytes)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Erro ao extrair arquivo no estudo guiado: {e}")
        raise HTTPException(status_code=500, detail="Falha ao extrair texto do arquivo para estudo.")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_FILE_EXTRACTED",
        f"Texto extraído do arquivo '{file.filename}' ({extracted_data['char_count']} caracteres, {extracted_data.get('page_count', 1)} páginas) para Sessão de Estudo Guiado.",
        category="STUDY",
        severity="INFO",
    )
    return extracted_data


@protected_router.get("/guided-study/sessions", response_model=List[schemas.GuidedStudySessionSummaryResponse])
def list_guided_study_sessions(
    workspace_id: Optional[int] = None,
    notebook_id: Optional[int] = None,
    target_note_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.GuidedStudySession)
    if workspace_id is not None:
        query = query.filter(models.GuidedStudySession.workspace_id == workspace_id)
    if notebook_id is not None:
        query = query.filter(models.GuidedStudySession.notebook_id == notebook_id)
    if target_note_id is not None:
        query = query.filter(models.GuidedStudySession.target_note_id == target_note_id)

    sessions = query.order_by(models.GuidedStudySession.updated_at.desc()).all()
    return [serialize_guided_study_summary(s) for s in sessions]


@protected_router.post("/guided-study/sessions", response_model=schemas.GuidedStudySessionResponse)
def create_guided_study_session(
    payload: schemas.GuidedStudySessionCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    import json
    sources_meta = []
    combined_text_parts = []

    # 1. Extrair conteúdo das notas selecionadas
    if payload.source_note_ids:
        notes = db.query(models.Note).filter(models.Note.id.in_(payload.source_note_ids)).all()
        for note in notes:
            src_info = guided_study_engine.extract_content_from_source(note)
            sources_meta.append({
                "source_type": src_info["source_type"],
                "title": src_info["title"],
                "note_id": src_info["note_id"],
                "file_name": src_info["file_name"],
                "char_count": src_info["char_count"],
            })
            if src_info["text"].strip():
                combined_text_parts.append(f"=== [Fonte: {src_info['title']} | note_id: {src_info['note_id']} | type: {src_info['source_type']}] ===\n{src_info['text']}")

    # 2. Adicionar texto bruto caso fornecido
    if payload.raw_text and payload.raw_text.strip():
        raw_text_clean = payload.raw_text.strip()
        sources_meta.append({
            "source_type": "raw_text",
            "title": "Texto Colado / Inserido",
            "note_id": None,
            "file_name": None,
            "char_count": len(raw_text_clean),
        })
        combined_text_parts.append(f"=== [Conteúdo Adicional Colado] ===\n{raw_text_clean}")

    full_material_text = "\n\n".join(combined_text_parts).strip()
    if not full_material_text:
        raise HTTPException(
            status_code=400,
            detail="Nenhum conteúdo para estudar foi fornecido. Selecione ao menos uma Nota/PDF ou cole um texto de estudo."
        )

    depth_persona = (payload.depth_persona or "Cientista da Computação").strip()
    surface_pace = getattr(payload, "surface_pace", "standard") or "standard"
    if surface_pace not in ["fast", "standard", "detailed"]:
        surface_pace = "standard"

    # 3. Chamar motor socrático para analisar o material e gerar a trilha + primeira pergunta
    try:
        init_res = guided_study_engine.generate_initial_roadmap_and_first_question(
            source_title=payload.title,
            combined_content=full_material_text,
            depth_persona=depth_persona,
            surface_pace=surface_pace
        )
    except Exception as e:
        logger.error(f"Erro ao inicializar sessão de estudo guiado: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar o material com a IA para estruturar o estudo.")

    roadmap = init_res.get("roadmap", [])
    big_insight = init_res.get("big_insight", "")
    first_turn = init_res.get("first_turn", {})

    contextualization = first_turn.get("contextualization", "")
    explanation = first_turn.get("explanation", "")
    question = first_turn.get("question", "")
    slide_reference = first_turn.get("slide_reference")
    diagram_mermaid = first_turn.get("diagram_mermaid")
    step_by_step_example = first_turn.get("step_by_step_example")

    full_first_message = f"{contextualization}\n\n{explanation}\n\n**Pergunta:** {question}" if question else f"{contextualization}\n\n{explanation}"

    first_message_entry = {
        "id": "msg-init",
        "role": "assistant",
        "phase": "surface",
        "topic_id": first_turn.get("topic_id", "t1"),
        "subconcept_id": first_turn.get("subconcept_id", "t1_s1"),
        "contextualization": contextualization,
        "explanation": explanation,
        "slide_reference": slide_reference,
        "diagram_mermaid": diagram_mermaid,
        "step_by_step_example": step_by_step_example,
        "question": question,
        "content": full_first_message,
        "student_synthesis": None,
        "topic_validated": False,
        "synapse_comment_id": None,
        "timestamp": datetime.utcnow().isoformat(),
    }

    # 4. Determinar workspace e caderno
    workspace_id = payload.workspace_id
    notebook_id = payload.notebook_id
    if not workspace_id and notebook_id:
        nb = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
        if nb:
            workspace_id = nb.workspace_id

    # 5. Salvar sessão no banco de dados com criptografia AES-256-GCM
    session_model = models.GuidedStudySession(
        title=sanitize_html_content(payload.title) or payload.title,
        workspace_id=workspace_id,
        notebook_id=notebook_id,
        target_note_id=payload.target_note_id,
        depth_persona=depth_persona,
        surface_pace=surface_pace,
        current_phase="surface",
        current_topic_index=0,
        big_insight=big_insight,
        source_material_text=full_material_text,
        sources_meta_json=json.dumps(sources_meta),
        roadmap_json=json.dumps(roadmap),
        messages_json=json.dumps([first_message_entry]),
        last_synapse_comment_id=None,
        auto_create_synapses=True if payload.auto_create_synapses is None else bool(payload.auto_create_synapses),
        status="active"
    )
    db.add(session_model)
    db.commit()
    db.refresh(session_model)

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_SESSION_CREATED",
        f"Sessão de Estudo Guiado criada: '{session_model.title}' (#{session_model.id} | Rigor: {depth_persona} | {len(roadmap)} tópicos mapeados).",
        category="STUDY",
        severity="SUCCESS",
    )
    return serialize_guided_study_session(session_model)


@protected_router.get("/guided-study/sessions/{session_id}", response_model=schemas.GuidedStudySessionResponse)
def get_guided_study_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")
    return serialize_guided_study_session(session)


@protected_router.post("/guided-study/sessions/{session_id}/turn")
def execute_guided_study_turn(
    session_id: int,
    payload: schemas.GuidedStudyTurnRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    check_ip_ban_and_rate_limit(request, bucket_type="chat_ai", limit_per_min=30)
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    if payload.auto_create_synapse is not None:
        session.auto_create_synapses = payload.auto_create_synapse

    try:
        turn_result = guided_study_engine.process_study_turn(
            session=session,
            user_message=payload.user_message,
            action=payload.action or "answer",
            db=db
        )
        db.commit()
        db.refresh(session)
    except Exception as e:
        logger.error(f"Erro no turno do estudo guiado: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao processar raciocínio pedagógico do turno.")

    validation_label = "VALIDADO" if turn_result.get("topic_validated") else "EM CONSTRUÇÃO"
    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_TURN",
        f"Turno socrático processado na sessão #{session_id} ({session.title}): Fase {session.current_phase.upper()} [{validation_label}].",
        category="STUDY",
        severity="SUCCESS" if turn_result.get("topic_validated") else "INFO",
    )

    return {
        "turn_result": turn_result,
        "session": serialize_guided_study_session(session)
    }


@protected_router.post("/guided-study/sessions/{session_id}/crystallize-synapse")
def crystallize_synapse_endpoint(
    session_id: int,
    payload: schemas.CrystallizeSynapseRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    import json
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    messages: list = []
    try:
        messages = json.loads(session.messages_json or "[]")
    except Exception:
        messages = []

    target_msg = next((m for m in messages if m.get("id") == payload.message_id), None)
    if not target_msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada na sessão.")

    roadmap: list = []
    try:
        roadmap = json.loads(session.roadmap_json or "[]")
    except Exception:
        roadmap = []

    topic_title = "Conceito"
    topic_idx = session.current_topic_index or 0
    if target_msg.get("topic_id"):
        t_match = next((t for t in roadmap if t.get("id") == target_msg.get("topic_id")), None)
        if t_match:
            topic_title = t_match.get("title", "Conceito")

    synthesis_text = target_msg.get("student_synthesis") or target_msg.get("explanation") or target_msg.get("content")
    question_text = target_msg.get("question") or f"Pergunta sobre {topic_title}"

    try:
        synapse_id = guided_study_engine.create_synapse_in_mindmap(
            db=db,
            session=session,
            topic_title=topic_title,
            question_text=question_text,
            synthesis_text=synthesis_text,
            phase=target_msg.get("phase", session.current_phase),
            topic_index=topic_idx,
            custom_observation=payload.custom_observation
        )
        session.last_synapse_comment_id = synapse_id
        target_msg["synapse_comment_id"] = synapse_id
        session.messages_json = json.dumps(messages)
        db.commit()
    except Exception as e:
        logger.error(f"Erro ao cristalizar sinapse manualmente: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar nó sináptico no Mapa Mental.")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_SYNAPSE_CRYSTALLIZED",
        f"Sinapse #{synapse_id} cristalizada no Mapa Mental a partir do estudo '{session.title}'.",
        category="STUDY",
        severity="SUCCESS",
    )
    return {
        "success": True,
        "synapse_comment_id": synapse_id,
        "message": "Nó e conexão sináptica criados com sucesso no Mapa Mental!"
    }


@protected_router.patch("/guided-study/sessions/{session_id}", response_model=schemas.GuidedStudySessionResponse)
def update_guided_study_session(
    session_id: int,
    payload: schemas.GuidedStudySessionUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        if k == "title" and v:
            session.title = sanitize_html_content(v) or v
        elif k == "depth_persona" and v:
            session.depth_persona = v.strip()
        elif hasattr(session, k) and v is not None:
            setattr(session, k, v)

    db.commit()
    db.refresh(session)

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_SESSION_UPDATED",
        f"Sessão de Estudo Guiado #{session_id} atualizada ({', '.join(update_data.keys())}).",
        category="STUDY",
        severity="INFO",
    )
    return serialize_guided_study_session(session)


@protected_router.delete("/guided-study/sessions/{session_id}")
def delete_guided_study_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    s_title = session.title
    db.delete(session)
    db.commit()

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_SESSION_DELETED",
        f"Sessão de Estudo Guiado #{session_id} ('{s_title}') excluída permanentemente.",
        category="STUDY",
        severity="WARNING",
    )
    return {"success": True, "message": "Sessão de estudo excluída com sucesso."}


@protected_router.post("/guided-study/sessions/{session_id}/rebuild-roadmap", response_model=schemas.GuidedStudySessionResponse)
def rebuild_guided_study_roadmap_endpoint(
    session_id: int,
    request: Request,
    payload: Optional[schemas.RebuildRoadmapRequest] = None,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    surface_pace = payload.surface_pace if payload else None

    try:
        res = guided_study_engine.rebuild_roadmap_for_session(session=session, db=db, surface_pace=surface_pace)
    except Exception as e:
        logger.error(f"Erro ao reconstruir trilha socrática: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao reconstruir trilha profunda com micro-conceitos e slides.")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_ROADMAP_REBUILT",
        f"Trilha profunda e micro-conceitos reconstruídos na sessão #{session_id} ('{session.title}') com ritmo '{session.surface_pace}'.",
        category="STUDY",
        severity="SUCCESS",
    )
    return serialize_guided_study_session(session)


@protected_router.post("/guided-study/sessions/{session_id}/jump", response_model=schemas.GuidedStudySessionResponse)
def jump_guided_study_step_endpoint(
    session_id: int,
    payload: schemas.GuidedStudyJumpRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    try:
        guided_study_engine.jump_to_study_step(
            session=session,
            topic_index=payload.topic_index,
            subconcept_index=payload.subconcept_index,
            phase=payload.phase,
            db=db
        )
    except Exception as e:
        logger.error(f"Erro ao saltar etapa de estudo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao saltar etapa de estudo: {str(e)}")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_JUMP",
        f"Salto de etapa na sessão #{session_id}: Tópico {payload.topic_index}, Subconceito {payload.subconcept_index}, Fase {payload.phase or session.current_phase}.",
        category="STUDY",
        severity="INFO",
    )
    return serialize_guided_study_session(session)


@protected_router.post("/guided-study/sessions/{session_id}/generate-visual")
def generate_visual_for_study_message(
    session_id: int,
    payload: schemas.GenerateVisualRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    try:
        res = guided_study_engine.generate_visual_for_message(
            session=session,
            message_id=payload.message_id,
            prompt_hint=payload.prompt_hint,
            db=db
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Erro ao gerar recurso visual: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao gerar diagrama visual para a mensagem.")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_VISUAL_GENERATED",
        f"Diagrama visual Mermaid gerado para mensagem {payload.message_id} na sessão #{session_id}.",
        category="STUDY",
        severity="INFO",
    )
    return res


@protected_router.post("/guided-study/sessions/{session_id}/raise-hand", response_model=schemas.GuidedStudySessionResponse)
def raise_hand_for_study_doubt(
    session_id: int,
    payload: schemas.GuidedStudyRaiseHandRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    try:
        guided_study_engine.process_raise_hand_doubt(
            db=db,
            session=session,
            user_doubt=payload.doubt_text,
            parent_message_id=payload.parent_message_id,
            thread_id=payload.thread_id
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Erro ao processar dúvida de sala de aula (Levantar a Mão): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao esclarecer dúvida com o professor.")

    log_activity_event(
        db,
        request,
        "GUIDED_STUDY_RAISE_HAND",
        f"Dúvida levantada pelo aluno na sessão #{session_id} vinculada à mensagem {payload.parent_message_id}.",
        category="STUDY",
        severity="INFO",
    )
    return serialize_guided_study_session(session)


@protected_router.post("/guided-study/sessions/{session_id}/resolve-doubt", response_model=schemas.GuidedStudySessionResponse)
def resolve_study_doubt_thread(
    session_id: int,
    payload: schemas.GuidedStudyResolveDoubtRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    session = db.query(models.GuidedStudySession).filter(models.GuidedStudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de Estudo Guiado não encontrada.")

    try:
        guided_study_engine.resolve_raise_hand_doubt(
            db=db,
            session=session,
            parent_message_id=payload.parent_message_id,
            thread_id=payload.thread_id
        )
    except Exception as e:
        logger.error(f"Erro ao marcar dúvida como resolvida: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao atualizar status da dúvida.")

    return serialize_guided_study_session(session)


app.include_router(protected_router)

# 3. Domínio ISOLADO da Equipe: /team-auth, /team-portal (liderados) e /team-admin (somente Líder)
from team_router import mount_team_routers
mount_team_routers(app)


# Healthcheck minimalista sem informações sensíveis para o container Docker
@app.get("/healthz")
def healthcheck():
    return {"status": "ok"}


# Servir build estático de produção do Frontend (quando compilado para Docker/Cloudflare Tunnel)
if os.path.isdir(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend_assets")

    @app.get("/{full_path:path}")
    def serve_spa_frontend(full_path: str):
        requested = os.path.abspath(os.path.join(FRONTEND_DIST_DIR, full_path))
        if requested.startswith(FRONTEND_DIST_DIR) and os.path.isfile(requested):
            return FileResponse(requested)
        index_html = os.path.join(FRONTEND_DIST_DIR, "index.html")
        if os.path.isfile(index_html):
            return FileResponse(
                index_html,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return JSONResponse(status_code=404, content={"detail": "Recurso não encontrado."})
else:
    @app.get("/")
    def read_root():
        return {"message": "Synaptix Zero-Trust API Ativa"}


if __name__ == "__main__":
    import uvicorn
    bind_host = os.environ.get("SYNAPTIX_BIND_HOST", "127.0.0.1")
    bind_port = int(os.environ.get("SYNAPTIX_BIND_PORT", "8000"))
    uvicorn.run("main:app", host=bind_host, port=bind_port, reload=False)
