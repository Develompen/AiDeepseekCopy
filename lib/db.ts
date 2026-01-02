import { openDB, DBSchema, IDBPDatabase, type IDBPTransaction } from 'idb';

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt?: string;
  attachedFile?: AttachedFile;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachedFile {
  name: string;
  type: string;
  text: string;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const DB_NAME = 'deepseek-chat-db';
const DB_VERSION = 2;
const STORE_NAME = 'chats';

interface DeepseekChatDB extends DBSchema {
  chats: {
    key: string;
    value: Chat;
    indexes: {
      createdAt: Date;
      updatedAt: Date;
    };
  };
}

async function getDB(): Promise<IDBPDatabase<DeepseekChatDB>> {
  return openDB(DB_NAME, DB_VERSION, {
    async upgrade(
      db: IDBPDatabase<DeepseekChatDB>,
      oldVersion: number,
      _newVersion: number | null,
      transaction: IDBPTransaction<DeepseekChatDB, [typeof STORE_NAME], 'versionchange'>
    ) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('updatedAt', 'updatedAt');
      }

      if (oldVersion < 2) {
        const store = transaction.objectStore(STORE_NAME);
        let cursor = await store.openCursor();
        while (cursor) {
          const value = cursor.value as Chat;
          const next: Chat = {
            ...value,
            systemPrompt: value.systemPrompt ?? '',
            attachedFile: value.attachedFile
              ? {
                  ...value.attachedFile,
                  updatedAt: new Date((value.attachedFile as any).updatedAt ?? new Date()),
                }
              : undefined,
          };
          await cursor.update(next);
          cursor = await cursor.continue();
        }
      }
    },
  });
}

export async function saveChat(chat: Chat): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, {
    id: chat.id,
    title: chat.title,
    messages: chat.messages,
    systemPrompt: chat.systemPrompt ?? '',
    attachedFile: chat.attachedFile,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  });
}

export async function getChat(id: string): Promise<Chat | undefined> {
  const db = await getDB();
  const chat = await db.get(STORE_NAME, id);
  if (chat) {
    return {
      ...chat,
      createdAt: new Date(chat.createdAt),
      updatedAt: new Date(chat.updatedAt),
      systemPrompt: (chat as Chat).systemPrompt ?? '',
      attachedFile: (chat as Chat).attachedFile
        ? {
            ...(chat as Chat).attachedFile!,
            updatedAt: new Date(((chat as Chat).attachedFile as any).updatedAt),
          }
        : undefined,
      messages: chat.messages.map((msg: Message) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    };
  }
  return undefined;
}

export async function getAllChats(): Promise<Chat[]> {
  const db = await getDB();
  const chats = await db.getAll(STORE_NAME);
  return chats.map((chat: Chat) => ({
      ...chat,
      createdAt: new Date(chat.createdAt),
      updatedAt: new Date(chat.updatedAt),
      systemPrompt: (chat as Chat).systemPrompt ?? '',
      attachedFile: (chat as Chat).attachedFile
        ? {
            ...(chat as Chat).attachedFile!,
            updatedAt: new Date(((chat as Chat).attachedFile as any).updatedAt),
          }
        : undefined,
      messages: chat.messages.map((msg: Message) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    }))
    .sort((a: Chat, b: Chat) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function deleteAllChats(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function createChat(title?: string): Promise<Chat> {
  const chat: Chat = {
    id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: title || 'Новый чат',
    messages: [],
    systemPrompt: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  const db = await getDB();
  await db.put(STORE_NAME, chat);
  return chat;
}

export async function updateChat(id: string, updates: Partial<Chat>): Promise<void> {
  const chat = await getChat(id);
  if (chat) {
    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date(),
    };
    await saveChat(updatedChat);
  }
}
