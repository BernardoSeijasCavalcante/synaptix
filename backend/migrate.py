import sqlite3

def run():
    conn = sqlite3.connect('synaptix.db')
    try:
        conn.execute("ALTER TABLE notes ADD COLUMN type VARCHAR DEFAULT 'markdown'")
    except Exception as e:
        print("Note type already exists or error:", e)
    
    try:
        conn.execute("ALTER TABLE notes ADD COLUMN file_url VARCHAR")
    except Exception as e:
        print("Note file_url already exists or error:", e)

    try:
        conn.execute("ALTER TABLE comments ADD COLUMN page_number INTEGER")
    except Exception as e:
        pass
    
    for col in ['rect_x1', 'rect_y1', 'rect_x2', 'rect_y2', 'x_position', 'y_position', 'notebook_id']:
        try:
            conn.execute(f"ALTER TABLE comments ADD COLUMN {col} INTEGER")
        except Exception as e:
            pass
            
    try:
        conn.execute("ALTER TABLE comments ADD COLUMN is_question BOOLEAN DEFAULT 0")
    except Exception as e:
        pass

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    run()
