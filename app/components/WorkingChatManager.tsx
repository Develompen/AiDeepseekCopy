'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import {
  getAllChats as dbGetAllChats,
  createChat as dbCreateChat,
  deleteChat as dbDeleteChat,
  deleteAllChats as dbDeleteAllChats,
  updateChat as dbUpdateChat,
  getChat as dbGetChat,
} from '../../lib/db';

interface Chat {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  systemPrompt?: string;
  attachedFile?: {
    name: string;
    type: string;
    text: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ChatContextType {
  chats: Chat[];
  currentChatId: string | null;
  chatsLoaded: boolean;
  createNewChat: (title?: string) => Promise<Chat>;
  setCurrentChatId: (id: string | null) => void;
  deleteChat: (id: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  addMessage: (chatId: string, message: any) => Promise<void>;
  updateChatMeta: (chatId: string, updates: { systemPrompt?: string; attachedFile?: Chat['attachedFile'] | null }) => Promise<void>;
  getCurrentChat: () => Chat | null;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function useWorkingChatManager() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatIdState] = useState<string | null>(null);
  const [chatsLoaded, setChatsLoaded] = useState(false);

  // Загружаем чаты при монтировании
  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const allChats = await dbGetAllChats();
      setChats(
        allChats.map((c) => ({
          id: c.id,
          title: c.title,
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString(),
          })),
          systemPrompt: c.systemPrompt ?? '',
          attachedFile: c.attachedFile
            ? {
                name: c.attachedFile.name,
                type: c.attachedFile.type,
                text: c.attachedFile.text,
                updatedAt: c.attachedFile.updatedAt.toISOString(),
              }
            : undefined,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }))
      );
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setChatsLoaded(true);
    }
  };

  const updateChatMeta: ChatContextType['updateChatMeta'] = async (chatId, updates) => {
    try {
      const nextSystemPrompt = updates.systemPrompt;
      const nextAttachedFile = updates.attachedFile;

      await dbUpdateChat(chatId, {
        systemPrompt: typeof nextSystemPrompt === 'string' ? nextSystemPrompt : undefined,
        attachedFile:
          nextAttachedFile === null
            ? undefined
            : nextAttachedFile
              ? {
                  name: nextAttachedFile.name,
                  type: nextAttachedFile.type,
                  text: nextAttachedFile.text,
                  updatedAt: new Date(nextAttachedFile.updatedAt),
                }
              : undefined,
      });

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            systemPrompt: typeof nextSystemPrompt === 'string' ? nextSystemPrompt : c.systemPrompt,
            attachedFile:
              nextAttachedFile === null
                ? undefined
                : nextAttachedFile
                  ? nextAttachedFile
                  : c.attachedFile,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    } catch (error) {
      console.error('Failed to update chat meta:', error);
    }
  };

  const clearAllChats = async (): Promise<void> => {
    try {
      setChats([]);
      setCurrentChatIdState(null);

      await dbDeleteAllChats();
    } catch (error) {
      console.error('Failed to clear chats:', error);
      await loadChats();
    }
  };

  const createNewChat = async (title?: string): Promise<Chat> => {
    try {
      const created = await dbCreateChat(title || 'Новый чат');
      const newChat: Chat = {
        id: created.id,
        title: created.title,
        messages: [],
        systemPrompt: created.systemPrompt ?? '',
        attachedFile: created.attachedFile
          ? {
              name: created.attachedFile.name,
              type: created.attachedFile.type,
              text: created.attachedFile.text,
              updatedAt: created.attachedFile.updatedAt.toISOString(),
            }
          : undefined,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };

      setChats((prev) => [newChat, ...prev]);
      setCurrentChatIdState(newChat.id);
      return newChat;
    } catch (error) {
      console.error('Failed to create chat:', error);
      throw error;
    }
  };

  const setCurrentChatId = (id: string | null) => {
    setCurrentChatIdState(id);
  };

  const deleteChat = async (id: string): Promise<void> => {
    try {
      await dbDeleteChat(id);
      setChats((prev) => prev.filter((chat) => chat.id !== id));
      if (currentChatId === id) {
        setCurrentChatIdState(null);
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const addMessage = async (chatId: string, message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  }): Promise<void> => {
    try {
      const ts = message.timestamp ? new Date(message.timestamp) : new Date();
      // Always read the latest chat from IndexedDB to avoid stale state overwriting messages.
      const dbChat = await dbGetChat(chatId);
      if (!dbChat) return;

      const updatedMessages = [
        ...dbChat.messages,
        { id: message.id, role: message.role, content: message.content, timestamp: ts },
      ];

      await dbUpdateChat(chatId, {
        messages: updatedMessages,
      });

      const updatedChat: Chat = {
        id: dbChat.id,
        title: dbChat.title,
        messages: updatedMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
        systemPrompt: dbChat.systemPrompt ?? '',
        attachedFile: dbChat.attachedFile
          ? {
              name: dbChat.attachedFile.name,
              type: dbChat.attachedFile.type,
              text: dbChat.attachedFile.text,
              updatedAt: dbChat.attachedFile.updatedAt.toISOString(),
            }
          : undefined,
        createdAt: dbChat.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setChats((prev) => {
        const without = prev.filter((c) => c.id !== chatId);
        return [updatedChat, ...without];
      });
    } catch (error) {
      console.error('Failed to add message:', error);
    }
  };

  const getCurrentChat = (): Chat | null => {
    return chats.find(c => c.id === currentChatId) || null;
  };

  return {
    chats,
    currentChatId,
    chatsLoaded,
    createNewChat,
    setCurrentChatId,
    deleteChat,
    clearAllChats,
    addMessage,
    updateChatMeta,
    getCurrentChat,
  };
}

export function WorkingChatProvider({ children }: { children: React.ReactNode }) {
  const chatManager = useWorkingChatManager();

  return (
    <ChatContext.Provider value={chatManager}>
      {children}
    </ChatContext.Provider>
  );
}

export function useWorkingChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useWorkingChatContext must be used within a WorkingChatProvider');
  }
  return context;
}
