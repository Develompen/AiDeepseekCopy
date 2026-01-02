import { NextRequest, NextResponse } from 'next/server';
import Exa from 'exa-js';

const exaApi = new Exa(process.env.EXA_API_KEY);

export async function POST(req: NextRequest) {
    try {
        const { query, previousQueries = [] } = await req.json();

        if (!query) {
            return NextResponse.json({ error: 'Запрос обязателен' }, { status: 400 });
        }

        // Format contextual query with previous queries
        let contextualQuery = query;
        if (previousQueries.length > 0) {
            const context = previousQueries
                .map((q: string) => `Предыдущий вопрос: ${q}`)
                .join('\n');
            contextualQuery = `${context}\n\nТеперь ответьте на вопрос: ${query}`;
        }

        // Perform web search with contents
        const searchResults = await exaApi.searchAndContents(contextualQuery, {
            numResults: 5,
            text: true,
        });

        // Format results
        const results = searchResults.results.map((result: any) => ({
            title: result.title,
            url: result.url,
            text: result.text,
            author: result.author,
            publishedDate: result.publishedDate,
            favicon: result.favicon,
        }));

        return NextResponse.json({ results });

    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json({ error: `Не удалось выполнить поиск | ${error}` }, { status: 500 });
    }
}
