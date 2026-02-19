
import { GoogleGenerativeAI } from "@google/generative-ai";

const getAIClient = () => {
  // @ts-ignore
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "PLACEHOLDER_API_KEY") {
    console.warn("Chave API do Gemini não configurada ou inválida.");
    // Pode retornar null ou lançar erro, mas vamos deixar o erro acontecer na chamada se for o caso
    // ou retornar uma instância que vai falhar
  }
  return new GoogleGenerativeAI(apiKey || "");
};

export const translateText = async (text: string, targetLanguage: string, retries: number = 3): Promise<string> => {
  try {
    const genAI = getAIClient();
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // Pausa mínima de 1.5s para estabilidade sem causar timeout
    await new Promise(resolve => setTimeout(resolve, 1500));

    const prompt = `
      Traduza o seguinte texto do Português para o idioma: ${targetLanguage}. 
      
      REGRAS DE FORMATAÇÃO:
      1. Use rigorosamente o formato Markdown (Use # para títulos, ## para subtítulos, * para listas, etc).
      2. Mantenha o tom profissional, formal e técnico de um artigo académico.
      3. Preserve a estrutura original do documento, mas otimize-a para legibilidade em Markdown.
      4. NÃO adicione comentários, notas de tradutor ou avisos. Retorne APENAS o texto traduzido.
      
      TEXTO PARA TRADUZIR:
      ${text}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    // Lógica de Re-tentativa para Erro 429 (Limite Excedido)
    if (error.message?.includes("429") && retries > 0) {
      console.warn(`Limite de API atingido. A aguardar 5 segundos para tentar novamente... (${retries} tentativas restantes)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return translateText(text, targetLanguage, retries - 1);
    }

    console.error("Erro na tradução Gemini (Service):", error);
    
    let errorMessage = "Falha ao comunicar com a inteligência artificial.";

    if (error.message) {
      if (error.message.includes("API key not valid")) errorMessage = "Chave de API inválida. Verifique o seu .env.local";
      else if (error.message.includes("403")) errorMessage = "Acesso negado (403). Verifique se o Gemini está disponível no seu país ou se a chave tem permissões.";
      else if (error.message.includes("429")) errorMessage = "Limite de requisições excedido. Aguarde um momento e tente novamente.";
      else if (error.message.includes("500")) errorMessage = "Erro interno dos servidores da Google. Tente novamente em instantes.";
      else if (error.message.includes("Safety ratings")) errorMessage = "O conteúdo foi bloqueado pelos filtros de segurança da Google.";
      else errorMessage = `Erro da API: ${error.message}`;
    }

    throw new Error(errorMessage);
  }
};
