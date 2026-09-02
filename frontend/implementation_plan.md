# Suporte a Arquivos PDF e Slides com Anotações

Este plano detalha a implementação do recurso que permitirá aos usuários fazer upload de PDFs e apresentações de slides, integrando-os como notas dentro dos cadernos do Synaptix, além de possibilitar a inserção de comentários posicionados sobre esses documentos.

## User Review Required

> [!WARNING]
> **Suporte a formato de Slides:** Para garantir uma visualização consistente e permitir anotações baseadas em coordenadas (X, Y), a abordagem mais robusta para apresentações de slides no ecossistema web é **salvá-las e fazer o upload em formato PDF**. Renderizar nativamente arquivos `.pptx` na web é um processo complexo que exigiria serviços de terceiros. A proposta é tratar "Slides" como PDFs em modo de visualização paisagem/tela cheia. Você concorda com essa limitação/abordagem?

## Open Questions

> [!IMPORTANT]
> **Seleção de Texto vs Pins Visuais:** Nos arquivos Markdown atuais, os comentários estão atrelados ao texto selecionado. Para PDFs e Slides, extrair o texto perfeitamente pode ser falho dependendo da formatação do documento. A sugestão é basear os comentários em PDFs em "Pins Visuais" usando coordenadas (X e Y da página), em vez de seleção de texto. O usuário clica num ponto da página e adiciona o comentário lá. Isso atende a sua visão para a funcionalidade?

## Proposed Changes

---
### Banco de Dados e Schemas (Backend)

Modificações para suportar novos tipos de nota, armazenamento de arquivos e amarração de página em comentários.

#### [MODIFY] backend/models.py
- Na classe `Note`, adicionar:
  - `type = Column(String, default="markdown")` (valores possíveis: "markdown", "pdf", "slide")
  - `file_url = Column(String, nullable=True)` (caminho para o arquivo salvo no servidor)
- Na classe `Comment`, adicionar:
  - `page_number = Column(Integer, nullable=True)` (necessário para ancorar comentários em uma página específica do PDF/Slide)

#### [MODIFY] backend/schemas.py
- Atualizar `NoteBase` e `NoteResponse` para incluir `type` (str) e `file_url` (str opcional).
- Atualizar `CommentBase` e `CommentResponse` para incluir `page_number` (int opcional).
- Tornar `selected_text` do `CommentBase` opcional (pois em PDFs poderemos usar apenas X/Y + page_number).

#### [MODIFY] backend/main.py
- Importar módulo para manipulação de arquivos estáticos (`from fastapi.staticfiles import StaticFiles`) e upload (`UploadFile`, `File`).
- Criar endpoint `POST /upload` para receber o PDF, salvar no disco (ex: pasta `/uploads`) e retornar o caminho/URL do arquivo.
- Montar a rota de arquivos estáticos: `app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")`.
- Ajustar os endpoints de Notas (`POST /notes`, `PUT /notes`) para aceitar a nova estrutura com `type` e `file_url`.

---
### Dependências (Frontend)

#### [MODIFY] frontend/package.json
- Instalar a biblioteca `react-pdf` (ou alternativamente `@react-pdf-viewer/core`) para renderizar os arquivos de forma robusta com suporte a canvas de páginas.

---
### Componentes e Interfaces (Frontend)

#### [MODIFY] frontend/src/types/index.ts
- Adicionar os campos `type`, `file_url` à interface `Note`.
- Adicionar o campo `page_number` à interface `Comment`.
- Atualizar a interface do formulário de criação de Notas para aceitar arquivo.

#### [MODIFY] frontend/src/components/Sidebar.tsx
- Modificar o botão ou menu de "Criar Nota" para oferecer também a opção "Upload de PDF/Slide".
- Adicionar lógica para fazer o upload do arquivo chamador o endpoint do backend e, na sequência, criar a entidade de Nota respectiva.

#### [NEW] frontend/src/components/DocumentViewer.tsx
- Criar componente que recebe a URL do arquivo (`file_url`).
- Usar `react-pdf` para renderizar o documento, com controles básicos: Próxima Página, Página Anterior, Zoom.
- Implementar uma camada invisível (Overlay) sobre a página atual do PDF. Ao clicar ou arrastar nela, captura-se o `x_position`, `y_position` e a página atual para abrir o componente `CommentBox`.
- Os comentários existentes para aquela Nota (e página específica) deverão ser renderizados visualmente como "Pins" / ícones sobrepostos no documento nesta mesma camada.

#### [MODIFY] frontend/src/components/NoteEditor.tsx
- Incluir uma verificação condicional:
  - Se `note.type === 'markdown'`, renderiza o editor Tiptap (comportamento atual).
  - Se `note.type === 'pdf'` ou `'slide'`, renderiza o componente `DocumentViewer` passando o `note.file_url`.

#### [MODIFY] frontend/src/components/CommentBox.tsx e CommentSidebar.tsx
- Ajustar o fluxo de inserção de comentário. Caso o usuário não tenha um `selected_text` (cenário de PDF/Pin), o comentário deve ser criado com as coordenadas salvas pelo `DocumentViewer`.
- No componente de visualização de comentários na sidebar, exibir em qual página (se aplicável) o comentário foi feito.

## Verification Plan

### Automated Tests
- Testar backend criando uma nota do tipo `pdf` com `file_url` válida e validando a resposta (HTTP 201).
- Testar a criação de um comentário em que `selected_text` é omitido, mas `x_position`, `y_position` e `page_number` são enviados.

### Manual Verification
1. Abrir a interface web, selecionar um caderno e clicar em "Upload PDF/Slide".
2. Selecionar um arquivo PDF; verificar se ele carrega no centro da tela e se há navegação de páginas.
3. Clicar em uma parte específica do slide/página (ex: no topo de uma imagem) para criar um comentário e inserir texto.
4. Mudar de página e voltar; o pin/comentário visual deve estar posicionado na coordenada correta.
5. Clicar no pin do comentário e visualizar a sua conexão na visualização em Mind Map para garantir a integridade relacional no sistema Synaptix.
