import re

with open("schemas.py", "r", encoding="utf-8") as f:
    content = f.read()

new_task_schema = """# Task Schemas
class TaskBase(BaseModel):
    name: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"
    difficulty: Optional[str] = "medium"
    estimated_hours: Optional[int] = 0
    status: Optional[str] = "pending"
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_hours: Optional[int] = None
    status: Optional[str] = None
    workspace_id: Optional[int] = None
    notebook_id: Optional[int] = None
    time_spent_seconds: Optional[int] = None
    timer_status: Optional[str] = None

class TaskResponse(TaskBase):
    id: int
    time_spent_seconds: int
    timer_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True"""

content = re.sub(r'# Task Schemas.*?class Config:\s+from_attributes = True', new_task_schema, content, flags=re.DOTALL)

with open("schemas.py", "w", encoding="utf-8") as f:
    f.write(content)
