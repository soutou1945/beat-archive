(() => {
  'use strict'

  const HOST = 'new.chunithm-net.com'
  const STORAGE_KEY = 'beat-archive:chunithm-export:v1'
  const META_KEY = 'beat-archive:chunithm-meta:v1'
  const ROOT_ID = 'beat-archive-chunithm-exporter'
  const BASE = '/chuni-mobile/html/mobile/'
  const DIFFICULTIES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA']
  const DIFFICULTY_BY_NUMBER = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA']
  const WAIT_MS = 4000

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
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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

  const readMeta = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const capturePlayerRating = (doc) => {
    const selectors = [
      '.player_data_rating',
      '.player_rating',
      '.player_rating_num',
      '[class*="player"][class*="rating"]',
    ]
    for (const selector of selectors) {
      for (const element of doc.querySelectorAll(selector)) {
        const match = normalize(element.textContent).match(/(\d{1,2}(?:\.\d{1,2})?)/)
        const rating = Number(match?.[1])
        if (Number.isFinite(rating) && rating >= 0 && rating <= 100) {
          localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), playerRating: rating }))
          return rating
        }
      }
    }
    const labelMatch = normalize(doc.body?.textContent).match(/\bRATING\s*[：:]?\s*(\d{1,2}(?:\.\d{1,2})?)/i)
    const rating = Number(labelMatch?.[1])
    if (Number.isFinite(rating) && rating >= 0 && rating <= 100) {
      localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), playerRating: rating }))
      return rating
    }
    return null
  }

  const saveMerged = (found) => {
    const merged = new Map(readStored().map((score) => [score.id, score]))
    found.forEach((score) => {
      const previous = merged.get(score.id)
      merged.set(score.id, {
        ...previous,
        ...score,
        frame: score.frame || previous?.frame || null,
        isNewSong: Boolean(score.isNewSong || previous?.isNewSong),
      })
    })
    const scores = [...merged.values()]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
    return scores
  }

  const findText = (block, selectors) => {
    for (const selector of selectors) {
      const value = normalize(block.querySelector(selector)?.textContent)
      if (value) return value
    }
    return ''
  }

  const difficultyFromBlock = (block, forcedDifficulty) => {
    if (DIFFICULTIES.includes(forcedDifficulty)) return forcedDifficulty
    const inputDifficulty = Number(block.querySelector('input[name="diff"]')?.value)
    if (Number.isInteger(inputDifficulty) && DIFFICULTY_BY_NUMBER[inputDifficulty]) {
      return DIFFICULTY_BY_NUMBER[inputDifficulty]
    }
    const classText = `${block.className || ''} ${block.parentElement?.className || ''}`
    const fromClass = classText.match(/bg_(basic|advanced|expert|master|ultima)/i)?.[1]
    if (fromClass) return fromClass.toUpperCase()
    const text = normalize(block.textContent)
    return DIFFICULTIES.find((value) => new RegExp(`\\b${value}\\b`, 'i').test(text)) || ''
  }

  const parseBlock = (block, { difficulty: forcedDifficulty = '', frame = null } = {}) => {
    const text = normalize(block.textContent)
    const difficulty = difficultyFromBlock(block, forcedDifficulty)
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

    const scoreText = findText(block, [
      '.play_musicdata_highscore span',
      '.play_musicdata_highscore',
      'span.text_b',
      '[class*="highscore"]',
    ])
    const scoreMatch = `${scoreText} ${text}`.match(/(?:HIGH\s*)?SCORE\s*[：:]?\s*([\d,]{6,9})|([\d,]{6,9})/)
    const score = numberFrom(scoreMatch?.[1] || scoreMatch?.[2])

    const levelText = findText(block, [
      '.music_lv',
      '.music_level',
      '.play_musicdata_lv',
      '[class*="music"][class*="level"]',
      '[class*="music"][class*="_lv"]',
    ])
    const levelMatch = levelText.match(/(\d{1,2}(?:\.\d+)?\+?)/)
      || text.match(/(?:LEVEL|Lv\.?)\s*[：:]?\s*(\d{1,2}(?:\.\d+)?\+?)/i)
    const level = normalize(levelMatch?.[1]) || '?'
    if (!title || score <= 0 || score > 1010000) return null

    const iconSources = [...block.querySelectorAll('.play_musicdata_icon img, img')]
      .map((image) => String(image.getAttribute('src') || '').toLowerCase())
      .join(' ')
    let clear = 'CLEAR'
    if (/alljustice|all_justice/.test(iconSources) || /ALL\s*JUSTICE/i.test(text)) clear = 'ALL JUSTICE'
    else if (/fullcombo|full_combo/.test(iconSources) || /FULL\s*COMBO/i.test(text)) clear = 'FULL COMBO'
    else if (/failed|未クリア/i.test(text)) clear = 'FAILED'

    const isNewSong = frame === 'new' || /\bNEW!?\b|新曲/i.test(text)
    const sourceId = normalize(block.querySelector('input[name="idx"]')?.value)
    return {
      id: sourceId ? `${sourceId}::${difficulty}` : `${title}::${difficulty}`,
      title,
      difficulty,
      level,
      score,
      rank: rankFor(score),
      clear,
      isNewSong,
      frame: frame || (isNewSong ? 'new' : null),
    }
  }

  const parseMusicList = (doc, difficulty, frame = null) => {
    const blocks = [...doc.querySelectorAll('.musiclist_box, [class*="musiclist_box"]')]
    return blocks.map((block) => parseBlock(block, { difficulty, frame })).filter(Boolean)
  }

  const parseRatingPage = (doc, frame) => {
    const forms = [...doc.querySelectorAll('.w420 > .box05 > form, .box05 form')]
    return forms.map((form) => parseBlock(form, { frame })).filter(Boolean)
  }

  const fetchDocument = async (path, options = {}) => {
    const response = await fetch(new URL(path, location.origin), {
      credentials: 'include',
      redirect: 'follow',
      ...options,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if (
      /\/login\//.test(response.url)
      || doc.querySelector('input[type="password"]')
      || /ログインしてください/.test(normalize(doc.body?.textContent))
    ) {
      throw new Error('ログインが切れています')
    }
    return doc
  }

  const difficultyRequest = async (difficulty) => {
    const doc = await fetchDocument(`${BASE}record/musicGenre/${difficulty.toLowerCase()}`)
    const scores = parseMusicList(doc, difficulty)
    if (!scores.length) throw new Error('楽曲一覧を検出できません')
    return scores
  }

  const collectVisible = () => {
    const found = parseMusicList(document)
    const scores = saveMerged(found)
    return { added: found.length, total: scores.length }
  }

  let running = false
  const collectAutomatically = async () => {
    if (running) return
    running = true
    setBusy(true)
    const warnings = []
    let collected = 0
    setStatus('プレイヤーレートを取得中：プレイヤー情報')
    try {
      const playerDoc = await fetchDocument(`${BASE}home/playerData`)
      const playerRating = capturePlayerRating(playerDoc)
      if (playerRating === null) throw new Error('レートを検出できません')
    } catch (error) {
      warnings.push(`プレイヤーレート: ${error instanceof Error ? error.message : '取得失敗'}`)
    }
    await wait(WAIT_MS)
    const tasks = [
      ...DIFFICULTIES.map((difficulty) => ({
        label: difficulty,
        run: () => difficultyRequest(difficulty),
      })),
      {
        label: 'ベスト枠',
        run: async () => parseRatingPage(
          await fetchDocument(`${BASE}home/playerData/ratingDetailBest/`),
          'best',
        ),
      },
      {
        label: '新曲枠',
        run: async () => parseRatingPage(
          await fetchDocument(`${BASE}home/playerData/ratingDetailRecent/`),
          'new',
        ),
      },
      {
        label: '候補枠',
        run: async () => parseRatingPage(
          await fetchDocument(`${BASE}home/playerData/ratingDetailNext/`),
          null,
        ),
      },
    ]

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index]
      setStatus(`取得中 ${index + 1}/${tasks.length}：${task.label}`)
      try {
        const found = await task.run()
        saveMerged(found)
        collected += found.length
        if (!found.length) warnings.push(`${task.label}: データなし`)
      } catch (error) {
        warnings.push(`${task.label}: ${error instanceof Error ? error.message : '取得失敗'}`)
      }
      if (index < tasks.length - 1) await wait(WAIT_MS)
    }

    running = false
    setBusy(false)
    const total = readStored().length
    if (!collected) {
      setStatus(`スコアを取得できませんでした。${warnings.join('／')}`, true)
      return
    }
    const warningText = warnings.length ? ` 一部未取得：${warnings.join('／')}` : ''
    setStatus(`自動巡回が完了しました（合計${total}譜面）。${warningText}`, warnings.length > 0)
  }

  const download = () => {
    const scores = readStored()
    if (!scores.length) {
      setStatus('保存できるデータがありません。先に「全ページを自動取得」を押してください。', true)
      return
    }
    const payload = {
      schema: 'beat-archive.chunithm.v1',
      exportedAt: new Date().toISOString(),
      version: normalize(document.querySelector('.player_data_version, [class*="version"]')?.textContent),
      playerRating: readMeta().playerRating ?? null,
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
      #${ROOT_ID} button:disabled{opacity:.55} #${ROOT_ID} .ba-auto{background:#ffbd3b;color:#17120a} #${ROOT_ID} .ba-add{background:#293142;color:#eef2f8}
      #${ROOT_ID} .ba-save{background:#eef2f8;color:#111722} #${ROOT_ID} .ba-clear{min-height:38px;background:transparent;color:#ff8998;border:1px solid rgba(255,100,120,.25)}
      #${ROOT_ID} .ba-status{min-height:18px;margin:10px 0 0;color:#aeb6c5} #${ROOT_ID} .ba-status.ba-error{color:#ff8998}
    </style>
    <div class="ba-head"><div><h2>BEAT ARCHIVE</h2><p>CHUNITHMスコア取込</p></div><button class="ba-close" aria-label="閉じる">×</button></div>
    <div class="ba-count">端末に保存済み：<strong class="ba-score-count">${readStored().length}譜面</strong><br>プレイヤーレート：<strong class="ba-rating">${readMeta().playerRating?.toFixed?.(2) ?? '--.--'}</strong></div>
    <div class="ba-actions">
      <button class="ba-auto">全ページを自動取得</button>
      <button class="ba-add">表示中ページだけ追加</button>
      <button class="ba-save">JSONを保存</button>
      <button class="ba-clear">端末内の収集データを消去</button>
    </div>
    <p class="ba-status">プレイヤーレート、難易度別スコア、レーティング枠を約4秒間隔で取得します（約40秒）。</p>
  `
  document.body.appendChild(root)

  const setStatus = (message, error = false) => {
    const status = root.querySelector('.ba-status')
    status.textContent = message
    status.classList.toggle('ba-error', error)
    root.querySelector('.ba-score-count').textContent = `${readStored().length}譜面`
    root.querySelector('.ba-rating').textContent = readMeta().playerRating?.toFixed?.(2) ?? '--.--'
  }

  const setBusy = (busy) => {
    root.querySelectorAll('button:not(.ba-close)').forEach((button) => {
      button.disabled = busy
    })
  }

  root.querySelector('.ba-close').addEventListener('click', () => { root.hidden = true })
  root.querySelector('.ba-auto').addEventListener('click', collectAutomatically)
  root.querySelector('.ba-add').addEventListener('click', () => {
    const result = collectVisible()
    if (!result.added) {
      setStatus('この画面ではスコア一覧を検出できませんでした。「全ページを自動取得」をお試しください。', true)
      return
    }
    setStatus(`表示中の${result.added}譜面を追加しました（合計${result.total}譜面）。`)
  })
  root.querySelector('.ba-save').addEventListener('click', download)
  root.querySelector('.ba-clear').addEventListener('click', () => {
    if (!confirm('CHUNITHM-NET内に保存した収集データを消去しますか？')) return
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(META_KEY)
    setStatus('収集データを消去しました。')
  })

  if (location.pathname.includes('/home/playerData')) capturePlayerRating(document)
})()
