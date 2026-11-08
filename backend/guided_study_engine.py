import os
import io
import re
import json
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from sqlalchemy.orm import Session
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

import models
import schemas
from database import SessionLocal
from security.crypto import read_decrypted_file, sanitize_html_content

logger = logging.getLogger("guided_study_engine")
client = OpenAI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")


def extract_text_from_pdf_bytes(pdf_bytes: bytes, max_pages: int = 150, source_label: str = "") -> Tuple[str, int]:
    """Extrai texto de um stream de bytes de arquivo PDF usando pypdf, demarcando páginas."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page_count = len(reader.pages)
    text_parts = []
    
    pages_to_read = min(page_count, max_pages)
    prefix = f"{source_label} | " if source_label else ""
    for idx in range(pages_to_read):
        page = reader.pages[idx]
        extracted = page.extract_text() or ""
        if extracted.strip():
            text_parts.append(f"--- [Página {idx + 1} | {prefix}Pág. {idx + 1}] ---\n{extracted.strip()}")
            
    return "\n\n".join(text_parts), page_count


def extract_content_from_source(note: models.Note) -> Dict[str, Any]:
    """Extrai texto e metadados de uma Nota (markdown ou PDF do cofre) com indexação de páginas."""
    text_content = ""
    source_type = note.type or "markdown"
    char_count = 0
    clean_title = note.title or f"Nota #{note.id}"

    if source_type == "pdf" and note.file_url:
        clean_name = os.path.basename(note.file_url)
        file_path = os.path.join(UPLOADS_DIR, clean_name)
        if os.path.exists(file_path):
            try:
                decrypted_bytes = read_decrypted_file(file_path)
                text_content, _pages = extract_text_from_pdf_bytes(decrypted_bytes, source_label=f"{clean_title} (ID: {note.id})")
            except Exception as e:
                logger.error(f"Erro ao extrair texto do PDF {clean_name}: {e}")
                text_content = f"[Erro ao extrair conteúdo do PDF: {note.title}]"
        else:
            text_content = f"[Arquivo PDF não encontrado no disco: {clean_name}]"
    else:
        text_content = note.content or ""

    char_count = len(text_content)
    return {
        "source_type": source_type,
        "title": clean_title,
        "note_id": note.id,
        "file_name": os.path.basename(note.file_url) if note.file_url else None,
        "char_count": char_count,
        "text": text_content,
    }


def extract_uploaded_file_text(filename: str, raw_bytes: bytes) -> Dict[str, Any]:
    """Extrai texto de arquivo enviado avulso na gaveta (.pdf, .txt, .md)."""
    clean_name = os.path.basename(filename)
    ext = os.path.splitext(clean_name)[1].lower()
    
    if ext == ".pdf":
        text_content, pages = extract_text_from_pdf_bytes(raw_bytes, source_label=clean_name)
        return {
            "filename": clean_name,
            "extracted_text": text_content,
            "char_count": len(text_content),
            "page_count": pages,
        }
    elif ext in (".txt", ".md"):
        try:
            text_content = raw_bytes.decode("utf-8", errors="replace")
        except Exception:
            text_content = raw_bytes.decode("latin-1", errors="replace")
        return {
            "filename": clean_name,
            "extracted_text": text_content,
            "char_count": len(text_content),
            "page_count": 1,
        }
    else:
        raise ValueError(f"Extensão de arquivo não suportada: {ext}. Aceitos: PDF, TXT, MD.")


def scan_document_structure(source_material_text: str) -> List[Dict[str, Any]]:
    """
    Scanner estrutural universal de cabeçalhos e páginas:
    Funciona tanto para N arquivos PDFs (ex: 01.pdf a 14.pdf) quanto para 1 livro único de 400 páginas ou notas soltas.
    Agrupa páginas expositivas, filtra páginas vazias ou capas, e produz a lista de unidades estruturais com páginas reais.
    """
    if not source_material_text:
        return []

    sources = re.split(r'(=== \[(?:Fonte|FONTE): [^\]]+\] ===)', source_material_text)
    structured_units: List[Dict[str, Any]] = []

    if len(sources) > 2:
        # Caso A: Múltiplas fontes demarcadas (ex: 14 PDFs ou N notas)
        for i in range(1, len(sources), 2):
            header = sources[i]
            body = sources[i+1] if i+1 < len(sources) else ""
            
            # Extrair título e note_id do cabeçalho
            title_match = re.search(r'Fonte:\s*([^|\]]+)', header)
            note_id_match = re.search(r'note_id:\s*(\d+)', header)
            src_title = title_match.group(1).strip() if title_match else f"Módulo {len(structured_units)+1}"
            src_note_id = int(note_id_match.group(1)) if note_id_match else None

            pages = re.split(r'---\s*\[Página\s+(\d+)[^\]]*\]\s*---', body)
            page_items = []
            if len(pages) > 2:
                for p_i in range(1, len(pages), 2):
                    p_num = int(pages[p_i])
                    p_content = pages[p_i+1].strip() if p_i+1 < len(pages) else ""
                    # Filtro de páginas vazias ou capas irrelevantes (< 40 caracteres e sem termos úteis)
                    if len(p_content) > 30 and not re.match(r'^(bibliografia|obrigado|dúvidas\??|vamos começar!*\??)\s*$', p_content.lower()):
                        # Extrair título provisório da página a partir das primeiras linhas
                        lines = [l.strip() for l in p_content.splitlines() if l.strip() and not l.startswith('•')]
                        page_title = lines[0][:80] if lines else f"Pág. {p_num}"
                        page_items.append({
                            "page_num": p_num,
                            "title": page_title,
                            "length": len(p_content),
                            "preview": p_content[:300]
                        })
            else:
                # Fonte de texto sem páginas (ex: Markdown ou TXT)
                page_items.append({
                    "page_num": 1,
                    "title": src_title,
                    "length": len(body),
                    "preview": body[:500]
                })

            structured_units.append({
                "source_title": src_title,
                "source_note_id": src_note_id,
                "pages": page_items,
                "total_chars": len(body)
            })
    else:
        # Caso B: Documento único massivo (ex: 1 Livro único em PDF ou texto longo colado)
        pages = re.split(r'---\s*\[Página\s+(\d+)[^\]]*\]\s*---', source_material_text)
        all_pages = []
        if len(pages) > 2:
            for p_i in range(1, len(pages), 2):
                p_num = int(pages[p_i])
                p_content = pages[p_i+1].strip() if p_i+1 < len(pages) else ""
                if len(p_content) > 30:
                    lines = [l.strip() for l in p_content.splitlines() if l.strip()]
                    page_title = lines[0][:80] if lines else f"Pág. {p_num}"
                    all_pages.append({
                        "page_num": p_num,
                        "title": page_title,
                        "length": len(p_content),
                        "preview": p_content[:300]
                    })
        else:
            all_pages.append({
                "page_num": 1,
                "title": "Conteúdo Geral",
                "length": len(source_material_text),
                "preview": source_material_text[:500]
            })

        # Particionar as páginas do livro em capítulos de ~20-30 páginas cada
        chunk_size = max(15, len(all_pages) // 8) if len(all_pages) > 20 else len(all_pages)
        for c_idx in range(0, len(all_pages), chunk_size):
            chunk = all_pages[c_idx:c_idx + chunk_size]
            first_p = chunk[0]["page_num"]
            last_p = chunk[-1]["page_num"]
            cap_title = chunk[0]["title"] or f"Capítulo {len(structured_units)+1}"
            structured_units.append({
                "source_title": f"{cap_title} (Págs. {first_p}-{last_p})",
                "source_note_id": None,
                "pages": chunk,
                "total_chars": sum(p["length"] for p in chunk)
            })

    return structured_units


def build_curriculum_roadmap(
    structured_units: List[Dict[str, Any]],
    source_title: str,
    depth_persona: str = "Cientista da Computação",
    surface_pace: str = "standard"
) -> Dict[str, Any]:
    """
    Gera o roadmap garantindo 100% de cobertura dos capítulos e dividindo os sub-conceitos
    segundo o ritmo de estudo escolhido (fast, standard ou detailed).
    """
    # Determinar fatiamento de páginas por bloco segundo o ritmo
    # fast: 1-2 blocos por unidade
    # standard: 2-3 blocos por unidade
    # detailed: 4-6 blocos por unidade
    pace_divisor = 2 if surface_pace == "fast" else (3 if surface_pace == "standard" else 5)

    roadmap: List[Dict[str, Any]] = []

    # Criar um resumo estrutural conciso de todas as unidades para alimentar o LLM
    units_summary = []
    for u_idx, unit in enumerate(structured_units):
        pages = unit["pages"]
        p_nums = [p["page_num"] for p in pages]
        p_range = f"{p_nums[0]}-{p_nums[-1]}" if p_nums else "1"
        sample_titles = [p["title"] for p in pages[:4] if p["title"]]
        units_summary.append(
            f"Módulo {u_idx+1}: '{unit['source_title']}' (Páginas: {p_range}) | Temas principais: {', '.join(sample_titles)}"
        )

    summary_text = "\n".join(units_summary)

    # Chamada inteligente para sintetizar a Grande Sacada e os títulos nobres de cada Módulo
    system_prompt = f"""Você é o Arquiteto Pedagógico do Synaptix.
Sua missão é gerar os títulos de estudo e A Grande Sacada para um currículo completo de Ciência da Computação.
Rigor da Fase de Profundeza: {depth_persona}.
Ritmo da Superfície: {surface_pace.upper()}.

REQUISITO INEGOCIÁVEL:
Você DEVE gerar exatamente {len(structured_units)} módulos na chave 'modules', um para CADA unidade da lista fornecida, respeitando rigorosamente a ordem dos tópicos. NÃO OMITA NENHUM MÓDULO!

Retorne RIGOROSAMENTE um JSON:
{{
  "big_insight": "A síntese mestra que conecta todo o material do início ao fim.",
  "modules": [
    {{
      "module_index": 0,
      "title": "Título Nobre e Didático do Módulo",
      "summary": "Resumo em 1 frase do que este módulo ensina",
      "key_concept": "Conceito chave central",
      "deep_angle": "O que um {depth_persona} precisa dominar a fundo"
    }}
  ]
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Material: {source_title}\n\nESTRUTURA DE MÓDULOS:\n{summary_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        ai_curriculum = json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        logger.error(f"Erro ao chamar LLM para módulos: {e}")
        ai_curriculum = {}

    big_insight = ai_curriculum.get("big_insight") or f"A formalização e abstração dos problemas computacionais constituem a base indispensável para {depth_persona}."
    modules_meta = {m.get("module_index", idx): m for idx, m in enumerate(ai_curriculum.get("modules", []))}

    # Construção determinística em Python garantindo 100% de cobertura de páginas!
    for u_idx, unit in enumerate(structured_units):
        meta = modules_meta.get(u_idx, {})
        topic_title = meta.get("title") or unit["source_title"].replace('.pdf', '').capitalize()
        summary = meta.get("summary") or f"Estudo abrangente de {topic_title}."
        key_concept = meta.get("key_concept") or topic_title
        deep_angle = meta.get("deep_angle") or f"Fundamentos teóricos e complexidade de {topic_title}."

        pages = unit["pages"]
        total_p = len(pages)
        if total_p == 0:
            pages = [{"page_num": 1, "title": topic_title}]
            total_p = 1

        # Dividir páginas em blocos conforme o ritmo
        num_blocks = max(1, min(total_p, pace_divisor))
        block_size = max(1, (total_p + num_blocks - 1) // num_blocks)

        subconcepts = []
        for b_idx in range(0, total_p, block_size):
            block_pages = pages[b_idx:b_idx + block_size]
            p_nums = [p["page_num"] for p in block_pages]
            first_p = p_nums[0]
            last_p = p_nums[-1]
            p_range_label = f"Págs. {first_p}-{last_p}" if first_p != last_p else f"Pág. {first_p}"
            
            # Nome do sub-conceito baseado no tema das páginas
            sample_title = block_pages[0]["title"]
            sub_title = f"{sample_title} ({p_range_label})" if sample_title and sample_title != f"Pág. {first_p}" else f"Fundamentos de {topic_title} ({p_range_label})"

            subconcepts.append({
                "id": f"t{u_idx+1}_s{len(subconcepts)+1}",
                "title": sub_title,
                "source_note_id": unit.get("source_note_id"),
                "source_title": unit.get("source_title"),
                "page_numbers": p_nums,
                "covered_pages": p_nums,
                "attempts": 0,
                "surface_passed": False,
                "depth_passed": False
            })

        all_topic_pages = []
        for sc in subconcepts:
            all_topic_pages.extend(sc.get("page_numbers", []))
        all_topic_pages = sorted(list(set(all_topic_pages)))

        roadmap.append({
            "id": f"t{u_idx+1}",
            "title": topic_title,
            "summary": summary,
            "key_concept": key_concept,
            "deep_angle": deep_angle,
            "surface_status": "in_progress" if u_idx == 0 else "pending",
            "depth_status": "locked",
            "current_subconcept_index": 0,
            "source_refs": [{"note_id": unit.get("source_note_id"), "title": unit.get("source_title")}],
            "covered_pages": all_topic_pages,
            "chapter_surface_completed": False,
            "subconcepts": subconcepts
        })

    return {
        "big_insight": big_insight,
        "roadmap": roadmap
    }


def retrieve_relevant_source_pages(
    source_material_text: str,
    current_topic: Dict[str, Any],
    current_subconcept: Optional[Dict[str, Any]] = None,
    max_chars: int = 40000
) -> str:
    """
    Localiza e extrai de source_material_text as páginas exatas correspondentes ao bloco/sub-conceito.
    """
    if not source_material_text:
        return ""

    matched_text_chunks = []
    target_title = current_subconcept.get("source_title") if current_subconcept else None
    target_note_id = current_subconcept.get("source_note_id") if current_subconcept else None
    page_numbers: List[int] = (current_subconcept.get("page_numbers") or current_subconcept.get("covered_pages") or []) if current_subconcept else []

    source_pattern = None
    if target_title:
        escaped_title = re.escape(target_title)
        source_pattern = re.compile(rf'=== \[(?:Fonte|FONTE): [^\]]*{escaped_title}[^\]]*\] ===(.*?)((?==== \[(?:Fonte|FONTE):)|$)', re.DOTALL | re.IGNORECASE)
    elif target_note_id:
        source_pattern = re.compile(rf'=== \[(?:Fonte|FONTE): [^\]]*note_id: {target_note_id}[^\]]*\] ===(.*?)((?==== \[(?:Fonte|FONTE):)|$)', re.DOTALL | re.IGNORECASE)

    extracted_source_body = ""
    if source_pattern:
        match = source_pattern.search(source_material_text)
        if match:
            extracted_source_body = match.group(1)

    if extracted_source_body:
        if page_numbers:
            for p_num in page_numbers:
                p_pat = re.compile(rf'--- \[Página {p_num}\b[^\]]*\] ---(.*?)((?=--- \[Página \d+)|$)', re.DOTALL | re.IGNORECASE)
                p_match = p_pat.search(extracted_source_body)
                if p_match:
                    matched_text_chunks.append(f"--- [Página {p_num}] ---\n{p_match.group(1).strip()}")
        if not matched_text_chunks:
            matched_text_chunks.append(extracted_source_body[:max_chars])
    else:
        # Fallback de busca textual
        topic_title = current_topic.get("title", "")
        key_words = [w for w in re.split(r'\W+', topic_title) if len(w) > 4][:3]
        if key_words:
            regex_kw = "|".join([re.escape(w) for w in key_words])
            for m in re.finditer(rf'.{{0,300}}({regex_kw}).{{0,1200}}', source_material_text, re.DOTALL | re.IGNORECASE):
                matched_text_chunks.append(m.group(0).strip())
                if len("\n\n".join(matched_text_chunks)) > max_chars:
                    break

    combined = "\n\n".join(matched_text_chunks).strip()
    return (combined or source_material_text)[:max_chars]


def sanitize_mermaid_syntax(mermaid_str: Optional[str]) -> Optional[str]:
    """
    Sanitiza strings de código Mermaid para garantir compatibilidade com o compilador:
    - Envolve labels de nós que contêm caracteres especiais ({}, [], (), =, ;, etc.) entre aspas duplas:
      Ex: A[Σ = {a, b}] -> A["Σ = {a, b}"]
    """
    if not mermaid_str:
        return None
    code = mermaid_str.strip()
    # Remove cercas de markdown se houver
    code = re.sub(r'^```mermaid\s*', '', code, flags=re.IGNORECASE)
    code = re.sub(r'\s*```$', '', code).strip()

    # Decodifica entidades HTML que possam ter sido inseridas acidentalmente
    code = (
        code.replace('&gt;', '>')
        .replace('&lt;', '<')
        .replace('&quot;', '"')
        .replace('&#39;', "'")
        .replace('&amp;', '&')
    )

    lines = code.split("\n")
    sanitized_lines = []
    # Regex para capturar labels não cotadas dentro de colchetes que contenham caracteres especiais
    bracket_re = re.compile(r'([a-zA-Z0-9_-]+)\[([^"\]\n]*?[{}()=;,|<>εΣλ∅→*+\\₁₂₃₄₅₆₇₈₉₀][^"\]\n]*?)\]')
    # Regex para capturar labels não cotadas dentro de parênteses
    paren_re = re.compile(r'([a-zA-Z0-9_-]+)\((?!\[|\()([^"\)\n]*?[{}[\]=;,|<>εΣλ∅→*+\\₁₂₃₄₅₆₇₈₉₀][^"\)\n]*?)\)(?!\]|\))')

    for line in lines:
        def quote_bracket(m):
            clean_txt = m.group(2).replace('"', "'")
            return f'{m.group(1)}["{clean_txt}"]'

        def quote_paren(m):
            clean_txt = m.group(2).replace('"', "'")
            return f'{m.group(1)}("{clean_txt}")'

        line = bracket_re.sub(quote_bracket, line)
        line = paren_re.sub(quote_paren, line)
        sanitized_lines.append(line)

    return "\n".join(sanitized_lines)


def generate_lesson_for_step(
    session: models.GuidedStudySession,
    target_topic: Dict[str, Any],
    target_subconcept: Dict[str, Any],
    phase: str = "surface",
    contextual_intro: str = ""
) -> Dict[str, Any]:
    """
    Gera o Guia Completo da Seção para o bloco de páginas alvo:
    - Apresenta TODOS os conceitos, definições e fórmulas daquele bloco de páginas.
    - Cita as páginas com chips no formato [Pág. X].
    - Gera diagrama Mermaid, exemplo prático e UMA única pergunta integradora.
    """
    source_material_text = session.source_material_text or ""
    pages_text = retrieve_relevant_source_pages(
        source_material_text=source_material_text,
        current_topic=target_topic,
        current_subconcept=target_subconcept,
        max_chars=35000
    )

    page_numbers = target_subconcept.get("page_numbers") or target_subconcept.get("covered_pages") or []
    primary_page = page_numbers[0] if page_numbers else 1
    src_title = target_subconcept.get("source_title") or "Material"
    src_note_id = target_subconcept.get("source_note_id")

    system_prompt = f"""Você é o Mentor Socrático de Ciência da Computação do Synaptix.
Sua missão é apresentar a Fase de {phase.upper()} deste bloco de estudo com clareza, alta densidade de aprendizado e didatismo exemplar.
Persona para Profundeza: {session.depth_persona}.

INSTRUÇÕES OBRIGATÓRIAS DO GUIA DA SEÇÃO:
1. `contextualization`: {contextual_intro or 'Apresente a problemática real que este bloco de conteúdo resolve e por que é fundamental compreendê-lo.'}
2. `explanation`: Crie um GUIA COMPLETO E ESTRUTURADO abordando TODOS os conceitos, definições formais, notações matemáticas e regras presentes nas páginas deste bloco.
   - REGRA MANDATÓRIA: Insira tags de página no formato `[Pág. X]` (ex: `[Pág. {primary_page}]`) ao longo do texto sempre que citar um conceito ou definição extraído daquela página específica!
   - Não seja raso nem omita definições. Se o slide define alfabeto, cadeia, palavra vazia ou autômato, explique cada um com clareza!
3. `slide_reference`: Referência do slide principal a ser aberto no visualizador (`note_id`, `source_title`, `page_number`, `slide_excerpt`).
4. `covered_pages`: Lista exata de páginas abordadas neste bloco: {page_numbers}.
5. `diagram_mermaid`: Diagrama Mermaid (stateDiagram-v2, flowchart TD ou classDiagram) sintetizando a mecânica visual das páginas.
   - REGRA MANDATÓRIA: SEMPRE coloque entre aspas duplas o texto dos nós que contiverem símbolos matemáticos, chaves {{}}, colchetes [], parênteses () ou vírgulas. Exemplo correto: A[\"Σ = {{a, b}}\"] --> B[\"L = {{ab, aabb}}\"]. NUNCA escreva sem aspas como A[Σ = {{a, b}}].
6. `step_by_step_example`: Simulação, trace ou exemplo prático demonstrando o conteúdo do bloco.
7. `question`: UMA ÚNICA pergunta socrática integradora que exige do estudante relacionar os conceitos deste bloco com suas próprias palavras.

CONTEÚDO REAL DOS SLIDES/PÁGINAS DO BLOCO:
\"\"\"
{pages_text}
\"\"\"

Retorne RIGOROSAMENTE um JSON:
{{
  "contextualization": "Contextualização...",
  "explanation": "Guia Completo da Seção estruturado com títulos, tópicos e citações [Pág. X]...",
  "slide_reference": {{
    "note_id": {json.dumps(src_note_id)},
    "source_title": {json.dumps(src_title)},
    "page_number": {primary_page},
    "slide_excerpt": "Trecho literal relevante..."
  }},
  "covered_pages": {json.dumps(page_numbers)},
  "diagram_mermaid": "flowchart TD\\n...",
  "step_by_step_example": "Exemplo passo a passo...",
  "question": "Pergunta integradora..."
}}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system_prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    lesson_data = json.loads(response.choices[0].message.content or "{}")
    if lesson_data.get("diagram_mermaid"):
        lesson_data["diagram_mermaid"] = sanitize_mermaid_syntax(lesson_data["diagram_mermaid"])
    return lesson_data


def generate_initial_roadmap_and_first_question(
    source_title: str,
    combined_content: str,
    depth_persona: str = "Cientista da Computação",
    surface_pace: str = "standard"
) -> Dict[str, Any]:
    """
    Inicializa o currículo completo com validação de cobertura estrutural 100% e primeira aula.
    """
    structured_units = scan_document_structure(combined_content)
    curriculum = build_curriculum_roadmap(
        structured_units=structured_units,
        source_title=source_title,
        depth_persona=depth_persona,
        surface_pace=surface_pace
    )

    roadmap = curriculum["roadmap"]
    big_insight = curriculum["big_insight"]

    first_topic = roadmap[0] if roadmap else {
        "id": "t1", "title": source_title, "summary": "Módulo Inicial",
        "subconcepts": [{"id": "t1_s1", "title": "Introdução", "page_numbers": [1], "covered_pages": [1]}]
    }
    first_sub = first_topic["subconcepts"][0] if first_topic.get("subconcepts") else {
        "id": "t1_s1", "title": "Introdução", "page_numbers": [1], "covered_pages": [1]
    }

    # Criar um objeto de sessão temporário para gerar a primeira aula
    temp_session = models.GuidedStudySession(
        title=source_title,
        depth_persona=depth_persona,
        surface_pace=surface_pace,
        source_material_text=combined_content,
        big_insight=big_insight
    )

    first_lesson = generate_lesson_for_step(
        session=temp_session,
        target_topic=first_topic,
        target_subconcept=first_sub,
        phase="surface",
        contextual_intro="Bem-vindo ao Estudo Guiado do Synaptix. Iniciamos pela base de Superfície: uma passagem panorâmica, rica e estruturada pelos conceitos essenciais da matéria."
    )

    return {
        "big_insight": big_insight,
        "roadmap": roadmap,
        "first_turn": {
            "topic_id": first_topic.get("id", "t1"),
            "subconcept_id": first_sub.get("id", "t1_s1"),
            **first_lesson
        }
    }


def process_study_turn(
    session: models.GuidedStudySession,
    user_message: str,
    action: str = "answer",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Máquina de Estados de 2 Etapas (Zero Bug Off-By-One & Anti-Loop):
    1. Avalia a resposta do estudante à pergunta anterior com feedback transparente (what_was_right / what_is_missing).
    2. Na 2ª tentativa em Superfície (attempts >= 2), auto-consolida a lacuna e avança para o próximo bloco!
    3. Quando avança, incrementa o ponteiro PRIMEIRO e ensina o NOVO bloco de páginas sem repetição.
    """
    roadmap: List[Dict[str, Any]] = json.loads(session.roadmap_json or "[]")
    messages: List[Dict[str, Any]] = json.loads(session.messages_json or "[]")
    current_phase = session.current_phase or "surface"
    topic_idx = session.current_topic_index or 0

    if topic_idx >= len(roadmap):
        topic_idx = max(0, len(roadmap) - 1)
        
    current_topic = roadmap[topic_idx] if roadmap else {
        "id": "t1", "title": "Tópico Geral", "current_subconcept_index": 0, "subconcepts": []
    }

    subconcepts = current_topic.get("subconcepts", [])
    sub_idx = current_topic.get("current_subconcept_index", 0)
    if sub_idx >= len(subconcepts):
        sub_idx = max(0, len(subconcepts) - 1) if subconcepts else 0
    current_subconcept = subconcepts[sub_idx] if subconcepts else None

    # Obter a última mensagem do assistente para saber exatamente o que foi perguntado
    last_assistant_msg = next((m for m in reversed(messages) if m.get("role") == "assistant"), {})
    last_question = last_assistant_msg.get("question") or "Pergunta socrática da etapa anterior"

    # Incrementar contador de tentativas neste sub-conceito
    attempts = (current_subconcept.get("attempts", 0) if current_subconcept else 0) + 1
    if current_subconcept:
        current_subconcept["attempts"] = attempts

    # 1. Avaliar a resposta do aluno com o avaliador
    eval_prompt = f"""Você é o Avaliador Socrático do Synaptix.
Sua função é avaliar se o estudante respondeu à pergunta anterior ou se apresentou dúvida/pedido de pista.

PERGUNTA QUE FOI FEITA AO ALUNO:
"{last_question}"

RESPOSTA / MENSAGEM DO ALUNO:
"{user_message}"

AÇÃO INDICADA: {action}
TENTATIVA ATUAL NESTE BLOCO: {attempts} de 2 (Fase: {current_phase.upper()})

DIRETRIZES DE AVALIAÇÃO:
1. `student_intent`:
   - `"doubt_or_question"`: O aluno expressou dúvida explícita ("não entendi", "o que significa X?", "poderia dar uma pista?").
   - `"incomplete_or_incorrect"`: O aluno tentou responder, mas a resposta é incompleta ou omite pontos cruciais.
   - `"mastered_subconcept"`: O aluno respondeu com clareza demonstrando compreensão dos conceitos da pergunta.
2. `what_was_right`: O que o aluno expressou de correto (seja generoso reconhecendo os acertos).
3. `what_is_missing`: Se incompleto, cite pontualmente o conceito que ainda falta conectar.
4. `subconcept_validated`:
   - `true` se `mastered_subconcept`.
   - `false` se `doubt_or_question`.
   - Se `incomplete_or_incorrect` na fase de SUPERFÍCIE e `attempts >= 2`: marque `true` para AUTO-CONSOLIDAR e destravar o aluno, fornecendo a síntese completa!

Retorne RIGOROSAMENTE um JSON:
{{
  "student_intent": "doubt_or_question" | "incomplete_or_incorrect" | "mastered_subconcept",
  "subconcept_validated": true ou false,
  "what_was_right": "O que o aluno acertou...",
  "what_is_missing": "O que ainda faltava...",
  "student_synthesis": "Síntese brilhante em 1-2 frases do conceito validado (ou null se for dúvida)"
}}"""

    if action == "skip_block":
        eval_result = {
            "student_intent": "mastered_subconcept",
            "subconcept_validated": True,
            "what_was_right": "Você optou por avançar diretamente para o próximo bloco de estudo.",
            "what_is_missing": None,
            "student_synthesis": f"Avanço confirmado no bloco {current_subconcept.get('title') if current_subconcept else 'Conceito'}."
        }
    else:
        eval_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": eval_prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        eval_result = json.loads(eval_response.choices[0].message.content or "{}")

    student_intent = eval_result.get("student_intent", "doubt_or_question")
    subconcept_validated = bool(eval_result.get("subconcept_validated", False))
    what_was_right = eval_result.get("what_was_right")
    what_is_missing = eval_result.get("what_is_missing")
    student_synthesis = eval_result.get("student_synthesis")

    # Registro da mensagem do usuário
    now_iso = datetime.utcnow().isoformat()
    user_msg_entry = {
        "id": f"msg-{uuid.uuid4().hex[:8]}",
        "role": "user",
        "phase": current_phase,
        "topic_id": current_topic.get("id"),
        "subconcept_id": current_subconcept.get("id") if current_subconcept else None,
        "student_intent": student_intent,
        "content": user_message,
        "timestamp": now_iso,
    }
    messages.append(user_msg_entry)

    # Variáveis de transição
    topic_validated = False
    chapter_surface_completed = False
    advance_to_next_topic = False
    created_synapse_id = None

    # MÁQUINA DE ESTADOS:
    if subconcept_validated:
        # 1. Marcar subconceito como passado
        if current_subconcept:
            if current_phase == "surface":
                current_subconcept["surface_passed"] = True
            else:
                current_subconcept["depth_passed"] = True

        # Criar nó no Mapa Mental
        if student_synthesis and session.auto_create_synapses and db:
            try:
                sub_title = current_subconcept.get("title", current_topic.get("title", "Conceito")) if current_subconcept else "Conceito"
                created_synapse_id = create_synapse_in_mindmap(
                    db=db,
                    session=session,
                    topic_title=sub_title,
                    question_text=last_question,
                    synthesis_text=student_synthesis,
                    phase=current_phase,
                    topic_index=topic_idx
                )
            except Exception as e:
                logger.error(f"Erro ao criar sinapse: {e}")

        # 2. Verificar se restam subconceitos neste tópico
        if sub_idx + 1 < len(subconcepts):
            # Avança o ponteiro de subconceito PRIMEIRO
            current_topic["current_subconcept_index"] = sub_idx + 1
            target_topic = current_topic
            target_subconcept = subconcepts[current_topic["current_subconcept_index"]]
            contextual_intro = f"✅ Excelente raciocínio: {what_was_right or student_synthesis}. Avançamos agora para o próximo bloco de páginas da matéria."
        else:
            # 100% dos blocos deste tópico foram concluídos!
            topic_validated = True
            if current_phase == "surface":
                current_topic["surface_status"] = "validated"
                current_topic["depth_status"] = "pending"
                chapter_surface_completed = True

            # Próximo tópico
            if topic_idx + 1 < len(roadmap):
                session.current_topic_index = topic_idx + 1
                target_topic = roadmap[session.current_topic_index]
                target_topic["current_subconcept_index"] = 0
                if current_phase == "surface":
                    target_topic["surface_status"] = "in_progress"
                else:
                    target_topic["depth_status"] = "in_progress"
                target_subconcept = target_topic["subconcepts"][0] if target_topic.get("subconcepts") else None
                contextual_intro = f"🎉 Parabéns! Você concluiu a etapa de {current_topic.get('title')} ({'Superfície' if current_phase == 'surface' else 'Profundeza'}). Passamos agora para o Módulo {session.current_topic_index + 1}: {target_topic.get('title')}."
            else:
                # Fim da fase atual
                if current_phase == "surface":
                    session.current_phase = "depth"
                    session.current_topic_index = 0
                    current_phase = "depth"
                    for t in roadmap:
                        t["depth_status"] = "pending"
                        t["current_subconcept_index"] = 0
                    roadmap[0]["depth_status"] = "in_progress"
                    target_topic = roadmap[0]
                    target_subconcept = target_topic["subconcepts"][0] if target_topic.get("subconcepts") else None
                    contextual_intro = f"🏆 Conclusão da Base de Superfície! Todos os módulos foram compreendidos. Desbloqueamos agora a Fase de Profundeza sob o rigor de {session.depth_persona}."
                else:
                    session.status = "completed"
                    session.current_phase = "completed"
                    target_topic = current_topic
                    target_subconcept = current_subconcept
                    contextual_intro = f"🎓 Sessão Concluída! Você dominou tanto a Superfície quanto a Profundeza. A Grande Sacada está plenamente assimilada: '{session.big_insight}'."

        # Gerar a aula completa do NOVO bloco
        if target_topic and target_subconcept and session.status != "completed":
            lesson_res = generate_lesson_for_step(
                session=session,
                target_topic=target_topic,
                target_subconcept=target_subconcept,
                phase=current_phase,
                contextual_intro=contextual_intro
            )
        else:
            lesson_res = {
                "contextualization": contextual_intro,
                "explanation": f"### 🌟 Parabéns! O ciclo de aprendizado foi completado com êxito.\n\nTodos os tópicos foram validados. Você pode revisar as sinapses cristalizadas no Mapa Mental e suas anotações no caderno.",
                "question": "Deseja revisar algum tópico específico em Profundeza ou cristalizar mais conexões?",
                "slide_reference": None,
                "covered_pages": [],
                "diagram_mermaid": None,
                "step_by_step_example": None
            }

        ai_msg_entry = {
            "id": f"msg-{uuid.uuid4().hex[:8]}",
            "role": "assistant",
            "phase": current_phase,
            "topic_id": target_topic.get("id"),
            "subconcept_id": target_subconcept.get("id") if target_subconcept else None,
            "student_intent": student_intent,
            "contextualization": lesson_res.get("contextualization", ""),
            "explanation": lesson_res.get("explanation", ""),
            "slide_reference": lesson_res.get("slide_reference"),
            "covered_pages": lesson_res.get("covered_pages", []),
            "diagram_mermaid": lesson_res.get("diagram_mermaid"),
            "step_by_step_example": lesson_res.get("step_by_step_example"),
            "question": lesson_res.get("question", ""),
            "content": f"{lesson_res.get('contextualization', '')}\n\n{lesson_res.get('explanation', '')}\n\n**Pergunta:** {lesson_res.get('question', '')}",
            "student_synthesis": student_synthesis,
            "topic_validated": topic_validated,
            "chapter_surface_completed": chapter_surface_completed,
            "construction_feedback": None,
            "synapse_comment_id": created_synapse_id or session.last_synapse_comment_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
    else:
        # RESPOSTA INCOMPLETA OU DÚVIDA -> MANTÉM O MESMO BLOCO SEM REPETIR TEXTO ANTIGO
        # Responder à dúvida com clareza ou apontar a lacuna transparente
        feedback_obj = {
            "what_was_right": what_was_right,
            "what_is_missing": what_is_missing,
            "attempt_number": attempts,
            "max_attempts": 2
        }

        # Obter texto das páginas para tirar a dúvida com base nos slides
        source_material_text = session.source_material_text or ""
        pages_text = retrieve_relevant_source_pages(
            source_material_text=source_material_text,
            current_topic=current_topic,
            current_subconcept=current_subconcept,
            max_chars=25000
        )

        doubt_prompt = f"""Você é o Mentor Socrático do Synaptix.
O estudante está respondendo ao bloco: '{current_subconcept.get('title') if current_subconcept else 'Conceito'}'.
Intenção identificada: {student_intent}.
Tentativa {attempts} de 2.

Mensagem do estudante: "{user_message}"
Pergunta que havia sido feita: "{last_question}"
O que o estudante já acertou: "{what_was_right}"
O que falta para completar o raciocínio: "{what_is_missing}"

PÁGINAS DOS SLIDES PARA ESCLARECER:
\"\"\"
{pages_text}
\"\"\"

REGRAS:
- NÃO REPITA A MESMA EXPLICAÇÃO ANTERIOR!
- Destaque o que ele acertou de forma acolhedora.
- Esclareça pontualmente a dúvida ou a lacuna com uma analogia cirúrgica ou exemplo visual.
- Reformule a pergunta de forma mais guiada e direta para destravar a resposta no próximo passo.

Retorne JSON:
{{
  "contextualization": "Reconhecimento acolhedor do ponto do aluno...",
  "explanation": "Esclarecimento cirúrgico da dúvida/lacuna sem repetir texto antigo...",
  "question": "Pergunta socrática de apoio reformulada..."
}}"""

        doubt_res = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": doubt_prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        doubt_data = json.loads(doubt_res.choices[0].message.content or "{}")

        ai_msg_entry = {
            "id": f"msg-{uuid.uuid4().hex[:8]}",
            "role": "assistant",
            "phase": current_phase,
            "topic_id": current_topic.get("id"),
            "subconcept_id": current_subconcept.get("id") if current_subconcept else None,
            "student_intent": student_intent,
            "contextualization": doubt_data.get("contextualization", ""),
            "explanation": doubt_data.get("explanation", ""),
            "slide_reference": last_assistant_msg.get("slide_reference"),
            "covered_pages": current_subconcept.get("page_numbers", []) if current_subconcept else [],
            "diagram_mermaid": last_assistant_msg.get("diagram_mermaid"),
            "step_by_step_example": None,
            "question": doubt_data.get("question", last_question),
            "content": f"{doubt_data.get('contextualization', '')}\n\n{doubt_data.get('explanation', '')}\n\n**Pergunta:** {doubt_data.get('question', last_question)}",
            "student_synthesis": None,
            "topic_validated": False,
            "chapter_surface_completed": False,
            "construction_feedback": feedback_obj,
            "synapse_comment_id": session.last_synapse_comment_id,
            "timestamp": datetime.utcnow().isoformat(),
        }

    messages.append(ai_msg_entry)
    session.roadmap_json = json.dumps(roadmap)
    session.messages_json = json.dumps(messages)
    if created_synapse_id:
        session.last_synapse_comment_id = created_synapse_id

    return {
        "ai_message": ai_msg_entry,
        "student_intent": student_intent,
        "subconcept_validated": subconcept_validated,
        "topic_validated": topic_validated,
        "chapter_surface_completed": chapter_surface_completed,
        "student_synthesis": student_synthesis,
        "current_phase": session.current_phase,
        "current_topic_index": session.current_topic_index,
        "status": session.status,
        "roadmap": roadmap,
        "slide_reference": ai_msg_entry.get("slide_reference"),
    }


def jump_to_study_step(
    session: models.GuidedStudySession,
    topic_index: int,
    subconcept_index: int = 0,
    phase: Optional[str] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Permite ao estudante navegar livremente na trilha para qualquer Capítulo ou Bloco de estudo.
    Gera imediatamente o Guia Completo da Seção correspondente à etapa escolhida.
    """
    roadmap: List[Dict[str, Any]] = json.loads(session.roadmap_json or "[]")
    messages: List[Dict[str, Any]] = json.loads(session.messages_json or "[]")
    target_phase = phase or session.current_phase or "surface"

    if topic_index >= len(roadmap):
        topic_index = max(0, len(roadmap) - 1)

    target_topic = roadmap[topic_index]
    subconcepts = target_topic.get("subconcepts", [])
    if subconcept_index >= len(subconcepts):
        subconcept_index = max(0, len(subconcepts) - 1) if subconcepts else 0
    target_sub = subconcepts[subconcept_index] if subconcepts else None

    # Atualizar estado da sessão
    session.current_topic_index = topic_index
    session.current_phase = target_phase
    target_topic["current_subconcept_index"] = subconcept_index
    if target_phase == "surface":
        target_topic["surface_status"] = "in_progress"
    else:
        target_topic["depth_status"] = "in_progress"

    contextual_intro = f"🧭 Navegação na Trilha: Você abriu o Módulo {topic_index + 1}: '{target_topic.get('title')}' — Bloco {subconcept_index + 1} ({target_sub.get('title') if target_sub else 'Geral'}) na Fase de {target_phase.upper()}."

    lesson_res = generate_lesson_for_step(
        session=session,
        target_topic=target_topic,
        target_subconcept=target_sub,
        phase=target_phase,
        contextual_intro=contextual_intro
    )

    ai_msg_entry = {
        "id": f"msg-jump-{uuid.uuid4().hex[:6]}",
        "role": "assistant",
        "phase": target_phase,
        "topic_id": target_topic.get("id"),
        "subconcept_id": target_sub.get("id") if target_sub else None,
        "student_intent": "navigation",
        "contextualization": lesson_res.get("contextualization", ""),
        "explanation": lesson_res.get("explanation", ""),
        "slide_reference": lesson_res.get("slide_reference"),
        "covered_pages": lesson_res.get("covered_pages", []),
        "diagram_mermaid": lesson_res.get("diagram_mermaid"),
        "step_by_step_example": lesson_res.get("step_by_step_example"),
        "question": lesson_res.get("question", ""),
        "content": f"{lesson_res.get('contextualization', '')}\n\n{lesson_res.get('explanation', '')}\n\n**Pergunta:** {lesson_res.get('question', '')}",
        "student_synthesis": None,
        "topic_validated": False,
        "chapter_surface_completed": False,
        "construction_feedback": None,
        "synapse_comment_id": session.last_synapse_comment_id,
        "timestamp": datetime.utcnow().isoformat(),
    }

    messages.append(ai_msg_entry)
    session.roadmap_json = json.dumps(roadmap)
    session.messages_json = json.dumps(messages)
    if db:
        db.commit()
        db.refresh(session)

    return {
        "ai_message": ai_msg_entry,
        "session": session,
        "roadmap": roadmap
    }


def rebuild_roadmap_for_session(
    session: models.GuidedStudySession,
    surface_pace: str = "standard",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Reconstrói integralmente o roadmap com 100% de cobertura de todas as fontes/páginas,
    utilizando o ritmo de superfície configurado (fast, standard ou detailed).
    """
    full_text = session.source_material_text or ""
    if not full_text and db:
        sources_meta = json.loads(session.sources_meta_json or "[]")
        note_ids = [s.get("note_id") for s in sources_meta if s.get("note_id")]
        if note_ids:
            notes = db.query(models.Note).filter(models.Note.id.in_(note_ids)).all()
            parts = []
            for note in notes:
                src_info = extract_content_from_source(note)
                parts.append(f"=== [Fonte: {src_info['title']} | note_id: {src_info['note_id']} | type: {src_info['source_type']}] ===\n{src_info['text']}")
            full_text = "\n\n".join(parts)
            session.source_material_text = full_text

    session.surface_pace = surface_pace
    init_res = generate_initial_roadmap_and_first_question(
        source_title=session.title,
        combined_content=full_text,
        depth_persona=session.depth_persona or "Cientista da Computação",
        surface_pace=surface_pace
    )

    roadmap = init_res["roadmap"]
    big_insight = init_res["big_insight"]
    first_turn = init_res["first_turn"]

    full_first_message = f"{first_turn.get('contextualization', '')}\n\n{first_turn.get('explanation', '')}\n\n**Pergunta:** {first_turn.get('question', '')}"

    first_message_entry = {
        "id": f"msg-rebuild-{uuid.uuid4().hex[:6]}",
        "role": "assistant",
        "phase": "surface",
        "topic_id": first_turn.get("topic_id", "t1"),
        "subconcept_id": first_turn.get("subconcept_id", "t1_s1"),
        "contextualization": first_turn.get("contextualization", ""),
        "explanation": first_turn.get("explanation", ""),
        "slide_reference": first_turn.get("slide_reference"),
        "covered_pages": first_turn.get("covered_pages", []),
        "diagram_mermaid": first_turn.get("diagram_mermaid"),
        "step_by_step_example": first_turn.get("step_by_step_example"),
        "question": first_turn.get("question", ""),
        "content": full_first_message,
        "student_synthesis": None,
        "topic_validated": False,
        "chapter_surface_completed": False,
        "construction_feedback": None,
        "synapse_comment_id": None,
        "timestamp": datetime.utcnow().isoformat(),
    }

    session.roadmap_json = json.dumps(roadmap)
    session.big_insight = big_insight
    session.current_phase = "surface"
    session.current_topic_index = 0
    session.messages_json = json.dumps([first_message_entry])
    session.status = "active"

    if db:
        db.commit()
        db.refresh(session)

    return {
        "session": session,
        "roadmap": roadmap,
        "big_insight": big_insight,
        "first_message": first_message_entry
    }


def generate_visual_for_message(
    session: models.GuidedStudySession,
    message_id: str,
    prompt_hint: Optional[str] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Gera um diagrama visual rico Mermaid sob demanda para uma mensagem.
    """
    messages: List[Dict[str, Any]] = json.loads(session.messages_json or "[]")
    target_msg = next((m for m in messages if m.get("id") == message_id), None)
    if not target_msg:
        raise ValueError("Mensagem não encontrada.")

    concept_text = target_msg.get("explanation") or target_msg.get("content") or ""
    
    prompt = f"""Crie um diagrama Mermaid (stateDiagram-v2, flowchart TD ou classDiagram) altamente didático e elegante para representar visualmente este conceito de Ciência da Computação:
CONCEITO:
{concept_text}

Instruções adicionais: {prompt_hint or 'Foco em clareza visual, transições de estado ou etapas do processo.'}

Retorne SOMENTE o código Mermaid puro sem blocos ```mermaid de marcação."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    mermaid_code = (response.choices[0].message.content or "").strip()
    mermaid_code = re.sub(r'^```mermaid\s*', '', mermaid_code)
    mermaid_code = re.sub(r'\s*```$', '', mermaid_code).strip()
    mermaid_code = sanitize_mermaid_syntax(mermaid_code)

    target_msg["diagram_mermaid"] = mermaid_code
    session.messages_json = json.dumps(messages)
    if db:
        db.commit()

    return {
        "message_id": message_id,
        "diagram_mermaid": mermaid_code
    }


def create_synapse_in_mindmap(
    db: Session,
    session: models.GuidedStudySession,
    topic_title: str,
    question_text: str,
    synthesis_text: str,
    phase: str,
    topic_index: int,
    custom_observation: Optional[str] = None
) -> int:
    """
    Cria um Nó Sináptico (models.Comment) com is_question=True no Mapa Mental do Caderno
    e o conecta via models.CommentConnection ao nó sináptico anterior para traçar a linha de raciocínio.
    """
    col = topic_index % 4
    row = topic_index // 4
    y_offset = 0 if phase == "surface" else 420
    x_pos = 100 + (col * 360)
    y_pos = 120 + (row * 280) + y_offset

    target_note_id = session.target_note_id
    if not target_note_id and session.notebook_id:
        first_note = db.query(models.Note).filter(models.Note.notebook_id == session.notebook_id).first()
        if first_note:
            target_note_id = first_note.id

    phase_label = "Superfície" if phase == "surface" else "Profundeza"
    clean_question = sanitize_html_content(question_text or f"Passo {topic_index + 1}: {topic_title}")
    clean_synthesis = sanitize_html_content(f"[{phase_label}] {synthesis_text}")

    comment = models.Comment(
        note_id=target_note_id,
        notebook_id=session.notebook_id,
        is_question=True,
        selected_text=clean_question[:400],
        content=clean_synthesis,
        x_position=x_pos,
        y_position=y_pos,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    if session.last_synapse_comment_id:
        prev_comment = db.query(models.Comment).filter(models.Comment.id == session.last_synapse_comment_id).first()
        if prev_comment:
            obs = custom_observation or f"Linha de Raciocínio: {topic_title} ({phase_label})"
            connection = models.CommentConnection(
                source_comment_id=session.last_synapse_comment_id,
                target_comment_id=comment.id,
                observation=obs,
            )
            db.add(connection)
            db.commit()

    return comment.id
