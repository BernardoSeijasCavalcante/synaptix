import { useState, useEffect } from 'react';
import { useNotesStore } from '../store/useNotesStore';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { Notebook } from '../types';

const NotebookItem = ({ notebook, depth = 0 }: { notebook: Notebook; depth?: number }) => {
  const { notebooks, notes, activeNotebookId, activeNoteId, setActiveNotebook, setActiveNote, createNote, createNotebook, inactivateNotebook } = useNotesStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const childNotebooks = notebooks.filter(n => n.parent_id === notebook.id);
  const childNotes = notes.filter(n => n.notebook_id === notebook.id);

  const isSelected = activeNotebookId === notebook.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    setActiveNotebook(notebook.id);
  };

  const handleAddSubNotebook = (e: React.MouseEvent) => {
    e.stopPropagation();
    const title = prompt('Nome do sub-caderno:');
    if (title) {
      createNotebook(title, notebook.id);
      setIsOpen(true);
    }
  };

  const handleAddNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    const title = prompt('Nome da nova nota:');
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
    <div>
      <div
        className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/50 text-yellow-500' : 'text-gray-300 hover:bg-blue-900/30 hover:text-white'}`}
        style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-gray-400">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <Folder size={16} className={isSelected ? 'text-yellow-500' : 'text-gray-400'} />
          <span className="truncate text-sm font-medium">{notebook.title}</span>
        </div>
        
        {isHovered && (
          <div className="flex items-center gap-1">
            <button onClick={handleAddSubNotebook} className="p-1 hover:text-yellow-400" title="Novo Sub-caderno">
              <Folder size={14} />
            </button>
            <button onClick={handleAddNote} className="p-1 hover:text-yellow-400" title="Nova Nota">
              <Plus size={14} />
            </button>
            <button onClick={handleDelete} className="p-1 hover:text-red-400" title="Inativar Caderno">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div>
          {childNotebooks.map(child => (
            <NotebookItem key={child.id} notebook={child} depth={depth + 1} />
          ))}
          {childNotes.map(note => (
            <div
              key={note.id}
              className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm transition-colors ${activeNoteId === note.id ? 'bg-blue-800 text-white' : 'text-gray-400 hover:bg-blue-900/30 hover:text-gray-200'}`}
              style={{ paddingLeft: `${(depth + 1) * 1 + 0.5}rem` }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveNote(note.id);
                setActiveNotebook(notebook.id);
              }}
            >
              <FileText size={14} />
              <span className="truncate">{note.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar = () => {
  const { notebooks, fetchNotebooks, fetchNotes, createNotebook, notes, activeNoteId, setActiveNote } = useNotesStore();

  useEffect(() => {
    fetchNotebooks();
    fetchNotes(); // Fetch all notes initially
  }, []);

  const rootNotebooks = notebooks.filter(n => n.parent_id === null);
  const orphanNotes = notes.filter(n => n.notebook_id === null);

  const handleCreateRootNotebook = () => {
    const title = prompt('Nome do caderno:');
    if (title) {
      createNotebook(title);
    }
  };

  return (
    <div className="w-72 bg-slate-950 h-full flex flex-col border-r border-slate-800 shrink-0">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h2 className="text-yellow-500 font-bold tracking-wider uppercase text-sm">Meus Cadernos</h2>
        <button 
          onClick={handleCreateRootNotebook}
          className="text-gray-300 hover:text-yellow-400 p-1"
          title="Novo Caderno Raiz"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rootNotebooks.map(notebook => (
          <NotebookItem key={notebook.id} notebook={notebook} />
        ))}
        
        {orphanNotes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-gray-500 text-xs font-semibold px-2 mb-2 uppercase">Notas Avulsas</h3>
            {orphanNotes.map(note => (
              <div
                key={note.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm transition-colors ${activeNoteId === note.id ? 'bg-blue-800 text-white' : 'text-gray-400 hover:bg-blue-900/30 hover:text-gray-200'}`}
                onClick={() => setActiveNote(note.id)}
              >
                <FileText size={14} />
                <span className="truncate">{note.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
