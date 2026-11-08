import { create } from 'zustand';
import type { 
  GuidedStudySession, 
  GuidedStudySessionSummary, 
  ExtractFileResponse 
} from '../types';
import { trackSiteEvent } from '../security/eventTracker';
import { useCommentsStore } from './useCommentsStore';

const API_URL = '';

interface GuidedStudyState {
  isOpen: boolean;
  sessions: GuidedStudySessionSummary[];
  activeSession: GuidedStudySession | null;
  isLoadingSessions: boolean;
  isInitializingSession: boolean;
  isSendingTurn: boolean;
  isExtractingFile: boolean;
  isAskingDoubt: boolean;
  raisingHandForMessageId: string | null;
  error: string | null;

  // Drawer visibility
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  // Session Management
  fetchSessions: (workspaceId?: number | null, notebookId?: number | null, targetNoteId?: number | null) => Promise<void>;
  loadSession: (sessionId: number) => Promise<void>;
  createSession: (params: {
    title: string;
    workspaceId?: number | null;
    notebookId?: number | null;
    targetNoteId?: number | null;
    sourceNoteIds: number[];
    rawText?: string;
    depthPersona?: string;
    surfacePace?: 'fast' | 'standard' | 'detailed';
    autoCreateSynapses?: boolean;
  }) => Promise<GuidedStudySession | null>;
  
  sendTurn: (
    message: string, 
    action?: 'answer' | 'ask_hint' | 'advance_phase' | 'recap',
    autoCreateSynapse?: boolean
  ) => Promise<any>;

  raiseHand: (parentMessageId: string, doubtText: string, threadId?: string) => Promise<boolean>;
  resolveDoubt: (parentMessageId: string, threadId: string) => Promise<boolean>;

  extractFile: (file: File) => Promise<ExtractFileResponse | null>;
  crystallizeSynapse: (messageId: string, customObservation?: string) => Promise<number | null>;
  rebuildRoadmap: (sessionId: number, surfacePace?: 'fast' | 'standard' | 'detailed') => Promise<boolean>;
  jumpToStep: (topicIndex: number, subconceptIndex?: number, phase?: 'surface' | 'depth') => Promise<boolean>;
  generateVisual: (sessionId: number, messageId: string, promptHint?: string) => Promise<string | null>;
  updateSessionConfig: (updates: Partial<{ title: string; depth_persona: string; surface_pace: 'fast' | 'standard' | 'detailed'; auto_create_synapses: boolean; current_phase: string }>) => Promise<void>;
  deleteSession: (sessionId: number) => Promise<void>;
  clearActiveSession: () => void;
}

export const useGuidedStudyStore = create<GuidedStudyState>((set, get) => ({
  isOpen: false,
  sessions: [],
  activeSession: null,
  isLoadingSessions: false,
  isInitializingSession: false,
  isSendingTurn: false,
  isExtractingFile: false,
  isAskingDoubt: false,
  raisingHandForMessageId: null,
  error: null,

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((state) => ({ isOpen: !state.isOpen })),

  fetchSessions: async (workspaceId, notebookId, targetNoteId) => {
    set({ isLoadingSessions: true, error: null });
    try {
      const params = new URLSearchParams();
      if (workspaceId) params.append('workspace_id', workspaceId.toString());
      if (notebookId) params.append('notebook_id', notebookId.toString());
      if (targetNoteId) params.append('target_note_id', targetNoteId.toString());

      const url = params.toString() ? `${API_URL}/guided-study/sessions?${params.toString()}` : `${API_URL}/guided-study/sessions`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Falha ao listar sessões de estudo guiado');
      }
      const data: GuidedStudySessionSummary[] = await res.json();
      set({ sessions: data, isLoadingSessions: false });
    } catch (err: any) {
      console.error('Erro ao buscar sessões:', err);
      set({ error: err.message || 'Erro ao carregar sessões', isLoadingSessions: false });
    }
  },

  loadSession: async (sessionId: number) => {
    set({ isInitializingSession: true, error: null });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${sessionId}`);
      if (!res.ok) {
        throw new Error('Falha ao carregar detalhes da sessão');
      }
      const session: GuidedStudySession = await res.json();
      set({ activeSession: session, isInitializingSession: false, isOpen: true });

      trackSiteEvent({
        event_type: 'STUDY_SESSION_LOADED',
        category: 'AI_AGENT',
        severity: 'INFO',
        endpoint: `/guided-study/sessions/${sessionId}`,
        details: `Sessão de estudo retoma: '${session.title}' (Fase: ${session.current_phase.toUpperCase()}).`,
      });
    } catch (err: any) {
      console.error('Erro ao carregar sessão:', err);
      set({ error: err.message || 'Erro ao carregar sessão', isInitializingSession: false });
    }
  },

  createSession: async ({
    title,
    workspaceId,
    notebookId,
    targetNoteId,
    sourceNoteIds,
    rawText,
    depthPersona = 'Cientista da Computação',
    surfacePace = 'standard',
    autoCreateSynapses = true
  }) => {
    set({ isInitializingSession: true, error: null });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          workspace_id: workspaceId,
          notebook_id: notebookId,
          target_note_id: targetNoteId,
          source_note_ids: sourceNoteIds,
          raw_text: rawText,
          depth_persona: depthPersona,
          surface_pace: surfacePace,
          auto_create_synapses: autoCreateSynapses
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao iniciar sessão de estudo');
      }

      const newSession: GuidedStudySession = await res.json();
      set((state) => ({
        activeSession: newSession,
        sessions: [
          {
            id: newSession.id,
            title: newSession.title,
            workspace_id: newSession.workspace_id,
            notebook_id: newSession.notebook_id,
            target_note_id: newSession.target_note_id,
            depth_persona: newSession.depth_persona,
            surface_pace: newSession.surface_pace,
            current_phase: newSession.current_phase,
            current_topic_index: newSession.current_topic_index,
            total_topics: newSession.roadmap.length,
            validated_surface_topics: 0,
            validated_depth_topics: 0,
            status: newSession.status,
            created_at: newSession.created_at,
            updated_at: newSession.updated_at
          },
          ...state.sessions
        ],
        isInitializingSession: false,
        isOpen: true
      }));

      trackSiteEvent({
        event_type: 'STUDY_SESSION_STARTED',
        category: 'AI_AGENT',
        severity: 'SUCCESS',
        endpoint: `/guided-study/sessions/${newSession.id}`,
        details: `Nova sessão de estudo guiado iniciada: '${newSession.title}' com ${newSession.roadmap.length} tópicos.`,
      });

      return newSession;
    } catch (err: any) {
      console.error('Erro ao criar sessão:', err);
      set({ error: err.message || 'Erro ao criar sessão', isInitializingSession: false });
      return null;
    }
  },

  sendTurn: async (message: string, action = 'answer', autoCreateSynapse = true) => {
    const session = get().activeSession;
    if (!session) return null;

    set({ isSendingTurn: true, error: null });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: message,
          action,
          auto_create_synapse: autoCreateSynapse
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao processar resposta com o mentor IA');
      }

      const data = await res.json();
      const updatedSession: GuidedStudySession = data.session;
      const turnResult = data.turn_result;

      set({ activeSession: updatedSession, isSendingTurn: false });

      // Se uma nova sinapse foi criada no mapa mental, sincroniza os comentários do caderno
      if (turnResult?.synapse_comment_id && updatedSession.notebook_id) {
        useCommentsStore.getState().fetchNotebookComments(updatedSession.notebook_id);
        useCommentsStore.getState().fetchNotebookConnections(updatedSession.notebook_id);
      }

      return turnResult;
    } catch (err: any) {
      console.error('Erro no turno de estudo:', err);
      set({ error: err.message || 'Erro ao enviar resposta', isSendingTurn: false });
      return null;
    }
  },

  extractFile: async (file: File) => {
    set({ isExtractingFile: true, error: null });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/guided-study/extract-file`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao extrair texto do arquivo');
      }

      const data: ExtractFileResponse = await res.json();
      set({ isExtractingFile: false });
      return data;
    } catch (err: any) {
      console.error('Erro ao extrair arquivo:', err);
      set({ error: err.message || 'Erro ao extrair arquivo', isExtractingFile: false });
      return null;
    }
  },

  crystallizeSynapse: async (messageId: string, customObservation?: string) => {
    const session = get().activeSession;
    if (!session) return null;

    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}/crystallize-synapse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          custom_observation: customObservation
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao cristalizar sinapse');
      }

      const data = await res.json();
      const synapseId = data.synapse_comment_id;

      // Atualiza localmente a mensagem da sessão
      if (synapseId) {
        set((state) => {
          if (!state.activeSession) return state;
          const updatedMessages = state.activeSession.messages.map((m) =>
            m.id === messageId ? { ...m, synapse_comment_id: synapseId } : m
          );
          return {
            activeSession: {
              ...state.activeSession,
              last_synapse_comment_id: synapseId,
              messages: updatedMessages
            }
          };
        });

        if (session.notebook_id) {
          useCommentsStore.getState().fetchNotebookComments(session.notebook_id);
          useCommentsStore.getState().fetchNotebookConnections(session.notebook_id);
        }
      }

      return synapseId;
    } catch (err: any) {
      console.error('Erro ao cristalizar sinapse:', err);
      return null;
    }
  },

  rebuildRoadmap: async (sessionId: number, surfacePace?: 'fast' | 'standard' | 'detailed') => {
    set({ isInitializingSession: true, error: null });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${sessionId}/rebuild-roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface_pace: surfacePace || 'standard' })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao reconstruir trilha socrática');
      }
      const updated: GuidedStudySession = await res.json();
      set({ activeSession: updated, isInitializingSession: false });
      return true;
    } catch (err: any) {
      console.error('Erro ao reconstruir trilha:', err);
      set({ error: err.message || 'Falha ao reconstruir trilha', isInitializingSession: false });
      return false;
    }
  },

  jumpToStep: async (topicIndex: number, subconceptIndex?: number, phase?: 'surface' | 'depth') => {
    const session = get().activeSession;
    if (!session) return false;

    set({ isSendingTurn: true, error: null });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}/jump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_index: topicIndex,
          subconcept_index: subconceptIndex,
          phase: phase
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao saltar etapa de estudo');
      }

      const updated: GuidedStudySession = await res.json();
      set({ activeSession: updated, isSendingTurn: false });
      return true;
    } catch (err: any) {
      console.error('Erro ao saltar etapa:', err);
      set({ error: err.message || 'Falha ao saltar etapa', isSendingTurn: false });
      return false;
    }
  },

  generateVisual: async (sessionId: number, messageId: string, promptHint?: string) => {
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${sessionId}/generate-visual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, prompt_hint: promptHint })
      });
      if (!res.ok) {
        throw new Error('Falha ao gerar diagrama visual');
      }
      const data = await res.json();
      const mermaidCode = data.diagram_mermaid;
      if (mermaidCode) {
        set((state) => {
          if (!state.activeSession) return state;
          const updatedMessages = state.activeSession.messages.map((m) =>
            m.id === messageId ? { ...m, diagram_mermaid: mermaidCode } : m
          );
          return {
            activeSession: {
              ...state.activeSession,
              messages: updatedMessages
            }
          };
        });
      }
      return mermaidCode;
    } catch (err: any) {
      console.error('Erro ao gerar recurso visual:', err);
      return null;
    }
  },

  raiseHand: async (parentMessageId: string, doubtText: string, threadId?: string) => {
    const session = get().activeSession;
    if (!session) return false;

    set({ isAskingDoubt: true, raisingHandForMessageId: parentMessageId });
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}/raise-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_message_id: parentMessageId,
          doubt_text: doubtText,
          thread_id: threadId || null
        })
      });

      if (!res.ok) {
        throw new Error('Falha ao processar dúvida');
      }

      const updated: GuidedStudySession = await res.json();
      set({ activeSession: updated, isAskingDoubt: false, raisingHandForMessageId: null });
      return true;
    } catch (err: any) {
      console.error('Erro ao levantar a mão / tirar dúvida:', err);
      set({ isAskingDoubt: false, raisingHandForMessageId: null });
      return false;
    }
  },

  resolveDoubt: async (parentMessageId: string, threadId: string) => {
    const session = get().activeSession;
    if (!session) return false;

    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}/resolve-doubt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_message_id: parentMessageId,
          thread_id: threadId
        })
      });

      if (!res.ok) {
        throw new Error('Falha ao marcar dúvida como resolvida');
      }

      const updated: GuidedStudySession = await res.json();
      set({ activeSession: updated });
      return true;
    } catch (err) {
      console.error('Erro ao resolver dúvida:', err);
      return false;
    }
  },

  updateSessionConfig: async (updates) => {
    const session = get().activeSession;
    if (!session) return;

    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!res.ok) {
        throw new Error('Falha ao atualizar configurações da sessão');
      }

      const updated: GuidedStudySession = await res.json();
      set({ activeSession: updated });
    } catch (err) {
      console.error('Erro ao atualizar sessão:', err);
    }
  },

  deleteSession: async (sessionId: number) => {
    try {
      const res = await fetch(`${API_URL}/guided-study/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error('Falha ao excluir sessão');
      }
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        activeSession: state.activeSession?.id === sessionId ? null : state.activeSession
      }));
    } catch (err) {
      console.error('Erro ao excluir sessão:', err);
    }
  },

  clearActiveSession: () => set({ activeSession: null })
}));
