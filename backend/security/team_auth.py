"""
Autenticação do portal da Equipe (/team-auth/*) e dependências de escopo.

Circuito TOTALMENTE separado do Zero-Trust pessoal:
- Segredo JWT próprio (HKDF 'synaptix-team-member-jwt-v1') e cookie próprio.
- Credenciais (scrypt) + dispositivo ECDSA P-256 do liderado (tabela team_member_devices).
- Toda requisição ao portal exige: cookie JWT válido + assinatura ECDSA do dispositivo (anti-replay).
- Nenhum acesso ao banco pessoal (synaptix.db).
"""
import hashlib
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool

import team_models as tm
import team_schemas as ts
from security.auth import get_client_ip, is_https_request, verify_authorized_device
from security.crypto import (
    compute_public_key_fingerprint,
    get_team_jwt_signing_key,
    hash_team_password,
    verify_device_signature,
    verify_team_password,
)
from team_database import TeamScope, TeamSessionLocal, current_scope, get_unscoped_team_db

logger = logging.getLogger("synaptix.security.team_auth")

router = APIRouter(prefix="/team-auth", tags=["Team Auth"])

TEAM_COOKIE_NAME = "synaptix_team_session"
SESSION_TTL_HOURS = 12
SIGNATURE_MAX_SKEW_SECONDS = 300
MAX_USER_FAILURES = 5
USER_LOCK_MINUTES = 15
MAX_IP_FAILURES = 60
IP_BAN_SECONDS = 120

_USED_NONCES: Dict[str, float] = {}
_IP_FAILURES: Dict[str, List[float]] = {}
_IP_BANS: Dict[str, float] = {}
_RATE: Dict[str, List[float]] = {}

def reset_all_team_ip_bans():
    _IP_BANS.clear()
    _IP_FAILURES.clear()
    _RATE.clear()

_DUMMY_HASH = hash_team_password("dummy-password-for-timing-equalization")


# ------------------------------------------------------------------------------ utilidades
def _rate_limit(request: Request, bucket: str, limit_per_min: int):
    now = time.time()
    ip = get_client_ip(request)
    ban = _IP_BANS.get(ip)
    if ban:
        if now < ban:
            raise HTTPException(status_code=429, detail="IP temporariamente bloqueado. Tente novamente em instantes.")
        del _IP_BANS[ip]
    key = f"{ip}:{bucket}"
    stamps = [t for t in _RATE.get(key, []) if now - t < 60.0]
    if len(stamps) >= limit_per_min:
        raise HTTPException(status_code=429, detail="Limite de requisições excedido. Aguarde alguns segundos.")
    stamps.append(now)
    _RATE[key] = stamps


def _register_ip_failure(ip: str):
    now = time.time()
    fails = [t for t in _IP_FAILURES.get(ip, []) if now - t < 300] + [now]
    _IP_FAILURES[ip] = fails
    if len(fails) >= MAX_IP_FAILURES:
        _IP_BANS[ip] = now + IP_BAN_SECONDS


def _consume_nonce(scope_key: str, timestamp_str: str, nonce: str) -> bool:
    try:
        ts_val = float(timestamp_str)
    except ValueError:
        return False
    now = time.time()
    if abs(now - ts_val) > SIGNATURE_MAX_SKEW_SECONDS:
        return False
    if len(_USED_NONCES) > 4000:
        for k in [k for k, exp in _USED_NONCES.items() if exp < now]:
            del _USED_NONCES[k]
    key = f"{scope_key}:{nonce}"
    if _USED_NONCES.get(key, 0) > now:
        return False
    _USED_NONCES[key] = now + SIGNATURE_MAX_SKEW_SECONDS * 2
    return True


def log_team_event(
    db, event_type: str, details: str, *, request: Optional[Request] = None, actor: str = "system",
    member_id: Optional[int] = None, member_name: Optional[str] = None,
    category: str = "TEAM_AUTH", severity: str = "INFO", status_code: Optional[int] = None,
):
    try:
        db.add(tm.TeamAuditLog(
            member_id=member_id, actor=actor, member_name=member_name, event_type=event_type,
            category=category, severity=severity,
            ip_address=get_client_ip(request) if request else None,
            http_method=request.method.upper() if request else None,
            endpoint=request.url.path if request else None,
            status_code=status_code, details=details,
        ))
        db.commit()
    except Exception as e:  # nunca derruba a requisição por falha de auditoria
        logger.error(f"Erro ao gravar auditoria da equipe: {e}")
        db.rollback()


def _issue_cookie(response: Response, request: Request, member: tm.TeamMember, device_id: str) -> str:
    now_ts = int(time.time())  # epoch real (utcnow().timestamp() geraria iat no futuro fora de UTC)
    token = jwt.encode(
        {
            "sub": str(member.id), "did": device_id, "tv": member.token_version or 1,
            "iat": now_ts, "exp": now_ts + SESSION_TTL_HOURS * 3600,
            "aud": "synaptix-team",
        },
        get_team_jwt_signing_key(), algorithm="HS256",
    )
    response.set_cookie(
        key=TEAM_COOKIE_NAME, value=token, httponly=True, secure=is_https_request(request),
        samesite="lax", max_age=SESSION_TTL_HOURS * 3600, path="/",
    )
    return token


def _member_public(m: tm.TeamMember) -> dict:
    return {
        "id": m.id, "username": m.username, "display_name": m.display_name,
        "role_title": m.role_title, "avatar_color": m.avatar_color or "#6366f1",
    }


# ------------------------------------------------------------------------------ autenticação da requisição
def authenticate_member_request(request: Request) -> Tuple[dict, dict]:
    """Valida cookie JWT da equipe + assinatura ECDSA do dispositivo. Síncrona (usa o banco da equipe)."""
    _rate_limit(request, "portal", 300)
    ip = get_client_ip(request)

    def deny(detail: str, log: bool = True):
        _register_ip_failure(ip)
        if log:
            with TeamSessionLocal(scope=None) as adb:
                adb.info["scope"] = None
                log_team_event(adb, "PORTAL_ACCESS_DENIED", f"{detail} em {request.method} {request.url.path}",
                               request=request, severity="WARNING", status_code=401)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão da equipe inválida ou expirada.")

    token = request.cookies.get(TEAM_COOKIE_NAME)
    if not token:
        auth_hdr = request.headers.get("Authorization") or ""
        if auth_hdr.lower().startswith("bearer "):
            token = auth_hdr[7:].strip()
    device_id = request.headers.get("X-Synaptix-Team-Device-Id")
    ts_hdr = request.headers.get("X-Synaptix-Team-Timestamp")
    nonce = request.headers.get("X-Synaptix-Team-Nonce")
    signature = request.headers.get("X-Synaptix-Team-Signature")
    if not (token and device_id and ts_hdr and nonce and signature):
        deny("Credenciais de sessão/assinatura ausentes", log=False)

    try:
        claims = jwt.decode(token, get_team_jwt_signing_key(), algorithms=["HS256"], audience="synaptix-team")
        member_id = int(claims["sub"])
    except Exception:
        deny("Token de sessão inválido/expirado")

    token_did = claims.get("did")
    if device_id in ("pending-enrollment", None, "") and token_did:
        device_id = token_did
    elif token_did and device_id != token_did:
        deny("Dispositivo diverge do token de sessão")

    with TeamSessionLocal(scope=None) as db:
        db.info["scope"] = None
        member = db.query(tm.TeamMember).filter(tm.TeamMember.id == member_id).first()
        device = db.query(tm.TeamMemberDevice).filter(tm.TeamMemberDevice.id == device_id).first()
        if (
            not member or not member.is_active
            or (member.token_version or 1) != claims.get("tv")
            or not device or device.member_id != member.id or device.status != "approved"
        ):
            deny("Membro/dispositivo inativo, revogado ou sessão invalidada")

        if not _consume_nonce(device_id, ts_hdr, nonce):
            deny("Nonce repetido ou timestamp fora de sincronia (anti-replay)")
        canonical = f"{device_id}:{ts_hdr}:{nonce}:{request.method.upper()}:{request.url.path}"
        orig_hdr_did = request.headers.get("X-Synaptix-Team-Device-Id")
        if not verify_device_signature(device.public_key_jwk, signature, canonical):
            if orig_hdr_did and orig_hdr_did != device_id:
                alt_canonical = f"{orig_hdr_did}:{ts_hdr}:{nonce}:{request.method.upper()}:{request.url.path}"
                if not verify_device_signature(device.public_key_jwk, signature, alt_canonical):
                    deny("Assinatura ECDSA do dispositivo inválida")
            else:
                deny("Assinatura ECDSA do dispositivo inválida")

        device.last_ip = ip
        device.last_seen_at = datetime.utcnow()
        db.commit()
        return (
            {"id": member.id, "username": member.username, "display_name": member.display_name,
             "role_title": member.role_title, "avatar_color": member.avatar_color or "#6366f1"},
            {"id": device.id, "device_name": device.device_name},
        )


async def member_scope_dependency(request: Request):
    """Dependência do portal /team-portal/*: autentica o liderado e fixa o escopo (fail-closed)."""
    member, device = await run_in_threadpool(authenticate_member_request, request)
    scope = TeamScope(role="member", mode="member", member_id=member["id"], actor="member")
    request.state.team_scope = scope
    request.state.team_member = member
    request.state.team_device = device
    current_scope.set(scope)
    return scope


async def leader_scope_dependency(request: Request, _device=Depends(verify_authorized_device)):
    """
    Dependência de /team-admin/*: SOMENTE dispositivo ECDSA do Líder (verify_authorized_device).
    O contexto de visão vem do cabeçalho X-Team-Scope: all | shared-rw | shared-ro | member:<id>.
    """
    raw = (request.headers.get("X-Team-Scope") or "all").strip().lower()
    if raw == "all":
        scope = TeamScope(role="leader", mode="all", actor="leader")
    elif raw in ("shared-rw", "shared-ro"):
        scope = TeamScope(role="leader", mode="shared", shared_readonly=(raw == "shared-ro"), actor="leader")
    elif raw.startswith("member:") and raw[7:].isdigit():
        member_id = int(raw[7:])

        def _exists() -> bool:
            with TeamSessionLocal(scope=None) as db:
                db.info["scope"] = None
                return db.query(tm.TeamMember.id).filter(tm.TeamMember.id == member_id).first() is not None

        if not await run_in_threadpool(_exists):
            raise HTTPException(status_code=404, detail="Liderado não encontrado.")
        scope = TeamScope(role="leader", mode="member", member_id=member_id, actor="leader")
    else:
        raise HTTPException(status_code=400, detail="Cabeçalho X-Team-Scope inválido.")
    request.state.team_scope = scope
    current_scope.set(scope)
    return scope


def get_team_db(request: Request):
    """Sessão do banco da equipe SEMPRE vinculada ao escopo autenticado (fail-closed)."""
    scope: Optional[TeamScope] = getattr(request.state, "team_scope", None)
    if scope is None:
        raise HTTPException(status_code=401, detail="Escopo da equipe não estabelecido.")
    db = TeamSessionLocal(scope=scope)
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------------------ rotas públicas de login
@router.post("/login")
def team_login(payload: ts.TeamLoginRequest, request: Request, response: Response):
    _rate_limit(request, "team_login", 60)
    ip = get_client_ip(request)
    generic = HTTPException(status_code=401, detail="Usuário ou senha inválidos.")

    with TeamSessionLocal(scope=None) as db:
        db.info["scope"] = None
        username = payload.username.strip().lower()
        member = db.query(tm.TeamMember).filter(tm.TeamMember.username == username).first()

        now = datetime.utcnow()
        if member and member.locked_until and member.locked_until > now:
            verify_team_password(payload.password, _DUMMY_HASH)
            raise HTTPException(status_code=429, detail="Conta temporariamente bloqueada por tentativas inválidas.")

        password_ok = verify_team_password(payload.password, member.password_hash if member else _DUMMY_HASH)

        # Prova de posse da chave privada do dispositivo (quando fornecida)
        if payload.signature and payload.timestamp and payload.nonce and payload.public_key_jwk:
            canonical = f"team-login:{username}:{payload.timestamp}:{payload.nonce}"
            pop_ok = (
                _consume_nonce(f"login:{username}", payload.timestamp, payload.nonce)
                and verify_device_signature(payload.public_key_jwk, payload.signature, canonical)
            )
        else:
            pop_ok = True

        if not member:
            _register_ip_failure(ip)
            log_team_event(db, "LOGIN_FAILED", f"Usuário '{username}' não encontrado no cofre da equipe.", request=request,
                           actor="member", severity="WARNING", status_code=401)
            raise HTTPException(status_code=401, detail="Usuário não encontrado.")

        if not member.is_active:
            _register_ip_failure(ip)
            log_team_event(db, "LOGIN_FAILED", f"Liderado '{username}' com acesso desativado tentou efetuar login.", request=request,
                           actor="member", member_id=member.id, member_name=member.display_name,
                           severity="WARNING", status_code=403)
            raise HTTPException(status_code=403, detail="Acesso deste liderado está desativado pelo Líder. Entre em contato com seu gestor.")

        if not password_ok:
            _register_ip_failure(ip)
            member.failed_attempts = (member.failed_attempts or 0) + 1
            if member.failed_attempts >= MAX_USER_FAILURES:
                member.locked_until = now + timedelta(minutes=USER_LOCK_MINUTES)
                member.failed_attempts = 0
            db.commit()
            log_team_event(db, "LOGIN_FAILED", f"Senha incorreta para '{username}'. Tentativas: {member.failed_attempts}.", request=request,
                           actor="member", member_id=member.id, member_name=member.display_name,
                           severity="WARNING", status_code=401)
            raise HTTPException(status_code=401, detail="Senha incorreta.")

        if not pop_ok:
            _register_ip_failure(ip)
            log_team_event(db, "LOGIN_FAILED", f"Assinatura do dispositivo ou horário fora de sincronia para '{username}'.", request=request,
                           actor="member", member_id=member.id, member_name=member.display_name,
                           severity="WARNING", status_code=401)
            raise HTTPException(status_code=401, detail="Assinatura de segurança ou horário do dispositivo fora de sincronia. Verifique o relógio do seu dispositivo.")

        device_name = unquote(payload.device_name or "Dispositivo Liderado").strip() or "Dispositivo Liderado"

        if payload.public_key_jwk:
            try:
                fp = compute_public_key_fingerprint(payload.public_key_jwk)
            except Exception:
                raise HTTPException(status_code=400, detail="Chave pública inválida.")

            device = db.query(tm.TeamMemberDevice).filter(tm.TeamMemberDevice.fingerprint_sha256 == fp).first()
            if device and device.member_id != member.id:
                # O mesmo navegador/dispositivo foi utilizado por outro membro anteriormente.
                # Como o usuário autenticou a senha corretamente, desvinculamos a chave antiga do membro anterior
                # ou transferimos o vínculo para o membro atual para não travar o login no navegador compartilhado.
                old_member_id = device.member_id
                device.member_id = member.id
                device.device_name = device_name
                device.status = "pending_approval" if member.require_device_approval else "approved"
                device.last_ip = ip
                device.user_agent = request.headers.get("User-Agent", "Unknown")
                db.commit()
                log_team_event(
                    db, "DEVICE_REASSIGNED",
                    f"Dispositivo '{device_name}' transferido de membro #{old_member_id} para '{member.username}' (#{member.id}) ({device.status}).",
                    request=request, actor="member", member_id=member.id, member_name=member.display_name,
                    severity="INFO", status_code=200,
                )

            if device is None:
                device = tm.TeamMemberDevice(
                    id=str(uuid.uuid4()), member_id=member.id,
                    device_name=device_name,
                    public_key_jwk=payload.public_key_jwk, fingerprint_sha256=fp,
                    status="pending_approval" if member.require_device_approval else "approved",
                    user_agent=request.headers.get("User-Agent", "Unknown"), last_ip=ip,
                )
                db.add(device)
                db.commit()
                log_team_event(
                    db, "DEVICE_REGISTERED",
                    f"Novo dispositivo '{device.device_name}' de '{member.username}' ({device.status}).",
                    request=request, actor="member", member_id=member.id, member_name=member.display_name,
                    severity="WARNING" if device.status != "approved" else "INFO", status_code=200,
                )
        else:
            device = db.query(tm.TeamMemberDevice).filter(tm.TeamMemberDevice.member_id == member.id).first()
            if device is None:
                dummy_fp = hashlib.sha256(f"{member.id}:fallback:{ip}".encode()).hexdigest()
                device = tm.TeamMemberDevice(
                    id=str(uuid.uuid4()), member_id=member.id,
                    device_name=device_name,
                    public_key_jwk="", fingerprint_sha256=dummy_fp,
                    status="approved",
                    user_agent=request.headers.get("User-Agent", "Unknown"), last_ip=ip,
                )
                db.add(device)
                db.commit()

        if device.status == "revoked":
            raise HTTPException(status_code=403, detail="Este dispositivo foi revogado pelo Líder.")
        if device.status != "approved":
            return {"status": "pending_approval", "device_id": device.id,
                    "message": "Dispositivo aguardando aprovação do Líder."}

        member.failed_attempts = 0
        member.locked_until = None
        member.last_login_at = now
        device.last_ip = ip
        device.last_seen_at = now
        db.commit()
        token = _issue_cookie(response, request, member, device.id)
        log_team_event(db, "LOGIN_SUCCESS", f"Login de '{member.username}' no dispositivo '{device.device_name}'.",
                       request=request, actor="member", member_id=member.id, member_name=member.display_name,
                       severity="SUCCESS", status_code=200)
        return {
            "status": "approved",
            "token": token,
            "device_id": device.id,
            "member_id": member.id,
            "username": member.username,
            "full_name": member.display_name,
            "role": member.role_title or "Membro",
            "must_change_password": bool(getattr(member, "must_change_password", False)),
            "member": _member_public(member),
        }


@router.get("/status")
def team_status(request: Request):
    """Nunca devolve 401: informa apenas se há sessão válida (o front decide mostrar o login)."""
    try:
        member, device = authenticate_member_request(request)
        return {"authorized": True, "member": member, "device": device}
    except HTTPException as e:
        if e.status_code == 429:
            raise
        return {"authorized": False, "member": None, "device": None}


@router.post("/logout")
def team_logout(request: Request, response: Response):
    response.delete_cookie(TEAM_COOKIE_NAME, path="/")
    return {"success": True}


@router.post("/unban-ips")
def team_unban_ips(request: Request):
    reset_all_team_ip_bans()
    return {"success": True, "message": "Todos os bloqueios temporários de IP da equipe foram liberados."}


@router.post("/change-password")
async def team_change_password(payload: ts.TeamPasswordChange, request: Request, response: Response):
    member, device = await run_in_threadpool(authenticate_member_request, request)
    curr_pwd = payload.current_password or payload.old_password
    if not curr_pwd:
        raise HTTPException(status_code=400, detail="Informe a senha atual.")

    def _change():
        with TeamSessionLocal(scope=None) as db:
            db.info["scope"] = None
            m = db.query(tm.TeamMember).filter(tm.TeamMember.id == member["id"]).first()
            if not m or not verify_team_password(curr_pwd, m.password_hash):
                raise HTTPException(status_code=400, detail="Senha atual incorreta.")
            m.password_hash = hash_team_password(payload.new_password)
            m.token_version = (m.token_version or 1) + 1
            db.commit()
            log_team_event(db, "PASSWORD_CHANGED", "Senha alterada pelo próprio liderado.", request=request,
                           actor="member", member_id=m.id, member_name=m.display_name, severity="INFO", status_code=200)
            db.refresh(m)
            return m.id, m.token_version

    mid, tv = await run_in_threadpool(_change)
    # reemite a sessão com a nova versão do token
    class _M:  # estrutura mínima para _issue_cookie
        id = mid
        token_version = tv
    new_token = _issue_cookie(response, request, _M, device["id"])  # type: ignore[arg-type]
    return {"success": True, "token": new_token}

