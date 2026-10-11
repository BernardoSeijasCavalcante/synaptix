import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Clock, CheckCircle, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';

interface Task {
  id: number;
  name: string;
  description: string;
  priority: string;
  difficulty: string;
  estimated_hours: number;
  status: string;
  time_spent_seconds: number;
  timer_status: string;
  created_at: string;
}

type SortKey = keyof Task | 'time_spent_seconds';
type SortDirection = 'asc' | 'desc' | null;

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('http://localhost:8000/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error("Failed to fetch tasks", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') setSortDirection(null);
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const getSortedTasks = () => {
    if (!sortDirection) return tasks;

    return [...tasks].sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedTasks = getSortedTasks();

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key || !sortDirection) {
      return <ArrowUpDown size={14} className="text-slate-600 opacity-50 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="text-yellow-500" /> 
      : <ArrowDown size={14} className="text-yellow-500" />;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const renderStatus = (status: string, timer_status: string) => {
    if (status === 'completed') {
      return <span className="flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded border border-green-400/20 w-fit"><CheckCircle size={14}/> Concluída</span>;
    }
    if (timer_status === 'running') {
      return <span className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded border border-yellow-400/20 w-fit"><PlayCircle size={14} className="animate-pulse"/> Em Andamento</span>;
    }
    return <span className="flex items-center gap-1 text-slate-400 bg-slate-800 px-2 py-1 rounded border border-slate-700 w-fit"><Clock size={14}/> Pendente</span>;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0a1128] overflow-hidden">
      <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-200">Demandas</h2>
          <p className="text-slate-400 text-sm mt-1">Gerencie e ordene todas as suas tarefas.</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500 gap-3">
            <Loader2 className="animate-spin text-yellow-500" size={24} />
            Carregando demandas...
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <AlertCircle size={48} className="mb-4 text-slate-600" />
            <p className="text-lg">Nenhuma demanda encontrada.</p>
            <p className="text-sm">Peça à Secretária para adicionar uma nova tarefa.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-sm uppercase tracking-wider">
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-2">Nome {renderSortIcon('name')}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('priority')}>
                      <div className="flex items-center gap-2">Prioridade {renderSortIcon('priority')}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('difficulty')}>
                      <div className="flex items-center gap-2">Dificuldade {renderSortIcon('difficulty')}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-2">Status {renderSortIcon('status')}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('estimated_hours')}>
                      <div className="flex items-center gap-2">Estimativa {renderSortIcon('estimated_hours')}</div>
                    </th>
                    <th className="p-4 font-semibold cursor-pointer group hover:bg-slate-800/50 transition whitespace-nowrap" onClick={() => handleSort('time_spent_seconds')}>
                      <div className="flex items-center gap-2">Tempo Gasto {renderSortIcon('time_spent_seconds')}</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sortedTasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="p-4">
                        <div className="font-medium text-gray-200">{task.name}</div>
                        {task.description && (
                          <div className="text-xs text-slate-500 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all">{task.description}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs border whitespace-nowrap uppercase tracking-wider font-semibold ${
                          task.priority.toLowerCase() === 'high' || task.priority.toLowerCase() === 'alta' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                          task.priority.toLowerCase() === 'medium' || task.priority.toLowerCase() === 'média' || task.priority.toLowerCase() === 'media' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        }`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="p-4 text-slate-300 text-sm capitalize">
                        {task.difficulty}
                      </td>
                      <td className="p-4 text-sm whitespace-nowrap">
                        {renderStatus(task.status, task.timer_status)}
                      </td>
                      <td className="p-4 text-slate-300 text-sm font-mono whitespace-nowrap">
                        {task.estimated_hours}h
                      </td>
                      <td className="p-4 text-slate-300 text-sm font-mono whitespace-nowrap">
                        {formatTime(task.time_spent_seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
