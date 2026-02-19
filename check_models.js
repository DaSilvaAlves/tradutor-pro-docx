
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Ler .env.local manualmente pois estamos em ambiente Node para este script
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const match = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : null;

if (!apiKey) {
    console.error("Chave API não encontrada em .env.local");
    process.exit(1);
}

console.log(`Testando chave: ${apiKey.substring(0, 5)}...`);

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log("Listando modelos...");
        // Hack para aceder ao listModels se não estiver exposto diretamente na SDK de forma fácil
        // A SDK @google/generative-ai tem genAI.getGenerativeModel but listing might be on the model manager or need direct fetch if SDK doesn't expose it clearly in this version.
        // Actually, in the newer SDK, we might need to check how to list.
        // Let's try a direct fetch to be sure if SDK fails, but SDK usually has it.
        // Waiting... The SDK documentation says listModels is on the GoogleGenerativeAI instance or similar? 
        // Actually, let's just try to instantiate a few common models and see which one doesn't throw immediately or just trust the docs.
        // Better: Fetch via REST API to be absolutely sure without SDK wrapper issues.

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            console.error("Erro na API:", data.error);
        } else if (data.models) {
            const modelNames = data.models
                .filter(m => m.supportedGenerationMethods.includes("generateContent"))
                .map(m => m.name);

            fs.writeFileSync('models_list.txt', modelNames.join('\n'));
            console.log("Lista de modelos salva em models_list.txt");
        } else {
            console.log("Resposta inesperada:", data);
        }
    } catch (error) {
        console.error("Erro ao listar modelos:", error);
    }
}

listModels();
