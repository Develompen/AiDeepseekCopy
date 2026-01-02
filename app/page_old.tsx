'use client';

import { useChat, Message } from 'ai/react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { getAssetPath } from './utils';
import { useEnhancedChatManager } from './components/EnhancedChatManager';

interface SearchResult {
	title: string;
	url: string;
	text: string;
	author?: string;
	publishedDate?: string;
	favicon?: string;
}

const parseMessageContent = (content: string) => {
	// Проверяем наличие <thinking> тегов
	if (content.includes('<thinking>')) {
		const [thinkingPart, ...rest] = content.split('</thinking>');
		if (thinkingPart && rest.length > 0) {
			const thinking = thinkingPart.replace('<thinking>', '').trim();
			const finalResponse = rest.join('</thinking>').trim();
			return {
				thinking,
				finalResponse,
				isComplete: true,
				hasThinking: true
			};
		}
	}
	
	// Если есть только открывающий тег
	if (content.includes('<thinking>')) {
		const thinking = content.replace('<thinking>', '').trim();
		return {
			thinking,
			finalResponse: '',
			isComplete: false,
			hasThinking: true
		};
	}
	
	// Если нет thinking тегов
	return {
		thinking: '',
		finalResponse: content,
		isComplete: true,
		hasThinking: false
	};
};

export default function Page() {
	const [isSearching, setIsSearching] = useState(false);
	const [isLLMLoading, setIsLLMLoading] = useState(false);
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [previousQueries, setPreviousQueries] = useState<string[]>([]);
	const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
	const [isSourcesExpanded, setIsSourcesExpanded] = useState(true);
	const [loadingDots, setLoadingDots] = useState('');
	const [showModelNotice, setShowModelNotice] = useState(true);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [darkMode, setDarkMode] = useState(true);
	const [webSearchEnabled, setWebSearchEnabled] = useState(false);
	
	const chatManager = useEnhancedChatManager();

	useEffect(() => {
		let interval: NodeJS.Timeout;
		if (isSearching) {
			let count = 0;
			interval = setInterval(() => {
				count = (count + 1) % 4;
				setLoadingDots('.'.repeat(count));
			}, 500);
		}
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [isSearching]);

	const { messages, input, handleInputChange, handleSubmit: handleChatSubmit, setMessages } = useChat({
		api: getAssetPath('/api/chat'),
		onFinish: async (message) => {
			const currentChat = chatManager.getCurrentChat();
			if (currentChat) {
				// Сохраняем ответ AI в IndexedDB
				await chatManager.addMessage(currentChat.id, {
					id: message.id,
					role: message.role as 'user' | 'assistant',
					content: message.content
				});
			}
		}
	});

	// Правильное сохранение сообщений пользователя
	useEffect(() => {
		const currentChat = chatManager.getCurrentChat();
		if (currentChat && messages.length > 0) {
			// Находим последнее сообщение пользователя
			const lastMessage = messages[messages.length - 1];
			if (lastMessage.role === 'user') {
				const messageExists = currentChat.messages.some(m => m.id === lastMessage.id);
				
				if (!messageExists) {
					// Сохраняем сообщение пользователя в IndexedDB
					chatManager.addMessage(currentChat.id, {
						id: lastMessage.id,
						role: 'user',
						content: lastMessage.content
					});
				}
			}
		}
	}, [messages, chatManager]);

	const handleNewChat = async () => {
		await chatManager.createNewChat();
		setMessages([]);
		setSearchResults([]);
		setSearchError(null);
		setShowModelNotice(true);
	};

	const handleChatSelect = async (chatId: string) => {
		chatManager.setCurrentChatId(chatId);
		const chat = chatManager.chats.find(c => c.id === chatId);
		if (chat) {
			// Загружаем сообщения из IndexedDB
			const aiMessages = chat.messages
				.filter(msg => msg.role !== 'system')
				.map(msg => ({
					id: msg.id,
					role: msg.role,
					content: msg.content,
					createdAt: msg.timestamp
				}));
			setMessages(aiMessages);
			setSearchResults([]);
			setSearchError(null);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;

		let currentChat = chatManager.getCurrentChat();
		if (!currentChat) {
			currentChat = await chatManager.createNewChat(input.slice(0, 50) + (input.length > 50 ? '...' : 'Новый чат'));
		}

		// Reset states
		setIsLLMLoading(false);
		setSearchResults([]);
		setSearchError(null);

		// Если поиск включен - делаем поиск, иначе отправляем сразу в AI
		if (webSearchEnabled) {
			setIsSearching(true);
			
			try {
				// First, get web search results
				const searchResponse = await fetch(getAssetPath('/api/exawebsearch'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						query: input,
						previousQueries: previousQueries.slice(-5)
					}),
				});

				if (!searchResponse.ok) {
					throw new Error('Search failed');
				}

				const { results } = await searchResponse.json();
				setSearchResults(results);
				setShowModelNotice(false);
				setIsSearching(false);
				setIsLLMLoading(true);

				// Format search context
				const searchContext = results.length > 0
					? `Результаты веб-поиска:\n\n${results.map((r: SearchResult, i: number) =>
						`Источник [${i + 1}]:\nЗаголовок: ${r.title}\nURL: ${r.url}\n${r.author ? `Автор: ${r.author}\n` : ''}${r.publishedDate ? `Дата: ${r.publishedDate}\n` : ''}Содержание: ${r.text}\n---`
					).join('\n\n')}\n\nИнструкции: Основываясь на результатах поиска выше, пожалуйста, предоставьте подробный и развернутый ответ на запрос пользователя. При ссылке на информацию указывайте номер источника в скобках, например [1], [2] и т.д. Используйте простой русский язык. Самое важное: перед тем как дать окончательный ответ, подумайте вслух, думайте шаг за шагом. Думайте глубоко и просмотрите свои шаги, сделайте 5-7 шагов размышлений. Оберните размышления в теги <thinking>. Начните с <thinking> и закончите </thinking>, а затем дайте окончательный ответ. Учитывайте весь контекст разговора для более точного ответа.`
					: '';

				if (searchContext) {
					const newMessages: Message[] = [
						...messages,
						{
							id: Date.now().toString(),
							role: 'system',
							content: searchContext
						}
					];
					setMessages(newMessages);
				}

				handleChatSubmit(e);
				setPreviousQueries(prev => [...prev, input].slice(-5));

			} catch (err) {
				setSearchError(err instanceof Error ? err.message : 'Search failed');
				console.error('Error:', err);
				setIsLLMLoading(false);
			} finally {
				setIsSearching(false);
			}
		} else {
			// Отправляем напрямую в AI без поиска
			setIsLLMLoading(true);
			
			// Добавляем системный промпт для генерации thinking
			const systemPrompt = `Вы полезный ассистент. Перед тем как дать окончательный ответ, подумайте вслух, думайте шаг за шагом. Думайте глубоко и просмотрите свои шаги, сделайте 5-7 шагов размышлений. Оберните размышления в теги <thinking>. Начните с <thinking> и закончите </thinking>, а затем дайте окончательный ответ. Используйте простой русский язык.`;
			
			const newMessages: Message[] = [
				...messages,
				{
					id: Date.now().toString(),
					role: 'system',
					content: systemPrompt
				}
			];
			setMessages(newMessages);
			
			handleChatSubmit(e);
		}
	};

	useEffect(() => {
		const lastMessage = messages[messages.length - 1];
		if (lastMessage?.role === 'assistant') {
			const { isComplete } = parseMessageContent(lastMessage.content);
			if (isComplete) {
				setIsLLMLoading(false);
			}
		}
	}, [messages]);

	const currentChat = chatManager.getCurrentChat();

	// Черно-белая тема
	const themeClasses = darkMode ? {
		bg: 'bg-black',
		sidebar: 'bg-gray-900',
		card: 'bg-gray-900',
		border: 'border-gray-800',
		text: 'text-white',
		textSecondary: 'text-gray-400',
		input: 'bg-gray-800 border-gray-700 text-white',
		button: 'bg-gray-700 hover:bg-gray-600',
		buttonSecondary: 'bg-gray-800 hover:bg-gray-700',
		accent: 'bg-white text-black',
		toggleOff: 'bg-gray-600',
		toggleOn: 'bg-white',
		thinking: 'bg-gray-800 border-gray-700'
	} : {
		bg: 'bg-white',
		sidebar: 'bg-gray-50',
		card: 'bg-white',
		border: 'border-gray-200',
		text: 'text-black',
		textSecondary: 'text-gray-600',
		input: 'bg-white border-gray-300 text-black',
		button: 'bg-gray-100 hover:bg-gray-200',
		buttonSecondary: 'bg-gray-50 hover:bg-gray-100',
		accent: 'bg-black text-white',
		toggleOff: 'bg-gray-300',
		toggleOn: 'bg-black',
		thinking: 'bg-gray-50 border-gray-200'
	};

	return (
		<div className={`flex h-screen ${themeClasses.bg}`}>
			{/* Sidebar */}
			{sidebarOpen && (
				<div className={`w-80 ${themeClasses.sidebar} ${themeClasses.border} h-full flex flex-col`}>
					<div className={`p-4 ${themeClasses.border} flex items-center justify-between`}>
						<button
							onClick={handleNewChat}
							className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 ${themeClasses.accent} rounded-lg transition-colors font-medium`}
						>
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
							</svg>
							Новый чат
						</button>
						<button
							onClick={() => setDarkMode(!darkMode)}
							className={`ml-2 p-2 ${themeClasses.buttonSecondary} rounded-lg transition-colors`}
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

					<div className="flex-1 overflow-y-auto p-2">
						{chatManager.chats.length === 0 ? (
							<div className={`text-center ${themeClasses.textSecondary} p-4`}>
								Нет чатов. Создайте новый чат!
							</div>
						) : (
							chatManager.chats.map((chat) => (
								<div
									key={chat.id}
									onClick={() => handleChatSelect(chat.id)}
									className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
										chatManager.currentChatId === chat.id
											? `${themeClasses.card} ${themeClasses.border} border-2`
											: `hover:${themeClasses.card}`
									}`}
								>
									<div className="flex items-start justify-between">
										<div className="flex-1 min-w-0">
											<h3 className={`font-medium ${themeClasses.text} truncate`}>
												{chat.title}
											</h3>
											<p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
												{new Date(chat.createdAt).toLocaleDateString('ru-RU')}
											</p>
											{chat.messages.length > 0 && (
												<p className={`text-xs ${themeClasses.textSecondary} mt-1`}>
													{chat.messages.length} сообщений
												</p>
											)}
										</div>
										<button
											onClick={(e) => {
												e.stopPropagation();
												if (confirm('Удалить этот чат?')) {
													chatManager.deleteChat(chat.id);
												}
											}}
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
			)}

			{/* Main Content */}
			<div className="flex-1 flex flex-col">
				{/* Top Navigation Bar */}
				<div className={`${themeClasses.card} ${themeClasses.border} px-4 py-3 flex items-center justify-between`}>
					<div className="flex items-center gap-4">
						<button
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className={`p-2 ${themeClasses.buttonSecondary} rounded-lg transition-colors`}
						>
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
							</svg>
						</button>
						<h1 className={`text-lg font-semibold ${themeClasses.text}`}>
							{currentChat?.title || 'Новый чат'}
						</h1>
					</div>
					
					<div className="flex items-center gap-4">
						{/* Кнопка поиска */}
						<div className="flex items-center gap-2">
							<span className={`text-sm ${themeClasses.textSecondary}`}>Поиск:</span>
							<button
								onClick={() => setWebSearchEnabled(!webSearchEnabled)}
								className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
									webSearchEnabled ? themeClasses.toggleOn : themeClasses.toggleOff
								}`}
							>
								<span
									className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
										webSearchEnabled ? 'translate-x-6' : 'translate-x-1'
									}`}
								/>
							</button>
						</div>
						
						<a
							href="https://dashboard.exa.ai/playground/answer"
							target="_blank"
							className={`flex items-center px-3 py-1.5 ${themeClasses.accent} rounded-full transition-all duration-200 font-medium text-sm`}
						>
							Попробовать Exa API
						</a>
					</div>
				</div>

				{/* Chat Messages */}
				<div className="flex-1 overflow-y-auto">
					<div className="md:max-w-4xl mx-auto p-6 pt-4 pb-24 space-y-6">
						{messages.filter(m => m.role !== 'system').length === 0 ? (
							<div className="text-center py-12">
								<h2 className={`text-2xl font-semibold ${themeClasses.text} mb-4`}>
									Добро пожаловать в Deepseek Chat
								</h2>
								<p className={`${themeClasses.textSecondary} mb-8`}>
									Задайте любой вопрос, и я найду информацию в интернете и дам развернутый ответ
								</p>
							</div>
						) : (
							messages.filter(m => m.role !== 'system').map((message) => (
								<div key={message.id}>
									<div
										className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
									>
										<div
											className={`rounded-lg py-3 max-w-[85%] ${message.role === 'user'
													? `${themeClasses.accent} px-4`
													: `${themeClasses.card} ${themeClasses.text} ${themeClasses.border} px-4`
												}`}
										>
											{message.role === 'assistant' ? (
												<>
													{(() => {
														const { thinking, finalResponse, isComplete, hasThinking } = parseMessageContent(message.content);
														return (
															<>
																{hasThinking && (
																	<div className="mb-4">
																		<button
																			onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
																			className={`flex items-center gap-2 ${themeClasses.textSecondary} hover:${themeClasses.text} transition-colors`}
																		>
																			<svg
																				className={`w-4 h-4 transform transition-transform ${isThinkingExpanded ? 'rotate-0' : '-rotate-180'}`}
																				fill="none"
																				viewBox="0 0 24 24"
																				stroke="currentColor"
																			>
																				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
																			</svg>
																			<span className="text-sm font-medium">Размышления</span>
																		</button>
																		{isThinkingExpanded && (
																			<div className={`mt-2 p-3 ${themeClasses.thinking} ${themeClasses.border} rounded-lg text-sm ${themeClasses.textSecondary} whitespace-pre-wrap`}>
																				{thinking}
																			</div>
																		)}
																	</div>
																)}
																{isComplete && finalResponse && (
																	<div className={`prose prose-sm max-w-none ${darkMode ? 'prose-invert' : ''} ${themeClasses.text}`}>
																		<ReactMarkdown>{finalResponse}</ReactMarkdown>
																	</div>
																)}
															</>
														);
													})()}
												</>
											) : (
												<div className="whitespace-pre-wrap text-[15px]">{message.content}</div>
											)}
										</div>
									</div>

									{/* Show search results after user message - только если поиск был включен */}
									{message.role === 'user' && !isSearching && searchResults.length > 0 && webSearchEnabled && (
										<div className="my-8 space-y-4">
											<div className="flex items-center gap-2">
												<button
													onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
													className={`flex items-center gap-2 ${themeClasses.textSecondary} hover:${themeClasses.text}`}
												>
													<svg
														className={`w-4 h-4 transform transition-transform ${isSourcesExpanded ? 'rotate-0' : '-rotate-180'}`}
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
													</svg>
													<Image src={getAssetPath('/exa_logo.png')} alt="Exa" width={40} height={40} />
													<span className="text-sm font-medium">Источники</span>
												</button>
											</div>

											{isSourcesExpanded && (
												<div className="pl-4 space-y-2">
													{searchResults.map((result, idx) => (
														<div key={idx} className="text-sm group relative">
															<a href={result.url}
																target="_blank"
																className={`${themeClasses.textSecondary} hover:${themeClasses.text} flex items-center gap-2`}>
																[{idx + 1}] {result.title}
																{result.favicon && (
																	<img
																		src={result.favicon}
																		alt=""
																		className="w-4 h-4 object-contain"
																	/>
																)}
															</a>
														</div>
													))}
												</div>
											)}

											{isLLMLoading && (
												<div className="pt-6 flex items-center gap-2 text-gray-500">
													<svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
														<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
														<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
													<span className="text-sm">DeepSeek размышляет...</span>
												</div>
											)}
										</div>
									)}
								</div>
							))
						)}
					</div>

					{searchError && (
						<div className="mx-auto max-w-4xl px-6 pb-6">
							<div className="p-4 bg-red-50 rounded-lg border border-red-100">
								<p className="text-sm text-red-800">⚠️ {searchError}</p>
							</div>
						</div>
					)}
				</div>

				{/* Input Form */}
				<div className={`${messages.filter(m => m.role !== 'system').length === 0
					? 'flex-1 flex items-center justify-center'
					: `${themeClasses.border} ${themeClasses.card}`} z-40`}>
					<div className={`${messages.filter(m => m.role !== 'system').length === 0
						? 'w-full max-w-2xl mx-auto px-6'
						: 'w-full max-w-4xl mx-auto px-6 py-4'}`}>
					<form onSubmit={handleSubmit} className="flex flex-col items-center">
						<div className="flex gap-2 w-full max-w-4xl">
							<input
								value={input}
								onChange={handleInputChange}
								placeholder="Задайте вопрос..."
								autoFocus
								className={`flex-1 p-3 ${themeClasses.input} rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-base`}
							/>
							<button
								type="submit"
								disabled={!input.trim() || isSearching}
								className={`px-5 py-3 ${themeClasses.accent} rounded-lg font-medium w-[120px] disabled:opacity-50 transition-colors`}
							>
								{isSearching ? (
									<span className="inline-flex justify-center items-center">
										<span>Поиск</span>
										<span className="w-[24px] text-left">{loadingDots}</span>
									</span>
								) : (
									'Отправить'
								)}
							</button>
						</div>

						{showModelNotice && (
							<p className={`text-xs md:text-sm ${themeClasses.textSecondary} mt-8 text-center`}>
								Переключено на модель DeepSeek V3 с DeepSeek R1 из-за высокой нагрузки
							</p>
						)}
					</form>
					</div>
				</div>
			</div>
		</div>
	);
}
