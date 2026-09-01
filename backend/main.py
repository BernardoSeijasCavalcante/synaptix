from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
import uuid

import models
import schemas
from database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Synaptix API")

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Generate unique filename to avoid conflicts
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join("uploads", unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"file_url": f"http://localhost:8000/uploads/{unique_filename}", "filename": file.filename}

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

# Comment Endpoints
@app.post("/notes/{note_id}/comments", response_model=schemas.CommentResponse)
def create_comment(note_id: int, comment: schemas.CommentCreate, db: Session = Depends(get_db)):
    if note_id != comment.note_id:
        raise HTTPException(status_code=400, detail="Path note_id does not match payload note_id")
    db_comment = models.Comment(**comment.model_dump())
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

@app.get("/notes/{note_id}/comments", response_model=List[schemas.CommentResponse])
def get_comments(note_id: int, db: Session = Depends(get_db)):
    return db.query(models.Comment).filter(models.Comment.note_id == note_id).all()

@app.put("/comments/{comment_id}", response_model=schemas.CommentResponse)
def update_comment(comment_id: int, comment: schemas.CommentUpdate, db: Session = Depends(get_db)):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    update_data = comment.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_comment, key, value)
        
    db.commit()
    db.refresh(db_comment)
    return db_comment

@app.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db)):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(db_comment)
    db.commit()
    return {"message": "Comment deleted"}

@app.get("/notebooks/{notebook_id}/comments", response_model=List[schemas.CommentResponse])
def get_notebook_comments(notebook_id: int, db: Session = Depends(get_db)):
    # Get all notes for this notebook
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]
    
    # Get all comments for these notes
    if not note_ids:
        return []
    return db.query(models.Comment).filter(models.Comment.note_id.in_(note_ids)).all()

# Comment Connection Endpoints
@app.post("/comment-connections", response_model=schemas.CommentConnectionResponse)
def create_comment_connection(connection: schemas.CommentConnectionCreate, db: Session = Depends(get_db)):
    db_conn = models.CommentConnection(**connection.model_dump())
    db.add(db_conn)
    db.commit()
    db.refresh(db_conn)
    return db_conn

@app.get("/notebooks/{notebook_id}/comment-connections", response_model=List[schemas.CommentConnectionResponse])
def get_notebook_connections(notebook_id: int, db: Session = Depends(get_db)):
    notes = db.query(models.Note).filter(models.Note.notebook_id == notebook_id).all()
    note_ids = [note.id for note in notes]
    if not note_ids:
        return []
        
    comments = db.query(models.Comment).filter(models.Comment.note_id.in_(note_ids)).all()
    comment_ids = [comment.id for comment in comments]
    if not comment_ids:
        return []
        
    return db.query(models.CommentConnection).filter(
        models.CommentConnection.source_comment_id.in_(comment_ids) |
        models.CommentConnection.target_comment_id.in_(comment_ids)
    ).all()

@app.put("/comment-connections/{conn_id}", response_model=schemas.CommentConnectionResponse)
def update_comment_connection(conn_id: int, connection: schemas.CommentConnectionUpdate, db: Session = Depends(get_db)):
    db_conn = db.query(models.CommentConnection).filter(models.CommentConnection.id == conn_id).first()
    if not db_conn:
        raise HTTPException(status_code=404, detail="Connection not found")
        
    update_data = connection.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_conn, key, value)
        
    db.commit()
    db.refresh(db_conn)
    return db_conn

@app.delete("/comment-connections/{conn_id}")
def delete_comment_connection(conn_id: int, db: Session = Depends(get_db)):
    db_conn = db.query(models.CommentConnection).filter(models.CommentConnection.id == conn_id).first()
    if not db_conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(db_conn)
    db.commit()
    return {"message": "Connection deleted"}



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
