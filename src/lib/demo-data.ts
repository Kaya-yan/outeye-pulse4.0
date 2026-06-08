import type { Project, Post, Comment, AnalysisResult } from '@/types';

const DEMO_PROJECT_ID = 'demo-project-001';
const DEMO_POST_IDS = Array.from({ length: 20 }, (_, i) => `demo-post-${String(i + 1).padStart(3, '0')}`);

const GUO_YONGHUAI_KEYWORDS = [
  '郭永怀', '两弹一星', '永怀精神', '钱学森', '邓稼先',
  '原子弹', '氢弹', '导弹', '科学家', '爱国',
  '牺牲', '坠机', '警卫员', '荣成', '威海',
  '国家使命', '民族脊梁', '科学报国', '放弃优厚待遇', '回国',
];

const AIGC_KEYWORDS = ['AI复原', 'AI绘画', 'AI生成', '数字人', 'AI视频'];
const HUMAN_KEYWORDS = ['纪录片', '历史照片', '亲历者', '口述', '档案'];

const NARRATIVE_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateAnalysisResult(isAigc: boolean): AnalysisResult {
  const d3 = isAigc ? randomFloat(2, 5) : randomFloat(4, 6);
  const d2_arousal = isAigc ? randomFloat(0.5, 0.9) : randomFloat(0.3, 0.7);
  const d5 = isAigc ? randomFloat(3, 6) : randomFloat(5, 8);

  return {
    d1: randomFloat(3, 9),
    d2_valence: randomFloat(-0.3, 0.9),
    d2_arousal,
    d3,
    d4: randomInt(1, 5),
    d5,
    d6: isAigc ? randomInt(0, 2) : randomInt(0, 1),
    narrative_type: randomChoice(NARRATIVE_TYPES),
    labov_weights: Array.from({ length: 6 }, () => randomFloat(0, 0.5)),
    risk_level: randomChoice(['safe', 'safe', 'safe', 'low', 'low', 'medium', 'high'] as const),
    evidence_keywords: [
      { word: randomChoice(GUO_YONGHUAI_KEYWORDS), weight: randomFloat(0.2, 0.5), dimension: 'd3' },
      { word: randomChoice([...GUO_YONGHUAI_KEYWORDS, ...AIGC_KEYWORDS]), weight: randomFloat(0.1, 0.4), dimension: 'd1' },
    ],
    model_version: 'mimo-v2.5-pro',
  };
}

const COMMENT_TEMPLATES = [
  '郭永怀先生放弃美国优厚待遇回国，这种精神太感人了，泪目',
  '两弹一星的功臣，民族脊梁！致敬！',
  '永怀精神永垂不朽，我们要传承这种爱国精神',
  '用AI复原了郭永怀坠机瞬间，太震撼了',
  '作为荣成人，为有这样的老乡感到骄傲',
  '科学家才是真正的明星，不是那些流量明星',
  '看到纪录片哭了，这才是我们应该追的星',
  '希望更多年轻人了解这段历史',
  '爱国不是口号，是行动，郭永怀就是最好的证明',
  '钱学森、郭永怀……那一代人太伟大了',
  'AI画的郭永怀肖像好逼真，科技的力量',
  '历史不应该被遗忘，致敬所有默默奉献的科学家',
  '每次看到坠机那段都忍不住流泪',
  '这就是中国精神！不怕牺牲，勇往直前',
  '威海荣成出英雄，为家乡骄傲',
  '建议把永怀事迹写入教材，让更多孩子知道',
  '数字人复原技术让历史人物"活"过来了',
  '真正的偶像应该是这样的科学家',
  '从美国回来的决定需要多大的勇气啊',
  '两弹一星精神是中华民族的宝贵财富',
  '看到这些老照片，仿佛穿越回那个年代',
  '郭永怀和警卫员紧紧抱在一起保护资料的画面太震撼了',
  '这才是真正的国家脊梁',
  '比起那些娱乐明星，科学家更值得我们关注',
  'AI技术让红色文化有了新的传播方式',
  '希望这种正能量能传递给更多人',
  '致敬！向所有为国家默默奉献的人',
  '有时候会想，如果他们还活着会怎么看现在的中国',
  '这种精神在任何时代都不过时',
  '从小事做起，传承永怀精神',
];

function generateComment(postId: string, index: number, projectId?: string): Comment {
  const pid = projectId || DEMO_PROJECT_ID;
  const likes = index < 5 ? randomInt(100, 500) : index < 15 ? randomInt(10, 100) : randomInt(0, 10);
  const samplingTier = likes >= 100 ? 'high' : likes >= 10 ? 'mid' : 'low';
  const isSampled = samplingTier === 'high' || Math.random() < (samplingTier === 'mid' ? 0.5 : 0.3);
  const isAigc = Math.random() > 0.6;

  return {
    id: `demo-comment-${postId}-${String(index + 1).padStart(3, '0')}`,
    post_id: postId,
    project_id: pid,
    text: COMMENT_TEMPLATES[index % COMMENT_TEMPLATES.length] + (index > 19 ? ` (评论${index + 1})` : ''),
    likes,
    sampling_tier: samplingTier,
    is_sampled: isSampled,
    analysis: generateAnalysisResult(isAigc),
    is_empty: false,
    is_offensive: false,
    is_ad: false,
    is_irrelevant: false,
    human_corrected: null,
    created_at: new Date(Date.now() - randomInt(0, 30 * 24 * 60 * 60 * 1000)).toISOString(),
  };
}

const POST_TITLES_XHS = [
  'AI复原郭永怀先生音容笑貌，致敬两弹一星元勋',
  '两弹一星背后的感人故事：郭永怀的爱国情怀',
  '用数字技术重现永怀精神',
  '荣成骄傲：科学家郭永怀的传奇人生',
  '郭永怀放弃美国优厚待遇回国的真相',
  'AI绘画致敬郭永怀：民族脊梁',
  '从郭永怀看中国科学家的爱国精神',
  '两弹一星元勋郭永怀：用生命守护国家机密',
  '永怀精神代代传：青少年爱国主义教育',
  '数字人技术让历史人物"活"起来',
  '郭永怀与钱学森的深厚友谊',
  '威海荣成走出的两弹一星功臣',
  '郭永怀坠机瞬间：用身体保护绝密资料',
  'AI视频还原郭永怀归国之路',
  '致敬！那些为国默默奉献的科学家们',
  '从郭永怀看新中国成立初期的科学家群像',
  '红色文化的数字化传承与创新',
  '两弹一星精神在新时代的传承',
  '郭永怀：被遗忘的两弹一星元勋',
  '用AI技术讲述红色故事',
];

const POST_TITLES_BILIBILI = [
  '【纪录片】郭永怀：两弹一星背后的英雄',
  '用AI复原郭永怀先生，弹幕破防了',
  '两弹一星元勋郭永怀的故事，看哭了',
  '郭永怀放弃美国优厚待遇回国的真实原因',
  '【科普】郭永怀对中国航天的贡献',
  'AI数字人复原郭永怀，技术与情怀的碰撞',
  '郭永怀与警卫员：用生命守护国家机密',
  '从郭永怀看老一辈科学家的爱国情怀',
  '两弹一星精神：永不磨灭的丰碑',
  '【二创】永怀精神混剪，泪目',
];

export function generateDemoProject(realProjectId?: string): { project?: Project; posts: Post[]; comments: Comment[] } {
  const projectId = realProjectId || DEMO_PROJECT_ID;

  const project: Project | undefined = realProjectId ? undefined : {
    id: DEMO_PROJECT_ID,
    name: '郭永怀数字记忆监测 Demo',
    keyword: '郭永怀',
    description: '基于郭永怀主题的数字记忆传播监测演示项目，包含小红书和B站的模拟数据。',
    status: 'active',
    sampling_config: {
      high_likes_threshold: 100,
      high_likes_retention: 1.0,
      mid_likes_retention: 0.5,
      low_likes_retention: 0.3,
      batch_size: 10,
    },
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const posts: Post[] = [];
  const comments: Comment[] = [];

  // Generate 15 XHS posts
  for (let i = 0; i < 15; i++) {
    const isAigc = i < 8;
    const post: Post = {
      id: DEMO_POST_IDS[i],
      project_id: projectId,
      platform: 'xhs',
      title: POST_TITLES_XHS[i],
      content: `${POST_TITLES_XHS[i]}的详细内容...`,
      author_id_hash: `hash-xhs-${i}`,
      author_name_mask: `用户${String.fromCharCode(65 + i)}***`,
      likes: randomInt(50, 2000),
      comments_count: randomInt(10, 100),
      shares: randomInt(5, 200),
      is_aigc: isAigc,
      aigc_type: isAigc ? randomChoice(['ai_image', 'ai_video', 'ai_text'] as const) : randomChoice(['human_image', 'human_video', 'human_text'] as const),
      narrative_type: randomChoice(NARRATIVE_TYPES),
      url: `https://www.xiaohongshu.com/explore/demo-${i}`,
      publish_time: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000).toISOString(),
      collected_at: new Date().toISOString(),
      collected_by: 'demo',
      analysis_status: 'completed',
    };
    posts.push(post);

    // Generate 80-120 comments per post
    const commentCount = randomInt(80, 120);
    for (let j = 0; j < commentCount; j++) {
      comments.push(generateComment(post.id, j, projectId));
    }
  }

  // Generate 5 Bilibili posts
  for (let i = 0; i < 5; i++) {
    const post: Post = {
      id: DEMO_POST_IDS[15 + i],
      project_id: projectId,
      platform: 'bilibili',
      title: POST_TITLES_BILIBILI[i],
      content: `${POST_TITLES_BILIBILI[i]}的详细内容...`,
      author_id_hash: `hash-bili-${i}`,
      author_name_mask: `UP主${String.fromCharCode(65 + i)}***`,
      likes: randomInt(500, 10000),
      comments_count: randomInt(50, 500),
      shares: randomInt(10, 500),
      is_aigc: i < 2,
      aigc_type: i < 2 ? 'ai_video' : 'human_video',
      narrative_type: randomChoice(NARRATIVE_TYPES),
      url: `https://www.bilibili.com/video/demo-${i}`,
      publish_time: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000).toISOString(),
      collected_at: new Date().toISOString(),
      collected_by: 'demo',
      analysis_status: 'completed',
    };
    posts.push(post);

    const commentCount = randomInt(100, 200);
    for (let j = 0; j < commentCount; j++) {
      comments.push(generateComment(post.id, j, projectId));
    }
  }

  return { project, posts, comments };
}

// Pre-computed stats for demo
export function computeDemoStats(posts: Post[], comments: Comment[]) {
  const totalPosts = posts.length;
  const totalComments = comments.length;
  const aigcPosts = posts.filter((p) => p.is_aigc).length;
  const humanPosts = totalPosts - aigcPosts;
  const sampledComments = comments.filter((c) => c.is_sampled && c.analysis);
  const highRiskCount = comments.filter((c) => c.analysis?.risk_level === 'high').length;

  const avgDimensions = {
    d1: sampledComments.reduce((sum, c) => sum + (c.analysis?.d1 || 0), 0) / sampledComments.length,
    d2_valence: sampledComments.reduce((sum, c) => sum + (c.analysis?.d2_valence || 0), 0) / sampledComments.length,
    d2_arousal: sampledComments.reduce((sum, c) => sum + (c.analysis?.d2_arousal || 0), 0) / sampledComments.length,
    d3: sampledComments.reduce((sum, c) => sum + (c.analysis?.d3 || 0), 0) / sampledComments.length,
    d4: sampledComments.reduce((sum, c) => sum + (c.analysis?.d4 || 0), 0) / sampledComments.length,
    d5: sampledComments.reduce((sum, c) => sum + (c.analysis?.d5 || 0), 0) / sampledComments.length,
    d6: sampledComments.reduce((sum, c) => sum + (c.analysis?.d6 || 0), 0) / sampledComments.length,
  };

  const narrativeDistribution = NARRATIVE_TYPES.reduce(
    (acc, type) => {
      acc[type] = comments.filter((c) => c.analysis?.narrative_type === type).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    totalPosts,
    totalComments,
    aigcPosts,
    humanPosts,
    sampledComments: sampledComments.length,
    highRiskCount,
    avgDimensions,
    narrativeDistribution,
    aigcRatio: aigcPosts / totalPosts,
  };
}
