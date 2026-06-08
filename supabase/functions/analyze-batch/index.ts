// Supabase Edge Function: analyze-batch
// Proxies MiMo API calls for comment analysis

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT = `你是一位文化记忆研究领域的量化分析专家。请严格遵循以下学术框架对评论进行编码分析。

【理论框架与维度定义】
1. 精细加工可能性模型(ELM)：评估受众对郭永怀信息的认知加工深度(D1)
2. Russell情感环状模型：测量情感效价(D2_valence)与唤醒度(D2_arousal)
3. 阿斯曼文化记忆理论：评估从个体记忆到集体记忆的认同层级(D3)
4. 行为意向阶梯：测量从认知到行动的转化(D4)
5. 叙事传输理论：评估受众被叙事卷入的程度(D5)
6. 媒介伦理框架：识别历史虚无主义与消费主义风险(D6)

【分析维度与量表】
{
  "d1_cognitive_elaboration": { "scale": "0-10", "definition": "认知加工深度", "indicators": ["历史细节提及","跨文本关联","批判性思考"] },
  "d2_valence": { "scale": "-1.0~1.0", "definition": "情感效价", "indicators": ["词汇极性","语气判断"] },
  "d2_arousal": { "scale": "0.0~1.0", "definition": "情感唤醒", "indicators": ["感叹号/情绪词密度","行动号召强度"] },
  "d3_identity_level": { "scale": "1-6", "definition": "认同层级", "levels": ["1无认同","2个体钦佩","3职业认同","4地域认同","5民族认同","6国家使命认同"] },
  "d4_behavior_intention": { "scale": "1-5", "definition": "行为意向", "levels": ["1无行动","2点赞收藏","3评论转发","4深度搜索","5实地参访/志愿讲解"] },
  "d5_narrative_engagement": { "scale": "0-10", "definition": "叙事卷入", "indicators": ["情感共鸣词","第一人称代入","时空穿越感"] },
  "d6_ethical_risk": { "scale": "0-3", "definition": "伦理风险", "levels": ["0安全","1轻度娱乐化","2中度消费主义","3严重历史虚无主义"] },
  "narrative_type": { "options": ["T1历史还原","T2生活交往","T3精神诠释","T4情感共鸣","T5价值升华","T6娱乐消费"], "definition": "叙事类型", "based_on": "Labov叙事结构权重" },
  "labov_weights": { "definition": "Labov六要素权重", "elements": ["abstract","orientation","complicating_action","evaluation","result","coda"], "scale": "0-1" }
}

【输出格式】
严格返回JSON数组，禁止任何解释文本。格式：
[{"d1":8.5,"d2_valence":0.8,"d2_arousal":0.7,"d3":5,"d4":3,"d5":7.2,"d6":0,"narrative_type":"T2","labov_weights":[0.1,0.2,0.3,0.2,0.1,0.1],"risk_level":"safe","evidence_keywords":[{"word":"民族脊梁","weight":0.25,"dimension":"d3"}]}]

【质量控制规则】
- 若评论为空或纯表情，返回全null值
- 若评论包含侮辱性词汇，d6自动≥2
- 若评论提及"永怀精神""两弹一星"等核心符号，d3自动≥4
- 若评论出现"赚钱""带货""流量密码"等消费主义词汇，d6自动≥1`;

const FEW_SHOT_EXAMPLES = `【示例1】评论："郭永怀先生放弃美国优厚待遇回国，这种精神太感人了，泪目"
输出：{"d1":7,"d2_valence":0.9,"d2_arousal":0.8,"d3":5,"d4":3,"d5":8,"d6":0,"narrative_type":"T4","labov_weights":[0.1,0.1,0.2,0.5,0.05,0.05],"risk_level":"safe","evidence_keywords":[{"word":"放弃美国优厚待遇","weight":0.3,"dimension":"d1"},{"word":"精神太感人了","weight":0.35,"dimension":"d5"}]}

【示例2】评论："用AI复原郭永怀坠机瞬间，太震撼了，求教程"
输出：{"d1":4,"d2_valence":0.6,"d2_arousal":0.9,"d3":3,"d4":2,"d5":6,"d6":1,"narrative_type":"T6","labov_weights":[0.05,0.3,0.4,0.1,0.1,0.05],"risk_level":"low","evidence_keywords":[{"word":"AI复原","weight":0.4,"dimension":"d6"},{"word":"求教程","weight":0.3,"dimension":"d4"}]}

【示例3】评论："呵呵，又一个被造出来的神"
输出：{"d1":2,"d2_valence":-0.8,"d2_arousal":0.6,"d3":1,"d4":1,"d5":2,"d6":3,"narrative_type":"T1","labov_weights":[0.1,0.1,0.1,0.6,0.05,0.05],"risk_level":"high","evidence_keywords":[{"word":"造出来的神","weight":0.5,"dimension":"d6"}]}`;

Deno.serve(async (req) => {
  try {
    const { commentIds } = await req.json();

    if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'commentIds array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch comments from database
    const { data: comments, error: fetchError } = await supabase
      .from('comments')
      .select('id, text')
      .in('id', commentIds);

    if (fetchError || !comments) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch comments', details: fetchError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build batch prompt
    const userContent = comments
      .map((c, i) => `【${i + 1}】${c.text}`)
      .join('\n');

    // Call MiMo API
    const mimoApiKey = Deno.env.get('MIMO_API_KEY');
    const response = await fetch('https://api.mimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mimoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mimo-v2.5-pro',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\n' + FEW_SHOT_EXAMPLES },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'MiMo API call failed', status: response.status }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const analysisText = result.choices?.[0]?.message?.content || result.content?.[0]?.text;

    // Parse JSON response
    let analysisArray;
    try {
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      analysisArray = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: analysisText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update comments in database
    const updatePromises = comments.map((comment, i) => {
      if (i < analysisArray.length) {
        return supabase
          .from('comments')
          .update({
            analysis: {
              ...analysisArray[i],
              model_version: 'mimo-v2.5-pro',
              analyzed_at: new Date().toISOString(),
            },
          })
          .eq('id', comment.id);
      }
      return Promise.resolve();
    });

    await Promise.all(updatePromises);

    return new Response(
      JSON.stringify({
        success: true,
        processed: comments.length,
        total_tokens: result.usage?.total_tokens || 0,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
