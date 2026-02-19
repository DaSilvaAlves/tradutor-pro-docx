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
  const [globalError, setGlobalError] = useState<string | null>(null);
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
    setGlobalError(null);
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
          setGlobalError("Falha ao ler PDF.");
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
          setGlobalError("Erro ao ler Word.");
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
      const langPrompt = targetLang.includes("Português") ? "Português de Portugal (PT-PT), usando terminologia europeia estrita (ex: utilizador, ecrã, aceder, acções)" : targetLang;
      const result = await translateTextWithGroq(text, langPrompt);
      
      setBatches(prev => prev.map(b => 
        b.id === batchId ? { ...b, status: 'completed', translatedText: result } : b
      ));
      setLastTranslated(result.substring(0, 350) + "...");
      return true;
    } catch (err: any) {
      setBatches(prev => prev.map(b => b.id === batchId ? { 
        ...b, 
        status: 'error', 
        errorMsg: err.message.includes("Rate limit") ? "Limite de Tokens. Aguardando 10s..." : "Erro de ligação API." 
      } : b));
      return false;
    }
  };

  const processAllBatches = async () => {
    if (isAutoProcessing || batches.length === 0) return;
    setIsAutoProcessing(true);

    const currentBatches = [...batchesRef.current];
    for (const batch of currentBatches) {
      const realBatch = batchesRef.current.find(b => b.id === batch.id);
      if (realBatch?.status === 'completed') continue;
      
      let success = false;
      let retries = 0;
      while (!success && retries < 2) {
        success = await translateBatch(batch.id, batch.text);
        if (!success) {
          retries++;
          await new Promise(r => setTimeout(r, 10000));
        }
      }
      if (!success) {
        setIsAutoProcessing(false);
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    setIsAutoProcessing(false);
  };

  const copyToClipboardAsRichText = async () => {
    const fullContent = batchesRef.current
      .filter(b => b.status === 'completed')
      .map(b => b.translatedText)
      .join("\n\n");

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

  const handleDownloadFull = () => {
    const fullContent = batchesRef.current
      .filter(b => b.status === 'completed')
      .map(b => b.translatedText)
      .join("\n\n---\n\n");
    
    const langCode = LANGUAGES.find(l => l.id === targetLang)?.code || 'TRAD';
    const cleanFileName = file?.name.replace(/\.[^/.]+$/, "") || "Artigo_Traduzido";
    downloadAsFile(fullContent, `Prof_Ruben_ELITE_${langCode}_${cleanFileName}.md`);
  };

  const completedCount = batches.filter(b => b.status === 'completed').length;
  const progressPercent = batches.length > 0 ? Math.round((completedCount / batches.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#050608] text-slate-300 font-sans selection:bg-orange-500/30">
      {/* Header Premium */}
      <header className="w-full border-b border-white/5 bg-[#0a0c10]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-orange-600 to-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-900/20">
              <Zap className="text-white w-6 h-6 fill-white" />
            </div>
            <div className="text-left">
              <h1 className="text-white font-black text-xl tracking-tight leading-none">Portal Prof. Ruben Filipe</h1>
              <p className="text-orange-500/80 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Tradução de Elite • PDF • Word • Artigos Científicos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" /> AGENTE IA ACTIVO
            </div>
            <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[10px] font-black tracking-widest">
              v6.0 PRODUCTION
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Painel de Configuração */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. Upload */}
          <section className="bg-[#0e1117] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <FileType className="w-20 h-20 text-white" />
            </div>
            <h2 className="text-white font-black text-xs uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-black flex items-center justify-center text-[10px]">01</span>
              Documento Base
            </h2>
            {!file ? (
              <label className="flex flex-col items-center justify-center py-14 border-2 border-dashed border-white/5 rounded-[2rem] cursor-pointer hover:bg-white/5 transition-all group/label">
                <Upload className="w-10 h-10 text-slate-700 mb-4 group-hover/label:text-orange-500 transition-all group-hover/label:scale-110" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Upload DOCX / PDF</span>
                <input type="file" className="hidden" accept=".docx,.pdf,.txt" onChange={handleFileUpload} />
              </label>
            ) : (
              <div className="p-5 bg-orange-500/5 border border-orange-500/20 rounded-[1.5rem] relative z-10">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                    <FileCheck className="w-5 h-5 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white truncate">{file.name}</p>
                    <p className="text-[9px] text-orange-400/60 uppercase font-bold tracking-widest">{batches.length} Contentores</p>
                  </div>
                </div>
                <button onClick={() => {setFile(null); setBatches([]);}} className="w-full py-2 text-[9px] font-black text-red-500 uppercase tracking-widest hover:bg-red-500/10 rounded-lg transition-all">Substituir Artigo</button>
              </div>
            )}
          </section>

          {/* 2. Target Language */}
          {file && (
            <section className="bg-[#0e1117] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-left-4">
              <h2 className="text-white font-black text-xs uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500 text-black flex items-center justify-center text-[10px]">02</span>
                Idioma Alvo
              </h2>
              <div className="grid grid-cols-1 gap-2 mb-8">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => setTargetLang(lang.id)}
                    className={`py-4 px-5 rounded-2xl border text-[11px] font-black text-left transition-all flex items-center justify-between group ${targetLang === lang.id ? 'bg-orange-600 border-orange-400 text-white shadow-xl shadow-orange-900/40' : 'bg-[#151921] border-white/5 text-slate-500 hover:border-white/20'}`}
                  >
                    {lang.id}
                    <ArrowRight className={`w-4 h-4 transition-transform ${targetLang === lang.id ? 'translate-x-0' : '-translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                  </button>
                ))}
              </div>
              <button
                disabled={!targetLang || isAutoProcessing}
                onClick={processAllBatches}
                className={`w-full py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${targetLang && !isAutoProcessing ? 'bg-orange-500 text-white hover:bg-orange-400 shadow-2xl shadow-orange-900/40 hover:-translate-y-1' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
              >
                {isAutoProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-white" />}
                {isAutoProcessing ? 'Processamento Elite...' : 'Iniciar Tradução'}
              </button>
            </section>
          )}

          {/* 3. Export Actions */}
          {completedCount > 0 && (
            <section className="space-y-4 animate-in zoom-in-95">
              <button
                onClick={copyToClipboardAsRichText}
                className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-3 transition-all ${copyStatus ? 'bg-emerald-600 text-white shadow-emerald-900/20' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-2xl shadow-indigo-900/30 hover:-translate-y-1'}`}
              >
                {copyStatus ? <ClipboardCheck className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                {copyStatus ? 'PRONTO NO GOOGLE DRIVE!' : 'Copiar para Google Docs'}
              </button>
              
              <button
                onClick={handleDownloadFull}
                className="w-full py-5 bg-white/5 border border-white/10 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] hover:bg-white/10 transition-all flex items-center justify-center gap-3"
              >
                <Download className="w-4 h-4 text-emerald-400" /> Descarregar Backup .MD
              </button>
            </section>
          )}
        </div>

        {/* Lado Direito: Monitorização Elite */}
        <div className="lg:col-span-8 space-y-6">
          {file && (
            <div className="bg-[#0e1117] border border-white/5 rounded-[2.5rem] p-8 flex items-center justify-between px-12 shadow-2xl">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all ${isAutoProcessing ? 'bg-orange-500/10 shadow-inner' : 'bg-white/5'}`}>
                  <RefreshCcw className={`w-8 h-8 text-orange-500 ${isAutoProcessing ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-widest leading-none">Status de Produção</h3>
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-2">{completedCount} de {batches.length} partes consolidadas</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-5xl font-black text-white tracking-tighter tabular-nums">{progressPercent}%</span>
              </div>
            </div>
          )}

          {/* Live Preview (Elite Window) */}
          {lastTranslated && (
            <div className="bg-[#12161e] border border-emerald-500/20 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <Sparkles className="w-12 h-12 text-emerald-400" />
              </div>
              <div className="flex items-center gap-3 mb-4 text-emerald-400">
                <Eye className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Monitor de Fidelidade (PT-PT)</span>
              </div>
              <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
                <p className="text-[13px] text-slate-400 italic leading-relaxed font-serif">"{lastTranslated}"</p>
              </div>
            </div>
          )}

          {/* Grid de Contentores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[550px] overflow-y-auto pr-3 custom-scrollbar">
            {!file ? (
              <div className="col-span-full h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[3rem] text-slate-800 text-center p-12">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 opacity-20">
                  <Layers className="w-10 h-10" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-[0.4em] opacity-20">Sistema de Contentores Elite</h3>
                <p className="max-w-[300px] text-[10px] mt-4 font-bold uppercase leading-relaxed opacity-10 tracking-widest">Aguardando injecção de dados para iniciar a malha de tradução académica.</p>
              </div>
            ) : (
              batches.map(batch => (
                <div 
                  key={batch.id} 
                  className={`bg-[#0e1117] rounded-3xl p-6 border transition-all duration-700 relative overflow-hidden group ${
                    batch.status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/5' : 
                    batch.status === 'processing' ? 'border-orange-500/40 shadow-xl shadow-orange-900/10' : 
                    batch.status === 'error' ? 'border-red-500/20 bg-red-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400 transition-colors">Parte {batch.id}</span>
                    {batch.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500 animate-in zoom-in" />
                    ) : batch.status === 'processing' ? (
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" />
                      </div>
                    ) : null}
                  </div>
                  
                  {batch.status === 'error' ? (
                    <button onClick={() => translateBatch(batch.id, batch.text)} className="w-full py-2.5 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Retentar</button>
                  ) : batch.status === 'completed' ? (
                    <div className="h-1 w-full bg-emerald-500/30 rounded-full" />
                  ) : (
                    <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${batch.status === 'processing' ? 'bg-orange-500 w-full animate-pulse' : 'w-0'}`} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <footer className="w-full border-t border-white/5 py-12 mt-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-6">
          <div className="flex items-center gap-8 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
            <span>Groq Llama 3.1</span>
            <div className="w-1.5 h-1.5 bg-white/10 rounded-full" />
            <span>AIOS Infrastructure</span>
            <div className="w-1.5 h-1.5 bg-white/10 rounded-full" />
            <span>Professor Ruben Edition</span>
          </div>
          <p className="text-slate-700 text-[9px] font-bold uppercase tracking-widest">2026 • Projecto desenvolvido para fins de excelência académica</p>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249, 115, 22, 0.2); }
      `}</style>
    </div>
  );
};

export default App;
