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
      const langPrompt = targetLang.includes("Português") ? "Português de Portugal (PT-PT), usando terminologia europeia estrita" : targetLang;
      const result = await translateTextWithGroq(text, langPrompt);
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'completed', translatedText: result } : b));
      setLastTranslated(result.substring(0, 300) + "...");
      return true;
    } catch (err: any) {
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'error', errorMsg: "Aguardando limite..." } : b));
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
      {/* Header Premium */}
      <header className="w-full max-w-7xl mx-auto mb-10 border border-white/10 bg-black/60 backdrop-blur-xl p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-orange-700 to-orange-400 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-900/60">
            <Zap className="text-white w-8 h-8 fill-white" />
          </div>
          <div className="text-left">
            <h1 className="text-white font-black text-3xl tracking-tight leading-none">Portal Prof. Ruben Filipe</h1>
            <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Tradução de Elite Académica • v7.0</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-5 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> AGENTE IA ATIVO
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Painel Esquerdo */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-black/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md shadow-xl hover:border-orange-500/30 transition-all">
            <h2 className="text-white font-black mb-8 text-xs uppercase tracking-[0.4em] flex items-center gap-2">
              <Upload className="w-4 h-4 text-orange-500" /> 1. Carregar Artigo
            </h2>
            {!file ? (
              <label className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-white/10 rounded-[2rem] cursor-pointer hover:bg-white/5 transition-all group">
                <Upload className="w-10 h-10 text-slate-700 mb-4 group-hover:text-orange-500 transition-all group-hover:scale-110" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Selecionar Documento</span>
                <input type="file" className="hidden" accept=".docx,.pdf,.txt" onChange={handleFileUpload} />
              </label>
            ) : (
              <div className="p-6 bg-orange-500/5 border border-orange-500/20 rounded-[1.5rem] flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-orange-500" />
                  <p className="text-xs font-black text-white truncate">{file.name}</p>
                </div>
                <button onClick={() => {setFile(null); setBatches([]);}} className="w-full py-2 text-[9px] font-black text-red-500 uppercase tracking-widest hover:bg-red-500/10 rounded-lg transition-all">Trocar Artigo</button>
              </div>
            )}
          </section>

          {file && (
            <section className="bg-black/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md shadow-xl animate-in slide-in-from-left-4">
              <h2 className="text-white font-black mb-8 text-xs uppercase tracking-[0.4em] flex items-center gap-2">
                <Globe className="w-4 h-4 text-orange-500" /> 2. Destino
              </h2>
              <div className="grid grid-cols-1 gap-2 mb-8">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => setTargetLang(lang.id)}
                    className={`py-4 px-6 rounded-2xl border text-[10px] font-black text-left transition-all flex items-center justify-between group ${targetLang === lang.id ? 'bg-orange-600 border-orange-400 text-white shadow-lg shadow-orange-900/60' : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/30'}`}
                  >
                    {lang.id}
                    <ArrowRight className={`w-4 h-4 ${targetLang === lang.id ? 'opacity-100' : 'opacity-0'}`} />
                  </button>
                ))}
              </div>
              <button
                disabled={!targetLang || isAutoProcessing}
                onClick={processAllBatches}
                className="w-full py-5 bg-orange-500 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-orange-400 shadow-2xl shadow-orange-900/50 disabled:bg-slate-900 disabled:text-slate-700 transition-all hover:-translate-y-1"
              >
                {isAutoProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Iniciar Tradução Elite'}
              </button>
            </section>
          )}

          {completedCount > 0 && (
            <div className="space-y-4 animate-in zoom-in-95">
              <button onClick={copyToClipboard} className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.1em] shadow-xl flex items-center justify-center gap-3 transition-all ${copyStatus ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-900/40 hover:-translate-y-1'}`}>
                {copyStatus ? <ClipboardCheck className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                {copyStatus ? 'PRONTO NO GOOGLE DRIVE!' : 'Copiar para Google Docs'}
              </button>
              <button onClick={handleDownload} className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <Download className="w-4 h-4 text-emerald-500" /> Baixar Backup .MD
              </button>
            </div>
          )}
        </div>

        {/* Painel Direito */}
        <div className="lg:col-span-8 space-y-8">
          {file && (
            <div className="bg-black/60 border border-white/10 rounded-[2.5rem] p-10 flex items-center justify-between px-16 shadow-2xl backdrop-blur-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                 <Sparkles className="w-20 h-20 text-orange-500" />
               </div>
               <div className="relative z-10">
                <h3 className="text-white font-black text-xl uppercase tracking-[0.2em]">Monitor de Produção</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest">{completedCount} de {batches.length} blocos finalizados</p>
              </div>
              <span className="text-6xl font-black text-white tracking-tighter tabular-nums">{progressPercent}%</span>
            </div>
          )}

          {lastTranslated && (
            <div className="bg-black/40 border border-emerald-500/20 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4 text-emerald-500">
                <Eye className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Pré-visualização (PT-PT)</span>
              </div>
              <div className="bg-black/30 p-6 rounded-2xl border border-white/5">
                <p className="text-[13px] text-slate-400 italic leading-relaxed">"{lastTranslated}"</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
            {!file ? (
              <div className="col-span-full h-96 border-2 border-dashed border-white/5 rounded-[3.5rem] flex flex-col items-center justify-center text-slate-900 text-center p-12">
                <Layers className="w-16 h-16 mb-4 opacity-10" />
                <span className="text-xs font-black uppercase tracking-[0.5em] opacity-10">Sistema de Contentores Elite</span>
              </div>
            ) : (
              batches.map(batch => (
                <div key={batch.id} className={`bg-black/40 rounded-3xl p-6 border transition-all duration-700 ${batch.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : batch.status === 'processing' ? 'border-orange-500/60 shadow-lg shadow-orange-900/30' : 'border-white/5'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-600 uppercase">Parte {batch.id}</span>
                    {batch.status === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                  </div>
                  {batch.status === 'processing' && (
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 animate-loading" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
      
      <footer className="w-full py-16 mt-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-4">
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em]">Portal Professor Ruben Filipe • 2026</p>
          <p className="text-[8px] text-slate-800 font-bold uppercase tracking-widest">Tecnologia Groq Llama 3.1 • Edição Profissional</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
