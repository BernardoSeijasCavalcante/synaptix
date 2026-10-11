import re

with open("models.py", "r", encoding="utf-8") as f:
    content = f.read()

new_task = """class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    priority = Column(String, default="medium")
    difficulty = Column(String, default="medium")
    estimated_hours = Column(Integer, default=0)
    status = Column(String, default="pending")
    time_spent_seconds = Column(Integer, default=0)
    timer_status = Column(String, default="stopped")
    timer_started_at = Column(DateTime, nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
"""

content = re.sub(r'class Task\(Base\):.*?updated_at = Column\(DateTime, default=datetime\.datetime\.utcnow, onupdate=datetime\.datetime\.utcnow\)\n', new_task, content, flags=re.DOTALL)

with open("models.py", "w", encoding="utf-8") as f:
    f.write(content)
