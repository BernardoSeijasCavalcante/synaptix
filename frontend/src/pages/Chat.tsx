import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, Mic, Timer, Clock, Trash2, History, X, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Chat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [now, setNow] = useState<Date>(new Date());

  const [showHistory, setShowHistory] = useState(false);
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [viewingDate, setViewingDate] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  const fetchTodaySession = async () => {
    try {
      const res = await fetch("http://localhost:8000/chat/session");
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      }
      setViewingDate(null);
    } catch (err) {
      console.error("Failed to load session", err);
    }
  };

  // Fetch today's chat session on mount
  useEffect(() => {
    fetchTodaySession();
  }, []);

  const openHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/chat/sessions");
      const dates = await res.json();
      setHistoryDates(dates);
      setShowHistory(true);
    } catch (err) {
      console.error("Failed to load history dates", err);
    }
  };

  const loadPastSession = async (date: string) => {
    try {
      const res = await fetch(`http://localhost:8000/chat/session/${date}`);
      const data = await res.json();
      setMessages(data);
      setViewingDate(date);
      setShowHistory(false);
    } catch (err) {
      console.error("Failed to load past session", err);
    }
  };

  // Update visual timer every second
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  // Poll for notifications and active tasks
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // 1. Fetch Notifications
        const res = await fetch("http://localhost:8000/notifications/unread");
        if (res.ok) {
          const notifications = await res.json();
          if (notifications.length > 0) {
            notifications.forEach(async (n: any) => {
              // Trigger Windows/Browser Notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification("Synaptix - Alerta de Tempo", { body: n.message });
              }

              // Add to chat
              setMessages(prev => [...prev, { 
                role: "assistant", 
                content: `🚨 **Notificação do Sistema:**\n\n${n.message}`,
                timestamp: new Date().toISOString()
              }]);
              await fetch(`http://localhost:8000/notifications/${n.id}/read`, { method: "POST" });
            });
          }
        }

        // 2. Fetch Active Tasks for the Timer
        const resTasks = await fetch("http://localhost:8000/tasks/active");
        if (resTasks.ok) {
          const tasks = await resTasks.json();
          setActiveTasks(tasks);
        }

      } catch (e) {
        // fail silently on polling error
      }
    }, 3000); // Polling every 3 seconds for better responsiveness
    return () => clearInterval(interval);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Pedir permissao de notificacao nativa mediante interacao do usuario
    if ('Notification' in window && notifPerm === 'default') {
      Notification.requestPermission().then(perm => {
        setNotifPerm(perm);
      });
    }

    const newMsg = { role: "user", content: input, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        throw new Error("Erro na comunicação com a secretária");
      }

      const data = await response.json();
      
      // Inject timestamps if missing
      const serverMsgs = data.messages.map((m: any) => {
        if (!m.timestamp) m.timestamp = new Date().toISOString();
        return m;
      });
      
      setMessages(serverMsgs);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: "**Erro:** Desculpe, ocorreu um erro de conexão.", timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearSession = async () => {
    if (confirm("Tem certeza que deseja apagar o histórico de hoje? (Sua base de dados não será afetada)")) {
      await fetch("http://localhost:8000/chat/session/clear", { method: "POST" });
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0a1128] relative overflow-hidden">
      
      {/* Top Header Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {viewingDate ? (
          <button 
            onClick={fetchTodaySession}
            className="flex items-center gap-2 bg-yellow-600/20 text-yellow-500 border border-yellow-600/30 px-3 py-2 rounded-lg shadow-sm hover:bg-yellow-600/30 transition"
          >
            <ChevronLeft size={16} />
            <span className="text-sm font-medium">Voltar para Hoje</span>
          </button>
        ) : (
          <>
            <button 
              onClick={openHistory}
              className="flex items-center gap-2 bg-slate-900 text-gray-300 px-3 py-2 rounded-lg shadow-sm border border-slate-700 hover:text-yellow-400 hover:bg-slate-800 transition"
              title="Ver conversas anteriores"
            >
              <History size={16} />
              <span className="text-sm font-medium">Histórico</span>
            </button>
            {messages.length > 0 && (
              <button 
                onClick={handleClearSession}
                className="flex items-center gap-2 bg-slate-900 text-gray-300 px-3 py-2 rounded-lg shadow-sm border border-slate-700 hover:text-red-400 hover:bg-slate-800 transition"
                title="Reiniciar chat diário"
              >
                <Trash2 size={16} />
                <span className="text-sm font-medium">Limpar</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* History Slide-over Modal */}
      {showHistory && (
        <div className="absolute inset-0 z-30 flex justify-end bg-black bg-opacity-50 transition-opacity">
          <div className="w-80 bg-slate-950 border-l border-slate-800 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-gray-200 flex items-center gap-2">
                <History size={18} className="text-yellow-500" /> Histórico
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-yellow-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {historyDates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center mt-4">Nenhum histórico encontrado.</p>
              ) : (
                historyDates.map(date => (
                  <button
                    key={date}
                    onClick={() => loadPastSession(date)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-slate-800 hover:border-yellow-500/50 hover:bg-slate-900 transition flex items-center gap-3 group"
                  >
                    <div className="bg-slate-800 text-yellow-500 p-2 rounded-lg group-hover:bg-yellow-500/20 transition">
                      <Clock size={16} />
                    </div>
                    <span className="font-medium text-gray-300 group-hover:text-gray-200">{date}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notifications Permission Banner */}
      {notifPerm === 'default' && (
        <div className="bg-slate-900 border-b border-slate-800 text-yellow-500 p-2 text-center text-sm shadow-md z-20 flex justify-center items-center gap-4">
          <span>Para receber os alertas de tempo no Windows, precisamos da sua permissão.</span>
          <button 
            onClick={() => {
              Notification.requestPermission().then(perm => {
                setNotifPerm(perm);
                if (perm === 'granted') {
                  new Notification("Synaptix", { body: "Notificações ativadas com sucesso!" });
                } else if (perm === 'denied') {
                  alert("Permissão negada. Você precisa ativar manualmente nas configurações do navegador (ícone de cadeado na barra de endereços).");
                }
              });
            }}
            className="bg-yellow-600/20 text-yellow-500 border border-yellow-600/30 px-3 py-1 rounded-md font-bold hover:bg-yellow-600/30 transition"
          >
            Ativar Notificações Nativas
          </button>
        </div>
      )}

      {/* Active Tasks Banner */}
      {activeTasks.length > 0 && (
        <div className="bg-yellow-900/20 border-b border-yellow-700/50 p-3 shadow-sm z-10 flex flex-col items-center">
          {activeTasks.map(task => {
            const startedAt = new Date(task.timer_started_at + "Z"); // Parse UTC
            const elapsedSinceStart = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
            const totalElapsed = task.time_spent_seconds + elapsedSinceStart;
            
            const hours = Math.floor(totalElapsed / 3600);
            const mins = Math.floor((totalElapsed % 3600) / 60);
            const secs = totalElapsed % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            const estimatedSecs = (task.estimated_hours || 0) * 3600;
            const percent = estimatedSecs > 0 ? Math.min(100, Math.floor((totalElapsed / estimatedSecs) * 100)) : 0;

            return (
              <div key={task.id} className="flex items-center gap-4 text-yellow-500 font-medium">
                <div className="flex items-center gap-2">
                  <Timer size={18} className="animate-pulse text-yellow-400" />
                  <span>Tarefa ativa: <strong>{task.name}</strong></span>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded-full font-mono text-sm">
                  <Clock size={14} />
                  <span>{timeStr}</span>
                  {estimatedSecs > 0 && <span>/ {task.estimated_hours}h ({percent}%)</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <Bot size={48} className="mx-auto mb-4 text-slate-600" />
              <h2 className="text-3xl font-bold mb-3 text-gray-300">Secretária Executiva (Segundo Cérebro)</h2>
              <p className="text-lg">Envie tarefas, ideias ou anotações. Suporte nativo a **Markdown**.</p>
            </div>
          )}
          
          {messages.filter(m => m.role === 'user' || m.role === 'assistant').map((msg, i) => {
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] p-5 rounded-2xl shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-900/40 text-blue-100 border border-blue-800/50 rounded-br-sm prose prose-invert prose-p:my-1 prose-headings:my-2 prose-a:text-blue-200' 
                    : 'bg-slate-900 border border-slate-800 text-gray-200 rounded-bl-sm prose prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800'
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
                {timeStr && (
                  <span className="text-[11px] text-slate-500 mt-1 px-1">
                    {timeStr}
                  </span>
                )}
              </div>
            )
          })}
          
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-slate-900 border border-slate-800 text-gray-200 p-5 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-yellow-500" />
                <span className="text-slate-400 font-medium">Pensando e executando ferramentas...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-transparent shrink-0 z-10">
        <div className="max-w-4xl mx-auto flex gap-3 items-end bg-slate-900 rounded-2xl p-2 border border-slate-800 focus-within:border-slate-700 focus-within:ring-2 focus-within:ring-slate-800 transition-all shadow-xl">
          <button className="p-3 text-slate-500 hover:text-yellow-500 rounded-full hover:bg-slate-800 transition flex-shrink-0 self-end mb-1">
            <Mic size={22} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!!viewingDate}
            placeholder={viewingDate ? `Visualizando histórico (${viewingDate}). Retorne para hoje para enviar mensagens.` : "Escreva sua mensagem... (Use Shift+Enter para quebrar linha)"}
            className="flex-1 bg-transparent outline-none py-3 text-gray-200 placeholder-slate-500 resize-none max-h-60 min-h-[50px] overflow-y-auto font-sans leading-relaxed disabled:opacity-50"
            rows={1}
            style={{
              height: 'auto'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
            }}
          />
          <button 
            onClick={handleSend}
            disabled={loading || !input.trim() || !!viewingDate}
            className="p-3 mb-1 bg-yellow-600/20 text-yellow-500 border border-yellow-600/30 rounded-xl hover:bg-yellow-600/30 disabled:opacity-50 transition flex-shrink-0 shadow self-end"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
