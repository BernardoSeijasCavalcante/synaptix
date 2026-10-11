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

def read_organization_rules() -> str:
    """Le as regras de organizacao definidas pelo usuario."""
    if os.path.exists("library_rules.txt"):
        with open("library_rules.txt", "r", encoding="utf-8") as f:
            return f.read()
    return "Nenhuma regra de organizacao restrita definida pelo usuario. Organize as pastas usando seu proprio criterio."

def update_organization_rules(rules: str) -> dict:
    """Atualiza as regras e parametros de como a IA deve organizar a biblioteca."""
    with open("library_rules.txt", "w", encoding="utf-8") as f:
        f.write(rules)
    return {"success": True, "message": "Regras de organizacao atualizadas."}
