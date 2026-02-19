
/**
 * Splits text into manageable chunks for the API.
 * Gemini Flash 3 has a huge context, but output tokens are limited.
 * 2500 characters is the sweet spot for avoiding 503 Service Unavailable and 429 Rate Limits.
 */
export const splitTextIntoChunks = (text: string, chunkSize: number = 2500): string[] => {
  const chunks: string[] = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    let endPos = currentPos + chunkSize;
    
    // Avoid splitting in the middle of a sentence/paragraph if possible
    if (endPos < text.length) {
      const lastPeriod = text.lastIndexOf('.', endPos);
      const lastNewline = text.lastIndexOf('\n', endPos);
      const bestSplit = Math.max(lastPeriod, lastNewline);
      
      if (bestSplit > currentPos + (chunkSize * 0.5)) {
        endPos = bestSplit + 1;
      }
    }

    chunks.push(text.substring(currentPos, endPos).trim());
    currentPos = endPos;
  }

  return chunks;
};

export const downloadAsFile = (content: string, filename: string) => {
  const element = document.createElement('a');
  // Usar MIME type adequado para Markdown
  const file = new Blob([content], { type: 'text/markdown' });
  element.href = URL.createObjectURL(file);
  element.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};
