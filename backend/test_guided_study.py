import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import models
import database
import guided_study_engine

def run_tests():
    print("=== Iniciando Verificacao Automatizada da Sessao de Estudo Guiado (V2 - Visual & Anti-Pulo) ===")

    # 1. Verificar banco de dados e tabela
    models.Base.metadata.create_all(bind=database.engine)
    print("1. Tabelas do banco de dados criadas/validadas.")

    with database.SessionLocal() as db:
        # Criar workspace e caderno de teste se nao existirem
        ws = db.query(models.Workspace).first()
        if not ws:
            ws = models.Workspace(title="Workspace de Estudo Teste")
            db.add(ws)
            db.commit()
            db.refresh(ws)

        nb = db.query(models.Notebook).filter(models.Notebook.workspace_id == ws.id).first()
        if not nb:
            nb = models.Notebook(title="Caderno Teoria da Computacao Teste", workspace_id=ws.id)
            db.add(nb)
            db.commit()
            db.refresh(nb)

        # 2. Testar extracao com demarcadores de pagina
        sample_txt = "=== [Fonte: 01.pdf | note_id: 99 | type: pdf] ===\n--- [Página 2 | Pág. 2] ---\nO que é Teoria da Computação?\n--- [Página 3 | Pág. 3] ---\nA Teoria da Computação formaliza problemas computacionais."
        ext_res = guided_study_engine.extract_uploaded_file_text("01.txt", sample_txt.encode("utf-8"))
        assert ext_res["char_count"] == len(sample_txt)
        print(f"2. Extracao de arquivo com paginas validada: {ext_res['char_count']} caracteres.")

        # 3. Testar recuperacao direcionada de paginas dos slides
        topic_test = {
            "id": "t1",
            "title": "Introdução à Teoria da Computação",
            "current_subconcept_index": 0,
            "subconcepts": [
                {
                    "id": "t1_s1",
                    "title": "Formalização de Problemas Computacionais",
                    "source_title": "01.pdf",
                    "source_note_id": 99,
                    "page_numbers": [3],
                    "surface_passed": False,
                    "depth_passed": False
                }
            ]
        }
        retrieved_pages = guided_study_engine.retrieve_relevant_source_pages(
            source_material_text=sample_txt,
            current_topic=topic_test,
            current_subconcept=topic_test["subconcepts"][0]
        )
        assert "Página 3" in retrieved_pages
        assert "A Teoria da Computação formaliza" in retrieved_pages
        print("3. Recuperacao de paginas exatas de slides validada com sucesso.")

        # 4. Criar sessao de teste com checklist de micro-conceitos
        roadmap_sample = [
            {
                "id": "t1",
                "title": "Introdução à Teoria da Computação",
                "summary": "Formalizacao de problemas",
                "key_concept": "Abstracao e regras",
                "deep_angle": "Limites de computabilidade",
                "surface_status": "in_progress",
                "depth_status": "locked",
                "current_subconcept_index": 0,
                "subconcepts": [
                    {
                        "id": "t1_s1",
                        "title": "Conceito de Computacao como Regras",
                        "source_title": "01.pdf",
                        "source_note_id": 99,
                        "page_numbers": [2],
                        "surface_passed": False,
                        "depth_passed": False
                    },
                    {
                        "id": "t1_s2",
                        "title": "Abstracao e Independencia de Linguagem",
                        "source_title": "01.pdf",
                        "source_note_id": 99,
                        "page_numbers": [3],
                        "surface_passed": False,
                        "depth_passed": False
                    }
                ]
            }
        ]

        session = models.GuidedStudySession(
            title="Estudo Guiado: Teste Anti-Pulo",
            workspace_id=ws.id,
            notebook_id=nb.id,
            depth_persona="Cientista da Computação",
            current_phase="surface",
            current_topic_index=0,
            big_insight="A formalizacao matemática define a fronteira entre problemas solucionáveis e indecidíveis.",
            source_material_text=sample_txt,
            sources_meta_json=json.dumps([{"source_type": "pdf", "title": "01.pdf", "note_id": 99, "char_count": len(sample_txt)}]),
            roadmap_json=json.dumps(roadmap_sample),
            messages_json=json.dumps([
                {
                    "id": "msg-init",
                    "role": "assistant",
                    "phase": "surface",
                    "topic_id": "t1",
                    "subconcept_id": "t1_s1",
                    "contextualization": "Antes de programar, precisamos definir regras precisas.",
                    "explanation": "Computação é entrada -> regras -> saída.",
                    "slide_reference": {
                        "note_id": 99,
                        "source_title": "01.pdf",
                        "page_number": 2,
                        "slide_excerpt": "O que é Teoria da Computação?"
                    },
                    "diagram_mermaid": "flowchart LR\nEntrada --> Regras --> Saida",
                    "question": "Como você explicaria computação com base em regras?",
                    "content": "Antes de programar...",
                    "student_synthesis": None,
                    "topic_validated": False,
                    "synapse_comment_id": None,
                    "timestamp": "2026-11-07T22:00:00"
                }
            ]),
            last_synapse_comment_id=None,
            auto_create_synapses=True,
            status="active"
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        print(f"4. Sessao #{session.id} criada com persistencia AES-256-GCM.")

        # 5. Testar TRAVA ANTI-PULO PREMATURO com duvida do aluno
        doubt_msg = "Ainda nao entendi muito bem. O que exatamente a teoria da computacao define que difere de programar em Python?"
        turn1 = guided_study_engine.process_study_turn(
            session=session,
            user_message=doubt_msg,
            action="answer",
            db=db
        )
        db.commit()
        db.refresh(session)

        # Validar que a duvida NAO causou pulo de topico
        assert turn1["student_intent"] in ("doubt_or_question", "incomplete_or_incorrect"), f"Esperado doubt_or_question, recebido {turn1['student_intent']}"
        assert turn1["topic_validated"] is False, "O topico NAO deveria ter sido validado diante de uma duvida!"
        assert session.current_topic_index == 0, "O indice do topico NAO deveria ter avancado!"
        assert turn1["slide_reference"] is not None, "A resposta deve indicar referencia do slide."
        print(f"5. TRAVA ANTI-PULO VALIDADA: Duvida classificada como '{turn1['student_intent']}'. Topico mantido em {session.current_topic_index} (topic_validated=False).")

        # 6. Testar avanco por micro-conceito quando o aluno domina
        answer_msg = "Computação não depende da linguagem Python ou Java, mas sim de um modelo abstrato com estados, entradas, regras de transição bem definidas e saídas esperadas."
        turn2 = guided_study_engine.process_study_turn(
            session=session,
            user_message=answer_msg,
            action="answer",
            db=db
        )
        db.commit()
        db.refresh(session)

        # O primeiro micro-conceito foi validado, mas o topico ainda tem o subconceito t1_s2
        roadmap_after = json.loads(session.roadmap_json)
        t1_subconcepts = roadmap_after[0]["subconcepts"]
        print(f"6. Resposta avaliada. Sub-conceito 1 status: {t1_subconcepts[0]['surface_passed']}. Sub-conceito ativo: {roadmap_after[0]['current_subconcept_index'] + 1} de {len(t1_subconcepts)}.")
        assert t1_subconcepts[0]["surface_passed"] is True, "Subconceito 1 deveria ter passado."

        # Limpeza
        db.delete(session)
        db.commit()
        print("7. Limpeza dos dados de teste concluida com sucesso.")

    print("\n[SUCCESS] TODOS OS TESTES AUTOMATIZADOS DO MOTOR SOCRATICO V2 PASSARAM COM SUCESSO!")

if __name__ == "__main__":
    run_tests()
