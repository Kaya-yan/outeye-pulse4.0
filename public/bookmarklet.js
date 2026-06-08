// OutEye Bookmarklet - 完全自包含版本
// 这个文件是参考实现。实际 Bookmarklet 已内联在 P0 页面的 javascript: URL 中。
// 如需在 Console 中手动执行，请使用 P0 页面的"复制 Console 脚本"按钮。

(function() {
  'use strict';

  var SUPABASE_URL = 'https://qzrvorvokbbzxqpxdyhb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_-P42C_cGzAazdFX6sVnISw_Yy1DjJ3p';

  function toast(msg, type) {
    var el = document.getElementById('_oe_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_oe_toast';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:14px 18px;border-radius:10px;font:14px/1.5 system-ui,-apple-system,sans-serif;max-width:360px;box-shadow:0 6px 24px rgba(0,0,0,.4);transition:opacity .3s';
      document.body.appendChild(el);
    }
    var colors = {
      ok: 'background:#10B981;color:#fff',
      err: 'background:#EF4444;color:#fff',
      warn: 'background:#F59E0B;color:#fff',
      info: 'background:#1E293B;color:#F8FAFC'
    };
    el.style.cssText += ';' + (colors[type] || colors.info);
    el.textContent = msg;
    el.style.opacity = '1';
    if (type !== 'info') {
      setTimeout(function() {
        el.style.opacity = '0';
        setTimeout(function() { el.remove(); }, 400);
      }, 3000);
    }
  }

  function detectPlatform() {
    var url = location.href;
    if (url.indexOf('bilibili.com/video') > -1 || url.indexOf('b23.tv') > -1) {
      var m = url.match(/(BV\w+)/);
      return { platform: 'bilibili', sourceId: m ? m[1] : null, sourceUrl: url };
    }
    if (url.indexOf('xiaohongshu.com') > -1 || url.indexOf('xhslink.com') > -1) {
      var m = url.match(/\/explore\/([a-f0-9]+)/) || url.match(/\/discovery\/item\/([a-f0-9]+)/);
      return { platform: 'xhs', sourceId: m ? m[1] : null, sourceUrl: url };
    }
    return null;
  }

  function extractBilibiliComments() {
    var comments = [];
    document.querySelectorAll('.reply-item, .reply-item-wrap').forEach(function(item) {
      var textEl = item.querySelector('.reply-content, .text');
      var likesEl = item.querySelector('.like-count, .reply-like .count');
      var userEl = item.querySelector('.reply-list .user-name, .name');
      var rpid = item.getAttribute('data-rpid') || (item.id ? item.id.replace('reply-', '') : '');
      var text = textEl ? textEl.textContent.trim() : '';
      if (!text) return;
      comments.push({
        text: text,
        likes: parseInt(likesEl ? likesEl.textContent.replace(/[^\d]/g, '') : '0') || 0,
        rpid: rpid || null,
        username: userEl ? userEl.textContent.trim() : ''
      });
    });
    return comments;
  }

  function extractXHSComments() {
    var comments = [];
    document.querySelectorAll('.comment-item, .note-comment-item, [class*="commentItem"]').forEach(function(item) {
      var textEl = item.querySelector('.content, .comment-text, [class*="content"]');
      var likesEl = item.querySelector('.like-count, .count, [class*="like"] span');
      var userEl = item.querySelector('.name, .nickname, [class*="name"]');
      var text = textEl ? textEl.textContent.trim() : '';
      if (!text) return;
      comments.push({
        text: text,
        likes: parseInt(likesEl ? likesEl.textContent.replace(/[^\d]/g, '') : '0') || 0,
        rpid: null,
        username: userEl ? userEl.textContent.trim() : ''
      });
    });
    return comments;
  }

  var info = detectPlatform();
  if (!info) {
    toast('请在B站视频或小红书笔记页面使用', 'warn');
    return;
  }

  toast('OutEye 正在采集...', 'info');

  var comments = info.platform === 'bilibili' ? extractBilibiliComments() : extractXHSComments();
  if (comments.length === 0) {
    toast('未检测到评论，请先向下滚动加载评论', 'warn');
    return;
  }

  var seen = {};
  var unique = [];
  comments.forEach(function(c) {
    var key = c.rpid || (c.text + '_' + c.likes);
    if (!seen[key]) { seen[key] = 1; unique.push(c); }
  });

  var rows = unique.map(function(c) {
    return {
      platform: info.platform,
      source_id: info.sourceId,
      source_url: info.sourceUrl,
      text: c.text,
      likes: c.likes,
      rpid: c.rpid || null,
      collected_by: 'bookmarklet'
    };
  });

  fetch(SUPABASE_URL + '/rest/v1/raw_comments', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  }).then(function(resp) {
    if (resp.ok) {
      toast('已采集 ' + rows.length + ' 条评论，已自动入库', 'ok');
    } else {
      throw new Error('HTTP ' + resp.status);
    }
  }).catch(function() {
    try {
      navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      toast('已采集 ' + rows.length + ' 条，JSON已复制到剪贴板。请回到OutEye平台粘贴导入', 'ok');
    } catch (e) {
      var w = window.open('', '_blank');
      w.document.write('<pre>' + JSON.stringify(rows, null, 2) + '</pre>');
      toast('已采集 ' + rows.length + ' 条，请从弹出窗口复制JSON', 'warn');
    }
  });
})();
