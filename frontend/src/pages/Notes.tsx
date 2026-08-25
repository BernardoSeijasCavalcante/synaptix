import { Sidebar } from '../components/Sidebar';
import { NoteEditor } from '../components/NoteEditor';

export default function Notes() {
  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-950">
      <Sidebar />
      <NoteEditor />
    </div>
  );
}
