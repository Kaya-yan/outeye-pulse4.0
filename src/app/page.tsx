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
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#0EA5E9] to-[#6366F1] flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">O</span>
        </div>
        <p className="text-[#94A3B8]">加载中...</p>
      </div>
    </div>
  );
}
