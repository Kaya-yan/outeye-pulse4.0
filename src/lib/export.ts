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

export async function exportToWord(reportContent: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import('docx');

  const lines = reportContent.split('\n');
  const children: InstanceType<typeof Paragraph>[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.slice(2), bold: true })] }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.slice(3), bold: true })] }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.slice(4), bold: true })] }));
    } else if (line.startsWith('- **')) {
      const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)$/);
      if (match) {
        children.push(new Paragraph({ children: [new TextRun({ text: match[1], bold: true }), new TextRun({ text: ': ' + match[2] })] }));
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: line.slice(2) })] }));
      }
    } else if (line.startsWith('- ')) {
      children.push(new Paragraph({ children: [new TextRun({ text: line.slice(2) })], bullet: { level: 0 } }));
    } else if (line.startsWith('|')) {
      // Skip table markdown rows (handled separately if needed)
      if (line.includes('---')) continue;
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: cells.join(' | ') })] }));
      }
    } else if (line.trim()) {
      children.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

export async function exportToExcel(comments: Comment[], posts: Post[], filename: string) {
  const XLSX = await import('xlsx');

  const columnMap: Record<string, string> = {
    comment_id: '评论ID',
    post_title: '帖子标题',
    platform: '平台',
    text: '评论内容',
    likes: '点赞数',
    d1: '认知加工(D1)',
    d2_valence: '情感效价(D2)',
    d2_arousal: '情感唤醒(D2)',
    d3: '认同层级(D3)',
    d4: '行为意向(D4)',
    d5: '叙事卷入(D5)',
    d6: '伦理风险(D6)',
    narrative_type: '叙事类型',
    risk_level: '风险等级',
  };

  const data = prepareExportData(comments, posts);
  const headers = Object.keys(columnMap);
  const rows = data.map(row => headers.map(h => row[h] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet([headers.map(h => columnMap[h]), ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '评论数据');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}.xlsx`);
}
