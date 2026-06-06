#!/usr/bin/env python3
"""
生成合成演示数据 → data/

读取本机真实健康 / 屏幕数据，输出结构相同但数值合成的版本，
供 GitHub 公开展示使用。真实数值不会被写入仓库——本地后端
（server.mjs）始终直接读取本机真实数据。

用法：
    python3 scripts/generate-demo-data.py
    HEALTH_DATA_DIR=/path/to/data python3 scripts/generate-demo-data.py
"""
import json, random, os

random.seed(42)
DATA_DIR = os.environ.get('HEALTH_DATA_DIR', '/Users/zhangjiahui/Documents/黑客松/data')
SRC = os.path.join(DATA_DIR, 'processed')
DST = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'data'))


def synth(name, e):
    if not e.get('samples'):
        return
    if name == 'step_count':
        e['sumQty'] = float(random.randint(6000, 14000))
    elif name == 'walking_running_distance':
        e['sumQty'] = round(random.uniform(4, 11), 2)
    elif name == 'resting_heart_rate':
        x = float(random.randint(58, 74)); e['avgQty'] = e['minQty'] = e['maxQty'] = x
    elif name == 'heart_rate':
        lo = random.randint(52, 65); hi = random.randint(98, 145); avg = random.randint(lo + 6, 86)
        e['minQty'] = float(lo); e['maxQty'] = float(hi); e['avgQty'] = float(avg)
    elif name == 'heart_rate_variability':
        lo = random.uniform(38, 48); hi = lo + random.uniform(8, 20)
        e['minQty'] = round(lo, 1); e['maxQty'] = round(hi, 1); e['avgQty'] = round((lo + hi) / 2, 1)
    elif name == 'blood_oxygen_saturation':
        x = float(random.randint(96, 99)); e['avgQty'] = e['minQty'] = e['maxQty'] = x
    elif name == 'active_energy':
        e['sumQty'] = round(random.uniform(300, 2200), 1)
    elif name == 'apple_exercise_time':
        e['sumQty'] = float(random.randint(0, 60))


def main():
    # ---- 健康 ----
    h = json.load(open(os.path.join(SRC, 'autosync-summary.json')))
    h['sourceDir'] = '(demo, synthetic)'
    h['_demo'] = True
    h['_note'] = 'Synthetic demo data for public display — NOT real measurements.'
    h['metrics'].pop('weight_body_mass', None)  # 移除真实体成分

    for mname, m in h.get('metrics', {}).items():
        for dk, e in m.get('dates', {}).items():
            synth(mname, e)

    for dk, e in h['metrics'].get('sleep_analysis', {}).get('dates', {}).items():
        if e.get('samples'):
            y, mo, d = dk[:4], dk[4:6], dk[6:8]
            e['start'] = f'{y}-{mo}-{d}T15:30:00.000Z'  # CST 23:30
            e['end'] = f'{y}-{mo}-{d}T23:30:00.000Z'    # CST 07:30

    for w in h.get('workouts', {}).get('items', []):
        w['durationSeconds'] = round(random.uniform(1800, 14000), 1)
        w['activeEnergy'] = round(random.uniform(400, 3500), 1)
        if w.get('totalDistance') is not None:
            w['totalDistance'] = round(random.uniform(1.5, 6), 2)
    items = h.get('workouts', {}).get('items', [])
    if items:
        h['workouts']['totalDurationSeconds'] = round(sum(w['durationSeconds'] for w in items), 1)
        h['workouts']['totalActiveEnergy'] = round(sum(w['activeEnergy'] for w in items), 1)
        h['workouts']['totalDistance'] = round(sum((w.get('totalDistance') or 0) for w in items), 2)

    json.dump(h, open(os.path.join(DST, 'autosync-summary.json'), 'w'),
              ensure_ascii=False, separators=(',', ':'))

    # ---- 屏幕 ----
    s = json.load(open(os.path.join(SRC, 'screen-time-latest.json')))
    s['databasePath'] = '(demo, synthetic)'
    s['_demo'] = True
    s['_note'] = 'Synthetic demo data for public display — NOT real usage.'
    total = 0
    for a in s.get('apps', []):
        mins = round(random.uniform(3, 110), 1)
        a['durationMinutes'] = mins; a['durationSeconds'] = int(mins * 60); a['segmentCount'] = random.randint(1, 90)
        total += mins
    s['totalMinutes'] = round(total, 1); s['totalSeconds'] = int(total * 60)
    json.dump(s, open(os.path.join(DST, 'screen-time-latest.json'), 'w'),
              ensure_ascii=False, separators=(',', ':'))

    print('✓ 合成演示数据已写入', DST)


if __name__ == '__main__':
    main()
