import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Download, CheckCircle, Loader2, AlertCircle, Sparkles, User, Globe, Zap, ShieldCheck, Layers, RefreshCcw, FileCheck, Copy, ClipboardCheck, Eye, ArrowRight, FileType } from 'lucide-react';
import { translateTextWithGroq } from './core-app/infrastructure/services/groq';
import { splitTextIntoChunks, downloadAsFile } from './core-app/infrastructure/services/utils/text-processing';
import { TranslationStatus, FileData } from './types';

declare global {
  interface Window {
    mammoth: any;
    pdfjsLib: any;
    marked: any;
  }
}

const LANGUAGES = [
  { id: 'Português (Portugal)', label: 'Português (PT)', code: 'PT-PT' },
  { id: 'Inglês', label: 'Inglês', code: 'EN' },
  { id: 'Espanhol', label: 'Espanhol', code: 'ES' },
  { id: 'Francês', label: 'Francês', code: 'FR' },
  { id: 'Alemão', label: 'Alemão', code: 'DE' },
  { id: 'Italiano', label: 'Italiano', code: 'IT' },
];

const ALLOWED_EXTENSIONS = ['.docx', '.txt', '.pdf', '.md', '.rtf'];

interface BatchUnit {
  id: number;
  text: string;
  translatedText: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  errorMsg?: string;
}

const App: React.FC = () => {
  const [file, setFile] = useState<FileData | null>(null);
  const [targetLang, setTargetLang] = useState<string | null>(null);
  const [batches, setBatches] = useState<BatchUnit[]>([]);
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);
  const [lastTranslated, setLastTranslated] = useState("");

  const batchesRef = useRef<BatchUnit[]>([]);

  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);

  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  };

  const setupBatches = (text: string, name: string, size: number) => {
    const chunks = splitTextIntoChunks(text); 
    const newBatches: BatchUnit[] = chunks.map((chunk, index) => ({
      id: index + 1,
      text: chunk,
      translatedText: '',
      status: 'idle'
    }));
    
    setFile({ name, size, content: text });
    setBatches(newBatches);
    setLastTranslated("");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    const extension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    const reader = new FileReader();
    if (extension === '.pdf') {
      reader.onload = async (e) => {
        try {
          if (!window.pdfjsLib) {
            await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          }
          const loadingTask = window.pdfjsLib.getDocument({ data: e.target?.result as ArrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n\n";
          }
          setupBatches(fullText, selectedFile.name, selectedFile.size);
        } catch (err) {
          console.error("Erro PDF");
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else if (extension === '.docx') {
      reader.onload = async (e) => {
        try {
          if (!window.mammoth) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js");
          const result = await window.mammoth.extractRawText({ arrayBuffer: e.target?.result as ArrayBuffer });
          setupBatches(result.value, selectedFile.name, selectedFile.size);
        } catch (err) {
          console.error("Erro Word");
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else {
      reader.onload = (e) => setupBatches(e.target?.result as string, selectedFile.name, selectedFile.size);
      reader.readAsText(selectedFile);
    }
  };

  const translateBatch = async (batchId: number, text: string) => {
    if (!targetLang) return false;
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'processing' } : b));

    try {
      const langPrompt = targetLang.includes("Português") ? "Português de Portugal (PT-PT)" : targetLang;
      const result = await translateTextWithGroq(text, langPrompt);
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'completed', translatedText: result } : b));
      setLastTranslated(result.substring(0, 300) + "...");
      return true;
    } catch (err: any) {
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'error', errorMsg: "Erro API" } : b));
      return false;
    }
  };

  const processAllBatches = async () => {
    if (isAutoProcessing || batches.length === 0) return;
    setIsAutoProcessing(true);
    const currentBatches = [...batchesRef.current];
    for (const batch of currentBatches) {
      if (batchesRef.current.find(b => b.id === batch.id)?.status === 'completed') continue;
      let success = await translateBatch(batch.id, batch.text);
      if (!success) {
        setIsAutoProcessing(false);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    setIsAutoProcessing(false);
  };

  const copyToClipboard = async () => {
    const fullContent = batchesRef.current.filter(b => b.status === 'completed').map(b => b.translatedText).join("\n\n");
    try {
      if (!window.marked) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js");
      const htmlContent = window.marked.parse(fullContent);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const data = [new ClipboardItem({ "text/html": blob, "text/plain": new Blob([fullContent], { type: "text/plain" }) })];
      await navigator.clipboard.write(data);
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 3000);
    } catch (err) {
      await navigator.clipboard.writeText(fullContent);
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 3000);
    }
  };

  const handleDownload = () => {
    const fullContent = batchesRef.current.filter(b => b.status === 'completed').map(b => b.translatedText).join("\n\n---\n\n");
    downloadAsFile(fullContent, `Prof_Ruben_ELITE.md`);
  };

  const completedCount = batches.filter(b => b.status === 'completed').length;
  const progressPercent = batches.length > 0 ? Math.round((completedCount / batches.length) * 100) : 0;

  return (
    <div className="min-h-screen relative z-10 flex flex-col items-center py-10 px-4">
      <header className="w-full max-w-7xl mx-auto mb-10 border-b border-white/5 bg-black/40 backdrop-blur-xl p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-900/40">
            <Zap className="text-white w-6 h-6 fill-white" />
          </div>
          <div className="text-left">
            <h1 className="text-white font-black text-xl leading-none">Portal Prof. Ruben Filipe</h1>
            <p className="text-orange-500 text-[10px] font-bold uppercase tracking-widest mt-1">Tradução de Elite Académica</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black tracking-widest">
            v6.5 RECONSTRUÍDO
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-black/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md">
            <h2 className="text-white font-bold mb-6 text-xs uppercase tracking-widest">1. Carregar Artigo</h2>
            {!file ? (
              <label className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-white/10 rounded-3xl cursor-pointer hover:bg-white/5 transition-all">
                <Upload className="w-8 h-8 text-slate-600 mb-2" />
                <span className="text-[10px] font-black text-slate-500 uppercase">DOCX, PDF ou TXT</span>
                <input type="file" className="hidden-input" accept=".docx,.pdf,.txt" onChange={handleFileUpload} />
              </label>
            ) : (
              <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
                <p className="text-xs font-bold text-white truncate mb-2">{file.name}</p>
                <button onClick={() => {setFile(null); setBatches([]);}} className="text-[9px] font-black text-red-500 uppercase">Substituir</button>
              </div>
            )}
          </section>

          {file && (
            <section className="bg-black/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md animate-in slide-in-from-left-4">
              <h2 className="text-white font-bold mb-6 text-xs uppercase tracking-widest">2. Idioma</h2>
              <div className="grid grid-cols-1 gap-2 mb-6">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => setTargetLang(lang.id)}
                    className={`py-3 px-4 rounded-xl border text-[10px] font-bold text-left transition-all ${targetLang === lang.id ? 'bg-orange-600 border-orange-400 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}
                  >
                    {lang.id}
                  </button>
                ))}
              </div>
              <button
                disabled={!targetLang || isAutoProcessing}
                onClick={processAllBatches}
                className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-400 shadow-xl shadow-orange-900/40 disabled:bg-slate-800 disabled:text-slate-600"
              >
                {isAutoProcessing ? 'Processando...' : 'Iniciar Tradução'}
              </button>
            </section>
          )}

          {completedCount > 0 && (
            <div className="space-y-3">
              <button onClick={copyToClipboard} className={`w-full py-5 rounded-2xl font-black text-xs uppercase transition-all ${copyStatus ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
                {copyStatus ? 'Copiado para Google Docs!' : 'Copiar Formatado'}
              </button>
              <button onClick={handleDownload} className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase">
                Baixar Backup .MD
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          {file && (
            <div className="bg-black/40 border border-white/5 rounded-[2.5rem] p-8 flex items-center justify-between px-10 shadow-2xl backdrop-blur-md">
              <div>
                <h3 className="text-white font-black text-sm uppercase tracking-widest">Progresso do Artigo</h3>
                <p className="text-[10px] text-slate-500 uppercase mt-1">{completedCount} de {batches.length} partes prontas</p>
              </div>
              <span className="text-4xl font-black text-white">{progressPercent}%</span>
            </div>
          )}

          {lastTranslated && (
            <div className="bg-black/60 border border-emerald-500/20 rounded-[2rem] p-6 shadow-2xl backdrop-blur-md">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-2">Monitor (PT-PT):</span>
              <p className="text-[11px] text-slate-400 italic">"{lastTranslated}"</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {!file ? (
              <div className="col-span-full h-80 border-2 border-dashed border-white/5 rounded-[3rem] flex items-center justify-center text-slate-800 text-xs font-black uppercase tracking-widest opacity-20">
                Aguardando Artigo de Elite...
              </div>
            ) : (
              batches.map(batch => (
                <div key={batch.id} className={`bg-black/40 rounded-2xl p-5 border ${batch.status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/5' : batch.status === 'processing' ? 'border-orange-500/40 animate-pulse' : 'border-white/5'}`}>
                  <span className="text-[9px] font-black text-slate-600 uppercase">Bloco #{batch.id}</span>
                  {batch.status === 'completed' ? <CheckCircle className="w-4 h-4 text-emerald-500 float-right" /> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
