'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useWorkingChatContext as useChatManager } from '../../components/WorkingChatManager';
import { fileToText } from '../../../lib/fileText';
import { Modal } from '../../components/Modal';
import styles from './ChatPage.module.scss';

// --- ИНТЕРФЕЙСЫ ---
interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
}

interface SearchResult {
	title: string;
	url: string;
	text: string;
	content?: string;
}

// --- КОМПОНЕНТ ДЛЯ ОТОБРАЖЕНИЯ БЛОКА РАЗМЫШЛЕНИЙ ---
const ThinkingBlock = ({
	content,
	isStreaming,
	isFinished,
	darkMode
}: {
	content: string;
	isStreaming: boolean;
	isFinished: boolean;
	darkMode: boolean;
}) => {
	// Если идет стриминг, держим открытым, иначе закрываем по умолчанию (или наоборот, как нравится)
	const [isOpen, setIsOpen] = useState(isStreaming);

	// Автоматически открываем, если пришли новые данные во время стриминга
	useEffect(() => {
		if (isStreaming) setIsOpen(true);
	}, [isStreaming, content]);

	if (!content && !isStreaming) return null;

	const themeClasses = darkMode ? {
		card: 'bg-gray-900',
		border: 'border-gray-800',
		text: 'text-white',
		textSecondary: 'text-gray-400'
	} : {
		card: 'bg-gray-50',
		border: 'border-gray-200',
		text: 'text-black',
		textSecondary: 'text-gray-600'
	};

	return (
		<div className={`mb-3 rounded-lg overflow-hidden ${themeClasses.card} ${themeClasses.border}`}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className={`w-full flex items-center gap-2 p-2 hover:opacity-80 transition-colors text-left ${themeClasses.textSecondary}`}
			>
				<span className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
					▶
				</span>
				<span className="text-sm font-medium">
					{isStreaming ? 'Размышляет...' : 'Размышления'}
				</span>
			</button>

			{isOpen && (
				<div className={`p-3 text-sm font-mono whitespace-pre-wrap leading-relaxed ${themeClasses.card} ${themeClasses.text}`}>
					{content}
					{isStreaming && <span className="animate-pulse ml-1">▋</span>}
				</div>
			)}
		</div>
	);
};

// --- ОСНОВНОЙ КОМПОНЕНТ ---
export default function ChatPage() {
	const params = useParams();
	const router = useRouter();
	const chatId = params.id as string;
	const chatManager = useChatManager();

	// State
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	// Settings State
	const [webSearchEnabled, setWebSearchEnabled] = useState(false);
	const [showThinking, setShowThinking] = useState(true); // State для UI кнопки
	const [darkMode, setDarkMode] = useState(true);

	// UI State
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [personalizationOpen, setPersonalizationOpen] = useState(false);
	const [systemPrompt, setSystemPrompt] = useState('');
	const [tempSystemPrompt, setTempSystemPrompt] = useState('');
	const [promptError, setPromptError] = useState('');

	// Attachments & Search
	const [attachedFile, setAttachedFile] = useState<{ name: string; type: string; text: string } | null>(null);
	const [isAttachingFile, setIsAttachingFile] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [searchLog, setSearchLog] = useState<string>('');

	// Logic phases
	const [searchPhase, setSearchPhase] = useState<'idle' | 'searching' | 'finished'>('idle');
	const [thinkingPhase, setThinkingPhase] = useState<'idle' | 'thinking' | 'finished'>('idle');

	// Refs
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Streaming Refs
	const streamAbortRef = useRef<AbortController | null>(null);
	const streamMessageIdRef = useRef<string | null>(null);
	const lastStreamFlushAtRef = useRef<number>(0);
	const flushTimerRef = useRef<number | null>(null);
	const pendingAssistantContentRef = useRef<string>('');
	const typingIntervalRef = useRef<number | null>(null);
	const prefsLoadedRef = useRef(false);

	// --- UTILS ---
	const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
	};

	// --- LOAD SETTINGS ---
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const rawShowThinking = window.localStorage.getItem('chat.showThinking');
		const rawWebSearch = window.localStorage.getItem('chat.webSearchEnabled');
		const rawDarkMode = window.localStorage.getItem('chat.darkMode');
		const rawPersonalization = window.localStorage.getItem('chat.globalSystemPrompt');

		if (rawShowThinking !== null) setShowThinking(rawShowThinking === 'true');
		if (rawWebSearch !== null) setWebSearchEnabled(rawWebSearch === 'true');
		if (rawDarkMode !== null) setDarkMode(rawDarkMode === 'true');
		if (rawPersonalization !== null) setSystemPrompt(rawPersonalization);

		prefsLoadedRef.current = true;
	}, []);

	// Save settings on change
	useEffect(() => {
		if (typeof window === 'undefined' || !prefsLoadedRef.current) return;
		window.localStorage.setItem('chat.showThinking', String(showThinking));
	}, [showThinking]);

	useEffect(() => {
		if (typeof window === 'undefined' || !prefsLoadedRef.current) return;
		window.localStorage.setItem('chat.webSearchEnabled', String(webSearchEnabled));
	}, [webSearchEnabled]);

	useEffect(() => {
		if (typeof window === 'undefined' || !prefsLoadedRef.current) return;
		window.localStorage.setItem('chat.darkMode', String(darkMode));
	}, [darkMode]);

	// Синхронизация tempSystemPrompt при открытии модалки
	useEffect(() => {
		if (personalizationOpen) {
			setTempSystemPrompt(systemPrompt);
			setPromptError('');
		}
	}, [personalizationOpen, systemPrompt]);

	// --- CHAT LOADING LOGIC ---
	useEffect(() => {
		if (!chatId) {
			chatManager.setCurrentChatId(null);
			return;
		}
		chatManager.setCurrentChatId(chatId);
	}, [chatId]);

	useEffect(() => {
		const loadChat = async () => {
			if (!chatId || !chatManager.chatsLoaded) return;

			const chat = chatManager.chats.find((c: any) => c.id === chatId);
			if (chat) {
				const loadedMessages = chat.messages
					.filter((msg: any) => msg.role !== 'system')
					.map((msg: any) => ({
						id: msg.id,
						role: msg.role as 'user' | 'assistant',
						content: msg.content,
						createdAt: msg.timestamp,
					}));
				setMessages(loadedMessages);
				setAttachedFile(
					chat.attachedFile && typeof chat.attachedFile.text === 'string'
						? { name: chat.attachedFile.name, type: chat.attachedFile.type, text: chat.attachedFile.text }
						: null
				);

				// Auto-run logic check
				const key = `chat.autorun:${chatId}`;
				const shouldAutorun = typeof window !== 'undefined' && window.sessionStorage.getItem(key) === '1';

				if (shouldAutorun) {
					const hasAssistant = loadedMessages.some((m: Message) => m.role === 'assistant');
					if (!hasAssistant && loadedMessages.length > 0) {
						window.sessionStorage.removeItem(key);
						// Re-construct conversation for API
						const conversation = loadedMessages.map((m: Message) => ({ role: m.role, content: m.content }));
						runAssistant(chatId, conversation);
					} else {
						window.sessionStorage.removeItem(key);
					}
				}
			} else {
				router.replace('/');
			}
		};
		loadChat();
	}, [chatId, chatManager.chatsLoaded, chatManager.chats]); // Removed excessive dependencies

	// Auto-scroll with user position check
	useEffect(() => {
		const messagesContainer = messagesEndRef.current?.parentElement;
		if (!messagesContainer) return;
		
		// Check if user is near bottom (within 100px)
		const isUserNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
		
		// Only scroll if user is near bottom
		if (isUserNearBottom) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [messages, searchPhase, thinkingPhase]);

	// Textarea resize
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = input ? `${textareaRef.current.scrollHeight}px` : '48px';
		}
	}, [input]);

	// --- PARSING HELPER ---
	const parseMessageContent = (content: string) => {
		// Regex matches <thinking>...</thinking> OR <think>...</think>
		// Captures content inside group 1, and everything after in group 2
		const thinkMatch = content.match(/<(?:thinking|think)>([\s\S]*?)(?:<\/(?:thinking|think)>|$)([\s\S]*)/);

		if (thinkMatch) {
			return {
				thinking: thinkMatch[1].trim(),
				finalResponse: thinkMatch[2] ? thinkMatch[2].trim() : '',
				hasThinking: true
			};
		}

		return {
			thinking: '',
			finalResponse: content,
			hasThinking: false
		};
	};

	const startTypingLoop = (tick: () => void) => {
		if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
		typingIntervalRef.current = window.setInterval(tick, 20);
	};

	// --- CORE AI LOGIC ---
	const runAssistant = async (currentChatId: string, conversation: Array<{ role: 'user' | 'assistant'; content: string }>) => {
		setIsLoading(true);
		streamAbortRef.current?.abort();
		streamAbortRef.current = new AbortController();

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: streamAbortRef.current.signal,
				body: JSON.stringify({ messages: conversation }),
			});

			if (!response.ok) throw new Error('Failed to get AI response');
			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			let aiContent = '';
			let aiReasoning = '';
			const aiMessage: Message = {
				id: makeId(),
				role: 'assistant',
				content: '',
				createdAt: new Date().toISOString(),
			};

			streamMessageIdRef.current = aiMessage.id;
			pendingAssistantContentRef.current = '';
			lastStreamFlushAtRef.current = 0;

			setMessages(prev => [...prev, aiMessage]);
			setThinkingPhase('idle');

			const buildCombinedContent = () => {
				if (aiReasoning.trim()) {
					// Use standard XML tag for internal storage
					return `<thinking>${aiReasoning.trim()}</thinking>\n\n${aiContent}`;
				}
				return aiContent;
			};

			const flushAssistantToState = (force?: boolean) => {
				const now = Date.now();
				if (!force && now - lastStreamFlushAtRef.current < 50) return;
				lastStreamFlushAtRef.current = now;

				const nextContent = pendingAssistantContentRef.current;

				setMessages(prev => {
					if (prev.length === 0) return prev;
					const last = prev[prev.length - 1];
					if (last.id !== streamMessageIdRef.current) return prev; // Safety check

					if (force) {
						return [...prev.slice(0, -1), { ...last, content: nextContent }];
					}

					// Typewriter effect logic
					if (last.content.length >= nextContent.length) return prev;
					const step = Math.max(1, Math.min(5, nextContent.length - last.content.length)); // Slightly faster typing
					const partial = nextContent.slice(0, last.content.length + step);
					return [...prev.slice(0, -1), { ...last, content: partial }];
				});
			};

			// Start the UI update loop
			startTypingLoop(() => {
				setMessages((prev) => {
					if (prev.length === 0) return prev;
					const last = prev[prev.length - 1];
					if (last.id !== streamMessageIdRef.current) return prev;

					const target = pendingAssistantContentRef.current;
					if (!target || last.content.length >= target.length) {
						// Don't clear interval here, wait for final flush
						return prev;
					}

					const step = Math.max(1, Math.min(3, target.length - last.content.length));
					const partial = target.slice(0, last.content.length + step);
					return [...prev.slice(0, -1), { ...last, content: partial }];
				});
			});

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const text = new TextDecoder().decode(value);
				const lines = text.split('\n');

				for (const line of lines) {
					if (!line) continue;
					const match = line.match(/^(\d+):(.*)$/);
					if (!match) continue;

					const channel = Number(match[1]);
					const payload = match[2];
					if (!payload) continue;

					try {
						const parsed = JSON.parse(payload);
						const chunk = typeof parsed === 'string' ? parsed : (parsed.content ?? parsed.text ?? parsed.reasoning ?? '');
						if (!chunk) continue;

						if (channel === 0) {
							aiContent += chunk;
							if (thinkingPhase === 'thinking') setThinkingPhase('finished');
						} else {
							// Non-0 channel usually implies reasoning/data
							aiReasoning += chunk;
							if (thinkingPhase === 'idle') setThinkingPhase('thinking');
						}
						pendingAssistantContentRef.current = buildCombinedContent();
					} catch (e) { /* ignore json errors */ }

					// Throttle state updates
					if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
					flushTimerRef.current = window.setTimeout(() => flushAssistantToState(), 20);
				}
			}

			// Cleanup
			if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
			if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);

			// Final flush
			if (aiContent.trim() || aiReasoning.trim()) {
				const finalMsg = { ...aiMessage, content: buildCombinedContent() };
				await chatManager.addMessage(currentChatId, finalMsg);
				setMessages(prev => [...prev.slice(0, -1), finalMsg]);
			}

		} catch (error) {
			if ((error as any)?.name !== 'AbortError') console.error('AI response error:', error);
		} finally {
			streamMessageIdRef.current = null;
			setIsLoading(false);
			setThinkingPhase('finished');
		}
	};

	// --- HANDLERS ---
	const handleNewChat = async () => {
		const title = prompt('Название чата', 'Новый чат') || 'Новый чат';
		try {
			const newChat = await chatManager.createNewChat(title);
			router.push(`/chat/${newChat.id}`);
		} catch (e) { console.error(e); }
	};

	const handleClearAllChats = async () => {
		if (confirm('Удалить все чаты?')) {
			await chatManager.clearAllChats();
			router.push('/');
		}
	};

	const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (chatManager.currentChatId === id) router.push('/');
		await chatManager.deleteChat(id);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;

		// Reset UI states
		setSearchPhase('idle');
		setThinkingPhase('idle');
		setSearchLog('');

		const currentInput = input.trim();
		setInput('');
		setIsLoading(true);

		let currentChat = chatManager.getCurrentChat();
		// Create chat if doesn't exist
		if (!currentChat) {
			currentChat = await chatManager.createNewChat(currentInput.slice(0, 50));
			router.replace(`/chat/${currentChat.id}`);
			// Wait a tick for router
			await new Promise(r => setTimeout(r, 100));
		}

		const userMessage: Message = {
			id: makeId(),
			role: 'user',
			content: currentInput,
			createdAt: new Date().toISOString()
		};

		setMessages(prev => [...prev, userMessage]);
		await chatManager.addMessage(currentChat.id, userMessage);

		// WEB SEARCH LOGIC
		let localSearchLog = '';
		if (webSearchEnabled) {
			console.log('🔍 Поиск включен, начинаю поиск...');
			setIsSearching(true);
			setSearchPhase('searching');
			try {
				const searchRes = await fetch('/api/exawebsearch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query: currentInput }),
				});
				console.log('🔍 Статус поиска:', searchRes.status);
				if (searchRes.ok) {
					const data = await searchRes.json();
					console.log('🔍 Результаты поиска:', data.results?.length || 0);
					if (data.results?.length) {
						const log = data.results.slice(0, 6).map((r: SearchResult, i: number) =>
							`[Источник ${i + 1}] ${r.title}\nURL: ${r.url}\nДанные: ${r.content || r.text}\n`
						).join('\n');
						localSearchLog = log;
						setSearchLog(log);
						console.log('🔍 Лог поиска создан, длина:', log.length);
					}
				} else {
					console.error('🔍 Ошибка поиска:', searchRes.statusText);
				}
			} catch (err) { 
				console.error('🔍 Ошибка при поиске:', err); 
			}
			finally {
				setIsSearching(false);
				setSearchPhase('finished');
			}
		} else {
			console.log('🔍 Поиск отключен');
		}

		// PREPARE CONTEXT
		const systemMessages = [];
		if (showThinking) {
			systemMessages.push({ role: 'system', content: 'Перед ответом напиши размышления в тегах <thinking>...</thinking>. Размышляй на русском языке.' });
		}
		if (systemPrompt.trim()) {
			systemMessages.push({ 
				role: 'system', 
				content: `ТВОЯ СУЩНОСТЬ И РОЛЬ: ${systemPrompt.trim()}\n\nЭто не просто инструкция - это то КЕМ ТЫ ЯВЛЯЕШЬСЯ. Ты должен полностью вжиться в эту роль и верить в неё. Отвечай и думай как этот персонаж/сущность.` 
			});
		}
		if (attachedFile) systemMessages.push({ role: 'system', content: `Файл (${attachedFile.name}):\n${attachedFile.text}` });
		if (localSearchLog) {
			systemMessages.push({ 
				role: 'system', 
				content: `🔥 СРОЧНО: У тебя есть актуальные данные из интернета! Это не просто ссылки - это конкретная информация которая нужна пользователю. Используй эти данные для прямого ответа на вопрос.

${localSearchLog}

ВАЖНО: 
- Дай конкретный ответ на основе этих данных
- Не отправляй пользователя на другие сайты
- Если данных недостаточно, скажи что именно не хватает` 
			});
			console.log('🔍 Добавлен лог поиска в контекст, длина:', localSearchLog.length);
		}

		const fullConversation = [
			...systemMessages,
			...messages.map(m => ({ role: m.role, content: m.content })),
			{ role: 'user', content: currentInput }
		] as any;

		console.log('📊 Отправляем в AI:', {
			systemMessagesCount: systemMessages.length,
			totalMessages: fullConversation.length,
			hasSearchLog: !!localSearchLog,
			hasThinking: showThinking,
			hasAttachedFile: !!attachedFile
		});

		await runAssistant(currentChat.id, fullConversation);
		
		// Очищаем файл после отправки
		setAttachedFile(null);
	};

	// --- STYLES ---
	const themeClasses = darkMode ? {
		bg: 'bg-black',
		text: 'text-white',
		textSecondary: 'text-gray-400',
		border: 'border-gray-800',
		card: 'bg-gray-900',
		input: 'bg-gray-800 border-gray-700 text-white',
		hover: 'hover:bg-gray-800'
	} : {
		bg: 'bg-white',
		text: 'text-black',
		textSecondary: 'text-gray-600',
		border: 'border-gray-200',
		card: 'bg-gray-50',
		input: 'bg-white border-gray-300 text-black',
		hover: 'hover:bg-gray-50'
	};

	return (
		<div className={`${styles.page} min-h-screen ${themeClasses.bg} ${themeClasses.text} flex flex-col`}>

			{/* --- MODAL PERSONALIZATION --- */}
			<Modal open={personalizationOpen} title="Персонализация AI" onClose={() => setPersonalizationOpen(false)}>
				<div className="space-y-4 max-w-md mx-auto">
					<div>
						<label className="block text-sm font-medium mb-2">Роль и сущность AI:</label>
						<textarea
							value={tempSystemPrompt}
							onChange={(e) => {
								setTempSystemPrompt(e.target.value);
								setPromptError('');
							}}
							placeholder="Например: ты - Риас Гремори, демонесса высшего ранга из аниме High School DxD..."
							className={`w-full p-3 rounded-lg border ${themeClasses.input} resize-none focus:ring-2 focus:ring-blue-500 text-sm ${promptError ? 'border-red-500' : ''}`}
							rows={4}
						/>
						{promptError && (
							<p className="mt-1 text-xs text-red-500">{promptError}</p>
						)}
					</div>
					
					<div className="text-xs text-gray-500">
						<p>Примеры ролей и сущностей:</p>
						<ul className="list-disc list-inside mt-1 space-y-1">
							<li>Ты - Риас Гремори, демонесса из аниме DxD</li>
							<li>Ты - мастер ролевой игры, описывающий мир</li>
							<li>Ты - психолог который помогает решить проблемы</li>
							<li>Ты - обычный камень, не способный думать</li>
							<li>Ты - просто дружелюбный собеседник</li>
						</ul>
						<p className="mt-2 text-yellow-600 dark:text-yellow-400">
							⚠️ AI будет полностью вживаться в эту роль и верить в неё!
						</p>
					</div>
					
					<div className="flex flex-col sm:flex-row gap-2">
						<button 
							onClick={() => {
								setTempSystemPrompt('');
								setSystemPrompt('');
								setPromptError('');
								if (typeof window !== 'undefined') {
									window.localStorage.removeItem('chat.globalSystemPrompt');
								}
								setPersonalizationOpen(false);
							}} 
							className="px-3 py-2 rounded-lg bg-gray-500 text-white text-sm hover:bg-gray-600 transition-colors"
						>
							Отмена
						</button>
						<button 
							onClick={() => {
								// Валидация
								if (!tempSystemPrompt.trim()) {
									setPromptError('Пустое поле нельзя сохранять!');
									return;
								}
								
								const words = tempSystemPrompt.trim().split(/\s+/).filter(word => word.length > 0);
								if (words.length < 4) {
									setPromptError('Нужно минимум 4 слова!');
									return;
								}
								
								// Сохраняем
								setSystemPrompt(tempSystemPrompt);
								setPromptError('');
								if (typeof window !== 'undefined') {
									window.localStorage.setItem('chat.globalSystemPrompt', tempSystemPrompt);
								}
								setPersonalizationOpen(false);
							}} 
							className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
						>
							Сохранить
						</button>
					</div>
				</div>
			</Modal>

			{/* --- HEADER --- */}
			<header className={`border-b ${themeClasses.border} p-4 flex-shrink-0 fixed top-0 left-0 right-0 z-10 ${themeClasses.bg}`}>
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<div className="flex items-center gap-3">
						{/* Mobile menu button */}
						<button 
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
						>
							☰
						</button>
						<h1 className="text-xl font-bold">AI Chat</h1>
					</div>
					<div className="flex items-center space-x-4">
						<button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover}`}>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
						</button>
						<button onClick={() => router.push('/')} className={`p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover}`}>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
						</button>
						<button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover}`}>
							{darkMode ? '🌙' : '☀️'}
						</button>
						<button onClick={() => setPersonalizationOpen(true)} className={`p-2 rounded-lg ${themeClasses.card} ${themeClasses.hover}`}>
							⚙️
						</button>
					</div>
				</div>
			</header>

			{/* --- MAIN LAYOUT --- */}
			<div className={`${styles.shell} flex h-screen pt-[73px] pb-[80px]`}>
				{/* SIDEBAR */}
				<aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-30 w-80 h-full ${themeClasses.card} border-r ${themeClasses.border} transition-transform duration-300 flex-shrink-0`}>
					<div className={`${styles.sidebarInner} p-4 overflow-y-auto`}>
						<button onClick={handleNewChat} className="w-full mb-4 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
							<span>+</span> Новый чат
						</button>

						<div className="space-y-2">
							{chatManager.chats.length > 0 && (
								<div className="flex justify-between mb-2">
									<span className={`text-xs ${themeClasses.textSecondary}`}>История</span>
									<button onClick={handleClearAllChats} className="text-xs text-red-500 hover:underline">Очистить</button>
								</div>
							)}
							{chatManager.chats.map((chat: any) => (
								<div
									key={chat.id}
									onClick={() => {
								router.push(`/chat/${chat.id}`);
								if (window.innerWidth < 1024) setSidebarOpen(false);
							}}
									className={`p-3 rounded-lg cursor-pointer ${themeClasses.card} ${themeClasses.hover} ${chatId === chat.id ? 'ring-1 ring-blue-500' : ''} mb-2 relative group`}
								>
									<div className="truncate pr-6 font-medium text-sm">{chat.title}</div>
									<div className={`text-xs ${themeClasses.textSecondary}`}>{formatDate(chat.updatedAt)}</div>
									<button
										onClick={(e) => handleDeleteChat(chat.id, e)}
										className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 text-red-500"
									>
										×
									</button>
								</div>
							))}
						</div>
					</div>
				</aside>

				{/* Mobile sidebar overlay */}
				{sidebarOpen && (
					<div 
						className="lg:hidden fixed inset-0 bg-black/50 z-20"
						onClick={() => setSidebarOpen(false)}
					/>
				)}

				{/* CHAT AREA */}
				<main className="flex-1 flex flex-col min-w-0 overflow-hidden">
					<div className="flex-1 overflow-y-auto p-4 space-y-6">
						{messages.length === 0 ? (
							<div className="text-center py-20 opacity-50">
								<div className="text-4xl mb-4">💬</div>
								<h3 className="text-xl font-bold">Привет! Чем могу помочь?</h3>
							</div>
						) : (
							messages.map((msg) => {
								const isUser = msg.role === 'user';
								const parsed = parseMessageContent(msg.content);
								const isStreamingMsg = isLoading && msg.id === streamMessageIdRef.current;

								return (
									<div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
										<div className={`flex gap-2 sm:gap-3 max-w-[85%] sm:max-w-[70%] ${isUser ? 'flex-row-reverse' : ''}`}>
											{/* Avatar */}
											<div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex-shrink-0 flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-gray-600'} text-white text-xs`}>
												{isUser ? 'U' : 'AI'}
											</div>

											{/* Content Bubble */}
											<div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl ${isUser ? 'bg-blue-600 text-white' : `${themeClasses.card} ${themeClasses.border} ${themeClasses.text}`} max-w-full`}>
												{/* Web Search Status Block */}
												{!isUser && isStreamingMsg && searchPhase === 'searching' && (
													<div className="mb-2 text-xs text-green-400 animate-pulse flex items-center gap-2">
														<span>🔍</span> Ищу информацию...
													</div>
												)}

												{/* Thinking Block */}
												{!isUser && showThinking && (parsed.hasThinking || (isStreamingMsg && thinkingPhase === 'thinking')) && (
													<ThinkingBlock
														content={parsed.thinking}
														isStreaming={isStreamingMsg && thinkingPhase === 'thinking'}
														isFinished={!isStreamingMsg}
														darkMode={darkMode}
													/>
												)}

												{/* Final Response */}
												<div className={`prose ${darkMode ? 'prose-invert prose-headings:text-white' : ''} max-w-none text-sm leading-relaxed break-words`}>
													<ReactMarkdown>{parsed.finalResponse}</ReactMarkdown>
													{!isUser && isStreamingMsg && !parsed.finalResponse && thinkingPhase === 'finished' && (
														<span className="animate-pulse">▋</span>
													)}
												</div>
											</div>
										</div>
									</div>
								);
							})
						)}
						<div ref={messagesEndRef} />
					</div>

					{/* INPUT AREA */}
					<div className={`border-t ${themeClasses.border} p-3 sm:p-4 flex-shrink-0 fixed bottom-0 left-0 right-0 z-10 ${themeClasses.bg}`}>
						<form ref={formRef} onSubmit={handleSubmit} className="max-w-4xl mx-auto h-full flex flex-col justify-center">
							{attachedFile && (
								<div className="mb-3 p-3 rounded-lg border border-blue-500/50 bg-blue-500/20 flex justify-between items-center">
									<div className="flex items-center gap-2">
										<span className="text-blue-400">📎</span>
										<div>
											<div className="text-sm font-medium text-blue-300">{attachedFile.name}</div>
											<div className="text-xs text-blue-500 opacity-75">Файл загружен и будет отправлен</div>
										</div>
									</div>
									<button 
										type="button" 
										onClick={() => setAttachedFile(null)} 
										className="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
									>
										✕ Убрать
									</button>
								</div>
							)}

							<div className="flex items-end gap-2 sm:gap-3">
								{/* File Input */}
								<input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
									const file = e.target.files?.[0];
									if (file) {
										setIsAttachingFile(true);
										const data = await fileToText(file);
										setAttachedFile({ name: file.name, type: data.type, text: data.text });
										setIsAttachingFile(false);
									}
									e.target.value = '';
								}} />

								<button type="button" onClick={() => fileInputRef.current?.click()} className={`p-2 sm:p-3 rounded-lg ${themeClasses.card} ${themeClasses.hover} transition-colors flex-shrink-0`} title="Прикрепить файл">
									📎
								</button>

								{/* Toggle Search */}
								<button
									type="button"
									onClick={() => setWebSearchEnabled(!webSearchEnabled)}
									className={`p-2 sm:p-3 rounded-lg transition-colors flex-shrink-0 ${webSearchEnabled ? 'bg-green-600 text-white' : `${themeClasses.card} ${themeClasses.hover}`}`}
									title="Поиск в интернете"
								>
									🌐
								</button>

								{/* Toggle Thinking */}
								<button
									type="button"
									onClick={() => setShowThinking(!showThinking)}
									className={`p-2 sm:p-3 rounded-lg transition-colors flex-shrink-0 ${showThinking ? 'bg-purple-600 text-white' : `${themeClasses.card} ${themeClasses.hover}`}`}
									title="Включить размышления (CoT)"
								>
									🧠
								</button>

								{/* Text Input */}
								<textarea
									ref={textareaRef}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
									placeholder="Сообщение..."
									className={`flex-1 p-2 sm:p-3 rounded-lg border ${themeClasses.input} focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none text-sm`}
									rows={1}
									disabled={isLoading}
								/>

								<button type="submit" disabled={!input.trim() || isLoading} className="p-2 sm:p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
									{isLoading ? '...' : '➤'}
								</button>
							</div>
						</form>
					</div>
				</main>
			</div>
		</div>
	);
}