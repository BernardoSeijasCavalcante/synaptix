import os
from typing import Optional
from database import SessionLocal
import models

def list_library_structure() -> dict:
    """Retorna a arvore de Workspaces e Notebooks (Pastas) da biblioteca de Gestao Pessoal."""
    with SessionLocal() as db:
        workspaces = db.query(models.Workspace).filter(models.Workspace.is_active == True).all()
        notebooks = db.query(models.Notebook).filter(models.Notebook.is_active == True).all()
        
        result = []
        for ws in workspaces:
            ws_data = {"id": ws.id, "title": ws.title, "notebooks": []}
            ws_notebooks = [nb for nb in notebooks if nb.workspace_id == ws.id and nb.parent_id is None]
            
            def build_tree(nb_list):
                tree = []
                for nb in nb_list:
                    children = [child for child in notebooks if child.parent_id == nb.id]
                    tree.append({
                        "id": nb.id,
                        "title": nb.title,
                        "sub_notebooks": build_tree(children)
                    })
                return tree
            
            ws_data["notebooks"] = build_tree(ws_notebooks)
            result.append(ws_data)
            
        return {"library": result}

def create_workspace(title: str) -> dict:
    """Cria um Workspace (Raiz de categorias primarias)"""
    with SessionLocal() as db:
        ws = models.Workspace(title=title)
        db.add(ws)
        db.commit()
        db.refresh(ws)
        return {"success": True, "workspace_id": ws.id, "title": ws.title}

def create_notebook(title: str, workspace_id: int, parent_id: Optional[int] = None) -> dict:
    """Cria um Notebook (Pasta/Sub-pasta) dentro de um Workspace"""
    with SessionLocal() as db:
        nb = models.Notebook(title=title, workspace_id=workspace_id, parent_id=parent_id)
        db.add(nb)
        db.commit()
        db.refresh(nb)
        return {"success": True, "notebook_id": nb.id, "title": nb.title}

from security.crypto import encrypt_string, decrypt_string

RULES_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library_rules.txt")

def read_organization_rules() -> str:
    """Le as regras de organizacao definidas pelo usuario (descriptografando do disco)."""
    if os.path.exists(RULES_FILE):
        with open(RULES_FILE, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        if raw:
            return decrypt_string(raw) or ""
    return "Nenhuma regra de organizacao restrita definida pelo usuario. Organize as pastas usando seu proprio criterio."

def update_organization_rules(rules: str) -> dict:
    """Atualiza e criptografa as regras e parametros de como a IA deve organizar a biblioteca."""
    enc_rules = encrypt_string(rules)
    with open(RULES_FILE, "w", encoding="utf-8") as f:
        f.write(enc_rules)
    return {"success": True, "message": "Regras de organizacao atualizadas e criptografadas."}

def transfer_note(note_id: int, target_workspace_id: Optional[int] = None, target_notebook_id: Optional[int] = None) -> dict:
    """Transfere/move uma nota ou arquivo entre Cadernos e Workspaces sem precisar recriá-la."""
    with SessionLocal() as db:
        note = db.query(models.Note).filter(models.Note.id == note_id).first()
        if not note:
            return {"error": f"Nota com ID {note_id} não encontrada."}

        target_ws_id = target_workspace_id
        target_nb = None
        if target_notebook_id is not None:
            target_nb = db.query(models.Notebook).filter(models.Notebook.id == target_notebook_id).first()
            if not target_nb:
                return {"error": f"Caderno de destino com ID {target_notebook_id} não encontrado."}
            if target_ws_id is None:
                target_ws_id = target_nb.workspace_id

        if target_ws_id is None and note.workspace_id is not None:
            target_ws_id = note.workspace_id

        if target_ws_id is not None:
            ws = db.query(models.Workspace).filter(models.Workspace.id == target_ws_id).first()
            if not ws:
                return {"error": f"Workspace de destino com ID {target_ws_id} não encontrado."}

        note.workspace_id = target_ws_id
        note.notebook_id = target_notebook_id
        db.commit()
        db.refresh(note)

        ws_title = db.query(models.Workspace.title).filter(models.Workspace.id == note.workspace_id).scalar() if note.workspace_id else "Nenhum"
        nb_title = db.query(models.Notebook.title).filter(models.Notebook.id == note.notebook_id).scalar() if note.notebook_id else "Raiz do Workspace"

        return {
            "success": True,
            "message": f"Nota '{note.title}' (ID {note.id}) transferida com sucesso para o Workspace '{ws_title}' e Caderno '{nb_title}'.",
            "note_id": note.id,
            "title": note.title,
            "workspace_id": note.workspace_id,
            "notebook_id": note.notebook_id
        }

def list_notes_in_library(workspace_id: Optional[int] = None, notebook_id: Optional[int] = None, search_term: Optional[str] = None) -> dict:
    """Lista ou busca notas/arquivos existentes na biblioteca para obter IDs e localizações atuais."""
    with SessionLocal() as db:
        query = db.query(models.Note)
        if workspace_id is not None:
            query = query.filter(models.Note.workspace_id == workspace_id)
        if notebook_id is not None:
            query = query.filter(models.Note.notebook_id == notebook_id)
        
        notes = query.all()
        if search_term:
            term_lower = search_term.lower()
            notes = [n for n in notes if term_lower in (n.title or "").lower()]

        notes = notes[:50]
        result = []
        for n in notes:
            result.append({
                "id": n.id,
                "title": n.title,
                "type": n.type,
                "workspace_id": n.workspace_id,
                "notebook_id": n.notebook_id,
                "created_at": n.created_at.isoformat() if n.created_at else None
            })
        return {"notes": result, "count": len(result)}


