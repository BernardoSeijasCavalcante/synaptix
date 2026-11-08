import os
import sys
import uuid
import hashlib
from datetime import datetime, timedelta

# Garantir imports corretos
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
import models

PAIRING_CODE = "PAIR-7429-8153-6029"
BOOTSTRAP_CODE = "SYNX-4A9F-2E7B-8C1D"

def reset_security():
    db = SessionLocal()
    try:
        # 1. Limpar dispositivos autorizados antigos
        deleted_devices = db.query(models.AuthorizedDevice).delete()
        print(f"[*] Dispositivos autorizados anteriores removidos: {deleted_devices}")

        # 2. Limpar solicitações de pareamento anteriores
        deleted_enrollments = db.query(models.DeviceEnrollmentRequest).delete()
        print(f"[*] Solicitacoes de pareamento anteriores removidas: {deleted_enrollments}")

        # 3. Criar nova solicitacao de pareamento efemera
        pairing_hash = hashlib.sha256(PAIRING_CODE.encode("utf-8")).hexdigest()
        new_enrollment = models.DeviceEnrollmentRequest(
            id=str(uuid.uuid4()),
            enrollment_code_hash=pairing_hash,
            created_by_device_id=None,
            status="awaiting_claim",
            expires_at=datetime.utcnow() + timedelta(days=7),
            created_at=datetime.utcnow(),
        )
        db.add(new_enrollment)
        print(f"[+] Codigo de pareamento efemero gerado: {PAIRING_CODE}")

        # 4. Configurar Estado de Seguranca (Bootstrap liberado)
        bootstrap_hash = hashlib.sha256(BOOTSTRAP_CODE.encode("utf-8")).hexdigest()
        state = db.query(models.SystemSecurityState).first()
        if not state:
            state = models.SystemSecurityState(
                id=1,
                bootstrap_locked=False,
                bootstrap_token_hash=bootstrap_hash,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(state)
        else:
            state.bootstrap_locked = False
            state.bootstrap_token_hash = bootstrap_hash
            state.updated_at = datetime.utcnow()
        print(f"[+] Token de Bootstrap Genesis gerado: {BOOTSTRAP_CODE}")

        # 5. Salvar arquivo do token de bootstrap
        token_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "BOOTSTRAP_DEVICE_TOKEN.txt")
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(BOOTSTRAP_CODE + "\n")
        print(f"[+] Arquivo gravado: {token_path}")

        db.commit()
        print("[SUCCESS] Dispositivos reiniciados e novo pareamento configurado com sucesso!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Falha ao resetar seguranca: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    reset_security()
