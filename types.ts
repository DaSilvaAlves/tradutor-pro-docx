
export interface TranslationChunk {
  original: string;
  translated: string;
  index: number;
}

export interface TranslationStatus {
  isProcessing: boolean;
  progress: number;
  totalChunks: number;
  currentChunk: number;
  error: string | null;
}

export interface FileData {
  name: string;
  content: string;
  size: number;
}
