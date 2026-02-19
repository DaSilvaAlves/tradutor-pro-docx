/**
 * SERVIÇO GROQ (LLAMA 3) - TRADUTOR PRO DOCX
 * Motor de inferência ultra-rápido para documentos extensos.
 */

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export const translateTextWithGroq = async (text: string, targetLanguage: string): Promise<string> => {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY não configurada no .env.local");
  }

  const prompt = `Você é um tradutor acadêmico sênior especializado na Edição Prof. Ruben Filipe.
Traduza o texto abaixo para ${targetLanguage} seguindo estas regras rigorosas:
1. Retorne APENAS o texto traduzido em formato Markdown puro.
2. Mantenha tabelas, listas e metadados estruturados.
3. Use terminologia acadêmica formal e de alta fidelidade.
4. NÃO adicione introduções, explicações ou notas de rodapé.

TEXTO PARA TRADUZIR:
${text}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // Modelo ultra-rápido com limites diários maiores
        messages: [
          {
            role: "system",
            content: "Você é um tradutor acadêmico profissional que produz apenas Markdown puro."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1, 
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const apiErrorMessage = errorData.error?.message || response.statusText;
      console.error("Erro da API Groq:", apiErrorMessage);
      throw new Error(`API Groq: ${apiErrorMessage}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || "Erro: Conteúdo vazio.";
  } catch (error: any) {
    console.error("Falha na tradução Groq:", error);
    throw error;
  }
};
