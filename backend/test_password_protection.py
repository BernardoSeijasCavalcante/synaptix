import sys
import os
import unittest
import base64
import json
import time
import secrets
from fastapi import Request
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main
import models
import schemas
from database import SessionLocal
from security.crypto import hash_password, verify_password

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")

def generate_keypair():
    priv_key = ec.generate_private_key(ec.SECP256R1())
    pub_numbers = priv_key.public_key().public_numbers()
    x_b64 = _b64url(pub_numbers.x.to_bytes(32, "big"))
    y_b64 = _b64url(pub_numbers.y.to_bytes(32, "big"))
    jwk_str = json.dumps({"crv": "P-256", "kty": "EC", "x": x_b64, "y": y_b64})
    return priv_key, jwk_str

def sign(priv_key, dev_id, method, path):
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    payload = f"{dev_id}:{ts}:{nonce}:{method.upper()}:{path}".encode("utf-8")
    der_sig = priv_key.sign(payload, ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return {
        "X-Synaptix-Device-Id": dev_id,
        "X-Synaptix-Timestamp": ts,
        "X-Synaptix-Nonce": nonce,
        "X-Synaptix-Signature": _b64url(raw_sig),
    }

class TestPasswordProtectionComplete(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = SessionLocal()
        cls.ws = models.Workspace(title="Workspace de Teste de Senha")
        db.add(cls.ws)
        db.commit()
        db.refresh(cls.ws)
        cls.ws_id = cls.ws.id
        db.close()

    def test_01_crypto_hashing_and_verification(self):
        pwd = "MinhaSenhaSuperSecreta@2026"
        hashed = hash_password(pwd)
        self.assertTrue(hashed.startswith("scrypt$"))
        self.assertTrue(verify_password(pwd, hashed))
        self.assertFalse(verify_password("SenhaErrada", hashed))
        self.assertFalse(verify_password("", hashed))
        self.assertFalse(verify_password(pwd, None))

    def test_02_notebook_and_subnotebook_password_lifecycle(self):
        db = SessionLocal()
        # Cria caderno raiz
        nb_root = models.Notebook(title="Caderno Raiz Privado", workspace_id=self.ws_id)
        db.add(nb_root)
        db.commit()
        db.refresh(nb_root)
        root_id = nb_root.id

        # Cria sub-caderno
        nb_sub = models.Notebook(title="Sub-caderno de Finanças", parent_id=root_id, workspace_id=self.ws_id)
        db.add(nb_sub)
        db.commit()
        db.refresh(nb_sub)
        sub_id = nb_sub.id

        # Simula mock request
        class MockRequest:
            headers = {}
            client = type("Client", (), {"host": "127.0.0.1"})()
            url = type("URL", (), {"scheme": "http", "path": "/test"})()
            method = "POST"
            state = type("State", (), {})()


        req = MockRequest()

        # 1. Definir senha no Caderno Raiz
        res_set = main.set_notebook_password(
            notebook_id=root_id,
            payload=schemas.ItemPasswordSet(password="RootSenha123"),
            request=req,
            db=db
        )
        self.assertTrue(res_set.success)
        self.assertTrue(res_set.is_password_protected)

        # 2. Desbloquear Caderno Raiz (com sucesso e com erro)
        res_unlock = main.unlock_notebook(
            notebook_id=root_id,
            payload=schemas.ItemPasswordVerify(password="RootSenha123"),
            request=req,
            db=db
        )
        self.assertTrue(res_unlock["success"])

        with self.assertRaises(main.HTTPException) as ctx:
            main.unlock_notebook(
                notebook_id=root_id,
                payload=schemas.ItemPasswordVerify(password="SenhaIncorreta"),
                request=req,
                db=db
            )
        self.assertEqual(ctx.exception.status_code, 401)

        # 3. Alterar senha do Caderno Raiz
        res_change = main.set_notebook_password(
            notebook_id=root_id,
            payload=schemas.ItemPasswordSet(password="NovaRootSenha456", current_password="RootSenha123"),
            request=req,
            db=db
        )
        self.assertTrue(res_change.success)

        # 4. Definir senha no Sub-caderno
        res_sub_set = main.set_notebook_password(
            notebook_id=sub_id,
            payload=schemas.ItemPasswordSet(password="SubSenha789"),
            request=req,
            db=db
        )
        self.assertTrue(res_sub_set.success)
        self.assertTrue(res_sub_set.is_password_protected)

        # 5. Remover senha do Caderno Raiz
        res_rm = main.remove_notebook_password(
            notebook_id=root_id,
            payload=schemas.ItemPasswordVerify(password="NovaRootSenha456"),
            request=req,
            db=db
        )
        self.assertTrue(res_rm.success)
        self.assertFalse(res_rm.is_password_protected)
        db.close()

    def test_03_note_password_protection_and_content_masking(self):
        db = SessionLocal()
        # Cria nota confidencial
        note = models.Note(
            title="Estratégia Confidencial 2026",
            content="Dados financeiros confidenciais e senhas de servidores.",
            workspace_id=self.ws_id
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        note_id = note.id

        class MockRequest:
            headers = {}
            client = type("Client", (), {"host": "127.0.0.1"})()
            url = type("URL", (), {"scheme": "http", "path": "/test"})()
            method = "POST"
            state = type("State", (), {})()


        req = MockRequest()

        # 1. Definir senha na nota
        res_set = main.set_note_password(
            note_id=note_id,
            payload=schemas.ItemPasswordSet(password="NotaSenha999"),
            request=req,
            db=db
        )
        self.assertTrue(res_set.success)
        self.assertTrue(res_set.is_password_protected)

        # 2. Verificar que GET /notes mascara o conteúdo da nota protegida
        notes_list = main.get_notes(workspace_id=self.ws_id, db=db)
        target_note_in_list = next((n for n in notes_list if n.id == note_id), None)
        self.assertIsNotNone(target_note_in_list)
        self.assertTrue(target_note_in_list.is_password_protected)
        self.assertEqual(target_note_in_list.content, "") # Conteúdo mascarado!

        # 3. Desbloquear nota com senha
        unlock_res = main.unlock_note(
            note_id=note_id,
            payload=schemas.ItemPasswordVerify(password="NotaSenha999"),
            request=req,
            db=db
        )
        self.assertTrue(unlock_res["success"])
        self.assertIn("Dados financeiros confidenciais", unlock_res["note"].content)

        # 4. Falha ao desbloquear com senha errada
        with self.assertRaises(main.HTTPException) as ctx:
            main.unlock_note(
                note_id=note_id,
                payload=schemas.ItemPasswordVerify(password="SenhaErrada"),
                request=req,
                db=db
            )
        self.assertEqual(ctx.exception.status_code, 401)

        # 5. Tentativa de update sem header X-Item-Password é bloqueada com 403
        req_update_unauth = MockRequest()
        with self.assertRaises(main.HTTPException) as ctx:
            main.update_note(
                note_id=note_id,
                note=schemas.NoteUpdate(title="Tentativa de Invasão"),
                request=req_update_unauth,
                db=db
            )
        self.assertEqual(ctx.exception.status_code, 403)

        # 6. Update com header X-Item-Password correto é aceito
        req_update_auth = MockRequest()
        req_update_auth.headers = {"X-Item-Password": "NotaSenha999"}
        updated = main.update_note(
            note_id=note_id,
            note=schemas.NoteUpdate(title="Estratégia Atualizada"),
            request=req_update_auth,
            db=db
        )
        self.assertEqual(updated.title, "Estratégia Atualizada")

        # 7. Remover senha da nota
        rm_res = main.remove_note_password(
            note_id=note_id,
            payload=schemas.ItemPasswordVerify(password="NotaSenha999"),
            request=req,
            db=db
        )
        self.assertTrue(rm_res.success)
        self.assertFalse(rm_res.is_password_protected)
        db.close()

if __name__ == "__main__":
    unittest.main()
