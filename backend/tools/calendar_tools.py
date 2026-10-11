from datetime import datetime
from typing import List, Optional
from database import SessionLocal
import models

def read_calendar(start_date: str, end_date: str) -> List[dict]:
    """
    Lista eventos da agenda entre duas datas (formato ISO: YYYY-MM-DDTHH:MM:SS)
    """
    try:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    except ValueError:
        return [{"error": "Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}]

    with SessionLocal() as db:
        events = db.query(models.Event).filter(
            models.Event.start_time >= start,
            models.Event.start_time <= end
        ).all()
        
        return [
            {
                "id": e.id,
                "title": e.title,
                "start_time": e.start_time.isoformat(),
                "end_time": e.end_time.isoformat(),
                "attendees": e.attendees,
                "created_at": e.created_at.isoformat() if e.created_at else None
            }
            for e in events
        ]

def create_event(title: str, start_time: str, end_time: str, attendees: Optional[str] = None) -> dict:
    """
    Cria um novo evento na agenda. Datas devem estar no formato ISO (YYYY-MM-DDTHH:MM:SS)
    """
    try:
        start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except ValueError:
        return {"error": "Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}

    with SessionLocal() as db:
        new_event = models.Event(
            title=title,
            start_time=start,
            end_time=end,
            attendees=attendees
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        return {"success": True, "event_id": new_event.id, "message": "Event created successfully."}

def update_cancel_event(event_id: int, action: str, new_title: str = None, new_start: str = None, new_end: str = None) -> dict:
    """
    Atualiza ou cancela ('cancel') um evento existente pelo ID.
    """
    with SessionLocal() as db:
        event = db.query(models.Event).filter(models.Event.id == event_id).first()
        if not event:
            return {"error": "Event not found."}
            
        if action.lower() == 'cancel':
            db.delete(event)
            db.commit()
            return {"success": True, "message": "Event canceled successfully."}
            
        if new_title:
            event.title = new_title
        if new_start:
            event.start_time = datetime.fromisoformat(new_start.replace("Z", "+00:00"))
        if new_end:
            event.end_time = datetime.fromisoformat(new_end.replace("Z", "+00:00"))
            
        db.commit()
        return {"success": True, "message": "Event updated successfully."}
