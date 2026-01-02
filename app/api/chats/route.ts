import { NextRequest, NextResponse } from 'next/server';

// Простое in-memory хранилище для тестов
let chats = new Map<string, any>();

export async function GET() {
	try {
		// Возвращаем все чаты
		const allChats = Array.from(chats.values());
		return NextResponse.json(allChats);
	} catch (error) {
		console.error('GET /api/chats error:', error);
		return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	try {
		const { title } = await req.json();

		const chat = {
			id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			title: title || 'Новый чат',
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// Сохраняем в Map
		chats.set(chat.id, chat);

		console.log('Created chat:', chat);
		return NextResponse.json(chat);
	} catch (error) {
		console.error('POST /api/chats error:', error);
		return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			const deletedCount = chats.size;
			chats.clear();
			console.log('Deleted all chats');
			return NextResponse.json({ success: true, deletedCount });
		}

		chats.delete(id);

		console.log('Deleted chat:', id);
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('DELETE /api/chats error:', error);
		return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
	}
}

export async function PUT(req: NextRequest) {
	try {
		const { id, updates } = await req.json();

		if (!id) {
			return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
		}

		const existingChat = chats.get(id);
		if (existingChat) {
			const updatedChat = {
				...existingChat,
				...updates,
				updatedAt: new Date().toISOString(),
			};

			// Обновляем в Map
			chats.set(id, updatedChat);

			console.log('Updated chat:', updatedChat);
			return NextResponse.json({ success: true });
		} else {
			return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
		}
	} catch (error) {
		console.error('PUT /api/chats error:', error);
		return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
	}
}
