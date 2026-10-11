import json
from sqlalchemy import text
from database import engine

def init_vector_db():
    with engine.connect() as conn:
        # Create virtual table for note embeddings
        conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
                note_id INTEGER PRIMARY KEY,
                embedding float[1536]
            );
        """))
        conn.commit()

if __name__ == "__main__":
    init_vector_db()
    print("Vector DB initialized successfully.")
