import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SYSTEM_PROMPT = `你是一位文化记忆研究领域的量化分析专家。请严格遵循以下学术框架对评论进行编码分析。

【理论框架与维度定义】
1. 精细加工可能性模型(ELM)：评估受众对郭永怀信息的认知加工深度(D1)
2. Russell情感环状模型：测量情感效价(D2_valence)与唤醒度(D2_arousal)
3. 阿斯曼文化记忆理论：评估从个体记忆到集体记忆的认同层级(D3)
4. 行为意向阶梯：测量从认知到行动的转化(D4)
5. 叙事传输理论：评估受众被叙事卷入的程度(D5)
6. 媒介伦理框架：识别历史虚无主义与消费主义风险(D6)

【输出格式】
严格返回JSON数组，禁止任何解释文本。格式：
[{"d1":8.5,"d2_valence":0.8,"d2_arousal":0.7,"d3":5,"d4":3,"d5":7.2,"d6":0,"narrative_type":"T2","labov_weights":[0.1,0.2,0.3,0.2,0.1,0.1],"risk_level":"safe","evidence_keywords":[{"word":"民族脊梁","weight":0.25,"dimension":"d3"}]}]`;

export async function POST(request: NextRequest) {
  try {
    const { commentIds } = await request.json();

    if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json(
        { error: 'commentIds array is required' },
        { status: 400 }
      );
    }

    // Fetch comments from database
    const { data: comments, error: fetchError } = await supabase
      .from('comments')
      .select('id, text')
      .in('id', commentIds);

    if (fetchError || !comments) {
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    // Build batch prompt
    const userContent = comments
      .map((c, i) => `【${i + 1}】${c.text}`)
      .join('\n');

    // Call MiMo API (Anthropic Messages format)
    const mimoApiKey = process.env.MIMO_API_KEY;
    const mimoApiUrl = process.env.MIMO_API_URL || 'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages';
    const response = await fetch(mimoApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mimoApiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mimo-v2.5-pro',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('MiMo API error:', response.status, errBody);
      return NextResponse.json(
        { error: 'MiMo API call failed', status: response.status, detail: errBody },
        { status: 500 }
      );
    }

    const result = await response.json();

    // Parse Anthropic Messages response: content is an array of {type, text/thinking} blocks
    let analysisText = '';
    if (Array.isArray(result.content)) {
      const textBlock = result.content.find((b: { type: string }) => b.type === 'text');
      analysisText = textBlock?.text || '';
    }

    if (!analysisText) {
      return NextResponse.json(
        { error: 'Empty AI response', raw: JSON.stringify(result).slice(0, 500) },
        { status: 500 }
      );
    }

    // Parse JSON response
    let analysisArray;
    try {
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      analysisArray = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: analysisText },
        { status: 500 }
      );
    }

    // Update comments in database
    for (let i = 0; i < comments.length; i++) {
      if (i < analysisArray.length) {
        await supabase
          .from('comments')
          .update({
            analysis: {
              ...analysisArray[i],
              model_version: 'mimo-v2.5-pro',
              analyzed_at: new Date().toISOString(),
            },
          })
          .eq('id', comments[i].id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: comments.length,
      total_tokens: result.usage?.output_tokens || 0,
    });
  } catch (error) {
    console.error('Analysis route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
