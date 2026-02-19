# Análise do Projeto: Tradutor Pro DOCX (Edição Prof. Ruben Filipe)

**Gerado em:** 18 de fevereiro de 2026
**Arquiteto:** Gemini CLI (Aria)
**Padrão:** AIOS (.aios-core)

---

## Estrutura do Projeto

| Aspeto | Valor |
|--------|-------|
| Framework | React 19 + Vite 6 |
| Linguagem | TypeScript |
| Estrutura Core | AIOS (.aios-core) |
| API de IA | Google Gemini (gemini-1.5-flash) |
| Estilo | Tailwind CSS (embutido via classes Lucide/Custom) |

---

## Inventário de Serviços (AIOS)

| Serviço | Localização | Função |
|---------|-------------|--------|
| **Gemini Service** | `.aios-core/infrastructure/services/gemini/` | Interface com a API da Google para tradução académica. |
| **Utils Service** | `.aios-core/infrastructure/services/utils/` | Processamento de texto, chunking e download de ficheiros. |

---

## Resumo de Padrões

### Gestão de Ambiente
- Utiliza `.env.local` com o prefixo `VITE_` para segurança e compatibilidade automática com o Vite.
- Chave principal: `VITE_GEMINI_API_KEY`.

### Fluxo de Dados
1. O utilizador carrega um DOCX/PDF.
2. O sistema extrai o texto (via Mammoth ou PDF.js).
3. O texto é dividido em blocos para respeitar os limites da API.
4. O Gemini traduz cada bloco com instruções estritas de formatação Markdown.
5. O resultado final é concatenado e descarregado como `.md`.

---

## Notas de Configuração
- O servidor de desenvolvimento foi reconfigurado para a porta **5173** em `localhost` para evitar conflitos de rede e erros de acesso (antiga porta 5174).
