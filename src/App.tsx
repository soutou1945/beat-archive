import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, ClearDonut, TrendChart } from './components'
import { makeSnapshot } from './csv'
import {
  cloudConfigured,
  loadCloud,
  loadLocal,
  saveCloud,
  saveLocal,
  signInWithEmail,
  signOut,
  supabase,
} from './store'
import type { Game, IidxScore, PersistedState, SdvxScore, Snapshot } from './types'
import { calculateTotalVf } from './vf'

type Tab = 'home' | 'search' | 'import' | 'settings'

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(value))
const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
const numberLabel = (value: number) => new Intl.NumberFormat('ja-JP').format(value)

function latestSnapshot(snapshots: Snapshot[], game: Game) {
  return snapshots
    .filter((snapshot) => snapshot.game === game)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0]
}

function App() {
  const [state, setState] = useState<PersistedState>(() => loadLocal())
  const [tab, setTab] = useState<Tab>('home')
  const [game, setGame] = useState<Game>('sdvx')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)

  useEffect(() => saveLocal(state), [state])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessionEmail) return
    loadCloud()
      .then(async (cloudSnapshots) => {
        const cloudIds = new Set(cloudSnapshots.map((snapshot) => snapshot.id))
        const localOnly = state.snapshots.filter((snapshot) => !cloudIds.has(snapshot.id))
        await Promise.all(localOnly.map(saveCloud))
        const merged = [...cloudSnapshots, ...localOnly].sort((a, b) => a.importedAt.localeCompare(b.importedAt))
        setState({ snapshots: merged })
        setMessage(`${merged.length}件の履歴をクラウドと同期しました。`)
      })
      .catch(() => setMessage('クラウド同期に失敗しました。ローカルデータはそのまま利用できます。'))
    // Sign-in is the synchronization boundary. Local changes are uploaded during this pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEmail])

  const sdvxLatest = latestSnapshot(state.snapshots, 'sdvx')
  const iidxLatest = latestSnapshot(state.snapshots, 'iidx')
  const activeSnapshot = game === 'sdvx' ? sdvxLatest : iidxLatest

  const sdvxTrend = useMemo(
    () =>
      state.snapshots
        .filter((snapshot) => snapshot.game === 'sdvx')
        .sort((a, b) => a.importedAt.localeCompare(b.importedAt))
        .map((snapshot) => ({
          label: dateLabel(snapshot.importedAt),
          value: calculateTotalVf((snapshot.scores as SdvxScore[]).map((score) => score.vf)),
        })),
    [state.snapshots],
  )

  const searchResults = useMemo(() => {
    if (!activeSnapshot) return []
    const normalized = query.trim().toLocaleLowerCase('ja')
    return activeSnapshot.scores
      .filter((score) => {
        const matchText =
          !normalized ||
          score.title.toLocaleLowerCase('ja').includes(normalized) ||
          ('artist' in score && score.artist.toLocaleLowerCase('ja').includes(normalized))
        const matchLevel = level === 'all' || String(score.level).startsWith(level)
        return matchText && matchLevel
      })
      .slice(0, 100)
  }, [activeSnapshot, level, query])

  const iidxClearCounts = useMemo(() => {
    const counts: Record<number, Record<string, number>> = { 10: {}, 11: {}, 12: {} }
    if (!iidxLatest) return counts
    for (const score of iidxLatest.scores as IidxScore[]) {
      if (score.level < 10 || score.level > 12) continue
      counts[score.level][score.clear] = (counts[score.level][score.clear] ?? 0) + 1
    }
    return counts
  }, [iidxLatest])

  const importSnapshot = async (snapshot: Snapshot) => {
    setState((current) => ({ snapshots: [...current.snapshots, snapshot] }))
    if (sessionEmail) await saveCloud(snapshot)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">PERSONAL SCORE LOG</span>
          <h1>BEAT<span>ARCHIVE</span></h1>
        </div>
        <button className="status-dot" aria-label={sessionEmail ? 'クラウド同期中' : 'ローカル保存中'}>
          <i className={sessionEmail ? 'online' : ''} />
        </button>
      </header>

      <main>
        {tab === 'home' && (
          <Home
            game={game}
            setGame={setGame}
            latest={activeSnapshot}
            sdvxTrend={sdvxTrend}
            iidxClearCounts={iidxClearCounts}
            onImport={() => setTab('import')}
            onSearch={() => setTab('search')}
          />
        )}
        {tab === 'search' && (
          <Search
            game={game}
            setGame={setGame}
            query={query}
            setQuery={setQuery}
            level={level}
            setLevel={setLevel}
            results={searchResults}
            hasData={Boolean(activeSnapshot)}
          />
        )}
        {tab === 'import' && (
          <ImportPanel
            onImport={importSnapshot}
            busy={busy}
            setBusy={setBusy}
            message={message}
            setMessage={setMessage}
            cloud={Boolean(sessionEmail)}
          />
        )}
        {tab === 'settings' && (
          <Settings
            state={state}
            setState={setState}
            sessionEmail={sessionEmail}
            message={message}
            setMessage={setMessage}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        {[
          ['home', '⌁', 'ホーム'],
          ['search', '⌕', '検索'],
          ['import', '＋', '取込'],
          ['settings', '⚙', '設定'],
        ].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as Tab)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function GameSwitch({
  game,
  setGame,
}: {
  game: Game
  setGame: (game: Game) => void
}) {
  return (
    <div className="game-switch">
      <button className={game === 'sdvx' ? 'active' : ''} onClick={() => setGame('sdvx')}>
        SDVX
      </button>
      <button className={game === 'iidx' ? 'active' : ''} onClick={() => setGame('iidx')}>
        IIDX
      </button>
    </div>
  )
}

function Home({
  game,
  setGame,
  latest,
  sdvxTrend,
  iidxClearCounts,
  onImport,
  onSearch,
}: {
  game: Game
  setGame: (game: Game) => void
  latest?: Snapshot
  sdvxTrend: { label: string; value: number }[]
  iidxClearCounts: Record<number, Record<string, number>>
  onImport: () => void
  onSearch: () => void
}) {
  const sdvxScores = game === 'sdvx' && latest ? (latest.scores as SdvxScore[]) : []
  const totalVf = calculateTotalVf(sdvxScores.map((score) => score.vf))
  const topScores = sdvxScores.slice().sort((a, b) => b.vf - a.vf).slice(0, 3)

  return (
    <div className="page home-page">
      <GameSwitch game={game} setGame={setGame} />
      {!latest ? (
        <section className="empty-hero">
          <div className="pulse-mark">＋</div>
          <span className="eyebrow">READY TO SYNC</span>
          <h2>最初のスコアを<br />取り込もう。</h2>
          <p>公式サイトからダウンロードしたCSVだけを読み込みます。ファイルは加工せず、そのままでOKです。</p>
          <button className="primary-button" onClick={onImport}>CSVを取り込む</button>
        </section>
      ) : game === 'sdvx' ? (
        <>
          <section className="hero-stat">
            <div>
              <span className="eyebrow">CURRENT VOLFORCE</span>
              <strong>{totalVf.toFixed(3)}</strong>
            </div>
            <p>BEST 50</p>
          </section>
          <section className="panel chart-panel">
            <div className="section-head">
              <div><span className="eyebrow">PROGRESS</span><h2>VF推移</h2></div>
              <span>{sdvxTrend.length} IMPORTS</span>
            </div>
            <TrendChart points={sdvxTrend} />
          </section>
          <section className="panel">
            <div className="section-head">
              <div><span className="eyebrow">TOP CHARTS</span><h2>VF上位</h2></div>
              <button className="text-button" onClick={onSearch}>すべて見る</button>
            </div>
            <div className="score-list">
              {topScores.map((score, index) => (
                <div className="mini-score" key={score.id}>
                  <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{score.title}</strong><small>{score.difficulty} · LV {score.level}</small></div>
                  <b>{score.vf.toFixed(3)}</b>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="hero-stat iidx-stat">
            <div><span className="eyebrow">ANOTHER + LEGGENDARIA</span><strong>{latest.scores.length}</strong></div>
            <p>CHARTS</p>
          </section>
          <section className="panel">
            <div className="section-head">
              <div><span className="eyebrow">CLEAR STATUS</span><h2>LEVEL 10–12</h2></div>
            </div>
            <div className="donut-grid">
              {[10, 11, 12].map((value) => (
                <ClearDonut key={value} level={value} values={iidxClearCounts[value]} />
              ))}
            </div>
            <div className="legend">
              <span><i className="hard" />HARD+</span>
              <span><i className="clear" />CLEAR</span>
              <span><i className="assist" />ASSIST</span>
              <span><i className="failed" />FAILED / NO PLAY</span>
            </div>
          </section>
          <button className="primary-button full" onClick={onSearch}>曲を検索する</button>
        </>
      )}
      {latest && <p className="updated">最終取込 {dateTimeLabel(latest.importedAt)} · {latest.fileName}</p>}
    </div>
  )
}

function Search({
  game,
  setGame,
  query,
  setQuery,
  level,
  setLevel,
  results,
  hasData,
}: {
  game: Game
  setGame: (game: Game) => void
  query: string
  setQuery: (value: string) => void
  level: string
  setLevel: (value: string) => void
  results: (SdvxScore | IidxScore)[]
  hasData: boolean
}) {
  return (
    <div className="page">
      <div className="page-title"><span className="eyebrow">LIBRARY</span><h2>曲を検索</h2></div>
      <GameSwitch game={game} setGame={setGame} />
      <label className="search-box">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="曲名・アーティストで検索" />
        {query && <button onClick={() => setQuery('')}>×</button>}
      </label>
      <div className="filter-row">
        {['all', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].map((value) => (
          <button key={value} className={level === value ? 'active' : ''} onClick={() => setLevel(value)}>
            {value === 'all' ? 'ALL' : `LV ${value}`}
          </button>
        ))}
      </div>
      <div className="result-count">{hasData ? `${results.length}${results.length === 100 ? '+' : ''} RESULTS` : 'NO DATA'}</div>
      <div className="cards">
        {results.map((score) =>
          game === 'sdvx' ? <SdvxCard key={score.id} score={score as SdvxScore} /> : <IidxCard key={score.id} score={score as IidxScore} />,
        )}
      </div>
      {hasData && results.length === 0 && <div className="empty-small">条件に合う譜面がありません。</div>}
      {!hasData && <div className="empty-small">先に公式CSVを取り込んでください。</div>}
    </div>
  )
}

function SdvxCard({ score }: { score: SdvxScore }) {
  return (
    <article className="score-card">
      <div className="card-top">
        <div><Badge tone="green">{score.difficulty}</Badge><span> LV {score.level}</span></div>
        <Badge>{score.clear}</Badge>
      </div>
      <h3>{score.title}</h3>
      <div className="metric-row">
        <div><span>SCORE</span><strong>{numberLabel(score.score)}</strong></div>
        <div><span>EX SCORE</span><strong>{numberLabel(score.exScore)}</strong></div>
        <div><span>VF</span><strong className="accent">{score.vf.toFixed(3)}</strong></div>
      </div>
    </article>
  )
}

function IidxCard({ score }: { score: IidxScore }) {
  return (
    <article className="score-card iidx-card">
      <div className="card-top">
        <div><Badge tone={score.difficulty === 'LEGGENDARIA' ? 'purple' : 'blue'}>{score.difficulty}</Badge><span> ☆{score.level}</span></div>
        <Badge>{score.clear}</Badge>
      </div>
      <h3>{score.title}</h3>
      <p>{score.artist}</p>
      <div className="metric-row">
        <div><span>SCORE</span><strong>{numberLabel(score.score)}</strong></div>
        <div><span>EX SCORE</span><strong>{numberLabel(score.exScore)}</strong></div>
        <div><span>MISS</span><strong>{score.missCount ?? '---'}</strong></div>
      </div>
    </article>
  )
}

function ImportPanel({
  onImport,
  busy,
  setBusy,
  message,
  setMessage,
  cloud,
}: {
  onImport: (snapshot: Snapshot) => Promise<void>
  busy: boolean
  setBusy: (value: boolean) => void
  message: string
  setMessage: (value: string) => void
  cloud: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importedAt, setImportedAt] = useState(() => new Date().toISOString().slice(0, 16))

  const runImport = async () => {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const snapshot = makeSnapshot(await file.text(), file.name, new Date(importedAt).toISOString())
      await onImport(snapshot)
      setMessage(`${snapshot.game.toUpperCase()}：${snapshot.scores.length}譜面を取り込みました。`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CSVの取り込みに失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title"><span className="eyebrow">OFFICIAL CSV ONLY</span><h2>スコア取込</h2></div>
      <section className="import-zone" onClick={() => fileRef.current?.click()}>
        <div className="upload-icon">⇧</div>
        <h3>{file ? file.name : 'CSVを選択'}</h3>
        <p>{file ? `${numberLabel(file.size)} bytes` : 'SDVX / IIDX公式サイトからダウンロードしたファイル'}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </section>
      <label className="field">
        <span>このデータの取得日時</span>
        <input type="datetime-local" value={importedAt} onChange={(event) => setImportedAt(event.target.value)} />
      </label>
      <div className="notice">
        <strong>{cloud ? 'CLOUD SYNC ON' : 'LOCAL MODE'}</strong>
        <p>{cloud ? '取り込んだスナップショットは他の端末にも同期されます。' : '現在はこの端末内に保存されます。設定からクラウド同期を利用できます。'}</p>
      </div>
      <button className="primary-button full" disabled={!file || busy} onClick={runImport}>
        {busy ? '取り込み中…' : 'データを取り込む'}
      </button>
      {message && <p className="message">{message}</p>}
      <section className="howto panel">
        <span className="eyebrow">SUPPORTED FORMAT</span>
        <h3>取込ルール</h3>
        <p>SDVXは全譜面を取り込み、現在VFをBest 50から算出します。IIDXはANOTHERとLEGGENDARIAだけを自動抽出します。</p>
      </section>
    </div>
  )
}

function Settings({
  state,
  setState,
  sessionEmail,
  message,
  setMessage,
}: {
  state: PersistedState
  setState: (state: PersistedState) => void
  sessionEmail: string | null
  message: string
  setMessage: (value: string) => void
}) {
  const [email, setEmail] = useState('')
  const handleSignIn = async () => {
    try {
      await signInWithEmail(email)
      setMessage('ログイン用リンクをメールで送りました。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メールを送信できませんでした。')
    }
  }
  const handleSignOut = async () => {
    await signOut()
    setMessage('クラウドからログアウトしました。')
  }

  return (
    <div className="page">
      <div className="page-title"><span className="eyebrow">PREFERENCES</span><h2>設定</h2></div>
      <section className="panel settings-panel">
        <div className="section-head"><div><span className="eyebrow">SYNC</span><h2>クラウド同期</h2></div><i className={`cloud-light ${sessionEmail ? 'on' : ''}`} /></div>
        {!cloudConfigured ? (
          <div className="setup-note">
            <strong>Supabaseの設定が必要です</strong>
            <p>VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY をGitHub Pagesのビルド環境に登録してください。</p>
          </div>
        ) : sessionEmail ? (
          <>
            <p className="signed-in">{sessionEmail}</p>
            <button className="secondary-button" onClick={handleSignOut}>ログアウト</button>
          </>
        ) : (
          <>
            <p>同じメールアドレスでログインすると、どの端末でも同じ履歴を利用できます。</p>
            <label className="field"><span>メールアドレス</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <button className="primary-button full" disabled={!email} onClick={handleSignIn}>ログインリンクを送る</button>
          </>
        )}
        {message && <p className="message">{message}</p>}
      </section>
      <section className="panel settings-panel">
        <span className="eyebrow">STORAGE</span>
        <h2>{state.snapshots.length}件の取込履歴</h2>
        <div className="history-list">
          {state.snapshots.slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((snapshot) => (
            <div key={snapshot.id}><Badge tone={snapshot.game === 'sdvx' ? 'green' : 'blue'}>{snapshot.game.toUpperCase()}</Badge><span>{dateTimeLabel(snapshot.importedAt)}</span><small>{snapshot.scores.length}譜面</small></div>
          ))}
        </div>
        {state.snapshots.length > 0 && (
          <button className="danger-button" onClick={() => {
            if (window.confirm('この端末の取込履歴をすべて削除しますか？')) setState({ snapshots: [] })
          }}>ローカル履歴を削除</button>
        )}
      </section>
    </div>
  )
}

export default App
