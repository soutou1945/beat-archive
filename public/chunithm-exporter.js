(async () => {
  'use strict'

  const scriptUrl = new URL(document.currentScript?.src || '/chunithm-exporter.js', location.href)
  const HOST = 'new.chunithm-net.com'
  const STORAGE_KEY = 'beat-archive:chunithm-export:v1'
  const META_KEY = 'beat-archive:chunithm-meta:v1'
  const ROOT_ID = 'beat-archive-chunithm-exporter'
  const BASE = '/chuni-mobile/html/mobile/'
  const LEVEL_SEARCH_PATH = `${BASE}record/musicLevel/search/`
  const WAIT_MS = 2000
  const RETRY_WAIT_MS = 4000

  if (location.hostname !== HOST) {
    alert('このツールはCHUNITHM-NET上で実行してください。')
    return
  }

  const existing = document.getElementById(ROOT_ID)
  if (existing) {
    existing.hidden = false
    return
  }

  const parserUrl = new URL('./chunithm-parser.js', scriptUrl)
  parserUrl.search = scriptUrl.search
  const { normalizeText: normalize, parseMusicList, parsePlayerRating, parseRatingPage } = await import(parserUrl.href)
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

  const storePlayerRating = (rating) => {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), playerRating: rating }))
  }

  const capturePlayerRating = (doc) => {
    const rating = parsePlayerRating(doc)
    if (rating !== null) storePlayerRating(rating)
    return rating
  }

  const mergeScores = (target, found) => {
    found.forEach((score) => {
      const previous = target.get(score.id)
      target.set(score.id, {
        ...previous,
        ...score,
        frame: score.frame || previous?.frame || null,
        isNewSong: Boolean(score.isNewSong || previous?.isNewSong),
      })
    })
    return target
  }

  const saveMerged = (found) => {
    const merged = mergeScores(new Map(readStored().map((score) => [score.id, score])), found)
    const scores = [...merged.values()]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
    return scores
  }

  const replaceStored = (scores) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
  }

  const fetchDocument = async (path, options = {}) => {
    const requestUrl = new URL(path, location.origin)
    let response
    try {
      response = await fetch(requestUrl, { credentials: 'include', redirect: 'follow', ...options })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '通信失敗'
      throw new Error(`${reason}（${requestUrl.pathname}）`)
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}（${requestUrl.pathname}）`)
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
    if (
      /\/login\//.test(response.url)
      || doc.querySelector('input[type="password"]')
      || /ログインしてください/.test(normalize(doc.body?.textContent))
    ) {
      throw new Error('ログインが切れています')
    }
    return doc
  }

  const diagnostic = (label, result, path) =>
    `${label}: 要素${result.blockCount}件／解析${result.scores.length}件（${path}）`

  const normalizeLevelLabel = (value) => normalize(value).replace(/^LEVEL\s*/i, '')

  const readLevelSearchForm = (doc) => {
    const select = doc.querySelector('select[name="level"]')
    const form = select?.closest('form')
    if (!select || !form) throw new Error('レベル検索フォームを検出できません')

    const levels = [...select.options]
      .map((option) => ({ value: String(option.value), label: normalizeLevelLabel(option.textContent) }))
      .filter((level) => level.value && level.label)
    if (!levels.length) throw new Error('取得可能なレベルを検出できません')

    return {
      action: form.getAttribute('action') || LEVEL_SEARCH_PATH,
      method: normalize(form.getAttribute('method') || 'GET').toUpperCase(),
      form,
      levels,
    }
  }

  const buildSearchRequest = (searchForm, levelValue) => {
    const params = new URLSearchParams()
    for (const element of searchForm.form.elements) {
      if (!element.name || element.disabled) continue
      if (element.name === 'level') {
        params.set(element.name, levelValue)
        continue
      }
      if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) continue
      params.append(element.name, element.value)
    }

    if (searchForm.method === 'POST') {
      return {
        path: searchForm.action,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: params.toString(),
        },
      }
    }

    const url = new URL(searchForm.action, location.origin)
    url.search = params.toString()
    return { path: url.href, options: { method: 'GET' } }
  }

  const levelRequest = async (searchForm, level) => {
    const request = buildSearchRequest(searchForm, level.value)
    const result = parseMusicList(await fetchDocument(request.path, request.options), '', null, level.label)
    if (!result.scores.length) {
      throw new Error(diagnostic(`LEVEL ${level.label}を検出できません`, result, request.path))
    }
    return result
  }

  const requestWithRetry = async (run) => {
    try {
      return await run()
    } catch (firstError) {
      await wait(RETRY_WAIT_MS)
      try {
        return await run()
      } catch {
        throw firstError
      }
    }
  }

  const ratingRequest = async (path, frame) => {
    const result = parseRatingPage(await fetchDocument(path), frame)
    if (!result.scores.length) throw new Error(diagnostic('レーティング枠を検出できません', result, path))
    return result
  }

  const selectedLevelFromDocument = () => {
    const selected = document.querySelector('select[name="level"] option:checked')
    return normalizeLevelLabel(selected?.textContent)
  }

  const collectVisible = () => {
    const result = parseMusicList(document, '', null, selectedLevelFromDocument())
    const scores = saveMerged(result.scores)
    return { added: result.scores.length, detected: result.blockCount, total: scores.length }
  }

  let running = false
  const collectAutomatically = async () => {
    if (running) return
    running = true
    setBusy(true)
    const warnings = []
    const staged = new Map(readStored().map((score) => [score.id, score]))
    let playerRating = null
    let successfulLevels = 0

    try {
      setStatus('レベル検索条件を取得中')
      const searchForm = readLevelSearchForm(await fetchDocument(LEVEL_SEARCH_PATH))

      setStatus('プレイヤーレートを取得中')
      try {
        const playerDoc = await fetchDocument(`${BASE}home/playerData`)
        playerRating = parsePlayerRating(playerDoc)
        if (playerRating === null) throw new Error('レートを検出できません')
      } catch (error) {
        warnings.push(`プレイヤーレート: ${error instanceof Error ? error.message : '取得失敗'}`)
      }
      await wait(WAIT_MS)

      for (let index = 0; index < searchForm.levels.length; index += 1) {
        const level = searchForm.levels[index]
        setStatus(`取得中 ${index + 1}/${searchForm.levels.length}：LEVEL ${level.label}`)
        try {
          mergeScores(staged, (await requestWithRetry(() => levelRequest(searchForm, level))).scores)
          successfulLevels += 1
        } catch (error) {
          warnings.push(`LEVEL ${level.label}: ${error instanceof Error ? error.message : '取得失敗'}`)
        }
        if (index < searchForm.levels.length - 1) await wait(WAIT_MS)
      }

      const ratingTasks = [
        { label: 'ベスト枠', path: `${BASE}home/playerData/ratingDetailBest/`, frame: 'best' },
        { label: '新曲枠', path: `${BASE}home/playerData/ratingDetailRecent/`, frame: 'new' },
        { label: '候補枠', path: `${BASE}home/playerData/ratingDetailNext/`, frame: null },
      ]
      for (let index = 0; index < ratingTasks.length; index += 1) {
        const task = ratingTasks[index]
        setStatus(`レーティング枠を取得中 ${index + 1}/${ratingTasks.length}：${task.label}`)
        try {
          mergeScores(staged, (await requestWithRetry(() => ratingRequest(task.path, task.frame))).scores)
        } catch (error) {
          warnings.push(`${task.label}: ${error instanceof Error ? error.message : '取得失敗'}`)
        }
        if (index < ratingTasks.length - 1) await wait(WAIT_MS)
      }

      if (!successfulLevels) {
        setStatus(`スコアを更新できませんでした。保存済みデータは変更していません。${warnings.join('／')}`, true)
        return
      }

      const scores = [...staged.values()]
      replaceStored(scores)
      if (playerRating !== null) storePlayerRating(playerRating)
      const warningText = warnings.length ? ` 未取得: ${warnings.join('／')}` : ''
      setStatus(`${successfulLevels}/${searchForm.levels.length}レベルを取得し、${scores.length}譜面へ更新しました。${warningText}`, warnings.length > 0)
    } catch (error) {
      setStatus(`更新を反映しませんでした。${error instanceof Error ? error.message : '取得失敗'}`, true)
    } finally {
      running = false
      setBusy(false)
    }
  }

  const download = () => {
    const scores = readStored()
    if (!scores.length) {
      setStatus('保存できるデータがありません。先に「全レベルを自動取得」を押してください。', true)
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
      <button class="ba-auto">全レベルを自動取得</button>
      <button class="ba-add">表示中レベルだけ追加</button>
      <button class="ba-save">JSONを保存</button>
      <button class="ba-clear">端末内の収集データを消去</button>
    </div>
    <p class="ba-status">レベル検索の全選択肢とレーティング枠を約2秒間隔で取得します。</p>
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
    root.querySelectorAll('button:not(.ba-close)').forEach((button) => { button.disabled = busy })
  }

  root.querySelector('.ba-close').addEventListener('click', () => { root.hidden = true })
  root.querySelector('.ba-auto').addEventListener('click', collectAutomatically)
  root.querySelector('.ba-add').addEventListener('click', () => {
    const result = collectVisible()
    if (!result.added) {
      setStatus(`この画面ではスコアを解析できませんでした（候補要素${result.detected}件）。レベル検索結果を表示してから再実行してください。`, true)
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
})().catch((error) => {
  const reason = error instanceof Error ? error.message : '不明なエラー'
  alert(`BEAT ARCHIVEの起動に失敗しました。${reason}`)
})
