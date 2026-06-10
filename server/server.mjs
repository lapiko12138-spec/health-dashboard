#!/usr/bin/env node
/**
 * 健康板块 · 本地 API 后端
 * 零依赖（Node 原生 http），实时读取本机健康 / 屏幕数据。
 *
 * 路由：
 *   GET  /api/health          → autosync-summary.json（Apple Health 摘要）
 *   GET  /api/screen          → screen-time-latest.json（今日屏幕使用）
 *   GET  /api/screen-history  → 近 14 日屏幕时长（查 SQLite）
 *   GET  /api/status          → 后端 / 数据源状态
 *   POST /api/refresh         → 触发本地刷新脚本（best-effort）
 *   其它                      → 静态服务仓库根（index.html、data/ 等）
 *
 * 数据目录可用环境变量 HEALTH_DATA_DIR 覆盖，端口用 PORT 覆盖。
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');                       // 仓库根：index.html, data/
const DATA_DIR = process.env.HEALTH_DATA_DIR || '/Users/zhangjiahui/Documents/黑客松/data';
const PROC = path.join(DATA_DIR, 'processed');
const SQLITE = path.join(DATA_DIR, 'agent-context.sqlite');
const HEALTH_ROOT = path.resolve(DATA_DIR, '..');                 // 刷新脚本（npm run）所在目录
const PORT = process.env.PORT || 4173;

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8',
};

function send(res, code, body, type='application/json; charset=utf-8'){
  res.writeHead(code, {'Content-Type':type, 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store'});
  res.end(body);
}
async function sendJSONFile(res, fp){
  try { send(res, 200, await readFile(fp)); }
  catch(e){ send(res, 404, JSON.stringify({error:'数据文件不存在', file:path.basename(fp)})); }
}
function sqliteJSON(sql){
  return new Promise((resolve, reject)=>{
    execFile('sqlite3', ['-cmd','.timeout 5000', SQLITE, '-json', sql],
      {timeout:8000, maxBuffer:16*1024*1024},
      (err, stdout)=>{
        if(err) return reject(err);
        try { resolve(JSON.parse(stdout || '[]')); } catch(e){ resolve([]); }
      });
  });
}
function runRefresh(){
  return new Promise((resolve)=>{
    execFile('npm', ['run','health:summarize-autosync'], {cwd:HEALTH_ROOT, timeout:60000}, ()=>{
      execFile('npm', ['run','screen:sample'], {cwd:HEALTH_ROOT, timeout:60000}, ()=>resolve());
    });
  });
}

// ── Sleep score API ──────────────────────────────────────────────────────────
const SLEEP_DIR = `${process.env.HOME}/Library/Mobile Documents/iCloud~com~ifunography~HealthExport/Documents/AutoSync/HealthMetrics/sleep_analysis`;
const APPLE_EPOCH_MS = new Date('2001-01-01T00:00:00Z').getTime();
let sleepCache = null;
const SLEEP_CACHE_TTL = 5 * 60 * 1000;

function decodeHae(filePath) {
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'hae-')), 'out.json');
  try {
    execFileSync('compression_tool', ['-decode','-a','lzfse','-i',filePath,'-o',tmp],
      { stdio:'ignore', timeout:5000 });
    return (JSON.parse(readFileSync(tmp,'utf8')).data) ?? [];
  } catch { return []; }
  finally { try { rmSync(path.dirname(tmp),{recursive:true}); } catch {} }
}

function calcSleepScore(hrs) {
  if (hrs === null || hrs < 2 || hrs > 13) return null;
  if (hrs >= 7 && hrs <= 9)  return Math.min(100, Math.round(85 + (hrs-7)/2*15));
  if (hrs >= 6 && hrs < 7)   return Math.round(70 + (hrs-6)*15);
  if (hrs >= 5 && hrs < 6)   return Math.round(55 + (hrs-5)*15);
  if (hrs >= 4 && hrs < 5)   return Math.round(40 + (hrs-4)*15);
  if (hrs >= 2 && hrs < 4)   return Math.round(20 + (hrs-2)*10);
  if (hrs > 9 && hrs <= 13)  return Math.max(60, Math.round(85 - (hrs-9)*6));
  return null;
}

function buildSleepData() {
  let files = [];
  try { files = readdirSync(SLEEP_DIR).filter(f=>f.endsWith('.hae')).sort(); }
  catch { return { days:[], latest:null }; }

  const seen = new Set(), allSamples = [];
  for (const f of files) {
    for (const s of decodeHae(path.join(SLEEP_DIR, f))) {
      const k = `${s.start}-${s.end}`;
      if (!seen.has(k)) { seen.add(k); allSamples.push(s); }
    }
  }

  const byDate = {};
  for (const s of allSamples) {
    const ts = s.end ?? s.start; if (!ts) continue;
    const cstDate = new Date(APPLE_EPOCH_MS + ts*1000 + 8*3600000).toISOString().slice(0,10);
    if (!byDate[cstDate]) byDate[cstDate] = { total:0, deep:0, rem:0, core:0, awake:0 };
    const d = byDate[cstDate];
    d.total += s.totalSleep ?? 0;
    d.deep  += s.deep   ?? 0;
    d.rem   += s.rem    ?? 0;
    d.core  += s.core   ?? 0;
    d.awake += s.awake  ?? 0;
  }

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate()-i);
    const key = dt.toISOString().slice(0,10);
    const entry = byDate[key];
    const hrs = entry ? Math.round(entry.total*10)/10 : null;
    days.push({
      date: `${dt.getMonth()+1}/${String(dt.getDate()).padStart(2,'0')}`,
      hrs, score: calcSleepScore(hrs),
      stages: entry ? {
        deep:  Math.round(entry.deep*10)/10,
        rem:   Math.round(entry.rem*10)/10,
        core:  Math.round(entry.core*10)/10,
        awake: Math.round(entry.awake*10)/10,
      } : null,
    });
  }
  const latest = [...days].reverse().find(d=>d.score!==null) ?? null;
  return { days, latest };
}

const server = http.createServer(async (req, res)=>{
  const p = new URL(req.url, 'http://localhost').pathname;
  try {
    if(p === '/api/health') return sendJSONFile(res, path.join(PROC, 'autosync-summary.json'));
    if(p === '/api/screen'){
      const date = new URL(req.url, 'http://localhost').searchParams.get('date');
      if(!date) return sendJSONFile(res, path.join(PROC, 'screen-time-latest.json'));
      const safe = date.replace(/[^0-9-]/g, '');               // 防注入：只留数字与连字符
      const rows = await sqliteJSON(
        "SELECT app_name, bundle_id, duration_seconds, segment_count, first_seen_at, last_seen_at "+
        "FROM screen_time_daily_app_summary WHERE local_date = '"+safe+"' ORDER BY duration_seconds DESC;");
      const totalSeconds = rows.reduce((a,r)=>a+(r.duration_seconds||0), 0);
      const apps = rows.map(r=>({
        appName:r.app_name, bundleId:r.bundle_id,
        durationSeconds:r.duration_seconds, durationMinutes:+(r.duration_seconds/60).toFixed(1),
        segmentCount:r.segment_count, firstSeenAt:r.first_seen_at, lastSeenAt:r.last_seen_at,
      }));
      return send(res, 200, JSON.stringify({
        date:safe, timezone:'Asia/Shanghai', generatedAt:new Date().toISOString(),
        source:'sqlite-daily-summary', totalSeconds, totalMinutes:+(totalSeconds/60).toFixed(1), apps,
      }));
    }
    if(p === '/api/screen-history'){
      const days = await sqliteJSON(
        "SELECT local_date, SUM(duration_seconds) AS total_seconds, COUNT(DISTINCT app_name) AS app_count "+
        "FROM screen_time_daily_app_summary GROUP BY local_date ORDER BY local_date DESC LIMIT 14;");
      return send(res, 200, JSON.stringify({days}));
    }
    if(p === '/api/screen-dates'){
      const rows = await sqliteJSON("SELECT DISTINCT local_date FROM screen_time_daily_app_summary ORDER BY local_date;");
      return send(res, 200, JSON.stringify({dates:rows.map(r=>r.local_date)}));
    }
    if(p === '/api/status'){
      return send(res, 200, JSON.stringify({
        ok:true, dataDir:DATA_DIR, sqlite:existsSync(SQLITE),
        health:existsSync(path.join(PROC,'autosync-summary.json')),
        screen:existsSync(path.join(PROC,'screen-time-latest.json')),
        time:new Date().toISOString(),
      }));
    }
    if(p === '/api/refresh' && req.method === 'POST'){ await runRefresh(); return send(res, 200, JSON.stringify({refreshed:true})); }
    if(p === '/api/sleep-scores'){ const now=Date.now(); if(!sleepCache||now-sleepCache.ts>SLEEP_CACHE_TTL) sleepCache={ts:now,data:buildSleepData()}; return send(res, 200, JSON.stringify(sleepCache.data)); }

    // 静态文件（限制在仓库根内，防目录穿越）
    const rel = decodeURIComponent(p === '/' ? '/index.html' : p);
    const fp = path.normalize(path.join(ROOT, rel));
    if(fp !== ROOT && !fp.startsWith(ROOT + path.sep)) return send(res, 403, JSON.stringify({error:'forbidden'}));
    const st = await stat(fp).catch(()=>null);
    if(!st || !st.isFile()) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    return send(res, 200, await readFile(fp), MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
  } catch(e){
    send(res, 500, JSON.stringify({error:String((e && e.message) || e)}));
  }
});

server.listen(PORT, ()=>{
  console.log(`[健康板块] 本地后端运行中 → http://localhost:${PORT}`);
  console.log(`[健康板块] 数据目录：${DATA_DIR}`);
});
