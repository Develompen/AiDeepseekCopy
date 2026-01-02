'use client';

import { WorkingChatProvider } from './components/WorkingChatManager';

export function Providers({ children }: { children: React.ReactNode }) {
  return <WorkingChatProvider>{children}</WorkingChatProvider>;
}
