import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Notes from './pages/Notes';
import Network from './pages/Network';
import Chat from './pages/Chat';
import Tasks from './pages/Tasks';
import { PromptModal } from './components/PromptModal';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-gray-200 font-sans flex flex-col">
        <nav className="bg-[#0a1128] text-white px-8 py-4 flex items-center justify-between border-b border-slate-800 h-[64px]">
          <Link to="/" className="font-bold text-2xl tracking-tight flex items-center gap-2 text-yellow-500">
            🧠 Synaptix
          </Link>
          <div className="flex gap-6 font-medium">
            <Link to="/" className="text-gray-300 hover:text-yellow-400 transition">Secretária</Link>
            <Link to="/tasks" className="text-gray-300 hover:text-yellow-400 transition">Demandas</Link>
            <Link to="/notes" className="text-gray-300 hover:text-yellow-400 transition">Notas</Link>
            <Link to="/network" className="text-gray-300 hover:text-purple-400 transition">Rede Sináptica</Link>
          </div>
        </nav>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/network" element={<Network />} />
          </Routes>
        </main>
        <PromptModal />
      </div>
    </BrowserRouter>
  );
}

export default App;
