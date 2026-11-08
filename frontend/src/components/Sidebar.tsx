import React, { useState, useEffect } from 'react';
import { useNotesStore } from '../store/useNotesStore';
import { usePromptStore } from '../store/usePromptStore';
import {
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  FolderPlus,
  FilePlus,
  Upload,
  Layers,
  FolderInput,
  File,
  Lock,
  Unlock,
  Key,
  Loader2,
} from 'lucide-react';
import type { Notebook, Note } from '../types';
import { PasswordModal, type PasswordModalMode } from './PasswordModal';


interface PasswordModalConfig {
  isOpen: boolean;
  mode: PasswordModalMode;
  itemType: 'Caderno' | 'Sub-caderno' | 'Nota';
  item: Notebook | Note | null;
}

const NoteSidebarItem = ({
  note,
  depth,
  onPasswordAction,
}: {
  note: Note;
  depth: number;
  onPasswordAction: (mode: PasswordModalMode, note: Note) => void;
}) => {
  const { activeNoteId, setActiveNote, setActiveNotebook, openTransferModal, deleteNote, isNoteUnlocked, lockNote } = useNotesStore();
  const [showMenu, setShowMenu] = useState(false);
  const isNoteActive = activeNoteId === note.id;
  const isProtected = Boolean(note.is_password_protected);
  const isUnlocked = isNoteUnlocked(note.id);

  return (
    <div
      className={`group/note relative flex items-center justify-between py-1.5 px-2.5 rounded-lg cursor-pointer text-xs transition-all duration-200 ${
        isNoteActive
          ? 'bg-blue-600/25 border border-blue-400/35 text-white font-medium shadow-[0_0_15px_rgba(59,130,246,0.2)]'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
      }`}
      style={{ paddingLeft: `${depth * 0.85 + 0.6}rem` }}
      onClick={() => {
        setActiveNote(note.id);
        if (note.notebook_id) {
          setActiveNotebook(note.notebook_id);
        }
      }}
    >
      <div className="flex items-center gap-2 overflow-hidden truncate">
        {note.type === 'pdf' ? (
          <File size={13} className={isNoteActive ? 'text-rose-400' : 'text-rose-400/80'} />
        ) : (
          <FileText size={13} className={isNoteActive ? 'text-blue-400' : 'text-slate-500'} />
        )}
        <span className="truncate">{note.title}</span>
        {isProtected && (
          isUnlocked ? (
            <span title="Nota protegida (Desbloqueada)">
              <Unlock size={11} className="text-emerald-400 shrink-0" />
            </span>
          ) : (
            <span title="Nota protegida por senha">
              <Lock size={11} className="text-amber-400 shrink-0" />
            </span>
          )
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover/note:opacity-100 transition-opacity ml-1 shrink-0">
        {isProtected ? (
          <>
            {isUnlocked ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  lockNote(note.id);
                }}
                className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-emerald-400"
                title="Bloquear Nota Agora"
              >
                <Lock size={12} />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPasswordAction('unlock', note);
                }}
                className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-amber-400"
                title="Desbloquear Nota"
              >
                <Unlock size={12} />
              </button>
            )}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-slate-400"
                title="Gerenciar Senha da Nota"
              >
                <Key size={12} />
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-36 bg-slate-900 border border-white/15 rounded-xl shadow-2xl py-1 z-30 text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onPasswordAction('change', note);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200"
                  >
                    Alterar Senha
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onPasswordAction('remove', note);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 text-rose-300"
                  >
                    Remover Senha
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPasswordAction('set', note);
            }}
            className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-slate-400"
            title="Proteger Nota com Senha"
          >
            <Key size={12} />
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            openTransferModal(note);
          }}
          className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-slate-400"
          title="Transferir / Mover Nota"
        >
          <FolderInput size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Deseja excluir a nota "${note.title}"?`)) {
              deleteNote(note.id);
            }
          }}
          className="p-1 hover:text-rose-400 hover:bg-rose-500/10 rounded transition text-slate-400"
          title="Excluir Nota"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

const NotebookItem = ({
  notebook,
  depth = 0,
  onPasswordAction,
  onNotePasswordAction,
}: {
  notebook: Notebook;
  depth?: number;
  onPasswordAction: (mode: PasswordModalMode, notebook: Notebook) => void;
  onNotePasswordAction: (mode: PasswordModalMode, note: Note) => void;
}) => {
  const { 
    notebooks, notes, activeNotebookId, 
    setActiveNotebook, createNote, createNotebook, 
    inactivateNotebook, isNotebookUnlocked, lockNotebook
  } = useNotesStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showPasswordMenu, setShowPasswordMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isProtected = Boolean(notebook.is_password_protected);
  const isUnlocked = isNotebookUnlocked(notebook.id);

  // Auto-expand if notebook was just unlocked
  useEffect(() => {
    if (isProtected && isUnlocked) {
      setIsOpen(true);
    }
  }, [isUnlocked, isProtected]);

  const childNotebooks = notebooks.filter(n => n.parent_id === notebook.id);
  const childNotes = notes.filter(n => n.notebook_id === notebook.id);

  const isSelected = activeNotebookId === notebook.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProtected && !isUnlocked) {
      onPasswordAction('unlock', notebook);
      return;
    }
    setIsOpen(!isOpen);
    setActiveNotebook(notebook.id);
  };

  const handleAddSubNotebook = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const title = await usePromptStore.getState().openPrompt('Nome do sub-caderno:');
    if (title) {
      createNotebook(title, notebook.id);
      setIsOpen(true);
    }
  };

  const handleAddNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const title = await usePromptStore.getState().openPrompt('Nome da nova nota:');
    if (title) {
      createNote(title, 'Comece a escrever...', notebook.id);
      setIsOpen(true);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Deseja inativar o caderno "${notebook.title}"?`)) {
      inactivateNotebook(notebook.id);
    }
  };

  return (
    <div className="select-none">
      <div
        className={`group relative flex items-center justify-between py-2 px-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
          isSelected 
            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200 shadow-[0_0_15px_rgba(234,179,8,0.12)]' 
            : 'text-slate-300 hover:bg-white/[0.05] hover:text-white border border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 0.85 + 0.6}rem` }}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowPasswordMenu(false);
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden truncate">
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <Folder size={15} className={isSelected ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-400 transition-colors'} />
          <span className="truncate text-xs font-semibold">{notebook.title}</span>
          {isProtected && (
            isUnlocked ? (
              <span title="Caderno protegido (Desbloqueado)">
                <Unlock size={12} className="text-emerald-400 shrink-0" />
              </span>
            ) : (
              <span title="Caderno protegido por senha">
                <Lock size={12} className="text-amber-400 shrink-0" />
              </span>
            )
          )}
        </div>
        
        {isHovered && (
          <div className="flex items-center gap-1 opacity-90 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleAddSubNotebook} className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition" title="Novo Sub-caderno">
              <FolderPlus size={13} />
            </button>
            <button onClick={handleAddNote} className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition" title="Nova Nota Markdown">
              <FilePlus size={13} />
            </button>
            <label className={`p-1 hover:text-amber-400 hover:bg-white/10 rounded cursor-pointer transition ${isUploading ? 'opacity-70 pointer-events-none' : ''}`} title={isUploading ? "Enviando PDF..." : "Upload PDF/Slide"}>
              <input 
                type="file" 
                accept="application/pdf" 
                className="hidden" 
                disabled={isUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setIsUploading(true);
                  try {
                    const url = await useNotesStore.getState().uploadFile(file);
                    if (url) {
                      const newNote = await useNotesStore.getState().createNote(file.name, '', notebook.id, 'pdf', url);
                      if (newNote?.id) {
                        useNotesStore.getState().setActiveNote(newNote.id);
                      }
                      setIsOpen(true);
                    }
                  } catch (err) {
                    console.error('Falha no upload de PDF:', err);
                  } finally {
                    setIsUploading(false);
                  }
                }} 
              />
              {isUploading ? (
                <Loader2 size={13} className="animate-spin text-amber-400" />
              ) : (
                <Upload size={13} />
              )}
            </label>

            {/* Gerenciamento de Senha */}
            {isProtected ? (
              <>
                {isUnlocked ? (
                  <button
                    onClick={() => {
                      lockNotebook(notebook.id);
                      setIsOpen(false);
                    }}
                    className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-emerald-400"
                    title="Bloquear Caderno Agora"
                  >
                    <Lock size={13} />
                  </button>
                ) : (
                  <button
                    onClick={() => onPasswordAction('unlock', notebook)}
                    className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-amber-400"
                    title="Desbloquear Caderno"
                  >
                    <Unlock size={13} />
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={() => setShowPasswordMenu(!showPasswordMenu)}
                    className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-slate-400"
                    title="Opções de Senha do Caderno"
                  >
                    <Key size={13} />
                  </button>
                  {showPasswordMenu && (
                    <div
                      className="absolute right-0 top-full mt-1 w-36 bg-slate-900 border border-white/15 rounded-xl shadow-2xl py-1 z-30 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setShowPasswordMenu(false);
                          onPasswordAction('change', notebook);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200"
                      >
                        Alterar Senha
                      </button>
                      <button
                        onClick={() => {
                          setShowPasswordMenu(false);
                          onPasswordAction('remove', notebook);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 text-rose-300"
                      >
                        Remover Senha
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => onPasswordAction('set', notebook)}
                className="p-1 hover:text-amber-400 hover:bg-white/10 rounded transition text-slate-400"
                title="Proteger Caderno com Senha"
              >
                <Key size={13} />
              </button>
            )}

            <button onClick={handleDelete} className="p-1 hover:text-rose-400 hover:bg-rose-500/10 rounded transition" title="Inativar Caderno">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {childNotebooks.map(child => (
            <NotebookItem
              key={child.id}
              notebook={child}
              depth={depth + 1}
              onPasswordAction={onPasswordAction}
              onNotePasswordAction={onNotePasswordAction}
            />
          ))}
          {childNotes.map(note => (
            <NoteSidebarItem
              key={note.id}
              note={note}
              depth={depth + 1}
              onPasswordAction={onNotePasswordAction}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar = () => {
  const { 
    workspaces, activeWorkspaceId, setActiveWorkspace, createWorkspace, inactivateWorkspace, fetchWorkspaces,
    notebooks, createNotebook, notes,
    unlockNotebook, setNotebookPassword, removeNotebookPassword,
    unlockNote, setNotePassword, removeNotePassword
  } = useNotesStore();

  const [passwordModal, setPasswordModal] = useState<PasswordModalConfig>({
    isOpen: false,
    mode: 'unlock',
    itemType: 'Caderno',
    item: null,
  });

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const rootNotebooks = notebooks.filter(n => n.parent_id === null);
  const orphanNotes = notes.filter(n => n.notebook_id === null);

  const handleCreateRootNotebook = async () => {
    if (!activeWorkspaceId) {
      alert("Por favor, selecione ou crie um Workspace primeiro.");
      return;
    }
    const title = await usePromptStore.getState().openPrompt('Nome do caderno:');
    if (title) {
      createNotebook(title);
    }
  };

  const handleCreateWorkspace = async () => {
    const title = await usePromptStore.getState().openPrompt('Nome do Workspace:');
    if (title) {
      createWorkspace(title);
    }
  };

  const handleInactivateWorkspace = () => {
    if (activeWorkspaceId && confirm("Deseja inativar o Workspace atual?")) {
      inactivateWorkspace(activeWorkspaceId);
    }
  };

  const openNotebookPasswordModal = (mode: PasswordModalMode, notebook: Notebook) => {
    setPasswordModal({
      isOpen: true,
      mode,
      itemType: notebook.parent_id !== null ? 'Sub-caderno' : 'Caderno',
      item: notebook,
    });
  };

  const openNotePasswordModal = (mode: PasswordModalMode, note: Note) => {
    setPasswordModal({
      isOpen: true,
      mode,
      itemType: 'Nota',
      item: note,
    });
  };

  const handlePasswordSubmit = async (data: { password: string; currentPassword?: string }) => {
    if (!passwordModal.item) return;

    if (passwordModal.itemType === 'Caderno' || passwordModal.itemType === 'Sub-caderno') {
      const nb = passwordModal.item as Notebook;
      switch (passwordModal.mode) {
        case 'unlock':
          await unlockNotebook(nb.id, data.password);
          break;
        case 'set':
          await setNotebookPassword(nb.id, data.password);
          break;
        case 'change':
          await setNotebookPassword(nb.id, data.password, data.currentPassword);
          break;
        case 'remove':
          await removeNotebookPassword(nb.id, data.password);
          break;
      }
    } else {
      const note = passwordModal.item as Note;
      switch (passwordModal.mode) {
        case 'unlock':
          await unlockNote(note.id, data.password);
          break;
        case 'set':
          await setNotePassword(note.id, data.password);
          break;
        case 'change':
          await setNotePassword(note.id, data.password, data.currentPassword);
          break;
        case 'remove':
          await removeNotePassword(note.id, data.password);
          break;
      }
    }
  };

  return (
    <>
      <div className="w-72 sm:w-80 glass-panel-subtle h-full flex flex-col border-r border-white/10 shrink-0 backdrop-blur-2xl">
        {/* Workspace Selector Section */}
        <div className="p-4 border-b border-white/10 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-slate-400 font-bold tracking-wider uppercase text-[11px]">
              <Layers size={13} className="text-amber-400" />
              <span>Workspace</span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={handleCreateWorkspace}
                className="text-slate-400 hover:text-amber-400 hover:bg-white/[0.08] p-1.5 rounded-lg transition"
                title="Novo Workspace"
              >
                <Plus size={14} />
              </button>
              {activeWorkspaceId && (
                <button 
                  onClick={handleInactivateWorkspace}
                  className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition"
                  title="Inativar Workspace"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <select 
            className="w-full glass-input text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-amber-400/50 transition-all font-medium"
            value={activeWorkspaceId || ''}
            onChange={(e) => setActiveWorkspace(Number(e.target.value) || null)}
          >
            {workspaces.length === 0 && (
              <option value="" disabled className="bg-slate-900 text-slate-400">Nenhum Workspace</option>
            )}
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id} className="bg-slate-900 text-slate-200">{ws.title}</option>
            ))}
          </select>
        </div>

        {/* Cadernos Header */}
        <div className="p-3.5 px-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-amber-400 font-bold tracking-wider uppercase text-xs flex items-center gap-1.5">
            <span>Cadernos</span>
            <span className="text-[10px] text-slate-500 font-mono font-normal">({rootNotebooks.length})</span>
          </h2>
          <button 
            onClick={handleCreateRootNotebook}
            className="text-slate-300 hover:text-amber-300 hover:bg-white/[0.08] p-1.5 rounded-lg transition"
            title="Novo Caderno Raiz"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Notebooks List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {rootNotebooks.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-xs">
              Nenhum caderno criado neste workspace.
            </div>
          )}
          
          {rootNotebooks.map(notebook => (
            <NotebookItem
              key={notebook.id}
              notebook={notebook}
              onPasswordAction={openNotebookPasswordModal}
              onNotePasswordAction={openNotePasswordModal}
            />
          ))}
          
          {orphanNotes.length > 0 && (
            <div className="mt-5 pt-3 border-t border-white/10">
              <h3 className="text-slate-500 text-[11px] font-bold px-2.5 mb-2 uppercase tracking-wider">Notas Avulsas</h3>
              <div className="space-y-0.5">
                {orphanNotes.map(note => (
                  <NoteSidebarItem
                    key={note.id}
                    note={note}
                    depth={0}
                    onPasswordAction={openNotePasswordModal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <PasswordModal
        isOpen={passwordModal.isOpen}
        onClose={() => setPasswordModal({ ...passwordModal, isOpen: false })}
        mode={passwordModal.mode}
        itemType={passwordModal.itemType}
        itemName={passwordModal.item?.title || ''}
        onSubmit={handlePasswordSubmit}
      />
    </>
  );
};
