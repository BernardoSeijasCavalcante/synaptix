"""
Escopo de segurança do domínio da Equipe, aplicado diretamente no ORM.

1) do_orm_execute  -> injeta filtros de visibilidade em TODA consulta/UPDATE/DELETE ORM da sessão.
2) before_flush    -> preenche donos/flags no INSERT e rejeita (HTTP 403) escritas que violem
                      as travas do Líder, além de validar que toda FK aponte para algo visível.

Assim, mesmo que um endpoint (ou código reaproveitado) esqueça de filtrar, o liderado jamais
lê, altera ou apaga dados fora do seu escopo.
"""
from fastapi import HTTPException
from sqlalchemy import and_, event, false, inspect, or_, select
from sqlalchemy.orm import with_loader_criteria

import team_models as tm
from team_database import ScopedSession, TeamScope

NOTE_DOMAIN = (tm.Workspace, tm.Notebook, tm.Note)
MEMBER_OWNED = (tm.Task, tm.RoutineTemplate, tm.TimelineBlock)
SHAREABLE = (tm.Event, tm.CalendarGoal)
GOVERNED = MEMBER_OWNED + SHAREABLE

FLAG_FIELDS = {
    "member_id", "owner_member_id", "is_team_shared",
    "allow_member_edit", "assigned_by_leader", "created_by_leader",
}

# Campos que o LIDERADO pode alterar em itens travados pelo Líder (assigned_by_leader=True)
LOCK_ALLOWED_FIELDS = {
    tm.Task: {"status", "time_spent_seconds", "timer_status", "timer_started_at", "execution_notes", "updated_at"},
    tm.TimelineBlock: {"status", "timer_started_at", "actual_seconds_spent", "checklist_json", "updated_at", "start_minute", "end_minute", "notes"},
    tm.CalendarGoal: {"logged_hours", "progress_percent", "milestones_json", "status", "updated_at"},
    tm.Event: {"updated_at"},
    tm.RoutineTemplate: {"updated_at"},
}

# Toda FK (modelo -> atributo -> modelo alvo) precisa apontar para algo VISÍVEL no escopo
FK_MAP = {
    tm.Task: {"goal_id": tm.CalendarGoal, "linked_note_id": tm.Note, "workspace_id": tm.Workspace, "notebook_id": tm.Notebook},
    tm.Event: {"goal_id": tm.CalendarGoal},
    tm.CalendarGoal: {"workspace_id": tm.Workspace, "notebook_id": tm.Notebook},
    tm.TimelineBlock: {
        "task_id": tm.Task, "goal_id": tm.CalendarGoal, "event_id": tm.Event,
        "linked_note_id": tm.Note, "routine_template_id": tm.RoutineTemplate,
    },
    tm.RoutineTemplate: {"linked_note_id": tm.Note},
    tm.Note: {"notebook_id": tm.Notebook, "workspace_id": tm.Workspace},
    tm.Notebook: {"parent_id": tm.Notebook, "workspace_id": tm.Workspace},
    tm.Comment: {"note_id": tm.Note, "notebook_id": tm.Notebook},
    tm.CommentConnection: {"source_comment_id": tm.Comment, "target_comment_id": tm.Comment},
}


def _forbidden(detail: str):
    return HTTPException(status_code=403, detail=detail)


# ------------------------------------------------------------------------------
# 1. Filtros de visibilidade
# ------------------------------------------------------------------------------
def _note_visibility(cls, scope: TeamScope):
    if scope.mode == "shared":
        return cls.is_team_shared.is_(True)
    return or_(cls.owner_member_id == scope.member_id, cls.is_team_shared.is_(True))


def _shareable_visibility(cls, scope: TeamScope):
    if scope.mode == "shared":
        return cls.is_team_shared.is_(True)
    return or_(cls.member_id == scope.member_id, cls.is_team_shared.is_(True))


def _owned_visibility(cls, scope: TeamScope):
    if scope.mode == "shared":
        return false()
    if cls is tm.RoutineTemplate:
        return or_(cls.member_id == scope.member_id, cls.member_id.is_(None))
    return cls.member_id == scope.member_id


def _criteria(scope: TeamScope):
    crit = []
    for cls in NOTE_DOMAIN:
        crit.append((cls, _note_visibility(cls, scope)))
    for cls in SHAREABLE:
        crit.append((cls, _shareable_visibility(cls, scope)))
    for cls in MEMBER_OWNED:
        crit.append((cls, _owned_visibility(cls, scope)))

    visible_notes = select(tm.Note.id).where(_note_visibility(tm.Note, scope))
    visible_notebooks = select(tm.Notebook.id).where(_note_visibility(tm.Notebook, scope))
    comment_vis = or_(
        tm.Comment.note_id.in_(visible_notes),
        tm.Comment.notebook_id.in_(visible_notebooks),
    )
    crit.append((tm.Comment, comment_vis))
    visible_comments = select(tm.Comment.id).where(comment_vis)
    crit.append((tm.CommentConnection, and_(
        tm.CommentConnection.source_comment_id.in_(visible_comments),
        tm.CommentConnection.target_comment_id.in_(visible_comments),
    )))
    return crit


@event.listens_for(ScopedSession, "do_orm_execute")
def _apply_scope_filters(state):
    scope = state.session.info.get("scope")
    if scope is None or scope.mode == "all":
        return
    if state.is_column_load or state.is_relationship_load:
        return
    if state.is_select or state.is_update or state.is_delete:
        options = [with_loader_criteria(m, expr, include_aliases=True) for m, expr in _criteria(scope)]
        state.statement = state.statement.options(*options)


# ------------------------------------------------------------------------------
# 2. Preenchimento e travas de escrita
# ------------------------------------------------------------------------------
def _get_visible(session, model, pk):
    return session.query(model).filter(model.id == pk).first()


def _member_can_edit_note_domain(obj, scope: TeamScope) -> bool:
    if obj.is_team_shared:
        return bool(obj.allow_member_edit) and isinstance(obj, tm.Note)
    return obj.owner_member_id == scope.member_id


def _changed_columns(obj):
    state = inspect(obj)
    return {
        attr.key for attr in state.mapper.column_attrs
        if state.attrs[attr.key].history.has_changes()
    }


def _block_assigned_ok(session, blk) -> bool:
    """Bloco gerado por rotina/evento do Líder herda a trava; qualquer outro nasce livre."""
    if blk.routine_template_id:
        rt = _get_visible(session, tm.RoutineTemplate, blk.routine_template_id)
        return bool(rt and rt.assigned_by_leader)
    if blk.event_id:
        ev = _get_visible(session, tm.Event, blk.event_id)
        return bool(ev and ev.assigned_by_leader)
    return False


def _fill_new(session, scope: TeamScope, obj):
    if isinstance(obj, GOVERNED):
        if scope.role == "member":
            obj.member_id = scope.member_id
            if hasattr(obj, "is_team_shared"):
                obj.is_team_shared = False
            obj.assigned_by_leader = _block_assigned_ok(session, obj) if isinstance(obj, tm.TimelineBlock) else False
        elif scope.mode == "member":
            obj.member_id = scope.member_id
            obj.assigned_by_leader = True
            if hasattr(obj, "is_team_shared"):
                obj.is_team_shared = False
        else:
            if isinstance(obj, (tm.Task, tm.TimelineBlock)):
                raise HTTPException(status_code=400, detail="Selecione um liderado específico para criar este item.")
            obj.member_id = None
            if hasattr(obj, "is_team_shared"):
                obj.is_team_shared = True
            obj.assigned_by_leader = True
        return

    if isinstance(obj, NOTE_DOMAIN):
        if scope.role == "member":
            inherit = False
            parent = None
            if isinstance(obj, tm.Note) and obj.notebook_id:
                parent = _get_visible(session, tm.Notebook, obj.notebook_id)
            elif isinstance(obj, tm.Notebook):
                if obj.parent_id:
                    parent = _get_visible(session, tm.Notebook, obj.parent_id)
                elif obj.workspace_id:
                    parent = _get_visible(session, tm.Workspace, obj.workspace_id)
            if parent is not None and parent.is_team_shared:
                if not parent.allow_member_edit:
                    raise _forbidden("Este conteúdo compartilhado é somente leitura para liderados.")
                inherit = not isinstance(obj, tm.Workspace)
            obj.owner_member_id = scope.member_id
            obj.created_by_leader = False
            obj.is_team_shared = inherit
            obj.allow_member_edit = True
        elif scope.mode == "member":
            obj.owner_member_id = scope.member_id
            obj.is_team_shared = False
            obj.allow_member_edit = True
            obj.created_by_leader = True
        else:
            obj.owner_member_id = None
            obj.is_team_shared = True
            obj.allow_member_edit = not scope.shared_readonly
            obj.created_by_leader = True


def _check_fk_visibility(session, obj, only_changed: bool):
    fks = FK_MAP.get(type(obj))
    if not fks:
        return
    changed = _changed_columns(obj) if only_changed else None
    for attr, target in fks.items():
        if changed is not None and attr not in changed:
            continue
        value = getattr(obj, attr, None)
        if value is None:
            continue
        if _get_visible(session, target, value) is None:
            raise _forbidden("Referência inválida ou fora do seu escopo de acesso.")


def _check_member_note_children(session, scope: TeamScope, obj):
    """Liderado só comenta/conecta em notas que pode editar."""
    note = None
    if isinstance(obj, tm.Comment):
        if obj.note_id:
            note = _get_visible(session, tm.Note, obj.note_id)
        elif obj.notebook_id:
            nb = _get_visible(session, tm.Notebook, obj.notebook_id)
            if nb is not None and nb.is_team_shared and not nb.allow_member_edit:
                raise _forbidden("Conteúdo compartilhado somente leitura.")
    elif isinstance(obj, tm.CommentConnection):
        src = _get_visible(session, tm.Comment, obj.source_comment_id)
        if src is not None and src.note_id:
            note = _get_visible(session, tm.Note, src.note_id)
    if note is not None and not _member_can_edit_note_domain(note, scope):
        raise _forbidden("Nota compartilhada somente leitura: comentários e conexões são restritos ao Líder.")


def _guard_member_change(obj, scope: TeamScope, deleting: bool):
    if isinstance(obj, tuple(LOCK_ALLOWED_FIELDS)) and obj.assigned_by_leader:
        if deleting:
            raise _forbidden("Item atribuído/travado pelo Líder: não pode ser excluído.")
        illegal = _changed_columns(obj) - LOCK_ALLOWED_FIELDS[type(obj)]
        if illegal:
            raise _forbidden(
                "Item atribuído pelo Líder: apenas execução é permitida "
                f"(campos bloqueados: {', '.join(sorted(illegal))})."
            )
    if isinstance(obj, NOTE_DOMAIN) and obj.is_team_shared:
        if not _member_can_edit_note_domain(obj, scope):
            raise _forbidden("Conteúdo compartilhado da equipe: somente o Líder pode alterar ou excluir.")


@event.listens_for(ScopedSession, "before_flush")
def _enforce_scope(session, flush_context, instances):
    scope = session.info.get("scope")
    if scope is None:
        return
    is_member = scope.role == "member"
    check_fk = not (scope.role == "leader" and scope.mode == "all")

    for obj in list(session.new):
        _fill_new(session, scope, obj)
        if check_fk:
            _check_fk_visibility(session, obj, only_changed=False)
        if is_member:
            _check_member_note_children(session, scope, obj)

    for obj in list(session.dirty):
        if not session.is_modified(obj, include_collections=False):
            continue
        if is_member:
            if _changed_columns(obj) & FLAG_FIELDS:
                raise _forbidden("Campos de governança só podem ser alterados pelo Líder.")
            _guard_member_change(obj, scope, deleting=False)
            _check_member_note_children(session, scope, obj)
        if check_fk:
            _check_fk_visibility(session, obj, only_changed=True)

    if is_member:
        for obj in list(session.deleted):
            _guard_member_change(obj, scope, deleting=True)
            _check_member_note_children(session, scope, obj)
