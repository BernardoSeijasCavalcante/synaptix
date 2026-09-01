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
  content?: string;
  note_type: string;
  file_url?: string;
  notebook_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  note_id: number;
  content: string;
  selected_text?: string;
  x_position?: number | null;
  y_position?: number | null;
  width?: number | null;
  height?: number | null;
  page_number?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CommentConnection {
  id: number;
  source_comment_id: number;
  target_comment_id: number;
  observation: string | null;
  created_at: string;
}
