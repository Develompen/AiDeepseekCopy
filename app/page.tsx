'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkingChatContext as useChatManager } from './components/WorkingChatManager';
import styles from './HomePage.module.scss';

interface Chat {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [homeInput, setHomeInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const router = useRouter();
  const chatManager = useChatManager();

  const handleNewChat = async () => {
    try {
      const title = window.prompt('Название чата', 'Новый чат') || 'Новый чат';
      const newChat = await chatManager.createNewChat(title);
      console.log('Created new chat:', newChat);
      router.push(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  const handleHomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeInput.trim() || isCreatingChat) return;

    const firstPrompt = homeInput.trim();
    setHomeInput('');
    setIsCreatingChat(true);

    try {
      const title = window.prompt('Название чата', firstPrompt.slice(0, 50)) || firstPrompt.slice(0, 50);
      const newChat = await chatManager.createNewChat(title);

      const userMessage = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        role: 'user' as const,
        content: firstPrompt,
        timestamp: new Date().toISOString(),
      };

      await chatManager.addMessage(newChat.id, userMessage);

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`chat.autorun:${newChat.id}`, '1');
      }

      router.push(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Failed to start chat from home:', error);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleChatSelect = (chatId: string) => {
    console.log('Selecting chat:', chatId);
    router.push(`/chat/${chatId}`);
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (chatManager.currentChatId === chatId) {
        router.push('/');
      }
      await chatManager.deleteChat(chatId);
      console.log('Deleted chat:', chatId);
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleClearAllChats = async () => {
    if (!confirm('Удалить все чаты?')) return;
    try {
      await chatManager.clearAllChats();
    } catch (error) {
      console.error('Failed to clear chats:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const themeClasses = darkMode ? {
    bg: 'bg-black',
    text: 'text-white',
    textSecondary: 'text-gray-400',
    border: 'border-gray-800',
    card: 'bg-gray-900',
    hover: 'hover:bg-gray-800'
  } : {
    bg: 'bg-white',
    text: 'text-black',
    textSecondary: 'text-gray-600',
    border: 'border-gray-200',
    card: 'bg-gray-50',
    hover: 'hover:bg-gray-100'
  };

  return (
    <div className={`${styles.page} min-h-screen ${themeClasses.bg} ${themeClasses.text}`}>
      {/* Header */}
      <header className={`border-b ${themeClasses.border} p-4`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">DeepSeek AI</h1>
            <span className={`text-sm ${themeClasses.textSecondary}`}>Чат-приложение</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`${styles.btn} p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover} transition-colors`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`${styles.btn} p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover} transition-colors`}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className={`${styles.shell} flex h-[calc(100vh-73px)]`}>
        {/* Sidebar */}
        <aside
          className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarClosed : ''} ${themeClasses.border} border-r`}
        >
          <div className={`${styles.sidebarInner} p-4 overflow-y-auto`}>
            <div className="mb-6">
              <button
                onClick={handleNewChat}
                className={`${styles.btn} w-full flex items-center justify-center space-x-2 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Новый чат</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-medium ${themeClasses.textSecondary}`}>История чатов</h3>
                {chatManager.chats.length > 0 && (
                  <button
                    onClick={handleClearAllChats}
                    className={`text-xs ${themeClasses.textSecondary} hover:text-red-500 transition-colors`}
                  >
                    Очистить
                  </button>
                )}
              </div>
              {chatManager.chats.length === 0 ? (
                <div className={`text-center ${themeClasses.textSecondary} p-4`}>
                  <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>Нет чатов. Создайте новый чат!</p>
                </div>
              ) : (
                chatManager.chats.map((chat: Chat) => (
                  <div
                    key={chat.id}
                    onClick={() => handleChatSelect(chat.id)}
                    className={`${styles.cardIn} p-3 rounded-lg cursor-pointer transition-colors mb-2 ${themeClasses.card} ${themeClasses.hover} ${chatManager.currentChatId === chat.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{chat.title}</h4>
                        <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
                          {formatDate(chat.updatedAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        className={`ml-2 p-1 ${themeClasses.textSecondary} hover:text-red-500 transition-colors`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`${styles.main} flex-1 flex flex-col`}>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold mb-3">Начните новый чат</h2>
                <p className={`text-lg ${themeClasses.textSecondary}`}>Напишите сообщение ниже — мы создадим чат и сразу начнём диалог</p>
              </div>
            </div>
          </div>

          <div className={`border-t ${themeClasses.border} p-4`}>
            <form onSubmit={handleHomeSubmit} className="max-w-4xl mx-auto">
              <div className="flex space-x-4">
                <textarea
                  value={homeInput}
                  onChange={(e) => setHomeInput(e.target.value)}
                  placeholder="Введите ваше сообщение..."
                  className={`flex-1 p-3 rounded-lg border ${themeClasses.card} ${themeClasses.border} resize-none focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  rows={1}
                  disabled={isCreatingChat}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!homeInput.trim() || isCreatingChat}
                  className={`${styles.btn} px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
