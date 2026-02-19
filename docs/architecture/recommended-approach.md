# Recomendação Arquitetural: Saída Markdown de Alta Fidelidade

**Data:** 18 de fevereiro de 2026
**Estatuto:** Implementado
**Recurso Principal:** Markdown Ready Export (.md)

---

## 🏛️ Abordagem de Implementação

### 1. Instruções Sistémicas (Prompt Engineering)
- O `geminiService` (agora parte da infraestrutura AIOS) usa um prompt otimizado que exige o retorno de Markdown puro.
- **Vantagem:** O utilizador recebe um ficheiro pronto a ser lido por visualizadores de Markdown, editores académicos ou plataformas de blog.

### 2. Tratamento de Metadados
- Foi mantida a estrutura de nomeação personalizada para o **Prof. Ruben Filipe**: `Prof_Ruben_{ID_LINGUA}_{NOME_FICHEIRO}.md`.
- **Vantagem:** Organização profissional imediata após o download.

---

## 🛠️ Manutenção e Escalabilidade (Próximos Passos)

### Agentes AIOS Recomendados:
- **@dev:** Para adicionar suporte a novos formatos de exportação (ex: HTML ou LaTeX) se necessário.
- **@qa:** Para validar se tabelas complexas de DOCX estão a ser convertidas corretamente em tabelas Markdown.

---

## ✅ Lista de Verificação Pós-Migração
1. [x] Estrutura `.aios-core/` validada.
2. [x] Chave `VITE_GEMINI_API_KEY` unificada no `.env.local` e código.
3. [x] Servidor Vite ajustado para porta **5173** (estabilidade local).
4. [x] Exportação de ficheiros `.md` ativada e testada.
