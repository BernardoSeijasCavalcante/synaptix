import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Notes from './pages/Notes';
import Network from './pages/Network';

function Dashboard() {
  return (
    <div className="p-12 max-w-5xl mx-auto">
      <h1 className="text-4xl font-extrabold mb-4 text-gray-900 tracking-tight">Bem-vindo ao Synaptix</h1>
      <p className="text-gray-600 mb-8 text-xl">Seu centralizador de estudos inteligente construindo sua rede sináptica de conhecimento.</p>
      <div className="flex gap-4">
        <Link to="/notes" className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition font-medium">Escrever Notas</Link>
        <Link to="/network" className="px-6 py-3 bg-purple-600 text-white rounded-lg shadow hover:bg-purple-700 transition font-medium">Visualizar Rede</Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <nav className="bg-gray-900 text-white px-8 py-4 flex items-center justify-between shadow-md">
          <Link to="/" className="font-bold text-2xl tracking-tight flex items-center gap-2">
            🧠 Synaptix
          </Link>
          <div className="flex gap-6 font-medium">
            <Link to="/" className="hover:text-blue-400 transition">Início</Link>
            <Link to="/notes" className="hover:text-blue-400 transition">Notas</Link>
            <Link to="/network" className="hover:text-purple-400 transition">Rede Sináptica</Link>
          </div>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/network" element={<Network />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
