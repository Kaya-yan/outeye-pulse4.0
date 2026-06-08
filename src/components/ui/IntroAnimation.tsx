'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const PHASE_LABELS = ['记忆奇点...', '数字大爆炸...', '六维聚合...', '视界穿透...'];
const DURATION = 4500;
const SESSION_KEY = 'outeye-intro-seen';

function hasSeenIntro(): boolean {
  if (typeof window === 'undefined') return true;
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

function markIntroSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
}

export function IntroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const doneRef = useRef(false);

  // Check sessionStorage after mount to avoid hydration mismatch
  useEffect(() => {
    if (!hasSeenIntro()) setVisible(true);
    setMounted(true);
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    markIntroSeen();
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current || doneRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; alpha: number;
    }

    const particles: Particle[] = [];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 800; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;
      particles.push({
        x: centerX, y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 1,
        color: Math.random() > 0.5 ? '#00F0FF' : '#8B5CF6',
        alpha: 1,
      });
    }

    let startTime = 0;
    let animationId: number;
    let lastPhase = -1;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / DURATION, 1);

      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (progress < 0.22) {
        const p = progress / 0.22;
        const glowSize = 20 + p * 80;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
        gradient.addColorStop(0, 'rgba(0, 240, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
        ctx.fill();
        if (lastPhase !== 0) { lastPhase = 0; if (phaseRef.current) phaseRef.current.textContent = PHASE_LABELS[0]; }
      } else if (progress < 0.55) {
        const p = (progress - 0.22) / 0.33;
        particles.forEach((particle) => {
          const speed = 1 + p * 3;
          particle.x += particle.vx * speed;
          particle.y += particle.vy * speed;
          particle.alpha = Math.max(0, 1 - p * 0.3);
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fillStyle = particle.color + Math.floor(particle.alpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });
        if (lastPhase !== 1) { lastPhase = 1; if (phaseRef.current) phaseRef.current.textContent = PHASE_LABELS[1]; }
      } else if (progress < 0.84) {
        const p = (progress - 0.55) / 0.29;
        const hexRadius = 150;
        ctx.strokeStyle = `rgba(59, 130, 246, ${p * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * hexRadius * p;
          const y = centerY + Math.sin(angle) * hexRadius * p;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        particles.forEach((particle, i) => {
          const targetAngle = ((i % 6) * Math.PI * 2) / 6 - Math.PI / 2;
          const targetRadius = hexRadius * (0.5 + Math.random() * 0.5);
          const targetX = centerX + Math.cos(targetAngle) * targetRadius;
          const targetY = centerY + Math.sin(targetAngle) * targetRadius;
          particle.x += (targetX - particle.x) * p * 0.1;
          particle.y += (targetY - particle.y) * p * 0.1;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fillStyle = particle.color + Math.floor((1 - p * 0.5) * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });
        if (lastPhase !== 2) { lastPhase = 2; if (phaseRef.current) phaseRef.current.textContent = PHASE_LABELS[2]; }
      } else {
        const p = (progress - 0.84) / 0.16;
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(1 + p * 2, 1 + p * 2);
        ctx.translate(-centerX, -centerY);
        particles.forEach((particle) => {
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, Math.max(0, particle.size * (1 - p)), 0, Math.PI * 2);
          ctx.fillStyle = particle.color + Math.floor((1 - p) * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });
        ctx.restore();
        ctx.fillStyle = `rgba(3, 7, 18, ${p})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (lastPhase !== 3) { lastPhase = 3; if (phaseRef.current) phaseRef.current.textContent = PHASE_LABELS[3]; }
        if (progress >= 1) { finish(); return; }
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(canvas.width / 2 - 100, canvas.height - 40, 200, 4);
      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(canvas.width / 2 - 100, canvas.height - 40, 200 * progress, 4);

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [visible, finish]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <canvas ref={canvasRef} className="w-full h-full" />
      <button
        onClick={finish}
        className="absolute top-6 right-6 px-4 py-2 rounded-lg bg-[#0B1221]/80 text-[#94A3B8] text-sm border border-[#1E293B] hover:border-[#334155] transition-colors backdrop-blur-sm"
      >
        跳过动画
      </button>
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center">
        <p className="text-[#64748B] text-xs">
          <span ref={phaseRef}>记忆奇点...</span>
        </p>
      </div>
    </div>
  );
}

/** Call this to replay the intro animation */
export function replayIntro() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  window.location.reload();
}
