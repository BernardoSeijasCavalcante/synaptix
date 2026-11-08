import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, Mic, Timer, Clock, Trash2, History, X, ChevronLeft, AlertCircle } from 'lucide-react';
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
  }, [messages, loading]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  const fetchTodaySession = async () => {
    try {
      const res = await fetch("/chat/session");
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
      const res = await fetch("/chat/sessions");
      const dates = await res.json();
      setHistoryDates(dates);
      setShowHistory(true);
    } catch (err) {
      console.error("Failed to load history dates", err);
    }
  };

  const loadPastSession = async (date: string) => {
    try {
      const res = await fetch(`/chat/session/${date}`);
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
    const fetchActiveTasks = async () => {
      try {
        const resTasks = await fetch("/tasks/active");
        if (resTasks.ok) {
          const tasks = await resTasks.json();
          setActiveTasks(tasks);
        }
      } catch (e) {
        // fail silently
      }
    };

    fetchActiveTasks();

    const interval = setInterval(async () => {
      try {
        // 1. Fetch Notifications
        const res = await fetch("/notifications/unread");
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
              await fetch(`/notifications/${n.id}/read`, { method: "POST" });
            });
          }
        }

        // 2. Fetch Active Tasks for the Timer
        await fetchActiveTasks();

      } catch (e) {
        // fail silently on polling error
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText !== undefined ? messageText : input;
    if (!textToSend.trim()) return;

    // Pedir permissao de notificacao nativa mediante interacao do usuario
    if ('Notification' in window && notifPerm === 'default') {
      Notification.requestPermission().then(perm => {
        setNotifPerm(perm);
      });
    }

    const newMsg = { role: "user", content: textToSend, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/chat", {
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
      await fetch("/chat/session/clear", { method: "POST" });
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] relative overflow-hidden bg-transparent">
      
      {/* Top Header Floating Glass Controls */}
      <div className="absolute top-4 right-6 z-20 flex items-center gap-2">
        {viewingDate ? (
          <button 
            onClick={fetchTodaySession}
            className="glass-btn-gold flex items-center gap-2 px-3.5 py-1.5 rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
          >
            <ChevronLeft size={16} />
            <span className="text-xs font-semibold">Voltar para Hoje</span>
          </button>
        ) : (
          <div className="glass-panel-subtle flex items-center gap-1.5 p-1 rounded-xl shadow-lg border border-white/10">
            <button 
              onClick={openHistory}
              className="flex items-center gap-1.5 text-slate-300 hover:text-amber-400 hover:bg-white/[0.06] px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              title="Ver conversas anteriores"
            >
              <History size={15} className="text-amber-400" />
              <span>Histórico</span>
            </button>
            {messages.length > 0 && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <button 
                  onClick={handleClearSession}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  title="Reiniciar chat diário"
                >
                  <Trash2 size={15} />
                  <span>Limpar</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* History Slide-over Frosted Glass Modal */}
      {showHistory && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="w-84 sm:w-96 bg-[#091129]/90 backdrop-blur-2xl border-l border-white/10 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2.5 text-sm tracking-wide">
                <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <History size={16} />
                </div>
                <span>Histórico de Sessões</span>
              </h3>
              <button 
                onClick={() => setShowHistory(false)} 
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
              {historyDates.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  <Clock size={32} className="mx-auto mb-2 opacity-40" />
                  Nenhum histórico anterior gravado.
                </div>
              ) : (
                historyDates.map(date => (
                  <button
                    key={date}
                    onClick={() => loadPastSession(date)}
                    className="w-full text-left p-3.5 rounded-xl glass-card glass-card-hover flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-2 rounded-lg group-hover:scale-105 transition-transform">
                        <Clock size={16} />
                      </div>
                      <div>
                        <span className="font-semibold text-sm text-slate-200 group-hover:text-amber-300 transition-colors">
                          {date}
                        </span>
                        <p className="text-[11px] text-slate-500">Sessão salva</p>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="rotate-180 text-slate-500 group-hover:text-amber-400 transition-colors" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Native Notifications Permission Banner */}
      {notifPerm === 'default' && (
        <div className="glass-panel border-b border-amber-500/25 bg-amber-950/25 text-amber-300 px-4 py-2.5 text-sm shadow-md z-20 flex flex-wrap justify-center items-center gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400 shrink-0" />
            <span>Permita as notificações nativas para receber lembretes de tempo da sua secretária.</span>
          </div>
          <button 
            onClick={() => {
              Notification.requestPermission().then(perm => {
                setNotifPerm(perm);
                if (perm === 'granted') {
                  new Notification("Synaptix", { body: "Notificações ativadas com sucesso!" });
                } else if (perm === 'denied') {
                  alert("Permissão negada. Você pode ativar nas configurações do navegador.");
                }
              });
            }}
            className="glass-btn-gold px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider"
          >
            Ativar Notificações
          </button>
        </div>
      )}

      {/* Active Tasks Glass Banner */}
      {activeTasks.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/30 via-yellow-950/20 to-amber-950/30 border-b border-amber-500/20 backdrop-blur-xl px-6 py-2.5 shadow-lg z-10 flex flex-col items-center">
          {activeTasks.map(task => {
            let elapsedSinceStart = 0;
            if (task.timer_started_at) {
              const rawStarted = String(task.timer_started_at);
              const isoStr = rawStarted.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(rawStarted) ? rawStarted : rawStarted + "Z";
              const startedAt = new Date(isoStr);
              if (!isNaN(startedAt.getTime())) {
                elapsedSinceStart = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
              }
            }
            const baseSeconds = Number(task.time_spent_seconds) || 0;
            const totalElapsed = baseSeconds + elapsedSinceStart;
            
            const hours = Math.floor(totalElapsed / 3600);
            const mins = Math.floor((totalElapsed % 3600) / 60);
            const secs = totalElapsed % 60;
            const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            const estimatedSecs = (Number(task.estimated_hours) || 0) * 3600;
            const percent = estimatedSecs > 0 ? Math.min(100, Math.floor((totalElapsed / estimatedSecs) * 100)) : 0;

            return (
              <div key={task.id} className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-amber-300 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-400">
                    <Timer size={14} className="animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                  <span>Tarefa ativa: <strong className="text-amber-200">{task.name}</strong></span>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full font-mono text-xs text-amber-300 shadow-[0_0_12px_rgba(234,179,8,0.15)]">
                  <Clock size={12} />
                  <span>{timeStr}</span>
                  {estimatedSecs > 0 && (
                    <span className="text-amber-400/80">/ {task.estimated_hours}h ({percent}%)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Empty Welcome State */}
          {messages.length === 0 && (
            <div className="my-10 max-w-xl mx-auto text-center">
              <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
                {/* Refractive corner sheen */}
                <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-400/10 rounded-full blur-2xl group-hover:bg-amber-400/20 transition-all pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400/20 via-yellow-500/10 to-transparent border border-amber-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)] flex items-center justify-center">
                    <Bot size={32} className="text-amber-400 drop-shadow-sm" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold mb-2.5 tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                    Secretária Executiva
                  </h2>
                  <p className="text-slate-400 text-sm sm:text-base mb-6 leading-relaxed">
                    Seu Segundo Cérebro conectado às suas demandas, anotações e compromissos com inteligência reflexiva.
                  </p>

                  {/* Suggestion Chips */}
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center pt-2">
                    {[
                      "Quais são minhas demandas para hoje?",
                      "Crie uma nova anotação estratégica",
                      "Como está a alocação do meu tempo?",
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(prompt)}
                        className="glass-btn-ghost text-xs font-medium px-3.5 py-2 rounded-xl text-left sm:text-center hover:border-amber-500/40 hover:text-amber-300 transition-all"
                      >
                        <span className="text-amber-400 mr-1.5">✦</span> {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Chat Messages */}
          {messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && String(m.content).trim().length > 0).map((msg, i) => {
            const isUser = msg.role === 'user';
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            
            return (
              <div 
                key={i} 
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                <div className="flex items-end gap-2 max-w-[90%] sm:max-w-[82%]">
                  {!isUser && (
                    <div className="shrink-0 mb-1 hidden sm:flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shadow-[0_0_10px_rgba(234,179,8,0.15)]">
                      <Bot size={16} />
                    </div>
                  )}

                  <div className={`p-4 sm:p-5 rounded-2xl shadow-xl transition-all ${
                    isUser 
                      ? 'bg-gradient-to-br from-blue-900/45 via-indigo-950/60 to-blue-950/50 backdrop-blur-xl text-blue-50 border border-blue-400/30 rounded-br-xs shadow-blue-950/40 prose prose-invert prose-p:my-1 prose-headings:my-2 prose-a:text-blue-200' 
                      : 'glass-panel text-slate-100 rounded-bl-xs border border-white/10 shadow-black/40 prose prose-invert prose-p:my-1.5 prose-headings:my-2 prose-pre:bg-slate-950/70 prose-pre:backdrop-blur-md prose-pre:border prose-pre:border-white/10 prose-code:text-amber-300 prose-a:text-amber-400'
                  }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {timeStr && (
                  <span className={`text-[10px] text-slate-400 font-mono mt-1 px-1 ${isUser ? 'mr-1' : 'ml-1 sm:ml-10'}`}>
                    {timeStr}
                  </span>
                )}
              </div>
            );
          })}
          
          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="flex items-center gap-3 glass-panel text-slate-200 px-5 py-3.5 rounded-2xl rounded-bl-xs shadow-xl border border-white/10 max-w-[85%]">
                <Loader2 size={18} className="animate-spin text-amber-400" />
                <span className="text-slate-300 text-sm font-medium tracking-wide flex items-center gap-1.5">
                  Processando resposta e ferramentas
                  <span className="flex gap-0.5">
                    <span className="animate-bounce text-amber-400" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce text-amber-400" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce text-amber-400" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Glass Dock Input */}
      <div className="p-4 sm:pb-6 bg-transparent shrink-0 z-20">
        <div className="max-w-4xl mx-auto flex gap-2.5 items-end glass-panel rounded-2xl p-2 sm:p-2.5 border border-white/15 focus-within:border-amber-400/50 focus-within:shadow-[0_0_30px_rgba(234,179,8,0.2)] shadow-2xl transition-all duration-300">
          <button 
            type="button"
            className="p-3 text-slate-400 hover:text-amber-400 rounded-xl hover:bg-white/[0.06] transition flex-shrink-0 self-end mb-0.5"
            title="Entrada por voz (Em breve)"
          >
            <Mic size={20} />
          </button>
          
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!!viewingDate}
            placeholder={viewingDate ? `Visualizando histórico (${viewingDate}). Retorne para hoje para interagir.` : "Pergunte algo, ordene uma tarefa ou anote uma ideia... (Shift+Enter para quebra)"}
            className="flex-1 bg-transparent outline-none py-2.5 text-slate-100 placeholder-slate-400 resize-none max-h-56 min-h-[46px] overflow-y-auto font-sans text-sm leading-relaxed disabled:opacity-50"
            rows={1}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 220)}px`;
            }}
          />

          <button 
            onClick={() => handleSend()}
            disabled={loading || !input.trim() || !!viewingDate}
            className="glass-btn-gold p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all flex-shrink-0 shadow-lg self-end mb-0.5 flex items-center justify-center"
            title="Enviar mensagem"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
