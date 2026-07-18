(() => {
  'use strict'

  const HOST = 'new.chunithm-net.com'
  const STORAGE_KEY = 'beat-archive:chunithm-export:v1'
  const ROOT_ID = 'beat-archive-chunithm-exporter'
  const DIFFICULTIES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA']

  if (location.hostname !== HOST) {
    alert('このツールはCHUNITHM-NET上で実行してください。')
    return
  }

  const existing = document.getElementById(ROOT_ID)
  if (existing) {
    existing.hidden = false
    return
  }

  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const numberFrom = (value) => Number(String(value || '').replace(/[^\d]/g, '')) || 0
  const rankFor = (score) => {
    if (score >= 1009000) return 'SSS+'
    if (score >= 1007500) return 'SSS'
    if (score >= 1005000) return 'SS+'
    if (score >= 1000000) return 'SS'
    if (score >= 990000) return 'S+'
    if (score >= 975000) return 'S'
    return 'AAA以下'
  }

  const readStored = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const findText = (block, selectors) => {
    for (const selector of selectors) {
      const value = normalize(block.querySelector(selector)?.textContent)
      if (value) return value
    }
    return ''
  }

  const detectFrame = () => {
    const page = `${location.pathname} ${document.title} ${normalize(document.body.innerText)}`.toLowerCase()
    if (/new.song|new.frame|新曲枠|新曲対象/.test(page)) return 'new'
    if (/best.song|best.frame|ベスト枠|ベスト対象/.test(page)) return 'best'
    return null
  }

  const parseBlock = (block, pageFrame) => {
    const text = normalize(block.textContent)
    const classText = String(block.className || '')
    const difficultyFromClass = classText.match(/bg_(basic|advanced|expert|master|ultima)/i)?.[1]
    const difficultyFromText = DIFFICULTIES.find((value) => new RegExp(`\\b${value}\\b`, 'i').test(text))
    const difficulty = String(difficultyFromClass || difficultyFromText || '').toUpperCase()
    if (!DIFFICULTIES.includes(difficulty)) return null

    let title = findText(block, [
      '.music_title',
      '.music_title_block',
      '.music_name',
      '.musiclist_title',
      '.musiclist_box_title',
      '[class*="music"][class*="title"]',
    ])
    if (!title) {
      title = text
        .split(/SCORE|HIGH SCORE|LEVEL|Lv\.?|BASIC|ADVANCED|EXPERT|MASTER|ULTIMA/i)[0]
        .replace(/NEW!/gi, '')
        .trim()
    }

    const scoreMatch = text.match(/(?:HIGH\s*)?SCORE\s*[：:]\s*([\d,]+)/i)
    const levelMatch = text.match(/(?:LEVEL|Lv\.?)\s*[：:]?\s*(\d+(?:\.\d+)?\+?)/i)
    const score = numberFrom(scoreMatch?.[1])
    const level = normalize(levelMatch?.[1])
    if (!title || !level || score <= 0 || score > 1010000) return null

    let clear = 'CLEAR'
    if (/ALL\s*JUSTICE/i.test(text)) clear = 'ALL JUSTICE'
    else if (/FULL\s*COMBO/i.test(text)) clear = 'FULL COMBO'
    else if (/FAILED|未クリア/i.test(text)) clear = 'FAILED'

    const isNewSong = pageFrame === 'new' || /\bNEW!?\b|新曲/i.test(text)
    const sourceId = block.querySelector('input[name="idx"]')?.value
    return {
      id: normalize(sourceId) || `${title}::${difficulty}`,
      title,
      difficulty,
      level,
      score,
      rank: rankFor(score),
      clear,
      isNewSong,
      frame: pageFrame || (isNewSong ? 'new' : null),
    }
  }

  const collectVisible = () => {
    const pageFrame = detectFrame()
    const blocks = [...document.querySelectorAll('.musiclist_box, [class*="musiclist_box"]')]
    const found = blocks.map((block) => parseBlock(block, pageFrame)).filter(Boolean)
    const merged = new Map(readStored().map((score) => [score.id, score]))
    found.forEach((score) => merged.set(score.id, score))
    const scores = [...merged.values()]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
    return { added: found.length, total: scores.length }
  }

  const download = () => {
    const scores = readStored()
    if (!scores.length) {
      setStatus('保存できるデータがありません。先に「表示中ページを追加」を押してください。', true)
      return
    }
    const payload = {
      schema: 'beat-archive.chunithm.v1',
      exportedAt: new Date().toISOString(),
      version: normalize(document.querySelector('.player_data_version, [class*="version"]')?.textContent),
      scores,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `beat-archive-chunithm-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus(`${scores.length}譜面のJSONを保存しました。`)
  }

  const root = document.createElement('section')
  root.id = ROOT_ID
  root.innerHTML = `
    <style>
      #${ROOT_ID}{position:fixed;z-index:2147483647;left:10px;right:10px;bottom:10px;max-width:520px;margin:auto;padding:16px;border:1px solid rgba(255,184,46,.45);border-radius:16px;background:#111722;color:#f7f8fb;box-shadow:0 20px 70px rgba(0,0,0,.55);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;text-align:left}
      #${ROOT_ID} *{box-sizing:border-box} #${ROOT_ID} h2{font-size:18px;margin:0;color:#ffbd3b} #${ROOT_ID} p{margin:5px 0 13px;color:#aeb6c5;font-size:12px}
      #${ROOT_ID} .ba-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px} #${ROOT_ID} .ba-close{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:#293142;color:#fff;font-size:20px}
      #${ROOT_ID} .ba-count{padding:10px 12px;border-radius:9px;background:#0b1019;color:#fff;margin-bottom:10px} #${ROOT_ID} .ba-count strong{color:#ffbd3b}
      #${ROOT_ID} .ba-actions{display:grid;gap:8px} #${ROOT_ID} button{min-height:46px;border:0;border-radius:9px;font-weight:700}
      #${ROOT_ID} .ba-add{background:#ffbd3b;color:#17120a} #${ROOT_ID} .ba-save{background:#eef2f8;color:#111722} #${ROOT_ID} .ba-clear{min-height:38px;background:transparent;color:#ff8998;border:1px solid rgba(255,100,120,.25)}
      #${ROOT_ID} .ba-status{min-height:18px;margin:10px 0 0;color:#aeb6c5} #${ROOT_ID} .ba-status.ba-error{color:#ff8998}
    </style>
    <div class="ba-head"><div><h2>BEAT ARCHIVE</h2><p>CHUNITHM表示データ取込</p></div><button class="ba-close" aria-label="閉じる">×</button></div>
    <div class="ba-count">端末に保存済み：<strong>${readStored().length}譜面</strong></div>
    <div class="ba-actions">
      <button class="ba-add">表示中ページを追加</button>
      <button class="ba-save">JSONを保存</button>
      <button class="ba-clear">端末内の収集データを消去</button>
    </div>
    <p class="ba-status">一覧ページごとに「追加」を押してください。ページの自動巡回は行いません。</p>
  `
  document.body.appendChild(root)

  const setStatus = (message, error = false) => {
    const status = root.querySelector('.ba-status')
    status.textContent = message
    status.classList.toggle('ba-error', error)
    root.querySelector('.ba-count strong').textContent = `${readStored().length}譜面`
  }

  root.querySelector('.ba-close').addEventListener('click', () => { root.hidden = true })
  root.querySelector('.ba-add').addEventListener('click', () => {
    const result = collectVisible()
    if (!result.added) {
      setStatus('この画面ではスコア一覧を検出できませんでした。スコア一覧ページを開いてください。', true)
      return
    }
    setStatus(`表示中の${result.added}譜面を追加しました（合計${result.total}譜面）。`)
  })
  root.querySelector('.ba-save').addEventListener('click', download)
  root.querySelector('.ba-clear').addEventListener('click', () => {
    if (!confirm('CHUNITHM-NET内に保存した収集データを消去しますか？')) return
    localStorage.removeItem(STORAGE_KEY)
    setStatus('収集データを消去しました。')
  })
})()
