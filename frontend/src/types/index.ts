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
  is_password_protected?: boolean;
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
  is_password_protected?: boolean;
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

export interface GuidedStudyConstructionFeedback {
  what_was_right?: string | null;
  what_is_missing?: string | null;
}

export interface GuidedStudySubconcept {
  id: string;
  title: string;
  source_note_id?: number | null;
  source_title?: string | null;
  page_numbers: number[];
  covered_pages?: number[];
  attempts?: number;
  surface_passed: boolean;
  depth_passed: boolean;
}

export interface GuidedStudySlideReference {
  note_id?: number | null;
  source_title?: string | null;
  page_number?: number | null;
  slide_excerpt?: string | null;
}

export interface GuidedStudyTopic {
  id: string;
  title: string;
  summary: string;
  surface_status: 'pending' | 'in_progress' | 'validated';
  depth_status: 'locked' | 'pending' | 'in_progress' | 'validated';
  key_concept?: string;
  deep_angle?: string;
  current_subconcept_index?: number;
  subconcepts?: GuidedStudySubconcept[];
  source_refs?: { note_id?: number; title?: string }[];
  covered_pages?: number[];
  chapter_surface_completed?: boolean;
}

export interface GuidedStudyDoubtMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  slide_reference?: GuidedStudySlideReference | null;
  covered_pages?: number[];
  diagram_mermaid?: string | null;
  timestamp: string;
}

export interface GuidedStudyDoubtThread {
  id: string;
  parent_message_id: string;
  topic_id?: string | null;
  subconcept_id?: string | null;
  title: string;
  status: 'open' | 'resolved';
  messages: GuidedStudyDoubtMessage[];
  created_at: string;
  updated_at: string;
}

export interface GuidedStudyMessage {
  id: string;
  role: 'assistant' | 'user';
  phase: 'surface' | 'depth' | 'synthesis';
  topic_id?: string;
  subconcept_id?: string | null;
  student_intent?: 'doubt_or_question' | 'incomplete_or_incorrect' | 'mastered_subconcept' | string;
  contextualization?: string;
  explanation?: string;
  slide_reference?: GuidedStudySlideReference | null;
  diagram_mermaid?: string | null;
  step_by_step_example?: string | null;
  visual_image_url?: string | null;
  construction_feedback?: GuidedStudyConstructionFeedback | null;
  attempts?: number | null;
  question?: string;
  content: string;
  student_synthesis?: string | null;
  topic_validated?: boolean;
  synapse_comment_id?: number | null;
  doubt_threads?: GuidedStudyDoubtThread[];
  timestamp: string;
}

export interface GuidedStudySourceMeta {
  source_type: 'markdown' | 'pdf' | 'raw_text' | 'upload' | string;
  title: string;
  note_id?: number | null;
  file_name?: string | null;
  char_count?: number;
}

export interface GuidedStudySession {
  id: number;
  title: string;
  workspace_id?: number | null;
  notebook_id?: number | null;
  target_note_id?: number | null;
  depth_persona: string;
  surface_pace?: 'fast' | 'standard' | 'detailed';
  current_phase: 'surface' | 'depth' | 'completed' | string;
  current_topic_index: number;
  big_insight?: string | null;
  sources_meta: GuidedStudySourceMeta[];
  roadmap: GuidedStudyTopic[];
  messages: GuidedStudyMessage[];
  last_synapse_comment_id?: number | null;
  auto_create_synapses: boolean;
  status: 'active' | 'paused' | 'completed' | string;
  created_at: string;
  updated_at: string;
}

export interface GuidedStudySessionSummary {
  id: number;
  title: string;
  workspace_id?: number | null;
  notebook_id?: number | null;
  target_note_id?: number | null;
  depth_persona: string;
  surface_pace?: 'fast' | 'standard' | 'detailed';
  current_phase: string;
  current_topic_index: number;
  total_topics: number;
  validated_surface_topics: number;
  validated_depth_topics: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractFileResponse {
  filename: string;
  extracted_text: string;
  char_count: number;
  page_count?: number;
}
