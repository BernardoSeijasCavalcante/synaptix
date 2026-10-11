import json
import inspect
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from tools import calendar_tools, comm_tools, task_tools, memory_tools, research_tools, library_tools

client = OpenAI()

# Define the available functions mapping
AVAILABLE_TOOLS = {
    "read_calendar": calendar_tools.read_calendar,
    "create_event": calendar_tools.create_event,
    "update_cancel_event": calendar_tools.update_cancel_event,
    "add_task": task_tools.add_task,
    "start_task_timer": task_tools.start_task_timer,
    "pause_task_timer": task_tools.pause_task_timer,
    "reset_task_timer": task_tools.reset_task_timer,
    "complete_task": task_tools.complete_task,
    "query_tasks": task_tools.query_tasks,
    "update_task_status": task_tools.update_task_status,
    "schedule_notification": comm_tools.schedule_notification,
    "save_note": memory_tools.save_note,
    "search_memory": memory_tools.search_memory,
    "run_code_analysis": research_tools.run_code_analysis,
    "list_library_structure": library_tools.list_library_structure,
    "create_workspace": library_tools.create_workspace,
    "create_notebook": library_tools.create_notebook,
    "update_organization_rules": library_tools.update_organization_rules,
}

# Define the schema for OpenAI
TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "read_calendar",
            "description": "Lista eventos da agenda entre duas datas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "Formato ISO (YYYY-MM-DDTHH:MM:SS)"},
                    "end_date": {"type": "string", "description": "Formato ISO (YYYY-MM-DDTHH:MM:SS)"}
                },
                "required": ["start_date", "end_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": "Cria um novo evento na agenda.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "start_time": {"type": "string", "description": "Formato ISO (YYYY-MM-DDTHH:MM:SS)"},
                    "end_time": {"type": "string", "description": "Formato ISO (YYYY-MM-DDTHH:MM:SS)"},
                    "attendees": {"type": "string", "description": "Lista de emails separados por virgula (opcional)"}
                },
                "required": ["title", "start_time", "end_time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_cancel_event",
            "description": "Atualiza ou cancela ('cancel') um evento existente pelo ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "integer"},
                    "action": {"type": "string", "description": "Use 'update' ou 'cancel'"},
                    "new_title": {"type": "string"},
                    "new_start": {"type": "string"},
                    "new_end": {"type": "string"}
                },
                "required": ["event_id", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_task",
            "description": "Adiciona uma nova tarefa na lista de demandas pendentes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "estimated_hours": {"type": "number", "description": "Tempo estimado em horas (ex: 2.5)"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_task_timer",
            "description": "Inicia o cronômetro de uma tarefa, agendando cobranças em 25%, 50% e 75% do tempo.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "pause_task_timer",
            "description": "Pausa o cronômetro de uma tarefa e cancela cobranças pendentes.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reset_task_timer",
            "description": "Zera completamente o tempo investido em uma tarefa e a redefine como pendente.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Finaliza uma demanda e para seu cronômetro.",
            "parameters": {
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_tasks",
            "description": "Busca tarefas (demandas) no sistema. Retorna a lista com IDs para você gerenciar os cronômetros.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Ex: all, pending, in_progress, completed", "default": "all"},
                    "search_term": {"type": "string", "description": "Termo para buscar no nome da tarefa (opcional)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_task_status",
            "description": "Atualiza o status de uma tarefa.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "status": {"type": "string", "description": "Ex: completed, in_progress, blocked"}
                },
                "required": ["task_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_notification",
            "description": "Agenda uma notificacao ou lembrete para ser enviada no futuro.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "scheduled_time": {"type": "string", "description": "Formato ISO (YYYY-MM-DDTHH:MM:SS)"}
                },
                "required": ["message", "scheduled_time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_note",
            "description": "Salva uma anotacao no Segundo Cerebro. Sempre chame list_library_structure primeiro para saber o notebook_id ou workspace_id corretos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "O titulo ou topico principal da anotacao"},
                    "content": {"type": "string", "description": "O conteudo completo da memoria/anotacao"},
                    "workspace_id": {"type": "integer"},
                    "notebook_id": {"type": "integer"}
                },
                "required": ["topic", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_memory",
            "description": "Faz a busca semantica na memoria (Segundo Cerebro) usando vetor para recuperar anotacoes passadas relevantes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "O termo ou frase para buscar nas memorias"},
                    "limit": {"type": "integer", "description": "Numero maximo de notas a retornar", "default": 5}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_code_analysis",
            "description": "Executa codigo Python em um processo local para orcamentos, graficos ou logica.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "O codigo Python a executar. Use print() para exibir resultados."}
                },
                "required": ["code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_library_structure",
            "description": "Retorna a arvore de pastas (Workspaces e Notebooks) da biblioteca pessoal. Use para saber onde guardar coisas.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_workspace",
            "description": "Cria um Workspace (Raiz principal) na biblioteca. Só crie se não existir um similar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Nome do workspace"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_notebook",
            "description": "Cria um Notebook (Pasta/Sub-pasta) na biblioteca.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "workspace_id": {"type": "integer"},
                    "parent_id": {"type": "integer", "description": "ID do notebook pai se for sub-pasta, null caso contrario."}
                },
                "required": ["title", "workspace_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_organization_rules",
            "description": "Salva e atualiza as regras de organizacao definidas pelo usuario (ex: onde salvar receitas, projetos).",
            "parameters": {
                "type": "object",
                "properties": {
                    "rules": {"type": "string", "description": "O texto completo com todas as regras de organizacao."}
                },
                "required": ["rules"]
            }
        }
    }
]

def get_system_prompt():
    now = datetime.now()
    library_rules = library_tools.read_organization_rules()
    
    return f"""Voce é uma Inteligência Artificial atuando como Secretária Executiva e Bibliotecária Pessoal (Segundo Cérebro) do usuário.
Voce tem total capacidade autônoma para usar ferramentas (function calling) e acessar/gravar dados.

Contexto Atual:
Data e Hora: {now.isoformat()}
Timezone Local: Assuma que você está rodando no computador local do usuário.

REGRAS DE ORGANIZAÇÃO (Definidas pelo Usuário):
------------------------------------------------
{library_rules}
------------------------------------------------

Instruções:
1. Ao guardar uma anotação, use list_library_structure para ver as pastas existentes e guarde-a no local correto conforme as Regras de Organização do usuário.
2. Se necessário, você pode criar pastas (Workspaces e Notebooks) usando create_workspace e create_notebook. NUNCA apague pastas criadas pelo usuário (nem há ferramentas para isso).
3. Quando o usuário ditar uma nova regra de organização (ex: "Sempre que for sobre finanças, crie um caderno com o ano atual"), chame update_organization_rules para registrar isso.
4. Quando o usuário pedir algo como "Me lembre amanhã às 15h de X", chame schedule_notification.
5. SEMPRE use as tools para efetuar as ações concretas no banco de dados. Nunca diga apenas que "anotou" sem chamar a tool.
6. **DISCERNIMENTO RIGOROSO (Demanda vs Anotação):** Avalie cuidadosamente se a mensagem do usuário é uma Demanda (tarefa acionável, com prazo/tempo, dificuldade) ou uma Anotação (informação passiva, referência). Se houver QUALQUER dúvida ou ambiguidade, PERGUNTE ao usuário antes de salvar.
7. **GESTÃO DE TEMPO:** Para Demandas, o usuário pode definir tempo estimado (em horas). Quando ele disser "vou começar agora", chame start_task_timer. Isso ativará um cronômetro e você fará cobranças automáticas em 25%, 50% e 75% do tempo. O usuário pode pausar (pause_task_timer), zerar/reiniciar o contador de tempo investido (reset_task_timer) ou concluir a tarefa (complete_task).
"""

import logging
logger = logging.getLogger("agent_core")

def chat_with_agent(messages: list[dict], model: str = "gpt-4o") -> dict:
    """
    Funcao principal de entrypoint para o Chat. 
    Espera uma lista de mensagens (history) e executa o ReAct loop se necessario.
    """
    logger.info("--- Iniciando ciclo de raciocinio da IA ---")
    
    system_message = {"role": "system", "content": get_system_prompt()}
    
    # Prepend system prompt if not present
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, system_message)
    else:
        messages[0] = system_message # Update context
        
    logger.info(f"Analisando contexto com {len(messages)} mensagens...")
    
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=TOOLS_SCHEMA,
        tool_choice="auto"
    )
    
    response_message = response.choices[0].message
    tool_calls = response_message.tool_calls
    
    # Se nao ha tool calls, o agente esta apenas respondendo normalmente.
    if not tool_calls:
        logger.info("IA decidiu responder diretamente (Nenhuma ferramenta invocada).")
        messages.append(response_message.model_dump())
        return {"response": response_message.content, "messages": messages, "tool_executed": False}
        
    # Fase Act: Executar tools e adicionar resultados ao historico
    logger.info(f"IA decidiu invocar {len(tool_calls)} ferramenta(s).")
    messages.append(response_message.model_dump())
    
    tools_results = []
    
    for tool_call in tool_calls:
        function_name = tool_call.function.name
        function_to_call = AVAILABLE_TOOLS.get(function_name)
        if function_to_call:
            try:
                function_args = json.loads(tool_call.function.arguments)
                logger.info(f"|> Executando ferramenta: {function_name} | Args: {function_args}")
                function_response = function_to_call(**function_args)
                logger.info(f"|> Resultado da ferramenta {function_name}: {function_response}")
            except Exception as e:
                logger.error(f"|> Erro na ferramenta {function_name}: {e}")
                function_response = {"error": str(e)}
                
            tools_results.append({
                "name": function_name,
                "args": function_args,
                "result": function_response
            })
            
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": function_name,
                "content": json.dumps(function_response),
            })
    
    # Chama o modelo de novo para gerar a resposta final apos ver os resultados das tools
    logger.info("IA lendo os resultados das ferramentas e formulando a resposta final...")
    final_response = client.chat.completions.create(
        model=model,
        messages=messages,
    )
    
    final_message = final_response.choices[0].message.content
    logger.info("--- Ciclo de raciocinio concluido com sucesso ---")
    messages.append({"role": "assistant", "content": final_message})
    
    return {
        "response": final_message,
        "messages": messages,
        "tool_executed": True,
        "tools_results": tools_results
    }
