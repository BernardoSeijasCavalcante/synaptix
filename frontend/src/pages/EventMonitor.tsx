import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  Clock,
  Calendar,
  Laptop,
  Globe,
  Terminal,
  Bot,
  CheckSquare,
  BookOpen,
  Network as NetworkIcon,
  FolderKanban,
  FileLock2,
  Compass,
  Cpu,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  Pause,
  Play,
  Eye,
} from "lucide-react";
import { formatEventTimestamp } from "../security/eventTracker";

export interface MonitoredEventItem {
  id: number;
  event_type: string;
  category?: string | null;
  severity?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  ip_address?: string | null;
  http_method?: string | null;
  endpoint?: string | null;
  status_code?: number | null;
  details?: string | null;
  created_at: string;
}

interface EventMonitorSummary {
  total_events: number;
  events_today: number;
  security_alerts: number;
  active_devices: number;
  categories_breakdown: Record<string, number>;
  events: MonitoredEventItem[];
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  ALL: {
    label: "Todas as Categorias",
    icon: Activity,
    badgeClass: "bg-slate-800 text-slate-200 border-white/15",
  },
  SECURITY: {
    label: "Segurança & Acesso",
    icon: ShieldCheck,
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  NAVIGATION: {
    label: "Navegação & Interface",
    icon: Compass,
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  },
  CHAT: {
    label: "Secretária Executiva",
    icon: Bot,
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  },
  AI_AGENT: {
    label: "Ações do Agente IA",
    icon: Cpu,
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/40",
  },
  TASKS: {
    label: "Demandas & Cronômetros",
    icon: CheckSquare,
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  CALENDAR: {
    label: "Calendário, Metas & Timeline 24h",
    icon: Calendar,
    badgeClass: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  },
  NOTES: {
    label: "Notas & Documentos",
    icon: BookOpen,
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  },
  WORKSPACES: {
    label: "Espaços & Cadernos",
    icon: FolderKanban,
    badgeClass: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  },
  NETWORK: {
    label: "Rede Sináptica",
    icon: NetworkIcon,
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
  },
  FILES: {
    label: "Cofre de Arquivos",
    icon: FileLock2,
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  SYSTEM: {
    label: "Sistema & API",
    icon: Terminal,
    badgeClass: "bg-slate-700/50 text-slate-300 border-slate-500/40",
  },
};

const SEVERITY_META: Record<
  string,
  { label: string; icon: React.ElementType; badgeClass: string; rowBorder: string }
> = {
  INFO: {
    label: "Informativo",
    icon: Info,
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/35",
    rowBorder: "border-white/10 hover:border-blue-400/40",
  },
  SUCCESS: {
    label: "Sucesso",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    rowBorder: "border-emerald-500/20 hover:border-emerald-400/50",
  },
  WARNING: {
    label: "Atenção",
    icon: AlertTriangle,
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    rowBorder: "border-amber-500/30 hover:border-amber-400/60",
  },
  CRITICAL: {
    label: "Crítico / Bloqueio",
    icon: ShieldAlert,
    badgeClass: "bg-rose-500/20 text-rose-200 border-rose-500/50",
    rowBorder: "border-rose-500/40 hover:border-rose-400/70 bg-rose-950/15",
  },
};

const EventMonitor: React.FC = () => {
  const [data, setData] = useState<EventMonitorSummary>({
    total_events: 0,
    events_today: 0,
    security_alerts: 0,
    active_devices: 0,
    categories_breakdown: {},
    events: [],
  });
  const [loading, setLoading] = useState(true);
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState("ALL");
  const [selectedDevice, setSelectedDevice] = useState("ALL");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "300");
      if (selectedCategory !== "ALL") params.set("category", selectedCategory);
      if (selectedSeverity !== "ALL") params.set("severity", selectedSeverity);
      if (selectedDevice !== "ALL") params.set("device_id", selectedDevice);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/auth/events?${params.toString()}`);
      if (res.ok) {
        const json: EventMonitorSummary = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch {
      // Silencioso em background
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedSeverity, selectedDevice, searchQuery]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!liveRefresh) return;
    const interval = setInterval(fetchEvents, 4000);
    return () => clearInterval(interval);
  }, [liveRefresh, fetchEvents]);

  const knownDevices = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of data.events) {
      if (ev.device_id) {
        map.set(ev.device_id, ev.device_name || `Dispositivo ${ev.device_id.slice(0, 8)}`);
      }
    }
    return Array.from(map.entries());
  }, [data.events]);

  const handleExportLogs = () => {
    const exportPayload = {
      exported_at: new Date().toISOString(),
      total_events: data.total_events,
      events_returned: data.events.length,
      events: data.events.map((ev) => ({
        ...ev,
        local_datetime: formatEventTimestamp(ev.created_at).fullStr,
      })),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `synaptix-monitor-eventos-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
      {/* Header Principal */}
      <div className="rounded-3xl bg-[#0a1229]/90 border border-white/15 p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-transparent border border-amber-400/50 flex items-center justify-center shadow-[0_0_25px_rgba(234,179,8,0.25)] shrink-0">
            <Eye size={24} className="text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Monitor de Eventos & Auditoria Integral
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveRefresh ? "bg-emerald-400 animate-ping" : "bg-slate-400"
                  }`}
                />
                {liveRefresh ? "Monitoramento Ao Vivo" : "Pausado"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Rastreabilidade total Zero-Trust: todas as ações, navegações, edições, comandos de IA e eventos de segurança são registrados com data e hora exatas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setLiveRefresh((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
              liveRefresh
                ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/25"
                : "bg-slate-800 text-slate-300 border-white/15 hover:bg-slate-700"
            }`}
          >
            {liveRefresh ? <Pause size={14} /> : <Play size={14} />}
            <span>{liveRefresh ? "Auto-Refresh (4s)" : "Retomar Ao Vivo"}</span>
          </button>

          <button
            onClick={fetchEvents}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-amber-400" : "text-amber-400"} />
            <span>Atualizar Agora</span>
          </button>

          <button
            onClick={handleExportLogs}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download size={14} />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {/* Cards de Indicadores (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1229]/90 border border-white/15 p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total de Eventos Registrados
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1 font-mono">
              {data.total_events.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-slate-400">
              Criptografados com AES-256-GCM
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/35 flex items-center justify-center">
            <Activity size={22} className="text-blue-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1229]/90 border border-white/15 p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Eventos Registrados Hoje
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-300 mt-1 font-mono">
              {data.events_today.toLocaleString("pt-BR")}
            </div>
            <span className="text-[11px] text-slate-400">
              Última leitura: {lastUpdated.toLocaleTimeString("pt-BR")}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center">
            <Clock size={22} className="text-emerald-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1229]/90 border border-white/15 p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Dispositivos Autorizados
            </span>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mt-1 font-mono">
              {data.active_devices}
            </div>
            <span className="text-[11px] text-slate-400">
              Assinatura ECDSA P-256 ativa
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center">
            <Laptop size={22} className="text-amber-400" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1229]/90 border border-white/15 p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Alertas & Segurança
            </span>
            <div className="text-2xl sm:text-3xl font-black text-rose-300 mt-1 font-mono">
              {data.security_alerts}
            </div>
            <span className="text-[11px] text-slate-400">
              Bloqueios, revogações e avisos
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center">
            <ShieldAlert size={22} className="text-rose-400" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa de Alto Contraste */}
      <div className="rounded-2xl bg-[#0a1229]/95 border border-white/15 p-4 space-y-4 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca Textual */}
          <div className="md:col-span-5 relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por evento, ação, dispositivo, IP ou rota..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs sm:text-sm font-medium bg-[#070d22] text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              style={{
                backgroundColor: "#070d22",
                color: "#ffffff",
                borderColor: "rgba(234, 179, 8, 0.45)",
                caretColor: "#facc15",
                colorScheme: "dark",
              }}
            />
          </div>

          {/* Seletor de Categoria */}
          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold bg-[#070d22] text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              style={{
                backgroundColor: "#070d22",
                color: "#ffffff",
                borderColor: "rgba(255, 255, 255, 0.22)",
                colorScheme: "dark",
              }}
            >
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key} className="bg-[#070d22] text-white">
                  {meta.label}
                  {key !== "ALL" && data.categories_breakdown[key]
                    ? ` (${data.categories_breakdown[key]})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Severidade */}
          <div className="md:col-span-2">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold bg-[#070d22] text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              style={{
                backgroundColor: "#070d22",
                color: "#ffffff",
                borderColor: "rgba(255, 255, 255, 0.22)",
                colorScheme: "dark",
              }}
            >
              <option value="ALL" className="bg-[#070d22] text-white">
                Todas as Severidades
              </option>
              <option value="INFO" className="bg-[#070d22] text-white">
                Informativo (INFO)
              </option>
              <option value="SUCCESS" className="bg-[#070d22] text-white">
                Sucesso (SUCCESS)
              </option>
              <option value="WARNING" className="bg-[#070d22] text-white">
                Atenção (WARNING)
              </option>
              <option value="CRITICAL" className="bg-[#070d22] text-white">
                Crítico (CRITICAL)
              </option>
            </select>
          </div>

          {/* Seletor de Dispositivo */}
          <div className="md:col-span-2">
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold bg-[#070d22] text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              style={{
                backgroundColor: "#070d22",
                color: "#ffffff",
                borderColor: "rgba(255, 255, 255, 0.22)",
                colorScheme: "dark",
              }}
            >
              <option value="ALL" className="bg-[#070d22] text-white">
                Todos os Dispositivos
              </option>
              {knownDevices.map(([devId, devName]) => (
                <option key={devId} value={devId} className="bg-[#070d22] text-white">
                  {devName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pílulas rápidas de categoria */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const isSelected = selectedCategory === key;
            const count =
              key === "ALL" ? data.total_events : data.categories_breakdown[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                    : "bg-[#070d22] text-slate-300 border-white/10 hover:border-white/25 hover:text-white"
                }`}
              >
                <Icon size={13} />
                <span>{meta.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected
                      ? "bg-slate-950/20 text-slate-950 font-black"
                      : "bg-white/10 text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista Cronológica de Eventos (Data e Hora Exatas) */}
      <div className="rounded-3xl bg-[#0a1229]/95 border border-white/15 overflow-hidden shadow-2xl flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Linha do Tempo de Eventos ({data.events.length} exibidos)
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Clique em qualquer registro para inspecionar os metadados técnicos completos
          </span>
        </div>

        {loading && data.events.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
            <RefreshCw size={24} className="text-amber-400 animate-spin" />
            <span>Carregando registros criptografados do Monitor de Eventos...</span>
          </div>
        ) : data.events.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Nenhum evento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-white/10 overflow-y-auto max-h-[68vh]">
            {data.events.map((ev) => {
              const catKey = (ev.category || "SECURITY").toUpperCase();
              const sevKey = (ev.severity || "INFO").toUpperCase();
              const catMeta = CATEGORY_META[catKey] || CATEGORY_META.SYSTEM;
              const sevMeta = SEVERITY_META[sevKey] || SEVERITY_META.INFO;
              const CatIcon = catMeta.icon;
              const SevIcon = sevMeta.icon;
              const ts = formatEventTimestamp(ev.created_at);
              const isExpanded = expandedEventId === ev.id;

              return (
                <div
                  key={ev.id}
                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                  className={`p-4 sm:px-6 transition-colors cursor-pointer hover:bg-white/[0.03] ${
                    sevKey === "CRITICAL" ? "bg-rose-950/20" : ""
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Coluna 1: Data e Hora Exata de Ocorrência */}
                    <div className="flex items-center gap-3 shrink-0 min-w-[230px]">
                      <div className="px-3 py-2 rounded-xl bg-[#070d22] border border-amber-500/35 text-left shadow-inner">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300">
                          <Calendar size={12} className="text-amber-400 shrink-0" />
                          <span>{ts.dateStr}</span>
                          <span className="text-slate-500">•</span>
                          <Clock size={12} className="text-amber-400 shrink-0" />
                          <span className="text-white">{ts.timeStr}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center justify-between">
                          <span>Evento #{ev.id}</span>
                          <span className="text-emerald-300 font-semibold">{ts.relativeStr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: Categoria, Tipo e Descrição da Ação */}
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${catMeta.badgeClass}`}
                        >
                          <CatIcon size={12} />
                          <span>{catMeta.label}</span>
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border ${sevMeta.badgeClass}`}
                        >
                          <SevIcon size={11} />
                          <span>{ev.event_type}</span>
                        </span>

                        {ev.http_method && (
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px] font-mono font-bold text-slate-300">
                            {ev.http_method} {ev.endpoint || ""}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-white font-medium leading-relaxed">
                        {ev.details || "Evento registrado pelo sistema."}
                      </div>
                    </div>

                    {/* Coluna 3: Dispositivo & IP */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-200 flex items-center justify-end gap-1.5">
                          <Laptop size={13} className="text-amber-400" />
                          <span>
                            {ev.device_name ||
                              (ev.device_id
                                ? `Dispositivo ${ev.device_id.slice(0, 8)}...`
                                : "Não Autenticado / Externo")}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                          <Globe size={11} className="text-slate-500" />
                          <span>IP: {ev.ip_address || "local"}</span>
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg bg-white/5 text-slate-400">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Painel Expandido de Metadados Forenses */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-[#070d22]/90 p-3.5 rounded-xl border border-white/10">
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Data e Hora Local Exata:
                        </span>
                        <span className="font-mono font-bold text-amber-300">
                          {ts.fullStr}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Carimbo UTC (ISO-8601):
                        </span>
                        <span className="font-mono text-slate-200">
                          {ev.created_at.endsWith("Z") ? ev.created_at : `${ev.created_at}Z`}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Dispositivo Executor:
                        </span>
                        <span className="font-mono text-white">
                          {ev.device_name ? `${ev.device_name} ` : ""}
                          {ev.device_id ? `(${ev.device_id})` : "(Sem ID de Dispositivo)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Origem / Endpoint / Status HTTP:
                        </span>
                        <span className="font-mono text-emerald-300">
                          IP {ev.ip_address || "N/A"} • {ev.http_method || "SYS"}{" "}
                          {ev.endpoint || "/"} (Status {ev.status_code ?? 200})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventMonitor;
