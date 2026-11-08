"""
Roteadores da Equipe.

- scoped_router : rotas de demandas/notas/calendário/fluxos diários. Montado em
                  /team-portal (liderado) e /team-admin (Líder) com dependências de escopo distintas.
- admin_router  : gestão de liderados, dispositivos, auditoria e painel — SOMENTE dispositivo do Líder.
"""
import json
import mimetypes
import os
import re
import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional

import filetype
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func

import team_calendar_tools as calendar_tools
import team_models as models
import team_routes_core
import team_schemas as ts
from security.auth import verify_authorized_device
from security.crypto import (
    encrypt_team_bytes,
    hash_team_password,
    read_decrypted_team_file,
    sanitize_html_content,
)
from security.team_auth import (
    get_team_db,
    leader_scope_dependency,
    log_team_event,
    member_scope_dependency,
)
from team_database import TEAM_UPLOADS_DIR, get_unscoped_team_db

scoped_router = team_routes_core.router
log_activity_event = team_routes_core.log_activity_event

MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024
ALLOWED_UPLOAD_MIMES = {
    "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg",
    "image/webp": ".webp", "image/gif": ".gif",
}
SAFE_FILENAME_REGEX = re.compile(r"^[a-fA-F0-9\-]{8,64}\.(pdf|png|jpg|jpeg|webp|gif)$")


# ==============================================================================
# Fluxos diários (rotinas) com checklist e POP vinculado
# ==============================================================================
def _serialize_routine(r: models.RoutineTemplate) -> dict:
    return {
        "id": r.id, "title": r.title, "description": r.description, "category": r.category or "routine",
        "start_time_str": r.start_time_str, "end_time_str": r.end_time_str,
        "days_of_week": r.days_of_week or "0,1,2,3,4,5,6", "color": r.color or "#6366f1",
        "is_active": bool(r.is_active), "created_at": r.created_at, "updated_at": r.updated_at,
        "member_id": r.member_id, "assigned_by_leader": bool(r.assigned_by_leader),
        "checklist": calendar_tools.parse_checklist(r.checklist_json), "linked_note_id": r.linked_note_id,
    }


def _checklist_json(items) -> str:
    return json.dumps(
        calendar_tools.parse_checklist([i.model_dump() if hasattr(i, "model_dump") else i for i in items]),
        ensure_ascii=False,
    )


@scoped_router.get("/calendar/routine", response_model=List[ts.TeamRoutineResponse])
def list_routine_templates_endpoint(db=Depends(get_team_db)):
    rows = db.query(models.RoutineTemplate).order_by(models.RoutineTemplate.start_time_str.asc()).all()
    return [_serialize_routine(r) for r in rows]


@scoped_router.post("/calendar/routine", response_model=ts.TeamRoutineResponse)
def create_routine_template_endpoint(payload: ts.TeamRoutineCreate, request: Request, db=Depends(get_team_db)):
    rt = models.RoutineTemplate(
        title=sanitize_html_content(payload.title.strip()) or payload.title,
        description=sanitize_html_content(payload.description.strip()) if payload.description else None,
        category=sanitize_html_content((payload.category or "routine").strip()) or "routine",
        start_time_str=payload.start_time_str,
        end_time_str=payload.end_time_str,
        days_of_week=payload.days_of_week or "0,1,2,3,4,5,6",
        color=payload.color or "#6366f1",
        is_active=True if payload.is_active is None else bool(payload.is_active),
        checklist_json=_checklist_json(payload.checklist or []),
        linked_note_id=payload.linked_note_id,
    )
    db.add(rt)
    db.commit()
    db.refresh(rt)
    log_activity_event(db, request, "ROUTINE_TEMPLATE_CREATED",
                       f"Fluxo diário criado: '{rt.title}' ({rt.start_time_str}–{rt.end_time_str}).",
                       category="CALENDAR", severity="SUCCESS")
    return _serialize_routine(rt)


@scoped_router.put("/calendar/routine/{routine_id}", response_model=ts.TeamRoutineResponse)
def update_routine_template_endpoint(routine_id: int, payload: ts.TeamRoutineUpdate, request: Request, db=Depends(get_team_db)):
    rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Fluxo diário não encontrado")
    data = payload.model_dump(exclude_unset=True)
    if data.get("title"):
        data["title"] = sanitize_html_content(data["title"].strip())
    if data.get("description"):
        data["description"] = sanitize_html_content(data["description"].strip())
    if "checklist" in data:
        rt.checklist_json = _checklist_json(payload.checklist or [])
        data.pop("checklist")
    for k, v in data.items():
        setattr(rt, k, v)
    db.commit()
    db.refresh(rt)
    log_activity_event(db, request, "ROUTINE_TEMPLATE_UPDATED", f"Fluxo diário #{routine_id} ('{rt.title}') atualizado.",
                       category="CALENDAR")
    return _serialize_routine(rt)


@scoped_router.delete("/calendar/routine/{routine_id}")
def delete_routine_template_endpoint(routine_id: int, request: Request, db=Depends(get_team_db)):
    rt = db.query(models.RoutineTemplate).filter(models.RoutineTemplate.id == routine_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Fluxo diário não encontrado")
    title = rt.title
    db.delete(rt)
    db.commit()
    log_activity_event(db, request, "ROUTINE_TEMPLATE_DELETED", f"Fluxo diário #{routine_id} ('{title}') excluído.",
                       category="CALENDAR", severity="WARNING")
    return {"success": True}


@scoped_router.put("/calendar/timeline/blocks/{block_id}/checklist")
def update_block_checklist(block_id: int, payload: ts.TeamBlockChecklistUpdate, request: Request, db=Depends(get_team_db)):
    blk = db.query(models.TimelineBlock).filter(models.TimelineBlock.id == block_id).first()
    if not blk:
        raise HTTPException(status_code=404, detail="Bloco não encontrado na timeline")
    scope = db.info.get("scope")
    new_items = calendar_tools.parse_checklist([i.model_dump() for i in payload.checklist])
    if scope and scope.role == "member" and blk.assigned_by_leader:
        old_items = calendar_tools.parse_checklist(blk.checklist_json)
        if [(i["id"], i["text"]) for i in old_items] != [(i["id"], i["text"]) for i in new_items]:
            raise HTTPException(status_code=403, detail="Checklist definido pelo Líder: apenas marcar/desmarcar itens.")
    blk.checklist_json = json.dumps(new_items, ensure_ascii=False)
    db.commit()
    db.refresh(blk)
    done = sum(1 for i in new_items if i["done"])
    log_activity_event(db, request, "TIMELINE_CHECKLIST_UPDATED",
                       f"Checklist do bloco #{block_id} ('{blk.title}'): {done}/{len(new_items)} concluídos.",
                       category="CALENDAR")
    return calendar_tools.serialize_timeline_block(blk)


# ==============================================================================
# Cofre de arquivos da equipe (AES-256-GCM, chave própria) com controle de acesso
# ==============================================================================
@scoped_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), db=Depends(get_team_db)):
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="O arquivo excede o tamanho máximo permitido de 25 MB.")
    kind = filetype.guess(raw_bytes)
    if not kind or kind.mime not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(status_code=400, detail="Tipo de arquivo não permitido. Apenas PDF e imagens são aceitos.")

    os.makedirs(TEAM_UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{ALLOWED_UPLOAD_MIMES[kind.mime]}"
    with open(os.path.join(TEAM_UPLOADS_DIR, filename), "wb") as fh:
        fh.write(encrypt_team_bytes(raw_bytes))

    scope = db.info.get("scope")
    db.add(models.Upload(
        filename=filename, uploaded_by_member_id=getattr(scope, "member_id", None),
        uploaded_by_role=getattr(scope, "role", "member"),
    ))
    db.commit()
    log_activity_event(db, request, "FILE_UPLOADED",
                       f"Arquivo enviado e criptografado: '{file.filename}' -> '{filename}' ({kind.mime}, {len(raw_bytes) / 1024:.1f} KB).",
                       category="FILES", severity="SUCCESS")
    return {"file_url": f"/uploads/{filename}"}


def _member_can_read_file(db, scope, filename: str) -> bool:
    rec = db.query(models.Upload).filter(models.Upload.filename == filename).first()
    if rec and rec.uploaded_by_member_id == scope.member_id and rec.uploaded_by_role == "member":
        return True
    token = f"/uploads/{filename}"
    for note in db.query(models.Note).all():  # já filtradas pelo escopo do liderado
        if token in (note.file_url or "") or token in (note.content or "") or filename in (note.file_url or ""):
            return True
    return False


@scoped_router.get("/uploads/{filename}")
def get_encrypted_upload(filename: str, request: Request, db=Depends(get_team_db)):
    clean = os.path.basename(filename)
    if clean != filename or not SAFE_FILENAME_REGEX.match(clean):
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")
    scope = db.info.get("scope")
    if scope.role == "member" and not _member_can_read_file(db, scope, clean):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    path = os.path.join(TEAM_UPLOADS_DIR, clean)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    try:
        data = read_decrypted_team_file(path)
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao descriptografar arquivo.")
    log_activity_event(db, request, "FILE_ACCESSED", f"Arquivo '{clean}' aberto.", category="FILES")
    mime, _ = mimetypes.guess_type(clean)
    return Response(
        content=data, media_type=mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{clean}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store, max-age=0",
        },
    )


# ==============================================================================
# Gestão (SOMENTE Líder): liderados, dispositivos, auditoria e painel
# ==============================================================================
admin_router = APIRouter(prefix="/team-admin", dependencies=[Depends(verify_authorized_device)], tags=["Team Admin"])


def _member_dict(db, m: models.TeamMember) -> dict:
    devs = db.query(models.TeamMemberDevice).filter(models.TeamMemberDevice.member_id == m.id).all()
    return {
        "id": m.id, "username": m.username, "display_name": m.display_name, "full_name": m.display_name,
        "role_title": m.role_title, "role": m.role_title or "Membro",
        "avatar_color": m.avatar_color or "#6366f1", "require_device_approval": bool(m.require_device_approval),
        "is_active": bool(m.is_active), "created_at": m.created_at, "last_login_at": m.last_login_at,
        "devices_total": len(devs), "devices_pending": sum(1 for d in devs if d.status == "pending_approval"),
    }


def _get_member_or_404(db, member_id: int) -> models.TeamMember:
    m = db.query(models.TeamMember).filter(models.TeamMember.id == member_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Liderado não encontrado.")
    return m


@admin_router.get("/members", response_model=List[ts.TeamMemberResponse])
def list_members(db=Depends(get_unscoped_team_db)):
    members = db.query(models.TeamMember).order_by(models.TeamMember.id.asc()).all()
    return [_member_dict(db, m) for m in members]


@admin_router.post("/members", response_model=ts.TeamMemberResponse)
def create_member(payload: ts.TeamMemberCreate, request: Request, db=Depends(get_unscoped_team_db)):
    username = payload.username.strip().lower()
    if db.query(models.TeamMember).filter(models.TeamMember.username == username).first():
        raise HTTPException(status_code=409, detail="Já existe um liderado com este usuário.")
    
    final_name = (payload.display_name or payload.full_name or payload.username).strip()
    final_role = (payload.role_title or payload.role or "Membro da Equipe").strip()
    
    m = models.TeamMember(
        username=username,
        display_name=sanitize_html_content(final_name),
        role_title=sanitize_html_content(final_role) if final_role else None,
        avatar_color=payload.avatar_color or "#6366f1",
        password_hash=hash_team_password(payload.password),
        require_device_approval=True if payload.require_device_approval is None else bool(payload.require_device_approval),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    log_team_event(db, "MEMBER_CREATED", f"Liderado '{m.username}' criado pelo Líder.", request=request,
                   actor="leader", member_id=m.id, member_name=m.display_name, category="TEAM_ADMIN",
                   severity="SUCCESS", status_code=200)
    return _member_dict(db, m)


@admin_router.put("/members/{member_id}", response_model=ts.TeamMemberResponse)
def update_member(member_id: int, payload: ts.TeamMemberUpdate, request: Request, db=Depends(get_unscoped_team_db)):
    m = _get_member_or_404(db, member_id)
    data = payload.model_dump(exclude_unset=True)
    updated_fields = []

    # Nome Completo / display_name
    final_name = data.get("display_name") or data.get("full_name")
    if final_name:
        sanitized_name = sanitize_html_content(final_name.strip())
        if sanitized_name != m.display_name:
            m.display_name = sanitized_name
            updated_fields.append("nome")

    # Cargo / role_title
    final_role = data.get("role_title") if "role_title" in data else data.get("role")
    if final_role is not None:
        sanitized_role = sanitize_html_content(final_role.strip()) if final_role.strip() else None
        if sanitized_role != m.role_title:
            m.role_title = sanitized_role
            updated_fields.append("cargo")

    # Nome de usuário / login
    if "username" in data and data["username"]:
        new_username = data["username"].strip().lower()
        if new_username != m.username:
            dup = db.query(models.TeamMember).filter(models.TeamMember.username == new_username, models.TeamMember.id != m.id).first()
            if dup:
                raise HTTPException(status_code=409, detail="Já existe um liderado com este nome de usuário.")
            m.username = new_username
            updated_fields.append("usuário")

    # Senha
    if "password" in data and data["password"]:
        new_pwd = data["password"].strip()
        if len(new_pwd) < 8:
            raise HTTPException(status_code=422, detail="A senha deve ter no mínimo 8 caracteres.")
        m.password_hash = hash_team_password(new_pwd)
        m.token_version = (m.token_version or 1) + 1
        m.failed_attempts = 0
        m.locked_until = None
        updated_fields.append("senha")
        log_team_event(db, "MEMBER_PASSWORD_RESET", f"Senha de '{m.username}' alterada na edição pelo Líder.",
                       request=request, actor="leader", member_id=m.id, member_name=m.display_name,
                       category="TEAM_ADMIN", severity="WARNING", status_code=200)

    # Status ativo / desativado
    if "is_active" in data and data["is_active"] is not None:
        new_active = bool(data["is_active"])
        if m.is_active != new_active:
            if not new_active:
                m.token_version = (m.token_version or 1) + 1  # derruba sessões ativas imediatamente
            m.is_active = new_active
            updated_fields.append("status_ativo")

    # Aprovação de dispositivos
    if "require_device_approval" in data and data["require_device_approval"] is not None:
        new_req = bool(data["require_device_approval"])
        if m.require_device_approval != new_req:
            m.require_device_approval = new_req
            updated_fields.append("exigir_aprovacao_dispositivo")

    # Avatar color
    if "avatar_color" in data and data["avatar_color"]:
        m.avatar_color = data["avatar_color"]

    db.commit()
    db.refresh(m)
    log_team_event(db, "MEMBER_UPDATED", f"Liderado '{m.username}' atualizado ({', '.join(updated_fields) or 'sem alterações'}).",
                   request=request, actor="leader", member_id=m.id, member_name=m.display_name,
                   category="TEAM_ADMIN", status_code=200)
    return _member_dict(db, m)


@admin_router.delete("/members/{member_id}")
def delete_member(member_id: int, request: Request, db=Depends(get_unscoped_team_db)):
    m = _get_member_or_404(db, member_id)
    username = m.username
    display_name = m.display_name

    # 1. Excluir dispositivos do liderado
    db.query(models.TeamMemberDevice).filter(models.TeamMemberDevice.member_id == member_id).delete()

    # 2. Excluir blocos da timeline
    db.query(models.TimelineBlock).filter(models.TimelineBlock.member_id == member_id).delete()

    # 3. Excluir rotinas/templates diários
    db.query(models.RoutineTemplate).filter(models.RoutineTemplate.member_id == member_id).delete()

    # 4. Excluir demandas (tasks) do liderado
    db.query(models.Task).filter(models.Task.member_id == member_id).delete()

    # 5. Excluir metas e eventos
    db.query(models.CalendarGoal).filter(models.CalendarGoal.member_id == member_id).delete()
    db.query(models.Event).filter(models.Event.member_id == member_id).delete()

    # 6. Excluir notas e cadernos de propriedade exclusiva do membro (se houver)
    note_ids = [n.id for n in db.query(models.Note.id).filter(models.Note.owner_member_id == member_id).all()]
    if note_ids:
        comment_ids = [c.id for c in db.query(models.Comment.id).filter(models.Comment.note_id.in_(note_ids)).all()]
        if comment_ids:
            db.query(models.CommentConnection).filter(
                (models.CommentConnection.source_comment_id.in_(comment_ids)) |
                (models.CommentConnection.target_comment_id.in_(comment_ids))
            ).delete(synchronize_session=False)
            db.query(models.Comment).filter(models.Comment.id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(models.Note).filter(models.Note.id.in_(note_ids)).delete(synchronize_session=False)

    db.query(models.Notebook).filter(models.Notebook.owner_member_id == member_id).delete(synchronize_session=False)
    db.query(models.Workspace).filter(models.Workspace.owner_member_id == member_id).delete(synchronize_session=False)

    # 7. Excluir o membro
    db.delete(m)
    db.commit()

    log_team_event(db, "MEMBER_DELETED", f"Liderado '{username}' ({display_name}) excluído pelo Líder.",
                   request=request, actor="leader", member_id=member_id, member_name=display_name,
                   category="TEAM_ADMIN", severity="WARNING", status_code=200)
    return {"success": True, "message": f"Liderado '{display_name}' excluído com sucesso."}


@admin_router.post("/members/{member_id}/reset-password")
def reset_member_password(member_id: int, payload: ts.TeamPasswordReset, request: Request, db=Depends(get_unscoped_team_db)):
    m = _get_member_or_404(db, member_id)
    m.password_hash = hash_team_password(payload.password)
    m.token_version = (m.token_version or 1) + 1
    m.failed_attempts = 0
    m.locked_until = None
    db.commit()
    log_team_event(db, "MEMBER_PASSWORD_RESET", f"Senha de '{m.username}' redefinida pelo Líder.", request=request,
                   actor="leader", member_id=m.id, member_name=m.display_name, category="TEAM_ADMIN",
                   severity="WARNING", status_code=200)
    return {"success": True}


@admin_router.get("/members/{member_id}/devices", response_model=List[ts.TeamDeviceResponse])
def list_member_devices(member_id: int, db=Depends(get_unscoped_team_db)):
    _get_member_or_404(db, member_id)
    return (
        db.query(models.TeamMemberDevice)
        .filter(models.TeamMemberDevice.member_id == member_id)
        .order_by(models.TeamMemberDevice.created_at.desc())
        .all()
    )


def _set_device_status(db, request, member_id: int, device_id: str, new_status: str):
    m = _get_member_or_404(db, member_id)
    d = (
        db.query(models.TeamMemberDevice)
        .filter(models.TeamMemberDevice.id == device_id, models.TeamMemberDevice.member_id == member_id)
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    d.status = new_status
    db.commit()
    log_team_event(
        db, "DEVICE_APPROVED" if new_status == "approved" else "DEVICE_REVOKED",
        f"Dispositivo '{d.device_name}' de '{m.username}' -> {new_status}.", request=request, actor="leader",
        member_id=m.id, member_name=m.display_name, category="TEAM_ADMIN",
        severity="SUCCESS" if new_status == "approved" else "CRITICAL", status_code=200,
    )
    return {"success": True, "status": new_status}


@admin_router.post("/members/{member_id}/devices/{device_id}/approve")
def approve_member_device(member_id: int, device_id: str, request: Request, db=Depends(get_unscoped_team_db)):
    return _set_device_status(db, request, member_id, device_id, "approved")


@admin_router.post("/members/{member_id}/devices/{device_id}/revoke")
def revoke_member_device(member_id: int, device_id: str, request: Request, db=Depends(get_unscoped_team_db)):
    return _set_device_status(db, request, member_id, device_id, "revoked")


@admin_router.get("/audit-logs", response_model=List[ts.TeamAuditLogResponse])
def team_audit_logs(member_id: Optional[int] = None, limit: int = 100, db=Depends(get_unscoped_team_db)):
    q = db.query(models.TeamAuditLog)
    if member_id is not None:
        q = q.filter(models.TeamAuditLog.member_id == member_id)
    return q.order_by(models.TeamAuditLog.created_at.desc()).limit(min(max(1, limit), 300)).all()


@admin_router.get("/summary")
def team_summary(db=Depends(get_unscoped_team_db)):
    """Painel consolidado: situação das demandas e dos fluxos de hoje por liderado."""
    today = date.today().isoformat()
    result = []
    for m in db.query(models.TeamMember).order_by(models.TeamMember.id.asc()).all():
        counts = dict(
            db.query(models.Task.status, func.count(models.Task.id))
            .filter(models.Task.member_id == m.id).group_by(models.Task.status).all()
        )
        blocks = db.query(models.TimelineBlock).filter(
            models.TimelineBlock.member_id == m.id, models.TimelineBlock.date_str == today
        ).all()
        running = db.query(models.Task).filter(
            models.Task.member_id == m.id, models.Task.timer_status == "running").count()
        devs = db.query(models.TeamMemberDevice).filter(models.TeamMemberDevice.member_id == m.id).all()
        pending_devs = sum(1 for d in devs if d.status == "pending_approval")
        total_tasks = sum(counts.values())

        result.append({
            "id": m.id,
            "username": m.username,
            "full_name": m.display_name,
            "display_name": m.display_name,
            "role": m.role_title or "Membro",
            "role_title": m.role_title or "Membro",
            "is_active": bool(m.is_active),
            "devices_count": len(devs),
            "devices_total": len(devs),
            "pending_devices_count": pending_devs,
            "devices_pending": pending_devs,
            "tasks_count": total_tasks,
            "completed_tasks_count": counts.get("completed", 0),
            "in_progress_tasks_count": counts.get("in_progress", 0),
            "member": _member_dict(db, m),
            "tasks": {"pending": counts.get("pending", 0), "in_progress": counts.get("in_progress", 0),
                      "completed": counts.get("completed", 0)},
            "timers_running": running,
            "today_blocks_total": len(blocks),
            "today_blocks_completed": sum(1 for b in blocks if b.status == "completed"),
        })
    return result


def mount_team_routers(app):
    """Registra os roteadores da equipe ANTES do catch-all do SPA."""
    from security.team_auth import router as team_auth_router

    app.include_router(team_auth_router)
    app.include_router(admin_router)
    app.include_router(scoped_router, prefix="/team-portal", dependencies=[Depends(member_scope_dependency)])
    app.include_router(scoped_router, prefix="/team-admin", dependencies=[Depends(leader_scope_dependency)])
