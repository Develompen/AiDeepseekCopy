export async function fileToText(file: File): Promise<{ text: string; type: string }> {
  const type = file.type || '';
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (type.includes('pdf') || ext === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjs: any = await import('pdfjs-dist');
    const getDocument: any = pdfjs.getDocument;
    const GlobalWorkerOptions: any = pdfjs.GlobalWorkerOptions;

    if (GlobalWorkerOptions) {
      try {
        GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
      } catch {
        // ignore
      }
    }

    const pdf = await getDocument({ data: arrayBuffer }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = (content.items as Array<{ str?: string }>).map((it) => it.str || '').filter(Boolean);
      out += strings.join(' ') + '\n';
    }
    return { text: out.trim(), type: type || 'application/pdf' };
  }

  const text = await file.text();
  return { text, type: type || (ext ? `text/${ext}` : 'text/plain') };
}
