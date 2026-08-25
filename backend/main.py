from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Synaptix API")

# Allow CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Synaptix API"}

# Notebook Endpoints
@app.post("/notebooks", response_model=schemas.NotebookResponse)
def create_notebook(notebook: schemas.NotebookCreate, db: Session = Depends(get_db)):
    db_notebook = models.Notebook(**notebook.model_dump())
    db.add(db_notebook)
    db.commit()
    db.refresh(db_notebook)
    return db_notebook

@app.get("/notebooks", response_model=List[schemas.NotebookResponse])
def get_notebooks(db: Session = Depends(get_db)):
    return db.query(models.Notebook).filter(models.Notebook.is_active == True).all()

@app.put("/notebooks/{notebook_id}", response_model=schemas.NotebookResponse)
def update_notebook(notebook_id: int, notebook: schemas.NotebookUpdate, db: Session = Depends(get_db)):
    db_notebook = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if not db_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    update_data = notebook.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_notebook, key, value)
        
    db.commit()
    db.refresh(db_notebook)
    return db_notebook

# Note Endpoints
@app.post("/notes", response_model=schemas.NoteResponse)
def create_note(note: schemas.NoteCreate, db: Session = Depends(get_db)):
    db_note = models.Note(**note.model_dump())
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note

@app.get("/notes", response_model=List[schemas.NoteResponse])
def get_notes(notebook_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Note)
    if notebook_id is not None:
        query = query.filter(models.Note.notebook_id == notebook_id)
    return query.all()

@app.put("/notes/{note_id}", response_model=schemas.NoteResponse)
def update_note(note_id: int, note: schemas.NoteUpdate, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = note.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_note, key, value)
        
    db.commit()
    db.refresh(db_note)
    return db_note

@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(db_note)
    db.commit()
    return {"message": "Note deleted"}


@app.post("/analyze")
def analyze_content(payload: dict):
    # Mock payload format: {"content": "text to analyze"}
    content = payload.get("content", "")
    
    # Returning mock data suitable for React Flow for now
    nodes = [
        {"id": "1", "data": {"label": "Conceito Chave A"}, "position": {"x": 250, "y": 100}},
        {"id": "2", "data": {"label": "Conceito Relacionado B"}, "position": {"x": 100, "y": 250}},
        {"id": "3", "data": {"label": "Aplicação C"}, "position": {"x": 400, "y": 250}}
    ]
    edges = [
        {"id": "e1-2", "source": "1", "target": "2", "label": "depende de"},
        {"id": "e1-3", "source": "1", "target": "3", "label": "gera"}
    ]
    return {"nodes": nodes, "edges": edges}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
