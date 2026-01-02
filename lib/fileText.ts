export async function fileToText(file: File): Promise<{ text: string; type: string }> {
  const type = file.type || '';
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (type.includes('pdf') || ext === 'pdf') {
    // Для PDF файлов временно возвращаем заглушку
    return { 
      text: `[PDF файл: ${file.name}]\n\nСодержимое PDF файлов временно недоступно в веб-версии. Пожалуйста, используйте текстовые файлы (.txt, .md, .docx) для полной функциональности.`, 
      type: type || 'application/pdf' 
    };
  }

  const text = await file.text();
  return { text, type: type || (ext ? `text/${ext}` : 'text/plain') };
}
