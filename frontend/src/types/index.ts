export interface Workspace {
  id: number;
  title: string;
  is_active: boolean;
  created_at: string;
}

export interface Notebook {
  id: number;
  title: string;
  parent_id: number | null;
  workspace_id: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  notebook_id: number | null;
  workspace_id: number | null;
  type?: string;
  file_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  note_id: number | null;
  notebook_id?: number | null;
  is_question?: boolean;
  content: string;
  selected_text?: string;
  page_number?: number | null;
  rect_x1?: number | null;
  rect_y1?: number | null;
  rect_x2?: number | null;
  rect_y2?: number | null;
  x_position?: number | null;
  y_position?: number | null;
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
