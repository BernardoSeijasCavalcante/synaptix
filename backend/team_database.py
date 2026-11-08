"""
Banco de dados ISOLADO da Equipe (synaptix_team.db).

- Engine/Base/Session totalmente separadas do banco pessoal (database.py).
- Escopo de acesso aplicado NO NÍVEL DO ORM (do_orm_execute + before_flush): toda sessão carrega
  um TeamScope; consultas são filtradas automaticamente e escritas violando as travas de
  governança são rejeitadas com HTTP 403, independentemente do endpoint que as originou.
"""
import os
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEAM_DB_PATH = os.environ.get("SYNAPTIX_TEAM_DB_PATH") or os.path.join(BASE_DIR, "synaptix_team.db")
TEAM_UPLOADS_DIR = os.environ.get("SYNAPTIX_TEAM_UPLOADS_DIR") or os.path.join(BASE_DIR, "uploads_team")

team_engine = create_engine(
    f"sqlite:///{TEAM_DB_PATH}", connect_args={"check_same_thread": False}
)
TeamBase = declarative_base()


@dataclass(frozen=True)
class TeamScope:
    """
    role: 'leader' (dispositivo ECDSA do Líder) ou 'member' (sessão de liderado).
    mode: 'member' (restrito a member_id + itens compartilhados),
          'shared' (apenas biblioteca/eventos compartilhados da equipe),
          'all' (visão consolidada; somente Líder).
    """
    role: str
    mode: str = "member"
    member_id: Optional[int] = None
    shared_readonly: bool = False
    actor: str = ""


current_scope: ContextVar[Optional[TeamScope]] = ContextVar("synaptix_team_scope", default=None)


class ScopedSession(Session):
    def __init__(self, *args, scope: Optional[TeamScope] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.info["scope"] = scope if scope is not None else current_scope.get()


TeamSessionLocal = sessionmaker(
    class_=ScopedSession, autocommit=False, autoflush=False, bind=team_engine
)


def get_unscoped_team_db():
    """Sessão SEM escopo — uso exclusivo de rotas de gestão restritas ao Líder."""
    db = TeamSessionLocal(scope=None)
    db.info["scope"] = None
    try:
        yield db
    finally:
        db.close()


def init_team_database():
    import team_models  # noqa: F401  (registra os modelos em TeamBase)
    os.makedirs(TEAM_UPLOADS_DIR, exist_ok=True)
    TeamBase.metadata.create_all(bind=team_engine)
    import team_scope  # noqa: F401  (registra os listeners de escopo)
