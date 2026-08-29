export interface Notebook {
  id: number;
  title: string;
  parent_id: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  notebook_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  note_id: number;
  content: string;
  selected_text: string;
  created_at: string;
  updated_at: string;
}
