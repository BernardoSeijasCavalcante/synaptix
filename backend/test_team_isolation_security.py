"""
Suíte de Verificação do Isolamento da Equipe (Zero-Trust).

Prova que:
1. Dados da equipe residem SOMENTE em um banco/arquivos separados e com criptografia de domínio próprio.
2. Sessão/dispositivo de liderado NUNCA acessa rotas pessoais do Líder nem /team-admin.
3. Dispositivo do Líder NUNCA acessa /team-portal (circuitos disjuntos).
4. Liderado A não enxerga/altera dados do liderado B (demandas, fluxos, notas, arquivos).
5. Travas do Líder: itens atribuídos só podem ser executados; conteúdo compartilhado somente leitura é imutável.
6. Anti-replay, revogação imediata de dispositivo e desativação imediata de liderado.

Execução (a partir de backend/):  venv\\Scripts\\python.exe test_team_isolation_security.py
"""
import base64
import json
import os
import secrets
import shutil
import sqlite3
import tempfile
import time
from datetime import date

_TMP = tempfile.mkdtemp(prefix="synaptix_team_test_")
os.environ["SYNAPTIX_TEAM_DB_PATH"] = os.path.join(_TMP, "synaptix_team_test.db")
os.environ["SYNAPTIX_TEAM_UPLOADS_DIR"] = os.path.join(_TMP, "uploads_team")

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils
from fastapi import Depends, Request
from fastapi.testclient import TestClient

import main
from database import DB_PATH, get_db
from security import team_auth
from security.auth import verify_authorized_device as real_verify_device
from team_database import TEAM_DB_PATH

TODAY = date.today().isoformat()
FAKE_LEADER = object()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def new_keypair():
    priv = ec.generate_private_key(ec.SECP256R1())
    nums = priv.public_key().public_numbers()
    jwk = json.dumps({"crv": "P-256", "kty": "EC", "x": _b64url(nums.x.to_bytes(32, "big")), "y": _b64url(nums.y.to_bytes(32, "big"))})
    return priv, jwk


def sign(priv, payload: str) -> str:
    der = priv.sign(payload.encode(), ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der)
    return _b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


# O Líder é simulado apenas quando o cabeçalho X-Test-Leader está presente; caso contrário,
# a verificação REAL do Zero-Trust pessoal é executada (provando o bloqueio).
def _leader_override(request: Request, db=Depends(get_db)):
    if request.headers.get("X-Test-Leader") == "1":
        return FAKE_LEADER
    return real_verify_device(request, db)


main.app.dependency_overrides[real_verify_device] = _leader_override


def reset_limiters():
    team_auth._IP_BANS.clear()
    team_auth._IP_FAILURES.clear()
    team_auth._RATE.clear()


class Leader:
    def __init__(self):
        self.client = TestClient(main.app)

    def call(self, method, path, scope="all", **kw):
        headers = {"X-Test-Leader": "1", "X-Team-Scope": scope}
        return self.client.request(method, path, headers=headers, **kw)


class Member:
    def __init__(self, username, password):
        self.username, self.password = username, password
        self.priv, self.jwk = new_keypair()
        self.client = TestClient(main.app)
        self.device_id = None

    def login(self, device_name="Notebook de Teste"):
        ts, nonce = str(int(time.time())), secrets.token_hex(8)
        sig = sign(self.priv, f"team-login:{self.username}:{ts}:{nonce}")
        r = self.client.post("/team-auth/login", json={
            "username": self.username, "password": self.password, "device_name": device_name,
            "public_key_jwk": self.jwk, "timestamp": ts, "nonce": nonce, "signature": sig,
        })
        if r.status_code == 200 and r.json().get("device_id"):
            self.device_id = r.json()["device_id"]
        return r

    def headers(self, method, path):
        ts, nonce = str(int(time.time())), secrets.token_hex(8)
        sig = sign(self.priv, f"{self.device_id}:{ts}:{nonce}:{method.upper()}:{path}")
        return {
            "X-Synaptix-Team-Device-Id": self.device_id, "X-Synaptix-Team-Timestamp": ts,
            "X-Synaptix-Team-Nonce": nonce, "X-Synaptix-Team-Signature": sig,
        }

    def call(self, method, path, **kw):
        return self.client.request(method, path, headers=self.headers(method, path.split("?")[0]), **kw)


def check(cond, label):
    print(("  [OK]   " if cond else "  [FALHA]") + " " + label)
    assert cond, label


def test_team_isolation():
    reset_limiters()
    leader = Leader()
    anon = TestClient(main.app)

    print("\n== 1. Fronteiras de autenticação ==")
    check(anon.get("/team-admin/members").status_code == 401, "/team-admin/members sem dispositivo do Líder -> 401")
    check(anon.get("/team-portal/tasks").status_code == 401, "/team-portal/tasks sem sessão -> 401")
    check(anon.get("/team-admin/tasks", headers={"X-Team-Scope": "all"}).status_code == 401, "/team-admin/tasks sem Líder -> 401")
    reset_limiters()

    print("\n== 2. Cadastro de liderados pelo Líder ==")
    pw_a, pw_b = "SenhaForte-A-2026!", "SenhaForte-B-2026!"
    ra = leader.call("POST", "/team-admin/members", json={"username": "ana", "display_name": "Ana Souza", "role_title": "Analista", "password": pw_a, "require_device_approval": True})
    rb = leader.call("POST", "/team-admin/members", json={"username": "bruno", "display_name": "Bruno Lima", "password": pw_b, "require_device_approval": False})
    check(ra.status_code == 200 and rb.status_code == 200, "Líder cria Ana e Bruno")
    ida, idb = ra.json()["id"], rb.json()["id"]
    check(leader.call("POST", "/team-admin/members", json={"username": "x", "display_name": "Xx", "password": "curta"}).status_code == 422, "Senha fraca é rejeitada")

    print("\n== 3. Login com senha + dispositivo ECDSA ==")
    ana, bruno = Member("ana", pw_a), Member("bruno", pw_b)
    bad = Member("ana", "senha-errada-123")
    check(bad.login().status_code == 401, "Senha incorreta -> 401")
    r = ana.login()
    check(r.status_code == 200 and r.json()["status"] == "pending_approval", "Dispositivo novo de Ana fica pendente de aprovação do Líder")
    check(ana.client.get("/team-auth/status").json()["authorized"] is False, "Sem aprovação não há sessão")
    devs = leader.call("GET", f"/team-admin/members/{ida}/devices").json()
    check(len(devs) == 1 and devs[0]["status"] == "pending_approval", "Líder vê o dispositivo pendente")
    check(leader.call("POST", f"/team-admin/members/{ida}/devices/{devs[0]['id']}/approve").status_code == 200, "Líder aprova o dispositivo")
    reset_limiters()
    r = ana.login()
    check(r.json()["status"] == "approved", "Ana autenticada após aprovação")
    rbr = bruno.login()
    check(rbr.json()["status"] == "approved", "Bruno (sem exigência de aprovação) autenticado")
    st = ana.call("GET", "/team-auth/status")
    check(st.json()["authorized"] and st.json()["member"]["username"] == "ana", "Status assinado confirma a identidade")

    print("\n== 4. Barreira Liderado -> área do Líder ==")
    for path in ("/tasks", "/notes", "/workspaces", "/calendar/goals", "/auth/devices", "/chat/session", "/team-admin/members", "/team-admin/tasks"):
        reset_limiters()
        res = ana.call("GET", path)
        check(res.status_code == 401, f"Ana em {path} -> 401 (HTTP {res.status_code})")
    reset_limiters()
    check(leader.client.get("/team-portal/tasks", headers={"X-Test-Leader": "1"}).status_code == 401, "Dispositivo do Líder não entra no /team-portal")

    print("\n== 5. Anti-replay ==")
    h = ana.headers("GET", "/team-portal/tasks")
    check(ana.client.get("/team-portal/tasks", headers=h).status_code == 200, "Requisição assinada válida -> 200")
    check(ana.client.get("/team-portal/tasks", headers=h).status_code == 401, "Mesma assinatura reutilizada -> 401")
    reset_limiters()

    print("\n== 6. Demandas: isolamento e travas ==")
    own = ana.call("POST", "/team-portal/tasks", json={"name": "Tarefa própria da Ana"})
    check(own.status_code == 200 and own.json()["assigned_by_leader"] is False and own.json()["member_id"] == ida, "Ana cria demanda própria (member_id forçado)")
    forged = ana.call("POST", "/team-portal/tasks", json={"name": "Forjada", "member_id": idb})
    check(forged.status_code == 200 and forged.json()["member_id"] == ida, "member_id forjado no payload é ignorado")
    assigned = leader.call("POST", "/team-admin/tasks", scope=f"member:{ida}", json={"name": "Demanda atribuída à Ana", "priority": "Alta"})
    check(assigned.status_code == 200 and assigned.json()["assigned_by_leader"] is True, "Líder atribui demanda travada à Ana")
    check(leader.call("POST", "/team-admin/tasks", scope="all", json={"name": "Sem dono"}).status_code == 400, "Líder sem selecionar liderado não cria demanda")
    tid = assigned.json()["id"]
    a_tasks = ana.call("GET", "/team-portal/tasks").json()
    b_tasks = bruno.call("GET", "/team-portal/tasks").json()
    check(any(t["id"] == tid for t in a_tasks) and len(a_tasks) == 3, "Ana vê apenas as 3 demandas dela")
    check(b_tasks == [], "Bruno não vê nenhuma demanda da Ana")
    check(ana.call("PUT", f"/team-portal/tasks/{tid}", json={"name": "Renomeada"}).status_code == 403, "Ana não altera escopo de demanda atribuída (403)")
    check(ana.call("PUT", f"/team-portal/tasks/{tid}", json={"estimated_hours": 1}).status_code == 403, "Ana não altera estimativa (403)")
    check(ana.call("DELETE", f"/team-portal/tasks/{tid}").status_code == 403, "Ana não exclui demanda atribuída (403)")
    check(ana.call("PUT", f"/team-portal/tasks/{tid}", json={"status": "in_progress", "execution_notes": "Iniciei"}).status_code == 200, "Ana atualiza status/relatório (execução permitida)")
    check(ana.call("POST", f"/team-portal/tasks/{tid}/start").status_code == 200, "Ana inicia o cronômetro da demanda atribuída")
    check(ana.call("POST", f"/team-portal/tasks/{tid}/pause").status_code == 200, "Ana pausa o cronômetro")
    check(bruno.call("POST", f"/team-portal/tasks/{tid}/start").status_code != 200, "Bruno não opera cronômetro da Ana")
    check(bruno.call("PUT", f"/team-portal/tasks/{tid}", json={"status": "completed"}).status_code == 404, "Bruno não enxerga/edita demanda da Ana (404)")
    check(bruno.call("DELETE", f"/team-portal/tasks/{tid}").status_code == 404, "Bruno não exclui demanda da Ana (404)")
    check(ana.call("DELETE", f"/team-portal/tasks/{own.json()['id']}").status_code == 200, "Ana exclui a própria demanda")

    print("\n== 7. Fluxos diários, checklist e timeline ==")
    routine = leader.call("POST", "/team-admin/calendar/routine", scope=f"member:{ida}", json={
        "title": "Abertura do Dia", "start_time_str": "08:00", "end_time_str": "09:00",
        "checklist": [{"text": "Conferir e-mails"}, {"text": "Revisar demandas"}],
    })
    check(routine.status_code == 200 and routine.json()["assigned_by_leader"] and len(routine.json()["checklist"]) == 2, "Líder cria fluxo diário com checklist para Ana")
    rid = routine.json()["id"]
    check(ana.call("PUT", f"/team-portal/calendar/routine/{rid}", json={"title": "Alterado"}).status_code == 403, "Ana não altera fluxo do Líder (403)")
    check(ana.call("DELETE", f"/team-portal/calendar/routine/{rid}").status_code == 403, "Ana não exclui fluxo do Líder (403)")
    check(bruno.call("GET", "/team-portal/calendar/routine").json() == [], "Bruno não vê o fluxo da Ana")
    gen = ana.call("POST", f"/team-portal/calendar/timeline/{TODAY}/generate", json={})
    check(gen.status_code == 200, "Ana gera a timeline do dia")
    blocks = [b for b in gen.json()["blocks"] if b["block_type"] == "routine"]
    check(len(blocks) == 1, "Timeline gerada contém o bloco do fluxo diário do Líder")
    if blocks:
        blk = blocks[0]
        check(blk["assigned_by_leader"] is True and len(blk["checklist"]) == 2, "Bloco gerado herda trava e checklist do fluxo")
        items = blk["checklist"]
        items[0]["done"] = True
        check(ana.call("PUT", f"/team-portal/calendar/timeline/blocks/{blk['id']}/checklist", json={"checklist": items}).status_code == 200, "Ana marca item do checklist")
        items[1]["text"] = "Texto adulterado"
        check(ana.call("PUT", f"/team-portal/calendar/timeline/blocks/{blk['id']}/checklist", json={"checklist": items}).status_code == 403, "Ana não adultera itens do checklist (403)")
        check(ana.call("DELETE", f"/team-portal/calendar/timeline/blocks/{blk['id']}").status_code == 403, "Ana não exclui bloco do fluxo (403)")
        check(ana.call("POST", f"/team-portal/calendar/timeline/blocks/{blk['id']}/start").status_code == 200, "Ana inicia o bloco (execução)")
        check(ana.call("PUT", f"/team-portal/calendar/timeline/blocks/{blk['id']}", json={"title": "Outro"}).status_code == 403, "Ana não renomeia bloco do Líder (403)")
        bt = bruno.call("GET", f"/team-portal/calendar/timeline/{TODAY}").json()
        check(all(b["title"] != "Abertura do Dia" for b in bt["blocks"]), "Bruno não vê blocos da Ana na timeline")
    own_block = ana.call("POST", f"/team-portal/calendar/timeline/{TODAY}/blocks", json={"title": "Foco livre", "start_time_str": "20:00", "end_time_str": "21:00", "block_type": "focus"})
    check(own_block.status_code == 200 and own_block.json()["assigned_by_leader"] is False, "Ana cria bloco próprio nos horários livres")
    check(ana.call("DELETE", f"/team-portal/calendar/timeline/blocks/{own_block.json()['id']}").status_code == 200, "Ana exclui o bloco próprio")

    print("\n== 8. Eventos/Metas compartilhados e atribuídos ==")
    ev = leader.call("POST", "/team-admin/calendar/events", scope="shared-rw", json={"title": "Reunião geral", "start_time": f"{TODAY}T14:00:00", "end_time": f"{TODAY}T15:00:00"})
    check(ev.status_code == 200, "Líder cria evento compartilhado")
    for m, nome in ((ana, "Ana"), (bruno, "Bruno")):
        evs = m.call("GET", f"/team-portal/calendar/events?start_date={TODAY}&end_date={TODAY}").json()
        check(any(e["title"] == "Reunião geral" for e in evs), f"{nome} enxerga o evento compartilhado")
    evid = ev.json()["id"]
    check(bruno.call("DELETE", f"/team-portal/calendar/events/{evid}").status_code in (403, 404), "Liderado não cancela evento do Líder")
    check(bruno.call("PUT", f"/team-portal/calendar/events/{evid}", json={"title": "Hack"}).status_code == 403, "Liderado não edita evento compartilhado (403)")

    print("\n== 9. Notas: individuais, compartilhadas e somente leitura ==")
    ws = leader.call("POST", "/team-admin/workspaces", scope="shared-ro", json={"title": "POPs da Equipe"})
    nb = leader.call("POST", "/team-admin/notebooks", scope="shared-ro", json={"title": "Procedimentos", "workspace_id": ws.json()["id"]})
    pop = leader.call("POST", "/team-admin/notes", scope="shared-ro", json={"title": "POP: Abertura", "content": "<p>Passo a passo</p>", "notebook_id": nb.json()["id"]})
    check(pop.status_code == 200 and pop.json()["is_team_shared"] and not pop.json()["allow_member_edit"], "Líder publica POP compartilhado somente leitura")
    popid = pop.json()["id"]
    for m, nome in ((ana, "Ana"), (bruno, "Bruno")):
        check(any(n["id"] == popid for n in m.call("GET", "/team-portal/notes").json()), f"{nome} lê o POP compartilhado")
    check(ana.call("PUT", f"/team-portal/notes/{popid}", json={"content": "<p>adulterado</p>"}).status_code == 403, "Liderado não altera POP somente leitura (403)")
    check(ana.call("DELETE", f"/team-portal/notes/{popid}").status_code == 403, "Liderado não exclui POP (403)")
    check(ana.call("POST", f"/team-portal/notes/{popid}/comments", json={"note_id": popid, "content": "oi"}).status_code == 403, "Liderado não comenta em POP somente leitura (403)")
    check(ana.call("PUT", f"/team-portal/workspaces/{ws.json()['id']}", json={"title": "x"}).status_code == 403, "Liderado não altera workspace compartilhado (403)")
    check(ana.call("POST", "/team-portal/notebooks", json={"title": "Invasor", "workspace_id": ws.json()["id"]}).status_code == 403, "Liderado não cria caderno em workspace somente leitura (403)")

    pws = ana.call("POST", "/team-portal/workspaces", json={"title": "Meu espaço"})
    pnb = ana.call("POST", "/team-portal/notebooks", json={"title": "Meu caderno", "workspace_id": pws.json()["id"]})
    pnote = ana.call("POST", "/team-portal/notes", json={"title": "Nota privada da Ana", "content": "<p>segredo</p>", "notebook_id": pnb.json()["id"]})
    check(pnote.status_code == 200 and pnote.json()["is_team_shared"] is False and pnote.json()["owner_member_id"] == ida, "Ana cria nota individual")
    pnid = pnote.json()["id"]
    check(all(n["id"] != pnid for n in bruno.call("GET", "/team-portal/notes").json()), "Bruno não vê a nota privada da Ana")
    check(bruno.call("PUT", f"/team-portal/notes/{pnid}", json={"content": "x"}).status_code == 404, "Bruno não edita nota da Ana (404)")
    check(bruno.call("POST", "/team-portal/notes", json={"title": "Invasão", "content": "x", "notebook_id": pnb.json()["id"]}).status_code == 403, "Bruno não cria nota no caderno da Ana (403)")
    check(bruno.call("POST", f"/team-portal/notes/{pnid}/comments", json={"note_id": pnid, "content": "oi"}).status_code in (403, 404), "Bruno não comenta na nota da Ana")
    check(all(w["id"] != pws.json()["id"] for w in bruno.call("GET", "/team-portal/workspaces").json()), "Bruno não vê o workspace da Ana")
    cm = ana.call("POST", f"/team-portal/notes/{pnid}/comments", json={"note_id": pnid, "content": "Ideia"})
    check(cm.status_code == 200, "Ana comenta na própria nota (rede sináptica)")
    check(bruno.call("GET", f"/team-portal/notebooks/{pnb.json()['id']}/comments").json() == [], "Bruno não vê comentários do caderno da Ana")
    check(any(n["id"] == pnid for n in leader.call("GET", "/team-admin/notes", scope=f"member:{ida}").json()), "Líder enxerga a nota da Ana (visão por liderado)")
    check(all(n["id"] != pnid for n in leader.call("GET", "/team-admin/notes", scope="shared-rw").json()), "Visão 'compartilhado' do Líder não mistura notas individuais")

    print("\n== 10. Cofre de arquivos ==")
    pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
    up = ana.call("POST", "/team-portal/upload", files={"file": ("a.pdf", pdf, "application/pdf")})
    check(up.status_code == 200, "Ana envia PDF ao cofre da equipe")
    fname = up.json()["file_url"].split("/")[-1]
    on_disk = open(os.path.join(os.environ["SYNAPTIX_TEAM_UPLOADS_DIR"], fname), "rb").read()
    check(on_disk.startswith(b"SYNXTEAM1") and b"%PDF" not in on_disk[:40], "Arquivo criptografado em repouso com chave da equipe")
    check(ana.call("GET", f"/team-portal/uploads/{fname}").content == pdf, "Ana lê o próprio arquivo")
    check(bruno.call("GET", f"/team-portal/uploads/{fname}").status_code == 404, "Bruno não lê arquivo da Ana (404)")
    check(leader.call("GET", f"/team-admin/uploads/{fname}").content == pdf, "Líder lê arquivos da equipe")

    print("\n== 11. Painel/auditoria do Líder ==")
    summ = leader.call("GET", "/team-admin/summary").json()
    check(len(summ) == 2, "Painel consolidado lista os dois liderados")
    logs = leader.call("GET", "/team-admin/audit-logs?limit=300").json()
    check(any(l["event_type"] == "LOGIN_SUCCESS" for l in logs) and any(l["event_type"] == "TASK_CREATED" for l in logs), "Ações dos liderados ficam na auditoria da equipe")

    print("\n== 12. Isolamento físico e criptográfico ==")
    check(os.path.abspath(TEAM_DB_PATH) != os.path.abspath(DB_PATH), "Bancos distintos em disco")
    pers = sqlite3.connect(DB_PATH)
    pers_tables = {r[0] for r in pers.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    pers.close()
    check(not any(t.startswith("team_") for t in pers_tables), "Banco pessoal não contém nenhuma tabela team_*")
    team = sqlite3.connect(TEAM_DB_PATH)
    team_tables = {r[0] for r in team.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    raw_name = team.execute("SELECT name FROM team_tasks WHERE id=?", (tid,)).fetchone()[0]
    raw_pwd = team.execute("SELECT password_hash FROM team_members WHERE id=?", (ida,)).fetchone()[0]
    team.close()
    check(not ({"tasks", "notes", "authorized_devices", "events"} & team_tables), "Banco da equipe não contém tabelas pessoais")
    check(raw_name.startswith("enc:team:v1:") and "atribuída" not in raw_name, "Campos da equipe cifrados com prefixo/chave de domínio próprios")
    check(raw_pwd.startswith("scrypt$") and pw_a not in raw_pwd, "Senha armazenada apenas como hash scrypt")
    from security.crypto import decrypt_string
    check(decrypt_string(raw_name) == raw_name, "Chave pessoal NÃO decifra dados da equipe")

    print("\n== 13. Revogação e desativação imediatas ==")
    devs_a = leader.call("GET", f"/team-admin/members/{ida}/devices").json()
    check(leader.call("POST", f"/team-admin/members/{ida}/devices/{devs_a[0]['id']}/revoke").status_code == 200, "Líder revoga o dispositivo da Ana")
    check(ana.call("GET", "/team-portal/tasks").status_code == 401, "Ana é bloqueada imediatamente após revogação")
    check(leader.call("PUT", f"/team-admin/members/{idb}", json={"is_active": False}).status_code == 200, "Líder desativa Bruno")
    check(bruno.call("GET", "/team-portal/tasks").status_code == 401, "Bruno é bloqueado imediatamente (sessão invalidada)")
    reset_limiters()
    check(Member("bruno", pw_b).login().status_code in (401, 403), "Bruno desativado não consegue novo login")
    print("\nTODAS AS VERIFICAÇÕES DE ISOLAMENTO PASSARAM.")


if __name__ == "__main__":
    try:
        test_team_isolation()
    finally:
        try:
            main.scheduler.shutdown(wait=False)
        except Exception:
            pass
        shutil.rmtree(_TMP, ignore_errors=True)
