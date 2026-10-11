import os
import json
from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from sqlalchemy import text
from database import SessionLocal, engine
import models

# Initialize OpenAI Client (depends on OPENAI_API_KEY env var)
client = OpenAI()

def _get_embedding(text_content: str) -> list[float]:
    """Helper function to get embedding from OpenAI."""
    response = client.embeddings.create(
        input=text_content,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

from typing import Optional

def save_note(topic: str, content: str, workspace_id: Optional[int] = None, notebook_id: Optional[int] = None) -> dict:
    """
    Salva uma anotacao no Segundo Cerebro, converte o texto em embeddings
    para busca semantica futura.
    """
    try:
        # Generate embedding
        embedding = _get_embedding(f"Title: {topic}\n\nContent: {content}")
        
        with SessionLocal() as db:
            # 1. Create the note
            new_note = models.Note(
                title=topic,
                content=content,
                type="markdown",
                workspace_id=workspace_id,
                notebook_id=notebook_id
            )
            db.add(new_note)
            db.commit()
            db.refresh(new_note)
            
            # 2. Insert into sqlite-vec virtual table
            with engine.connect() as conn:
                conn.execute(
                    text("INSERT INTO note_embeddings(note_id, embedding) VALUES (:id, :emb)"),
                    {"id": new_note.id, "emb": json.dumps(embedding)}
                )
                conn.commit()
                
            return {"success": True, "note_id": new_note.id, "message": "Note saved and embedded successfully."}
            
    except Exception as e:
        return {"error": str(e)}

def search_memory(query: str, limit: int = 5) -> list[dict]:
    """
    Faz a busca semantica na memoria (Segundo Cerebro) usando embeddings
    para recuperar as anotacoes mais relevantes.
    """
    try:
        # Generate embedding for the query
        query_embedding = _get_embedding(query)
        
        with engine.connect() as conn:
            # Query vec0 table for nearest neighbors
            result = conn.execute(
                text("""
                    SELECT note_id, distance
                    FROM note_embeddings
                    WHERE embedding MATCH :query_emb
                    ORDER BY distance
                    LIMIT :limit
                """),
                {"query_emb": json.dumps(query_embedding), "limit": limit}
            )
            
            matches = result.fetchall()
            if not matches:
                return []
                
            # Get the actual notes
            note_ids = [row[0] for row in matches]
            with SessionLocal() as db:
                notes = db.query(models.Note).filter(models.Note.id.in_(note_ids)).all()
                # Create a lookup dictionary and keep the order based on distance
                notes_dict = {n.id: {"title": n.title, "content": n.content, "created_at": n.created_at.isoformat() if n.created_at else None} for n in notes}
                
                ordered_results = []
                for row in matches:
                    nid = row[0]
                    if nid in notes_dict:
                        ordered_results.append(notes_dict[nid])
                        
                return ordered_results
                
    except Exception as e:
        return [{"error": str(e)}]
