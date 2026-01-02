// app/api/exawebsearch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Exa from "exa-js";

export const maxDuration = 60;

// Check if API key is available
const exaApiKey = process.env.EXA_API_KEY;
const exa = exaApiKey ? new Exa(exaApiKey) : null;

export async function POST(req: NextRequest) {
  try {
    const { query, previousQueries = [] } = await req.json();
    if (!query) {
      return NextResponse.json({ error: 'Запрос обязателен' }, { status: 400 });
    }

    // Check if Exa API is available
    if (!exa) {
      return NextResponse.json({ 
        error: 'Поиск в интернете временно недоступен. API ключ не настроен.',
        results: [] 
      }, { status: 200 });
    }

    // Format previous queries as context
    let contextualQuery = query;
    if (previousQueries.length > 0) {
      const context = previousQueries
        .map((q: string) => `Предыдущий вопрос: ${q}`)
        .join('\n');
      contextualQuery = `${context}\n\nТеперь ответьте на вопрос: ${query}`;
    }

    // Use Exa to search for content related to the claim
    const result = await exa.searchAndContents(
      contextualQuery,
      {
        type: "auto",
        text: true,
        numResults: 5,
        // livecrawl: "always",
      }
    );

    return NextResponse.json({ results: result.results });
  } catch (error) {
    return NextResponse.json({ error: `Не удалось выполнить поиск | ${error}` }, { status: 500 });
  }
}