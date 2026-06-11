'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/collect');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 animate-breathe" style={{ background: 'linear-gradient(135deg, #5B8DEF, #9B7BDB)' }}>
          <span className="text-white font-bold text-lg">O</span>
        </div>
        <p className="text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    </div>
  );
}
