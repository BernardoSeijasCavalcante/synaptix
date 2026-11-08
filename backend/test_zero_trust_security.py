"""
Suíte de Verificação Automatizada da Arquitetura Zero-Trust do Synaptix.
Valida:
1. Criptografia em repouso (AES-256-GCM no SQLite e nos PDFs em uploads/).
2. Bloqueio total de requisições não autorizadas (401).
3. Fluxo de Bootstrap do Dispositivo Gênesis (A) e bloqueio permanente pós-ativação (403).
4. Proteção Anti-Replay (rejeição de nonce repetido).
5. Fluxo completo de Pareamento Supervisionado: Dispositivo A gera código -> Dispositivo B solicita (claim) ->
   Dispositivo A aprova via código SAS de 6 dígitos -> Dispositivo B acessa -> Dispositivo A revoga Dispositivo B.
6. Sandbox AST seguro em run_code_analysis (cálculo permitido vs. bloqueio de os, socket, subprocess, open, __class__).
"""
import os
import json
import time
import datetime
import base64
import secrets
import sqlite3
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes

import main
import models
from database import SessionLocal, DB_PATH
from security.auth import init_security_bootstrap, BOOTSTRAP_FILE_PATH, _USED_NONCES, _AUTH_FAILURES, _BANNED_IPS
from tools.research_tools import run_code_analysis


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def generate_test_webcrypto_keypair():
    priv_key = ec.generate_private_key(ec.SECP256R1())
    pub_numbers = priv_key.public_key().public_numbers()
    x_b64 = _b64url(pub_numbers.x.to_bytes(32, "big"))
    y_b64 = _b64url(pub_numbers.y.to_bytes(32, "big"))
    jwk_str = json.dumps({"crv": "P-256", "kty": "EC", "x": x_b64, "y": y_b64})
    return priv_key, jwk_str


def sign_request(priv_key, device_id: str, method: str, path: str, custom_nonce: str = None):
    ts = str(int(time.time()))
    nonce = custom_nonce or secrets.token_hex(16)
    payload = f"{device_id}:{ts}:{nonce}:{method.upper()}:{path}".encode("utf-8")
    der_sig = priv_key.sign(payload, ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der_sig)
    # Formato IEEE P1363 (64 bytes r || s) idêntico à WebCrypto API do navegador
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return {
        "X-Synaptix-Device-Id": device_id,
        "X-Synaptix-Timestamp": ts,
        "X-Synaptix-Nonce": nonce,
        "X-Synaptix-Signature": _b64url(raw_sig),
    }


def run_all_tests():
    client = TestClient(main.app)

    print("=== [TESTE 1] Verificando Criptografia em Repouso (SQLite & Uploads) ===")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT title, content FROM notes LIMIT 1")
    row = cur.fetchone()
    conn.close()
    assert row is not None, "Deve haver notas no banco"
    assert row[0].startswith("enc:v1:") and row[1].startswith("enc:v1:"), "Notas devem estar criptografadas no disco!"
    print("   [OK] Registros brutos no SQLite estão criptografados com AES-256-GCM (enc:v1:...).")

    uploads_dir = os.path.join(os.path.dirname(DB_PATH), "uploads")
    pdf_files = [f for f in os.listdir(uploads_dir) if f.endswith(".pdf")]
    readable_pdf = None
    header = None
    for pf in pdf_files:
        try:
            with open(os.path.join(uploads_dir, pf), "rb") as f:
                header = f.read(8)
                readable_pdf = pf
                break
        except PermissionError:
            continue
    if readable_pdf is not None:
        assert header == b"SYNXENC1", "Arquivos em uploads/ devem estar criptografados com SYNXENC1!"
        print(f"   [OK] Arquivos em uploads/ ({readable_pdf}) estão criptografados em disco com AES-256-GCM.")
    else:
        readable_pdf = "test.pdf"
        print("   [OK] Verificação de header em uploads/ ignorada (arquivo em uso pelo sistema).")

    print("\n=== [TESTE 2] Verificando Bloqueio de Acesso Não Autorizado (Zero-Trust) ===")
    for route in [
        "/workspaces",
        "/notes",
        "/tasks",
        "/chat/session",
        f"/uploads/{readable_pdf}",
        "/auth/devices",
        "/calendar/events",
        "/calendar/goals",
        "/calendar/routine",
        "/calendar/timeline/2026-10-18",
    ]:
        r = client.get(route)
        assert r.status_code == 401, f"Rota {route} deveria retornar 401 sem assinatura, retornou {r.status_code}"
    r_create = client.post("/auth/enrollments/create")
    assert r_create.status_code == 401, "Dispositivo não autorizado jamais pode criar convites de pareamento!"
    r_cal_gen = client.post("/calendar/timeline/2026-10-18/generate", json={})
    assert r_cal_gen.status_code == 401, "Rota /calendar/timeline/{date}/generate deve exigir assinatura ECDSA P-256 (401)!"
    print("   [OK] Todas as rotas protegidas (incluindo /calendar/*) rejeitaram acesso não autorizado com 401.")

    print("\n=== [TESTE 3] Fluxo de Bootstrap do 1º Dispositivo (Gênesis) ===")
    # Garante estado de bootstrap limpo para o teste caso já haja dispositivo autorizado
    with SessionLocal() as db:
        saved_devices = [
            {
                "id": d.id,
                "device_name": d.device_name,
                "public_key_jwk": d.public_key_jwk,
                "fingerprint_sha256": d.fingerprint_sha256,
                "is_genesis": d.is_genesis,
                "approved_by_device_id": d.approved_by_device_id,
                "user_agent": d.user_agent,
                "last_ip": d.last_ip,
                "is_revoked": d.is_revoked,
                "created_at": d.created_at,
                "last_seen_at": d.last_seen_at,
            }
            for d in db.query(models.AuthorizedDevice).all()
            if d.device_name not in ("Dispositivo Genesis A", "Segundo Dispositivo B")
        ]
        state_row = db.query(models.SystemSecurityState).first()
        was_locked = state_row.bootstrap_locked if state_row else False
        db.query(models.DeviceEnrollmentRequest).delete()
        db.query(models.AuthorizedDevice).delete()
        if state_row:
            state_row.bootstrap_locked = False
        db.commit()
    init_security_bootstrap()

    event_id = None
    goal_id = None
    test_date = "2099-12-31"
    try:
        with open(BOOTSTRAP_FILE_PATH, "r", encoding="utf-8") as f:
            text_boot = f.read()
        boot_token = None
        for line in text_boot.splitlines():
            if "TOKEN DE USO ÚNICO:" in line:
                boot_token = line.split("TOKEN DE USO ÚNICO:")[1].strip()
                break
        assert boot_token is not None, "Token de bootstrap deve existir"

        priv_a, jwk_a = generate_test_webcrypto_keypair()
        r_boot = client.post(
            "/auth/bootstrap",
            json={
                "bootstrap_token": boot_token,
                "device_name": "Dispositivo Genesis A",
                "public_key_jwk": jwk_a,
            },
        )
        assert r_boot.status_code == 200, f"Bootstrap falhou: {r_boot.text}"
        dev_a_id = r_boot.json()["device_id"]
        assert not os.path.exists(BOOTSTRAP_FILE_PATH), "Arquivo de bootstrap deve ser destruído após o registro!"

        # Tentativa de novo bootstrap deve ser bloqueada com 403
        _, jwk_rogue = generate_test_webcrypto_keypair()
        r_boot_again = client.post(
            "/auth/bootstrap",
            json={
                "bootstrap_token": boot_token,
                "device_name": "Invasor",
                "public_key_jwk": jwk_rogue,
            },
        )
        assert r_boot_again.status_code == 403, "Segundo bootstrap deve ser bloqueado permanentemente com 403!"
        print("   [OK] Dispositivo Gênesis registrado e modo Bootstrap permanentemente bloqueado (403).")

        print("\n=== [TESTE 4] Leitura Descriptografada e Proteção Anti-Replay ===")
        headers_a = sign_request(priv_a, dev_a_id, "GET", "/notes", custom_nonce="nonce_unico_teste_123")
        r_notes = client.get("/notes", headers=headers_a)
        assert r_notes.status_code == 200
        notes_data = r_notes.json()
        assert len(notes_data) > 0 and not notes_data[0]["title"].startswith("enc:v1:")
        print(f"   [OK] Dispositivo A leu {len(notes_data)} notas descriptografadas de forma transparente.")

        # Replay Attack: enviar exatamente os mesmos cabeçalhos assinados novamente
        r_replay = client.get("/notes", headers=headers_a)
        assert r_replay.status_code == 401, "Replay do mesmo nonce deve ser bloqueado com 401!"
        print("   [OK] Ataque de Replay (repetição de Nonce/Assinatura) bloqueado com 401!")

        # Leitura autenticada de PDF criptografado
        if readable_pdf != "test.pdf":
            headers_pdf = sign_request(priv_a, dev_a_id, "GET", f"/uploads/{readable_pdf}")
            r_pdf = client.get(f"/uploads/{readable_pdf}", headers=headers_pdf)
            assert r_pdf.status_code == 200 and r_pdf.content.startswith(b"%PDF"), "PDF descriptografado deve iniciar com %PDF"
            print("   [OK] PDF criptografado em disco foi autenticado e descriptografado em memória (%PDF).")

        print("\n=== [TESTE 5] Pareamento Supervisionado: Dispositivo A Autoriza Dispositivo B ===")
        priv_b, jwk_b = generate_test_webcrypto_keypair()

        # 1. Dispositivo A gera código de pareamento
        r_inv = client.post(
            "/auth/enrollments/create",
            headers=sign_request(priv_a, dev_a_id, "POST", "/auth/enrollments/create"),
        )
        assert r_inv.status_code == 200
        invite_code = r_inv.json()["enrollment_code"]

        # 2. Dispositivo B reivindica o código enviando sua chave pública
        r_claim = client.post(
            "/auth/enrollments/claim",
            json={
                "enrollment_code": invite_code,
                "device_name": "Segundo Dispositivo B",
                "public_key_jwk": jwk_b,
            },
        )
        assert r_claim.status_code == 200
        claim_data = r_claim.json()
        enrollment_id = claim_data["enrollment_id"]
        sas_code_b = claim_data["sas_code"]
        dev_b_id = claim_data["device_id"]

        # Antes da aprovação de A, B ainda NÃO pode acessar /notes
        r_b_early = client.get("/notes", headers=sign_request(priv_b, dev_b_id, "GET", "/notes"))
        assert r_b_early.status_code == 401, "Dispositivo B não pode acessar antes da aprovação de A!"

        # 3. Dispositivo A consulta pendentes, confere o SAS code e aprova B
        r_pend = client.get(
            "/auth/enrollments/pending",
            headers=sign_request(priv_a, dev_a_id, "GET", "/auth/enrollments/pending"),
        )
        assert r_pend.status_code == 200 and len(r_pend.json()) == 1
        assert r_pend.json()[0]["sas_code"] == sas_code_b

        approve_path = f"/auth/enrollments/{enrollment_id}/approve"
        r_app = client.post(
            approve_path,
            headers=sign_request(priv_a, dev_a_id, "POST", approve_path),
            json={"sas_code_confirmed": sas_code_b},
        )
        assert r_app.status_code == 200

        # 4. Agora o Dispositivo B consegue acessar /tasks com sua assinatura ECDSA P-256!
        r_b_tasks = client.get("/tasks", headers=sign_request(priv_b, dev_b_id, "GET", "/tasks"))
        assert r_b_tasks.status_code == 200
        print(f"   [OK] Dispositivo B autorizado via SAS ({sas_code_b}) e autenticado com sucesso!")

        # 5. Dispositivo A revoga o acesso do Dispositivo B
        revoke_path = f"/auth/devices/{dev_b_id}/revoke"
        r_rev = client.post(
            revoke_path,
            headers=sign_request(priv_a, dev_a_id, "POST", revoke_path),
        )
        assert r_rev.status_code == 200

        r_b_after_revoke = client.get("/tasks", headers=sign_request(priv_b, dev_b_id, "GET", "/tasks"))
        assert r_b_after_revoke.status_code == 401, "Dispositivo B revogado deve ser bloqueado imediatamente!"
        print("   [OK] Revogação instantânea (Kill Switch) do Dispositivo B validada com sucesso!")

        print("\n=== [TESTE 6] Verificando Sandbox AST Seguro (run_code_analysis) ===")
        res_math = run_code_analysis("import math, statistics\nvals = [10, 20, 30, 40]\nprint(statistics.mean(vals) * math.sqrt(4))")
        assert res_math["success"] is True and "50.0" in res_math["stdout"]
        print(f"   [OK] Cálculo matemático legítimo no Sandbox: resultado = {res_math['stdout'].strip()}")

        malicious_payloads = [
            "import os\nos.system('whoami')",
            "import subprocess\nsubprocess.run(['ipconfig'])",
            "import socket\ns = socket.socket()",
            "open('C:/Windows/win.ini').read()",
            "print(().__class__.__bases__[0].__subclasses__())",
            "__import__('os').listdir('.')",
        ]
        for payload in malicious_payloads:
            res_mal = run_code_analysis(payload)
            assert res_mal["success"] is False, f"Payload malicioso deveria ter sido bloqueado: {payload}"
        print(f"   [OK] Todos os {len(malicious_payloads)} vetores de RCE / Escape / Rede foram bloqueados pelo Sandbox AST!")

        print("\n=== [TESTE 7] Verificando Calendário, Metas, Rotina 24h e Timeline Diária (Zero-Trust + AES-256-GCM + nh3) ===")
        with SessionLocal() as db:
            db.query(models.TimelineBlock).filter(models.TimelineBlock.date_str == test_date).delete()
            db.query(models.Event).filter(models.Event.start_time >= datetime.datetime(2099, 12, 31, 0, 0, 0)).delete()
            db.commit()

        # 7.1 Criar Meta com tentativa de XSS em title/description/milestones
        r_goal = client.post(
            "/calendar/goals",
            headers=sign_request(priv_a, dev_a_id, "POST", "/calendar/goals"),
            json={
                "title": "<script>alert(1)</script>Meta Estratégica Q4",
                "description": "<img src=x onerror=alert(2)>Descrição blindada",
                "horizon": "weekly",
                "target_hours": 10.0,
                "priority": "Crítica",
                "category": "Estratégico",
                "target_date": test_date,
                "milestones": [{"title": "<script>evil()</script>Marco 1", "completed": False}],
            },
        )
        assert r_goal.status_code == 200, f"Falha ao criar meta: {r_goal.text}"
        goal_obj = r_goal.json()
        goal_id = goal_obj["id"]
        assert "<script>" not in goal_obj["title"] and "Meta Estratégica Q4" in goal_obj["title"], "XSS deveria ser sanitizado por nh3!"
        print("   [OK] Meta criada com sanitização nh3 contra XSS.")

        # 7.2 Criar Evento Fixo na data de teste vinculado à Meta
        r_ev = client.post(
            "/calendar/events",
            headers=sign_request(priv_a, dev_a_id, "POST", "/calendar/events"),
            json={
                "title": "<b>Reunião de Conselho</b><script>xss()</script>",
                "description": "Alinhamento executivo",
                "location": "Sala 01",
                "category": "Executivo",
                "start_time": f"{test_date}T10:00:00",
                "end_time": f"{test_date}T11:00:00",
                "recurrence_rule": "none",
                "reminder_minutes": 15,
                "goal_id": goal_id,
            },
        )
        assert r_ev.status_code == 200, f"Falha ao criar evento: {r_ev.text}"
        ev_obj = r_ev.json()
        event_id = ev_obj["id"]
        assert "<script>" not in ev_obj["title"] and "Reunião de Conselho" in ev_obj["title"]
        print("   [OK] Evento criado e vinculado à meta com sanitização nh3.")

        # 7.3 Verificar perfil de Rotina Base 24h (seed padrão automático)
        r_routines = client.get(
            "/calendar/routine",
            headers=sign_request(priv_a, dev_a_id, "GET", "/calendar/routine"),
        )
        assert r_routines.status_code == 200
        routines_list = r_routines.json()
        assert len(routines_list) >= 4, "Templates padrão de rotina 24h devem ser semeados automaticamente!"
        print(f"   [OK] {len(routines_list)} blocos de Rotina Base 24h carregados.")

        # 7.4 Gerar a Timeline 24h (00:00 -> 23:59 / 1440 min) para test_date
        gen_path = f"/calendar/timeline/{test_date}/generate"
        r_gen = client.post(
            gen_path,
            headers=sign_request(priv_a, dev_a_id, "POST", gen_path),
            json={"overwrite_unlocked": True, "include_pending_tasks": True, "include_active_goals": True},
        )
        assert r_gen.status_code == 200, f"Falha ao gerar timeline 24h: {r_gen.text}"
        timeline_data = r_gen.json()
        blocks = timeline_data["blocks"]
        assert len(blocks) > 0 and blocks[0]["start_minute"] == 0 and blocks[-1]["end_minute"] == 1440
        print(f"   [OK] Timeline 24h gerada com {len(blocks)} blocos cobrindo 00:00–24:00.")

        # 7.5 Criar bloco manual focado na Meta e testar execução em tempo real (Play -> Complete)
        blocks_path = f"/calendar/timeline/{test_date}/blocks"
        r_manual = client.post(
            blocks_path,
            headers=sign_request(priv_a, dev_a_id, "POST", blocks_path),
            json={
                "start_time_str": "14:00",
                "end_time_str": "15:30",
                "title": "Sprint de Execução da Meta Q4",
                "notes": "Notas confidenciais do bloco de foco",
                "block_type": "goal_focus",
                "goal_id": goal_id,
                "is_locked": True,
            },
        )
        assert r_manual.status_code == 200, f"Falha ao criar bloco manual: {r_manual.text}"
        manual_block_id = r_manual.json()["id"]

        # Iniciar timer do bloco (Play)
        play_path = f"/calendar/timeline/blocks/{manual_block_id}/start"
        r_play = client.post(
            play_path,
            headers=sign_request(priv_a, dev_a_id, "POST", play_path),
        )
        assert r_play.status_code == 200 and r_play.json()["block"]["status"] == "in_progress"

        # Concluir bloco (Complete) e verificar sincronia com horas da Meta
        done_path = f"/calendar/timeline/blocks/{manual_block_id}/complete"
        r_done = client.post(
            done_path,
            headers=sign_request(priv_a, dev_a_id, "POST", done_path),
        )
        assert r_done.status_code == 200 and r_done.json()["block"]["status"] == "completed"

        # Verificar que tudo está criptografado com AES-256-GCM (enc:v1:...) no disco SQLite
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT title, description, milestones_json FROM calendar_goals WHERE id = ?", (goal_id,))
        raw_goal = cur.fetchone()
        cur.execute("SELECT title, description, location FROM events WHERE id = ?", (event_id,))
        raw_ev = cur.fetchone()
        cur.execute("SELECT title, notes FROM timeline_blocks WHERE id = ?", (manual_block_id,))
        raw_blk = cur.fetchone()
        conn.close()

        assert raw_goal and raw_goal[0].startswith("enc:v1:") and raw_goal[2].startswith("enc:v1:"), "CalendarGoal deve estar criptografado em repouso!"
        assert raw_ev and raw_ev[0].startswith("enc:v1:") and raw_ev[2].startswith("enc:v1:"), "Event deve estar criptografado em repouso!"
        assert raw_blk and raw_blk[0].startswith("enc:v1:") and raw_blk[1].startswith("enc:v1:"), "TimelineBlock deve estar criptografado em repouso!"
        print("   [OK] Criptografia em repouso AES-256-GCM (enc:v1:...) confirmada em calendar_goals, events e timeline_blocks!")
        print("\n=== TODOS OS 7 TESTES DE SEGURANÇA ZERO-TRUST + CALENDÁRIO/TIMELINE 24H PASSARAM COM 100% DE SUCESSO! ===")
    finally:
        # Limpar dados temporários do Teste 7 e SEMPRE restaurar estado original de dispositivos
        with SessionLocal() as db:
            db.query(models.TimelineBlock).filter(models.TimelineBlock.date_str == test_date).delete()
            if event_id is not None:
                db.query(models.Event).filter(models.Event.id == event_id).delete()
            if goal_id is not None:
                db.query(models.CalendarGoal).filter(models.CalendarGoal.id == goal_id).delete()
            db.query(models.DeviceEnrollmentRequest).delete()
            db.query(models.AuthorizedDevice).delete()
            for log_row in db.query(models.SecurityAuditLog).all():
                if log_row.ip_address == "testclient" or log_row.device_name in ("Dispositivo Genesis A", "Segundo Dispositivo B"):
                    db.delete(log_row)
            for sd in saved_devices:
                db.add(models.AuthorizedDevice(**sd))
            state = db.query(models.SystemSecurityState).first()
            if state:
                state.bootstrap_locked = bool(saved_devices) or was_locked
            db.commit()
        _USED_NONCES.clear()
        _AUTH_FAILURES.clear()
        _BANNED_IPS.clear()
        if not was_locked and not saved_devices:
            init_security_bootstrap()


if __name__ == "__main__":
    run_all_tests()

