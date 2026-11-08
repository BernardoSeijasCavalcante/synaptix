import { useState, useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Bot, CheckSquare, BookOpen, Network as NetworkIcon, Sparkles, ShieldCheck, Activity, CalendarDays, Users, Menu, X, ChevronRight } from 'lucide-react';
import Notes from './pages/Notes';
import Network from './pages/Network';
import Chat from './pages/Chat';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import EventMonitor from './pages/EventMonitor';
import TeamManagement from './pages/TeamManagement';
import TeamPortal from './pages/TeamPortal';
import { PromptModal } from './components/PromptModal';
import { TransferNoteModal } from './components/TransferNoteModal';
import { DeviceGuard, type AuthorizedDeviceInfo } from './components/DeviceGuard';
import { DeviceManagerModal } from './components/DeviceManagerModal';
import { trackSiteEvent } from './security/eventTracker';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Aba Secretária Executiva (Chat IA)',
  '/tasks': 'Aba Demandas & Cronômetros',
  '/calendar': 'Aba Calendário, Metas & Timeline 24h',
  '/notes': 'Aba Notas & Documentos',
  '/network': 'Aba Rede Sináptica (Grafo de Conhecimento)',
  '/monitor': 'Aba Monitor de Eventos & Auditoria Integral',
  '/team-management': 'Aba Gestão da Equipe & Demandas',
};

function RouteActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    const label = ROUTE_LABELS[location.pathname] || `Rota ${location.pathname}`;
    trackSiteEvent({
      event_type: 'PAGE_VIEW',
      category: 'NAVIGATION',
      severity: 'INFO',
      endpoint: location.pathname,
      details: `Usuário acessou: ${label}.`,
    });
  }, [location.pathname]);

  return null;
}

function Navigation({
  onOpenSecurityModal,
  pendingEnrollmentsCount,
}: {
  onOpenSecurityModal: () => void;
  pendingEnrollmentsCount: number;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu whenever route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const navItems = [
    { to: '/', label: 'Secretária', fullLabel: 'Secretária Executiva', desc: 'Chat Inteligente & Assistente IA', icon: Bot, isPurple: false },
    { to: '/tasks', label: 'Demandas', fullLabel: 'Demandas & Cronômetros', desc: 'Tarefas, Prazos e Tempos Estimados', icon: CheckSquare, isPurple: false },
    { to: '/calendar', label: 'Calendário', fullLabel: 'Calendário & Metas', desc: 'Timeline 24h, Prazos & Compromissos', icon: CalendarDays, isPurple: false },
    { to: '/notes', label: 'Notas', fullLabel: 'Notas & Documentos', desc: 'Cadernos, Editor Rico & PDFs', icon: BookOpen, isPurple: false },
    { to: '/team-management', label: 'Equipe', fullLabel: 'Gestão da Equipe', desc: 'Painéis, Membros & Demandas Coletivas', icon: Users, isPurple: false },
    { to: '/network', label: 'Rede Sináptica', fullLabel: 'Rede Sináptica', desc: 'Grafo Neuronal de Conhecimento', icon: NetworkIcon, isPurple: true },
    { to: '/monitor', label: 'Monitor', fullLabel: 'Monitor de Eventos', desc: 'Auditoria de Segurança & Logs em Tempo Real', icon: Activity, isPurple: false },
  ];

  const currentItem = navItems.find((item) => item.to === location.pathname) || navItems[0];
  const CurrentIcon = currentItem.icon;

  return (
    <>
      <nav className="glass-nav sticky top-0 z-40 px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between border-b border-white/[0.08]">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link 
            to="/" 
            className="group flex items-center gap-2 sm:gap-2.5 transition-transform duration-200 hover:scale-[1.02]"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400/20 via-yellow-500/10 to-transparent border border-amber-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)] group-hover:border-amber-400/50 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.35)] transition-all">
              <span className="text-base sm:text-lg">🧠</span>
              <div className="absolute -inset-0.5 rounded-xl bg-amber-400/10 blur-sm -z-10 group-hover:bg-amber-400/20 transition-all" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-yellow-200 via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-sm">
                Synaptix
              </span>
            </div>
          </Link>

          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-amber-300/80">
            <Sparkles size={10} className="text-amber-400" /> Zero-Trust
          </span>

          {/* Active Tab Badge on Mobile */}
          <div className="lg:hidden flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-slate-300">
            <CurrentIcon size={13} className={currentItem.isPurple ? 'text-purple-400' : 'text-amber-400'} />
            <span className="truncate max-w-[80px] sm:max-w-[120px]">{currentItem.label}</span>
          </div>
        </div>

        {/* Desktop Navigation Links (Visible on lg and larger) */}
        <div className="hidden lg:flex items-center gap-1.5 xl:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `
                  relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs xl:text-sm font-medium transition-all duration-200
                  ${
                    isActive
                      ? item.isPurple
                        ? 'bg-purple-500/15 text-purple-200 border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.25)]'
                        : 'bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-[0_0_20px_rgba(234,179,8,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border border-transparent'
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <Icon 
                      size={16} 
                      className={`transition-colors ${
                        isActive 
                          ? item.isPurple ? 'text-purple-400' : 'text-amber-400' 
                          : 'text-slate-400 group-hover:text-slate-300'
                      }`} 
                    />
                    <span>{item.label}</span>
                    {isActive && (
                      <span 
                        className={`w-1 h-1 rounded-full animate-pulse ${
                          item.isPurple ? 'bg-purple-400' : 'bg-amber-400'
                        }`} 
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

          {/* Botão de Governança de Dispositivos Zero-Trust Desktop */}
          <button
            onClick={onOpenSecurityModal}
            title="Gerenciar Dispositivos Autorizados e Pareamento Zero-Trust"
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all ml-1"
          >
            <ShieldCheck size={15} className="text-emerald-400" />
            <span>Dispositivos</span>
            {pendingEnrollmentsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black animate-bounce">
                {pendingEnrollmentsCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile Actions: Zero-Trust Button + Hamburger Toggle (Visible below lg) */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={onOpenSecurityModal}
            title="Gerenciar Dispositivos Autorizados"
            className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all active:scale-95"
            aria-label="Dispositivos Autorizados"
          >
            <ShieldCheck size={18} className="text-emerald-400" />
            {pendingEnrollmentsCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black animate-bounce">
                {pendingEnrollmentsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95 border ${
              isMobileMenuOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_15px_rgba(234,179,8,0.25)]'
                : 'bg-white/[0.06] text-slate-200 hover:text-white hover:bg-white/10 border-white/10'
            }`}
            aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay & Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col pt-[64px]">
          {/* Backdrop Blur */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-md -z-10 animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Body */}
          <div className="flex-1 bg-[#070c1b]/98 backdrop-blur-2xl border-t border-white/[0.08] overflow-y-auto p-4 sm:p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-top-4 duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-400" /> Menu de Funcionalidades
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {navItems.length} módulos
                </span>
              </div>

              {/* Navigation Items List with touch-friendly cards */}
              <div className="grid gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 active:scale-[0.99] ${
                        isActive
                          ? item.isPurple
                            ? 'bg-purple-500/15 border-purple-500/40 text-white shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                            : 'bg-amber-500/15 border-amber-500/40 text-white shadow-[0_0_20px_rgba(234,179,8,0.18)]'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                            isActive
                              ? item.isPurple
                                ? 'bg-purple-500/25 border-purple-400/50 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                                : 'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                              : 'bg-white/[0.05] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          <Icon size={20} />
                        </div>
                        <div className="flex flex-col text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm sm:text-base text-slate-100">
                              {item.fullLabel}
                            </span>
                            {isActive && (
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                item.isPurple
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}>
                                Ativo
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 line-clamp-1">
                            {item.desc}
                          </span>
                        </div>
                      </div>

                      <ChevronRight
                        size={18}
                        className={`transition-colors shrink-0 ${
                          isActive
                            ? item.isPurple ? 'text-purple-400' : 'text-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    </NavLink>
                  );
                })}
              </div>

              {/* Zero-Trust Mobile Action Card */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenSecurityModal();
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="flex flex-col text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm sm:text-base text-emerald-100">
                          Dispositivos Autorizados
                        </span>
                        {pendingEnrollmentsCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black animate-bounce">
                            {pendingEnrollmentsCount} pendente(s)
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-emerald-300/70">
                        Governança Zero-Trust & Pareamento Criptográfico
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-emerald-400 shrink-0" />
                </button>
              </div>
            </div>

            {/* Mobile Footer */}
            <div className="pt-6 pb-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Sessão Criptografada TLS 1.3
              </span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-slate-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 active:scale-95 transition-all text-xs font-medium"
              >
                Fechar Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AuthenticatedShell({ deviceInfo }: { deviceInfo: AuthorizedDeviceInfo }) {
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [pendingEnrollmentsCount, setPendingEnrollmentsCount] = useState(0);

  const handleOpenSecurityModal = () => {
    setIsSecurityModalOpen(true);
    trackSiteEvent({
      event_type: 'SECURITY_PANEL_OPENED',
      category: 'SECURITY',
      severity: 'INFO',
      endpoint: '/auth/devices',
      details: 'Painel de Governança Zero-Trust de Dispositivos aberto.',
    });
  };

  return (
    <BrowserRouter>
      <RouteActivityTracker />
      <div className="min-h-screen bg-[#070c1b] text-slate-100 font-sans flex flex-col relative overflow-x-hidden">
        {/* Ambient Glassmorphism Glow Background Orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          {/* Deep Midnight Base */}
          <div className="absolute inset-0 bg-[#070c1b]" />

          {/* Top-Left Synaptic Blue Orb */}
          <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-blue-600/15 blur-[130px]" />

          {/* Top-Right Ambient Amber / Gold Orb */}
          <div className="absolute top-[0%] right-[10%] w-[45vw] h-[45vw] max-w-[550px] max-h-[550px] rounded-full bg-amber-500/[0.08] blur-[150px]" />

          {/* Bottom-Right Neural Purple Orb */}
          <div className="absolute -bottom-[10%] right-[-5%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-purple-600/12 blur-[140px]" />

          {/* Center Subtle Deep Navy Fill */}
          <div className="absolute top-[40%] left-[25%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full bg-indigo-900/10 blur-[140px]" />

          {/* Synaptic Geometric Mesh / Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_60%,transparent_100%)] opacity-35" />
        </div>

        {/* Top Navbar */}
        <Navigation
          onOpenSecurityModal={handleOpenSecurityModal}
          pendingEnrollmentsCount={pendingEnrollmentsCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative z-10">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/team-management" element={<TeamManagement />} />
            <Route path="/network" element={<Network />} />
            <Route path="/monitor" element={<EventMonitor />} />
          </Routes>
        </main>

        {/* Global Prompt Modal */}
        <PromptModal />

        {/* Global Transfer Note Modal */}
        <TransferNoteModal />

        {/* Zero-Trust Device Manager & Pairing Modal */}
        <DeviceManagerModal
          isOpen={isSecurityModalOpen}
          onClose={() => setIsSecurityModalOpen(false)}
          currentDevice={deviceInfo}
          onPendingCountChange={setPendingEnrollmentsCount}
        />
      </div>
    </BrowserRouter>
  );
}

class TeamErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Erro interceptado no TeamPortal:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070c1b] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white/[0.04] border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-3">
            <h2 className="text-base font-bold text-rose-300">Falha ao carregar o Portal da Equipe</h2>
            <p className="text-xs text-slate-400 break-words">
              {this.state.error?.message || String(this.state.error || 'Erro inesperado')}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold transition-all"
            >
              Recarregar Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // Se o acesso for na rota dedicada da equipe (/equipe), renderiza o Portal da Equipe isolado
  if (window.location.pathname.startsWith('/equipe')) {
    return (
      <TeamErrorBoundary>
        <TeamPortal />
      </TeamErrorBoundary>
    );
  }

  return (
    <DeviceGuard>
      {(deviceInfo) => <AuthenticatedShell deviceInfo={deviceInfo} />}
    </DeviceGuard>
  );
}

export default App;

