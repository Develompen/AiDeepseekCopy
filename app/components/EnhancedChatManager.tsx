'use client';

import { useState, useEffect } from 'react';

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface EnhancedChat {
  id: string;
  title: string;
  messages: EnhancedMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// IndexedDB implementation
const DB_NAME = 'deepseek-chat-db';
const DB_VERSION = 1;
const STORE_NAME = 'chats';

class ChatDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
    });
  }

  async saveChat(chat: EnhancedChat): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(chat);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getChat(id: string): Promise<EnhancedChat | undefined> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            ...result,
            createdAt: new Date(result.createdAt),
            updatedAt: new Date(result.updatedAt),
            messages: result.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          });
        } else {
          resolve(undefined);
        }
      };
    });
  }

  async getAllChats(): Promise<EnhancedChat[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result;
        const chats = results.map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          updatedAt: new Date(chat.updatedAt),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        resolve(chats.sort((a: EnhancedChat, b: EnhancedChat) => b.updatedAt.getTime() - a.updatedAt.getTime()));
      };
    });
  }

  async deleteChat(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export function useEnhancedChatManager() {
  const [chats, setChats] = useState<EnhancedChat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [db] = useState(() => new ChatDB());

  // Load chats from IndexedDB on mount
  useEffect(() => {
    const loadChats = async () => {
      try {
        const savedChats = await db.getAllChats();
        setChats(savedChats);
      } catch (error) {
        console.error('Error loading chats:', error);
      }
    };
    loadChats();
  }, [db]);

  const createNewChat = async (title?: string) => {
    const newChat: EnhancedChat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'Новый чат',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.saveChat(newChat);
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    return newChat;
  };

  const updateChat = async (chatId: string, updates: Partial<EnhancedChat>) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date()
    };

    await db.saveChat(updatedChat);
    setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));
  };

  const addMessage = async (chatId: string, message: Omit<EnhancedMessage, 'timestamp'>) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const newMessage: EnhancedMessage = {
      ...message,
      timestamp: new Date()
    };

    const updatedMessages = [...chat.messages, newMessage];
    await updateChat(chatId, {
      messages: updatedMessages,
      title: chat.messages.length === 0 && message.role === 'user'
        ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
        : chat.title
    });
  };

  const deleteChat = async (chatId: string) => {
    await db.deleteChat(chatId);
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  };

  const getCurrentChat = () => {
    return chats.find(chat => chat.id === currentChatId);
  };

  return {
    chats,
    currentChatId,
    setCurrentChatId,
    createNewChat,
    updateChat,
    addMessage,
    deleteChat,
    getCurrentChat
  };
}
