"""
Script de Migração de Criptografia em Repouso (AES-256-GCM) do Synaptix.
- Cria as tabelas de governança Zero-Trust (dispositivos, pareamentos, auditoria).
- Criptografa de forma idempotente todos os registros em texto plano existentes em synaptix.db.
- Criptografa de forma idempotente todos os arquivos PDF/imagens existentes em backend/uploads/.
"""
import os
import sqlite3
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from database import engine, DB_PATH
import models
from security.crypto import (
    is_encrypted_string,
    encrypt_string,
    encrypt_file_on_disk,
)
from security.auth import init_security_bootstrap

TABLES_TO_ENCRYPT = {
    "workspaces": ("id", ["title"]),
    "notebooks": ("id", ["title"]),
    "notes": ("id", ["title", "content", "file_url"]),
    "comments": ("id", ["content", "selected_text"]),
    "comment_connections": ("id", ["observation"]),
    "tasks": ("id", ["name", "description", "category"]),
    "events": ("id", ["title", "attendees"]),
    "chat_sessions": ("date", ["messages_json"]),
    "notifications": ("id", ["message"]),
}


def migrate_database_encryption():
    print(f"[1/4] Garantindo criação das tabelas de segurança em {DB_PATH}...")
    models.Base.metadata.create_all(bind=engine)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    total_encrypted_rows = 0
    print("[2/4] Verificando e criptografando registros em repouso no SQLite (AES-256-GCM)...")

    for table_name, (pk_col, text_cols) in TABLES_TO_ENCRYPT.items():
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            continue

        cols_sql = ", ".join([pk_col] + text_cols)
        cursor.execute(f"SELECT {cols_sql} FROM {table_name}")
        rows = cursor.fetchall()

        table_updated = 0
        for row in rows:
            pk_val = row[0]
            updates = {}
            for idx, col_name in enumerate(text_cols, start=1):
                val = row[idx]
                if val is not None and isinstance(val, str) and not is_encrypted_string(val):
                    updates[col_name] = encrypt_string(val)

            if updates:
                set_clause = ", ".join([f"{col} = ?" for col in updates.keys()])
                params = list(updates.values()) + [pk_val]
                cursor.execute(f"UPDATE {table_name} SET {set_clause} WHERE {pk_col} = ?", params)
                table_updated += 1
                total_encrypted_rows += 1

        print(f"   -> Tabela '{table_name}': {table_updated}/{len(rows)} registros migrados para AES-256-GCM.")

    conn.commit()
    conn.close()
    print(f"   => Total de registros recém-criptografados no banco: {total_encrypted_rows}")


def migrate_uploads_encryption():
    uploads_dir = os.path.join(BASE_DIR, "uploads")
    print(f"[3/4] Criptografando arquivos em {uploads_dir}...")
    if not os.path.isdir(uploads_dir):
        print("   -> Diretório uploads/ não encontrado.")
        return

    encrypted_files_count = 0
    total_files = 0
    for fname in os.listdir(uploads_dir):
        fpath = os.path.join(uploads_dir, fname)
        if os.path.isfile(fpath):
            total_files += 1
            if encrypt_file_on_disk(fpath):
                encrypted_files_count += 1
                print(f"   -> Arquivo criptografado com AES-256-GCM: {fname}")
            else:
                print(f"   -> Arquivo já criptografado: {fname}")

    print(f"   => {encrypted_files_count}/{total_files} arquivos migrados no cofre de uploads.")


def migrate_rules_file():
    rules_path = os.path.join(BASE_DIR, "library_rules.txt")
    if os.path.isfile(rules_path):
        with open(rules_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if content and not is_encrypted_string(content):
            with open(rules_path, "w", encoding="utf-8") as f:
                f.write(encrypt_string(content))
            print("   -> Arquivo library_rules.txt criptografado com sucesso.")


def migrate_vector_embeddings():
    import struct
    import json
    from sqlalchemy import text
    from security.crypto import protect_embedding_vector

    marker_file = os.path.join(BASE_DIR, ".embeddings_protected_v1")
    if os.path.exists(marker_file):
        print("   -> Vetores em note_embeddings já protegidos com máscara isométrica.")
        return

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT note_id, embedding FROM note_embeddings")).fetchall()
        count = 0
        for note_id, raw_emb in rows:
            if isinstance(raw_emb, bytes) and len(raw_emb) == 1536 * 4:
                floats = list(struct.unpack(f"<{1536}f", raw_emb))
                protected = protect_embedding_vector(floats)
                conn.execute(
                    text("DELETE FROM note_embeddings WHERE note_id = :id"),
                    {"id": note_id},
                )
                conn.execute(
                    text("INSERT INTO note_embeddings(note_id, embedding) VALUES (:id, :emb)"),
                    {"id": note_id, "emb": json.dumps(protected)},
                )
                count += 1
        conn.commit()
    with open(marker_file, "w", encoding="utf-8") as f:
        f.write("protected:v1\n")
    print(f"   -> {count} embeddings vetoriais protegidos com transformação isométrica secreta.")


if __name__ == "__main__":
    migrate_database_encryption()
    migrate_uploads_encryption()
    migrate_rules_file()
    migrate_vector_embeddings()
    print("[4/4] Inicializando estado de Bootstrap Zero-Trust...")
    init_security_bootstrap()
    print("Migração de segurança concluída com sucesso!")
