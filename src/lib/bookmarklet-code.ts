// OutEye Bookmarklet - 完全内联版本
// 格式: javascript:(function(){...})()
// 转义规则: 模板 literal 中 \\w → 字符串 \w → 执行时正则 \w

const SB_URL = 'https://qzrvorvokbbzxqpxdyhb.supabase.co';
const SB_KEY = 'sb_publishable_-P42C_cGzAazdFX6sVnISw_Yy1DjJ3p';

// Bookmarklet: 拖拽到书签栏用的 javascript: URL
// IIFE 包裹, 单行, 无外部依赖
export const BOOKMARKLET_URL = `javascript:(function(){var u='${SB_URL}',k='${SB_KEY}';function T(m,t){var e=document.getElementById('_oe_t');if(!e){e=document.createElement('div');e.id='_oe_t';e.style.cssText='position:fixed;bottom:20px;right:20px;z-index:999999;padding:14px 18px;border-radius:10px;font:14px/1.5 system-ui,sans-serif;max-width:360px;box-shadow:0 6px 24px rgba(0,0,0,.4);';document.body.appendChild(e)}e.style.background=t==='ok'?'#10B981':t==='err'?'#EF4444':t==='warn'?'#F59E0B':'#1E293B';e.style.color='#fff';e.textContent=m;setTimeout(function(){e.remove()},3000)}var h=location.href,p,s,m2,url=h;if(h.indexOf('bilibili.com/video')>-1||h.indexOf('b23.tv')>-1){p='bilibili';m2=h.match(/(BV\\w+)/);s=m2?m2[1]:null}else if(h.indexOf('xiaohongshu.com')>-1||h.indexOf('xhslink.com')>-1){p='xhs';m2=h.match(/\\/explore\\/([a-f0-9]+)/)||h.match(/\\/discovery\\/item\\/([a-f0-9]+)/);s=m2?m2[1]:null}else{T('\\u8BF7\\u5728B\\u7AD9\\u89C6\\u9891\\u6216\\u5C0F\\u7EA2\\u4E66\\u7B14\\u8BB0\\u9875\\u9762\\u4F7F\\u7528','warn');return}if(!s){T('\\u65E0\\u6CD5\\u8BC6\\u522B\\u9875\\u9762ID','err');return}T('OutEye \\u6B63\\u5728\\u91C7\\u96C6...','info');var cs=[];if(p==='bilibili'){document.querySelectorAll('.reply-item,.reply-item-wrap').forEach(function(i){var t=i.querySelector('.reply-content,.text'),l=i.querySelector('.like-count,.reply-like .count');var txt=t?t.textContent.trim():'';if(!txt)return;cs.push({text:txt,likes:parseInt(l?l.textContent.replace(/[^\\d]/g,''):'0')||0,rpid:i.getAttribute('data-rpid')||null})})}else{document.querySelectorAll('.comment-item,.note-comment-item,[class*="commentItem"]').forEach(function(i){var t=i.querySelector('.content,.comment-text,[class*="content"]'),l=i.querySelector('.like-count,.count,[class*="like"] span');var txt=t?t.textContent.trim():'';if(!txt)return;cs.push({text:txt,likes:parseInt(l?l.textContent.replace(/[^\\d]/g,''):'0')||0,rpid:null})})}if(!cs.length){T('\\u672A\\u68C0\\u6D4B\\u5230\\u8BC4\\u8BBA\\uFF0C\\u8BF7\\u5148\\u5411\\u4E0B\\u6EDA\\u52A0\\u8F7D','warn');return}var seen={},uni=[];cs.forEach(function(c){var k2=c.rpid||c.text+'_'+c.likes;if(!seen[k2]){seen[k2]=1;uni.push(c)}});var rows=uni.map(function(c){return{platform:p,source_id:s,source_url:url,text:c.text,likes:c.likes,rpid:c.rpid||null,collected_by:'bookmarklet'}});fetch(u+'/rest/v1/raw_comments',{method:'POST',headers:{'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(rows)}).then(function(r){if(r.ok)T('\\u5DF2\\u91C7\\u96C6 '+rows.length+' \\u6761\\u8BC4\\u8BBA\\uFF0C\\u5DF2\\u81EA\\u52A8\\u5165\\u5E93','ok');else throw new Error(r.status)}).catch(function(){try{navigator.clipboard.writeText(JSON.stringify(rows,null,2));T('\\u5DF2\\u91C7\\u96C6 '+rows.length+' \\u6761\\uFF0CJSON\\u5DF2\\u590D\\u5236\\u3002\\u8BF7\\u56DE\\u5230OutEye\\u5E73\\u53F0\\u7C98\\u8D34\\u5BFC\\u5165','ok')}catch(e){var w=window.open('','_blank');w.document.write('<pre>'+JSON.stringify(rows,null,2)+'</pre>');T('\\u5DF2\\u91C7\\u96C6 '+rows.length+' \\u6761\\uFF0C\\u8BF7\\u4ECE\\u5F39\\u51FA\\u7A97\\u53E3\\u590D\\u5236JSON','warn')}})})()`;

// Console 脚本: F12 粘贴执行的多行可读版
export function getConsoleScript(): string {
  return `(function() {
  'use strict';
  var u = '${SB_URL}', k = '${SB_KEY}';

  // Toast 提示
  function T(msg, type) {
    var el = document.getElementById('_oe_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_oe_toast';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:14px 18px;border-radius:10px;font:14px/1.5 system-ui,sans-serif;max-width:360px;box-shadow:0 6px 24px rgba(0,0,0,.4);';
      document.body.appendChild(el);
    }
    var bg = {ok:'#10B981', err:'#EF4444', warn:'#F59E0B', info:'#1E293B'};
    el.style.background = bg[type] || bg.info;
    el.style.color = '#fff';
    el.textContent = msg;
    if (type !== 'info') setTimeout(function() { el.remove(); }, 3000);
  }

  // 平台检测
  var h = location.href, p, s, m, url = h;
  if (h.indexOf('bilibili.com/video') > -1 || h.indexOf('b23.tv') > -1) {
    p = 'bilibili'; m = h.match(/(BV\\w+)/); s = m ? m[1] : null;
  } else if (h.indexOf('xiaohongshu.com') > -1 || h.indexOf('xhslink.com') > -1) {
    p = 'xhs'; m = h.match(/\\/explore\\/([a-f0-9]+)/) || h.match(/\\/discovery\\/item\\/([a-f0-9]+)/);
    s = m ? m[1] : null;
  } else {
    T('\\u8BF7\\u5728B\\u7AD9\\u89C6\\u9891\\u6216\\u5C0F\\u7EA2\\u4E66\\u7B14\\u8BB0\\u9875\\u9762\\u4F7F\\u7528', 'warn');
    return;
  }
  if (!s) { T('\\u65E0\\u6CD5\\u8BC6\\u522B\\u9875\\u9762ID', 'err'); return; }

  T('OutEye \\u6B63\\u5728\\u91C7\\u96C6...', 'info');

  // 提取评论
  var cs = [];
  if (p === 'bilibili') {
    document.querySelectorAll('.reply-item,.reply-item-wrap').forEach(function(i) {
      var t = i.querySelector('.reply-content,.text');
      var l = i.querySelector('.like-count,.reply-like .count');
      var txt = t ? t.textContent.trim() : '';
      if (!txt) return;
      cs.push({
        text: txt,
        likes: parseInt(l ? l.textContent.replace(/[^\\d]/g, '') : '0') || 0,
        rpid: i.getAttribute('data-rpid') || null
      });
    });
  } else {
    document.querySelectorAll('.comment-item,.note-comment-item,[class*="commentItem"]').forEach(function(i) {
      var t = i.querySelector('.content,.comment-text,[class*="content"]');
      var l = i.querySelector('.like-count,.count,[class*="like"] span');
      var txt = t ? t.textContent.trim() : '';
      if (!txt) return;
      cs.push({
        text: txt,
        likes: parseInt(l ? l.textContent.replace(/[^\\d]/g, '') : '0') || 0,
        rpid: null
      });
    });
  }

  if (!cs.length) {
    T('\\u672A\\u68C0\\u6D4B\\u5230\\u8BC4\\u8BBA\\uFF0C\\u8BF7\\u5148\\u5411\\u4E0B\\u6EDA\\u52A0\\u8F7D', 'warn');
    return;
  }

  // 去重
  var seen = {}, uni = [];
  cs.forEach(function(c) {
    var k2 = c.rpid || c.text + '_' + c.likes;
    if (!seen[k2]) { seen[k2] = 1; uni.push(c); }
  });

  var rows = uni.map(function(c) {
    return {
      platform: p, source_id: s, source_url: url,
      text: c.text, likes: c.likes,
      rpid: c.rpid || null, collected_by: 'bookmarklet'
    };
  });

  // 尝试直接入库，失败则复制到剪贴板
  fetch(u + '/rest/v1/raw_comments', {
    method: 'POST',
    headers: {
      'apikey': k,
      'Authorization': 'Bearer ' + k,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  }).then(function(r) {
    if (r.ok) {
      T('\\u5DF2\\u91C7\\u96C6 ' + rows.length + ' \\u6761\\u8BC4\\u8BBA\\uFF0C\\u5DF2\\u81EA\\u52A8\\u5165\\u5E93', 'ok');
    } else {
      throw new Error(r.status);
    }
  }).catch(function() {
    try {
      navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      T('\\u5DF2\\u91C7\\u96C6 ' + rows.length + ' \\u6761\\uFF0CJSON\\u5DF2\\u590D\\u5236\\u3002\\u8BF7\\u56DE\\u5230OutEye\\u5E73\\u53F0\\u7C98\\u8D34\\u5BFC\\u5165', 'ok');
    } catch (e) {
      var w = window.open('', '_blank');
      w.document.write('<pre>' + JSON.stringify(rows, null, 2) + '</pre>');
      T('\\u5DF2\\u91C7\\u96C6 ' + rows.length + ' \\u6761\\uFF0C\\u8BF7\\u4ECE\\u5F39\\u51FA\\u7A97\\u53E3\\u590D\\u5236JSON', 'warn');
    }
  });
})();`;
}
