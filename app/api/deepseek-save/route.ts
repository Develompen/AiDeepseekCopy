import { NextRequest, NextResponse } from 'next/server';

// Имитация сервера DeepSeek для сохранения чатов
// В реальном приложении здесь была бы интеграция с официальным API DeepSeek

const chatStorage = new Map<string, any>();

export async function POST(req: NextRequest) {
    try {
        const { chatId, messages, title } = await req.json();

        if (!chatId || !messages) {
            return NextResponse.json({ error: 'chatId и messages обязательны' }, { status: 400 });
        }

        // Сохраняем чат в памяти (в реальном приложении - в базе данных)
        const chatData = {
            id: chatId,
            title: title || 'Новый чат',
            messages: messages,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        chatStorage.set(chatId, chatData);

        console.log(`Чат ${chatId} сохранен на сервере DeepSeek`);
        console.log(`Сообщений: ${messages.length}`);

        return NextResponse.json({ 
            success: true, 
            chatId: chatId,
            messageCount: messages.length,
            savedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Ошибка сохранения чата:', error);
        return NextResponse.json({ error: 'Не удалось сохранить чат' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const chatId = searchParams.get('id');

        if (chatId) {
            // Получить конкретный чат
            const chat = chatStorage.get(chatId);
            if (!chat) {
                return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
            }
            return NextResponse.json(chat);
        } else {
            // Получить все чаты
            const allChats = Array.from(chatStorage.values());
            return NextResponse.json(allChats);
        }

    } catch (error) {
        console.error('Ошибка получения чатов:', error);
        return NextResponse.json({ error: 'Не удалось получить чаты' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const chatId = searchParams.get('id');

        if (!chatId) {
            return NextResponse.json({ error: 'chatId обязателен' }, { status: 400 });
        }

        const deleted = chatStorage.delete(chatId);
        
        if (!deleted) {
            return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
        }

        console.log(`Чат ${chatId} удален с сервера DeepSeek`);

        return NextResponse.json({ success: true, deleted: true });

    } catch (error) {
        console.error('Ошибка удаления чата:', error);
        return NextResponse.json({ error: 'Не удалось удалить чат' }, { status: 500 });
    }
}
