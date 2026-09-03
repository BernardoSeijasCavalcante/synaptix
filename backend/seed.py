import sys
import os

# Adiciona o diretório atual ao path para importar módulos locais
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import engine, get_db
import models

def seed_data():
    # Cria as tabelas se não existirem
    models.Base.metadata.create_all(bind=engine)
    
    db = next(get_db())
    
    # Verifica se já existem dados
    if db.query(models.Notebook).first():
        print("O banco de dados já possui dados. Remova o arquivo synaptix.db se desejar recriar.")
        return

    print("Iniciando seed de dados...")

    # Workspace Principal
    ws_principal = models.Workspace(title="Workspace Principal")
    db.add(ws_principal)
    db.commit()

    # Cadernos (Notebooks)
    nb_livros = models.Notebook(title="📚 Livros Lidos", workspace_id=ws_principal.id)
    nb_estudos = models.Notebook(title="🔬 Estudos e Projetos", workspace_id=ws_principal.id)
    nb_dev = models.Notebook(title="💻 Desenvolvimento", workspace_id=ws_principal.id)
    
    db.add_all([nb_livros, nb_estudos, nb_dev])
    db.commit()
    
    # Subcadernos
    nb_psico = models.Notebook(title="Psicologia", parent_id=nb_livros.id, workspace_id=ws_principal.id)
    nb_stats = models.Notebook(title="Estatística", parent_id=nb_livros.id, workspace_id=ws_principal.id)
    db.add_all([nb_psico, nb_stats])
    db.commit()

    # Notas (Notes)
    note_stats_1 = models.Note(
        title="Como Mentir com Estatística", 
        notebook_id=nb_stats.id,
        workspace_id=ws_principal.id,
        content="""## Resumo do Livro
Existem várias formas de distorcer a verdade usando números.

A amostra tendenciosa é o principal problema. Uma pesquisa só é válida se a amostra de pessoas consultadas representar fielmente a população total.
Além disso, preste atenção na média. Na estatística, existem três medidas principais: Média Aritmética, Moda e Mediana.
"""
    )
    
    note_stats_2 = models.Note(
        title="Viés de Confirmação", 
        notebook_id=nb_psico.id,
        workspace_id=ws_principal.id,
        content="""O viés de confirmação é a tendência de lembrar ou pesquisar informações de maneira que confirme crenças ou hipóteses iniciais.
        
Isso é extremamente perigoso ao analisar dados brutos, conforme discutido em @[Como Mentir com Estatística](note:1)."""
    )
    
    db.add_all([note_stats_1, note_stats_2])
    db.commit()

    # Comentários (Comments) - Simulando marcações de texto na interface
    c1 = models.Comment(
        note_id=note_stats_1.id,
        selected_text="Uma pesquisa só é válida se a amostra de pessoas consultadas representar fielmente a população total.",
        content="Isso me lembra do conceito de p-hacking. Precisamos sempre duvidar das fontes de amostra.",
        rect_x1=100,
        rect_y1=100
    )
    
    c2 = models.Comment(
        note_id=note_stats_1.id,
        selected_text="Média Aritmética, Moda e Mediana",
        content="Empresas adoram usar a Moda quando a média aritmética os prejudica financeiramente nos relatórios.",
        rect_x1=600,
        rect_y1=200
    )
    
    c3 = models.Comment(
        note_id=note_stats_2.id,
        selected_text="pesquisar informações de maneira que confirme crenças",
        content="Exemplo clássico: O algoritmo de redes sociais reforçando bolhas ideológicas. Ver a @[Como Mentir com Estatística](note:1).",
        rect_x1=100,
        rect_y1=500
    )
    
    c4 = models.Comment(
        note_id=note_stats_1.id,
        selected_text="A amostra tendenciosa é o principal problema.",
        content="Ligação direta com o comportamento humano descrito na outra nota.",
        rect_x1=600,
        rect_y1=600
    )
    
    db.add_all([c1, c2, c3, c4])
    db.commit()
    
    # Conexões de Comentários (Mind Map)
    conn1 = models.CommentConnection(
        source_comment_id=c1.id,
        target_comment_id=c4.id,
        observation="A amostra é tendenciosa justamente pelo viés discutido!"
    )
    
    conn2 = models.CommentConnection(
        source_comment_id=c4.id,
        target_comment_id=c3.id,
        observation="O viés de confirmação causa a escolha de amostras tendenciosas."
    )
    
    db.add_all([conn1, conn2])
    db.commit()

    print("✅ Seed finalizado com sucesso! Cadernos, Notas, Comentários e Ligações criados.")

if __name__ == "__main__":
    seed_data()
