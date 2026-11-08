import { useState, useEffect } from 'react';
import { useNotesStore } from '../store/useNotesStore';
import { FolderInput, X, Folder, Layers, FileText, File, Check, Loader2 } from 'lucide-react';
import type { Notebook } from '../types';

export const TransferNoteModal = () => {
  const { 
    transferModalNote, 
    closeTransferModal, 
    workspaces, 
    fetchAllNotebooks, 
    transferNote 
  } = useNotesStore();

  const [allNotebooks, setAllNotebooks] = useState<Notebook[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [selectedNotebookId, setSelectedNotebookId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);

  useEffect(() => {
    if (transferModalNote) {
      setSelectedWorkspaceId(transferModalNote.workspace_id);
      setSelectedNotebookId(transferModalNote.notebook_id);

      setIsLoadingNotebooks(true);
      fetchAllNotebooks()
        .then(notebooks => {
          setAllNotebooks(notebooks);
        })
        .finally(() => {
          setIsLoadingNotebooks(false);
        });
    }
  }, [transferModalNote]);

  // Se mudar o workspace e o caderno selecionado não pertencer ao novo workspace, reseta o caderno
  const handleWorkspaceChange = (wsId: number) => {
    setSelectedWorkspaceId(wsId);
    if (selectedNotebookId) {
      const nb = allNotebooks.find(n => n.id === selectedNotebookId);
      if (nb && nb.workspace_id !== wsId) {
        setSelectedNotebookId(null);
      }
    }
  };

  if (!transferModalNote) return null;

  const availableNotebooks = allNotebooks.filter(
    nb => selectedWorkspaceId ? nb.workspace_id === selectedWorkspaceId : true
  );

  const currentWorkspace = workspaces.find(w => w.id === transferModalNote.workspace_id);
  const currentNotebook = allNotebooks.find(n => n.id === transferModalNote.notebook_id);

  const handleConfirm = async () => {
    if (!selectedWorkspaceId) {
      alert("Por favor, selecione um Workspace de destino.");
      return;
    }

    try {
      setIsSubmitting(true);
      await transferNote(
        transferModalNote.id, 
        selectedWorkspaceId, 
        selectedNotebookId || null
      );
    } catch (err) {
      alert("Erro ao transferir nota. Verifique os dados e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md glass-panel bg-slate-900/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm tracking-wide">
            <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
              <FolderInput size={16} />
            </div>
            <span>Transferir Nota / Arquivo</span>
          </div>
          <button 
            onClick={closeTransferModal}
            className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Note Info Card */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 truncate">
              {transferModalNote.type === 'pdf' ? (
                <File size={14} className="text-rose-400 shrink-0" />
              ) : (
                <FileText size={14} className="text-amber-400 shrink-0" />
              )}
              <span className="truncate">{transferModalNote.title}</span>
            </div>
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2">
              <span>Local atual:</span>
              <span className="text-slate-300 font-medium">
                {currentWorkspace?.title || 'Sem Workspace'} &rarr; {currentNotebook?.title || 'Raiz'}
              </span>
            </div>
          </div>

          {/* Select Target Workspace */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers size={13} className="text-amber-400" />
              <span>Workspace de Destino</span>
            </label>
            <select
              className="w-full glass-input text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-amber-400/50 transition-all font-medium"
              value={selectedWorkspaceId || ''}
              onChange={(e) => handleWorkspaceChange(Number(e.target.value))}
            >
              <option value="" disabled className="bg-slate-900 text-slate-400">
                Selecione o Workspace...
              </option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id} className="bg-slate-900 text-slate-200">
                  {ws.title}
                </option>
              ))}
            </select>
          </div>

          {/* Select Target Notebook */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Folder size={13} className="text-amber-400" />
              <span>Caderno / Pasta de Destino</span>
            </label>
            <select
              disabled={isLoadingNotebooks || !selectedWorkspaceId}
              className="w-full glass-input text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-amber-400/50 transition-all font-medium disabled:opacity-50"
              value={selectedNotebookId || ''}
              onChange={(e) => setSelectedNotebookId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" className="bg-slate-900 text-slate-300">
                (Nenhum caderno - Salvar na raiz do Workspace)
              </option>
              {availableNotebooks.map(nb => (
                <option key={nb.id} value={nb.id} className="bg-slate-900 text-slate-200">
                  📁 {nb.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 flex justify-end items-center gap-2.5 bg-white/[0.02]">
          <button
            onClick={closeTransferModal}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedWorkspaceId}
            className="glass-btn-gold px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Transferindo...</span>
              </>
            ) : (
              <>
                <Check size={13} />
                <span>Confirmar Transferência</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
