import { fireworks } from '@ai-sdk/fireworks';
import { streamText } from 'ai';

interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export const maxDuration = 600;

export async function POST(req: Request) {
	const { messages } = await req.json();

	console.log('📨 Получено сообщений:', messages.length);
	
	const systemMessages = (messages as Message[]).filter((m) => m.role === 'system');
	const systemPrompt = systemMessages.map((m) => m.content).filter(Boolean).join('\n\n').trim();
	
	console.log('🔧 Системных сообщений:', systemMessages.length);
	if (systemPrompt) {
		console.log('📝 Системный промпт (первые 100 символов):', systemPrompt.substring(0, 100) + '...');
	}

	const filteredMessages = (messages as Message[]).filter((m) => m.role !== 'system');

	const result = streamText({
		model: fireworks('accounts/fireworks/models/deepseek-v3-0324'),
		system: systemPrompt.length > 0 ? systemPrompt : undefined,
		messages: filteredMessages,
	});

	return result.toDataStreamResponse({ sendReasoning: true });
}