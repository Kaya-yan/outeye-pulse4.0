import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import type { Comment, Post } from '@/types';

export async function exportChartToPNG(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#030712',
      scale: 2,
    });

    canvas.toBlob((blob) => {
      if (blob) {
        saveAs(blob, `${filename}.png`);
      }
    });
  } catch (error) {
    console.error('Export failed:', error);
  }
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val ?? '');
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}.csv`);
}

export function exportToJSON(data: unknown, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  saveAs(blob, `${filename}.json`);
}

export function exportProjectFile(projectData: unknown, filename: string) {
  const jsonStr = JSON.stringify(projectData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/octet-stream' });
  saveAs(blob, `${filename}.outeye`);
}

export function prepareExportData(comments: Comment[], posts: Post[]): Record<string, unknown>[] {
  const postMap = new Map(posts.map(p => [p.id, p]));
  return comments.map(c => {
    const post = postMap.get(c.post_id);
    return {
      comment_id: c.id,
      post_title: post?.title || '',
      platform: post?.platform || '',
      text: c.text,
      likes: c.likes,
      d1: c.analysis?.d1 || '',
      d2_valence: c.analysis?.d2_valence || '',
      d2_arousal: c.analysis?.d2_arousal || '',
      d3: c.analysis?.d3 || '',
      d4: c.analysis?.d4 || '',
      d5: c.analysis?.d5 || '',
      d6: c.analysis?.d6 || '',
      narrative_type: c.analysis?.narrative_type || '',
      risk_level: c.analysis?.risk_level || '',
    };
  });
}
