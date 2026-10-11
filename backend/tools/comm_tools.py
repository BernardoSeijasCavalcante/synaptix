from datetime import datetime
from database import SessionLocal
import models

def schedule_notification(message: str, scheduled_time: str) -> dict:
    """
    Agenda uma notificacao para ser enviada/exibida no futuro.
    scheduled_time deve estar no formato ISO (YYYY-MM-DDTHH:MM:SS).
    """
    try:
        dt = datetime.fromisoformat(scheduled_time.replace("Z", "+00:00"))
    except ValueError:
        return {"error": "Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}

    with SessionLocal() as db:
        new_notification = models.Notification(
            message=message,
            scheduled_for=dt,
            is_sent=False
        )
        db.add(new_notification)
        db.commit()
        db.refresh(new_notification)
        return {"success": True, "notification_id": new_notification.id, "message": "Notification scheduled."}
