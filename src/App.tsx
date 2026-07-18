import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, ClearDonut, TrendChart } from './components'
import { makeSnapshot } from './csv'
import {
  aggregateChunithmRanks,
  CHUNITHM_RANKS,
  makeChunithmSnapshot,
  recommendChunithm,
  type ChunithmRecommendation,
} from './chunithm'
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
import type { ChunithmScore, Game, IidxScore, PersistedState, SdvxScore, Snapshot } from './types'
import { calculateTotalVf } from './vf'
import { recommendSdvx, type SdvxRecommendation } from './recommendations'

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
const OFFICIAL_CSV_PAGES = {
  sdvx: 'https://p.eagate.573.jp/game/sdvx/vii/playdata/download/index.html',
  iidx: 'https://p.eagate.573.jp/game/2dx/33/djdata/score_download.html',
}
const CHUNITHM_NET = 'https://new.chunithm-net.com/chuni-mobile/html/mobile/home/'
const CHUNITHM_BOOKMARKLET =
  "javascript:(()=>{const s=document.createElement('script');s.src='https://soutou1945.github.io/beat-archive/chunithm-exporter.js?v=4';document.body.appendChild(s)})()"

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
  const chunithmLatest = latestSnapshot(state.snapshots, 'chunithm')
  const activeSnapshot =
    game === 'sdvx' ? sdvxLatest : game === 'iidx' ? iidxLatest : chunithmLatest

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

  const sdvxRecommendations = useMemo(() => {
    const snapshots = state.snapshots
      .filter((snapshot) => snapshot.game === 'sdvx')
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    if (!snapshots[0]) return []
    return recommendSdvx(
      snapshots[0].scores as SdvxScore[],
      (snapshots[1]?.scores as SdvxScore[] | undefined) ?? [],
    )
  }, [state.snapshots])

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

  const chunithmRanks = useMemo(
    () =>
      aggregateChunithmRanks(
        (chunithmLatest?.scores as ChunithmScore[] | undefined) ?? [],
      ),
    [chunithmLatest],
  )

  const chunithmRecommendations = useMemo(() => {
    const snapshots = state.snapshots
      .filter((snapshot) => snapshot.game === 'chunithm')
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    const current = (snapshots[0]?.scores as ChunithmScore[] | undefined) ?? []
    const previous = (snapshots[1]?.scores as ChunithmScore[] | undefined) ?? []
    return {
      best: recommendChunithm(current, previous, 'best'),
      new: recommendChunithm(current, previous, 'new'),
    }
  }, [state.snapshots])

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
            sdvxRecommendations={sdvxRecommendations}
            iidxClearCounts={iidxClearCounts}
            chunithmRanks={chunithmRanks}
            chunithmRecommendations={chunithmRecommendations}
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
      <button className={game === 'chunithm' ? 'active' : ''} onClick={() => setGame('chunithm')}>
        CHUNITHM
      </button>
    </div>
  )
}

function Home({
  game,
  setGame,
  latest,
  sdvxTrend,
  sdvxRecommendations,
  iidxClearCounts,
  chunithmRanks,
  chunithmRecommendations,
  onImport,
  onSearch,
}: {
  game: Game
  setGame: (game: Game) => void
  latest?: Snapshot
  sdvxTrend: { label: string; value: number }[]
  sdvxRecommendations: SdvxRecommendation[]
  iidxClearCounts: Record<number, Record<string, number>>
  chunithmRanks: Record<string, Record<string, Record<string, number>>>
  chunithmRecommendations: { best: ChunithmRecommendation[]; new: ChunithmRecommendation[] }
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
          <p>{game === 'chunithm' ? 'CHUNITHM-NETで表示中のスコアを専用ツールからJSON保存して読み込みます。' : '公式サイトからダウンロードしたCSVだけを読み込みます。ファイルは加工せず、そのままでOKです。'}</p>
          <button className="primary-button" onClick={onImport}>{game === 'chunithm' ? '取込方法を見る' : 'CSVを取り込む'}</button>
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
          <section className="panel recommendation-panel">
            <div className="section-head">
              <div><span className="eyebrow">NEXT TARGETS</span><h2>伸びしろ候補</h2></div>
              <span>TOP {sdvxRecommendations.length}</span>
            </div>
            <p className="recommendation-intro">
              次の10万点とBEST 50への効果から、今狙いたい譜面を提案します。
            </p>
            <div className="recommendation-list">
              {sdvxRecommendations.map((item, index) => (
                <article className="recommendation-card" key={item.score.id}>
                  <span className="recommendation-rank">{String(index + 1).padStart(2, '0')}</span>
                  <div className="recommendation-main">
                    <div className="recommendation-title">
                      <strong>{item.score.title}</strong>
                      <Badge tone="green">{item.score.difficulty} · LV {item.score.level}</Badge>
                    </div>
                    <p>{item.reason}</p>
                    <div className="recommendation-metrics">
                      <span>
                        <small>CURRENT</small>
                        <b>{numberLabel(item.score.score)}</b>
                      </span>
                      <i>→</i>
                      <span>
                        <small>TARGET</small>
                        <b>{numberLabel(item.targetScore)}</b>
                      </span>
                      <span className="vf-gain">
                        <small>VF UP</small>
                        <b>+{item.chartVfGain.toFixed(3)}</b>
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {sdvxRecommendations.length === 0 && (
              <p className="empty-recommendation">提案できるプレー済み譜面がありません。</p>
            )}
            <p className="recommendation-note">※ 現在のCSVをもとにした目安です。譜面の得意・不得意は考慮していません。</p>
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
      ) : game === 'iidx' ? (
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
      ) : (
        <ChunithmHome
          scores={latest.scores as ChunithmScore[]}
          playerRating={latest.playerRating}
          ranks={chunithmRanks}
          recommendations={chunithmRecommendations}
          onSearch={onSearch}
        />
      )}
      {latest && <p className="updated">最終取込 {dateTimeLabel(latest.importedAt)} · {latest.fileName}</p>}
    </div>
  )
}

function ChunithmHome({
  scores,
  playerRating,
  ranks,
  recommendations,
  onSearch,
}: {
  scores: ChunithmScore[]
  playerRating?: number
  ranks: Record<string, Record<string, Record<string, number>>>
  recommendations: { best: ChunithmRecommendation[]; new: ChunithmRecommendation[] }
  onSearch: () => void
}) {
  const levels = Object.keys(ranks).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
  const [selectedLevel, setSelectedLevel] = useState(levels.at(-1) ?? '')
  const difficulties = Object.keys(ranks[selectedLevel] ?? {})
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulties.includes('MASTER') ? 'MASTER' : difficulties[0] ?? '')
  const values = ranks[selectedLevel]?.[selectedDifficulty] ?? {}
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)

  useEffect(() => {
    if (!ranks[selectedLevel] && levels.length) setSelectedLevel(levels.at(-1)!)
  }, [levels, ranks, selectedLevel])

  useEffect(() => {
    const available = Object.keys(ranks[selectedLevel] ?? {})
    if (!available.includes(selectedDifficulty)) {
      setSelectedDifficulty(available.includes('MASTER') ? 'MASTER' : available[0] ?? '')
    }
  }, [ranks, selectedDifficulty, selectedLevel])

  return (
    <>
      <section className="hero-stat chunithm-stat">
        <div>
          <span className="eyebrow">CURRENT RATING</span>
          <strong>{playerRating === undefined ? '--.--' : playerRating.toFixed(2)}</strong>
          <small className="chunithm-chart-count">{scores.length} IMPORTED CHARTS</small>
        </div>
        <p>CHUNITHM</p>
      </section>
      <section className="panel chunithm-rank-panel">
        <div className="section-head">
          <div><span className="eyebrow">SCORE STATUS</span><h2>ランク分布</h2></div>
          <span>{total} CHARTS</span>
        </div>
        <div className="chunithm-filters">
          <select value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)} aria-label="レベル">
            {levels.map((value) => <option value={value} key={value}>LV {value}</option>)}
          </select>
          <select value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value)} aria-label="難易度">
            {Object.keys(ranks[selectedLevel] ?? {}).map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </div>
        <div className="rank-bars">
          {CHUNITHM_RANKS.map((rank) => {
            const count = values[rank] ?? 0
            return (
              <div className="rank-bar-row" key={rank}>
                <strong>{rank}</strong>
                <div><i style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div>
                <span>{count}</span>
              </div>
            )
          })}
        </div>
      </section>
      {(['best', 'new'] as const).map((frame) => (
        <section className="panel recommendation-panel chunithm-recommendations" key={frame}>
          <div className="section-head">
            <div>
              <span className="eyebrow">{frame === 'best' ? 'BEST FRAME' : 'NEW SONG FRAME'}</span>
              <h2>{frame === 'best' ? 'ベスト枠おすすめ' : '新曲枠おすすめ'}</h2>
            </div>
            <span>TOP {recommendations[frame].length}</span>
          </div>
          <div className="recommendation-list">
            {recommendations[frame].map((item, index) => (
              <article className="recommendation-card" key={item.score.id}>
                <span className="recommendation-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="recommendation-main">
                  <div className="recommendation-title">
                    <strong>{item.score.title}</strong>
                    <Badge tone="orange">{item.score.difficulty} · LV {item.score.level}</Badge>
                  </div>
                  <p>{item.reason}</p>
                  <div className="recommendation-metrics">
                    <span><small>CURRENT</small><b>{numberLabel(item.score.score)}</b></span>
                    <i>→</i>
                    <span><small>TARGET</small><b>{numberLabel(item.targetScore)}</b></span>
                    <span className="chunithm-target"><small>RANK</small><b>{item.targetRank}</b></span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {recommendations[frame].length === 0 && (
            <p className="empty-recommendation">この枠として取得された候補がありません。</p>
          )}
        </section>
      ))}
      <p className="recommendation-note chunithm-note">※ 次のスコアランクまでの距離と前回からの伸びを使った目安です。レーティング値は計算していません。</p>
      <button className="primary-button full chunithm-button" onClick={onSearch}>曲を検索する</button>
    </>
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
  results: (SdvxScore | IidxScore | ChunithmScore)[]
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
          game === 'sdvx' ? (
            <SdvxCard key={score.id} score={score as SdvxScore} />
          ) : game === 'iidx' ? (
            <IidxCard key={score.id} score={score as IidxScore} />
          ) : (
            <ChunithmCard key={score.id} score={score as ChunithmScore} />
          ),
        )}
      </div>
      {hasData && results.length === 0 && <div className="empty-small">条件に合う譜面がありません。</div>}
      {!hasData && <div className="empty-small">先にスコアデータを取り込んでください。</div>}
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

function ChunithmCard({ score }: { score: ChunithmScore }) {
  return (
    <article className="score-card chunithm-card">
      <div className="card-top">
        <div><Badge tone="orange">{score.difficulty}</Badge><span> LV {score.level}</span></div>
        <Badge>{score.clear}</Badge>
      </div>
      <h3>{score.title}</h3>
      <div className="metric-row">
        <div><span>SCORE</span><strong>{numberLabel(score.score)}</strong></div>
        <div><span>RANK</span><strong className="chunithm-accent">{score.rank}</strong></div>
        <div><span>FRAME</span><strong>{score.frame?.toUpperCase() ?? '---'}</strong></div>
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
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false)

  const runImport = async () => {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const text = await file.text()
      const snapshot = file.name.toLowerCase().endsWith('.json')
        ? makeChunithmSnapshot(text, file.name, new Date(importedAt))
        : makeSnapshot(text, file.name, new Date(importedAt).toISOString())
      await onImport(snapshot)
      const ratingMessage = snapshot.game === 'chunithm' && snapshot.playerRating !== undefined
        ? ` / RATE ${snapshot.playerRating.toFixed(2)}`
        : ''
      setMessage(`${snapshot.game.toUpperCase()}：${snapshot.scores.length}譜面を取り込みました${ratingMessage}。`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'データの取り込みに失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title"><span className="eyebrow">OFFICIAL DATA IMPORT</span><h2>スコア取込</h2></div>
      <section className="official-csv-panel">
        <div className="import-step">
          <span>01</span>
          <div><strong>CSVを選択</strong><small>ゲームを選ぶと公式ダウンロードページが開きます</small></div>
        </div>
        <div className="official-link-grid">
          <a href={OFFICIAL_CSV_PAGES.sdvx} target="_blank" rel="noreferrer">
            <span>SDVX</span>
            <strong>公式CSVページ</strong>
            <i>↗</i>
          </a>
          <a href={OFFICIAL_CSV_PAGES.iidx} target="_blank" rel="noreferrer">
            <span>IIDX</span>
            <strong>公式CSVページ</strong>
            <i>↗</i>
          </a>
        </div>
        <details className="desktop-help">
          <summary>スマホでCSVボタンが見つからない場合</summary>
          <div>
            <p><strong>iPhone / Safari</strong>：アドレスバーの「ぁあ」→「デスクトップ用Webサイトを表示」</p>
            <p><strong>Android / Chrome</strong>：右上の「︙」→「PC版サイト」をオン</p>
            <p>公式ページをPC版表示に切り替えてから、CSVをダウンロードしてください。</p>
          </div>
        </details>
      </section>
      <section className="chunithm-setup panel">
        <div className="section-head">
          <div><span className="eyebrow">CHUNITHM MOBILE SETUP</span><h2>CHUNITHM取込</h2></div>
          <Badge tone="orange">JSON</Badge>
        </div>
        <p>CHUNITHM-NET内のプレイヤーレート、難易度別一覧、レーティング枠を自動取得し、BEAT ARCHIVE用JSONとして端末へ保存します。ログイン情報やCookieは送信しません。</p>
        <ol>
          <li><strong>ブックマークを作る</strong><span>このページをブックマークし、名前を「zzba」に変更します。</span></li>
          <li><strong>URLを置き換える</strong><span>下のボタンでコードをコピーし、ブックマークのURL欄へ貼り付けます。</span></li>
          <li><strong>CHUNITHM-NETで実行</strong><span>ログイン後に「zzba」の★付き候補をタップし、「全ページを自動取得」を押します。約40秒かかるため、完了まで画面を閉じずにお待ちください。</span></li>
          <li><strong>JSONを取り込む</strong><span>表示されたパネルからJSONを保存し、この画面で選択します。</span></li>
        </ol>
        <button
          className="secondary-button bookmarklet-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(CHUNITHM_BOOKMARKLET)
              setBookmarkletCopied(true)
              setMessage('ブックマークレットをコピーしました。ブックマークのURL欄へ貼り付けてください。')
            } catch {
              setMessage('自動コピーできませんでした。下のコードを長押ししてコピーしてください。')
            }
          }}
        >
          {bookmarkletCopied ? 'コピー済み ✓' : 'ブックマークレットをコピー'}
        </button>
        <textarea className="bookmarklet-code" readOnly value={CHUNITHM_BOOKMARKLET} aria-label="ブックマークレットコード" />
        <a className="chunithm-net-link" href={CHUNITHM_NET} target="_blank" rel="noreferrer">CHUNITHM-NETを開く ↗</a>
        <details className="desktop-help">
          <summary>Android Chromeで検索候補だけが表示される場合</summary>
          <div>
            <p>候補一覧の「zzba」という名前の<strong>★付きブックマーク</strong>をタップしてください。キーボードのEnterでは検索になります。</p>
            <p>候補が出ない場合は「︙」→「ブックマーク」から zzba を直接開きます。</p>
          </div>
        </details>
      </section>
      <label className="import-zone">
        <div className="upload-icon">⇧</div>
        <div className="import-step compact">
          <span>02</span>
          <div><strong>{file ? file.name : 'CSVまたはCHUNITHM JSONを選択'}</strong><small>{file ? `${numberLabel(file.size)} bytes` : '端末に保存したスコアデータを読み込みます'}</small></div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
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
        <p>SDVXは全譜面を取り込み、現在VFをBest 50から算出します。IIDXはANOTHERとLEGGENDARIAだけを自動抽出します。CHUNITHMは専用ブックマークレットが保存したJSONだけを受け付けます。</p>
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
            <div key={snapshot.id}><Badge tone={snapshot.game === 'sdvx' ? 'green' : snapshot.game === 'iidx' ? 'blue' : 'orange'}>{snapshot.game.toUpperCase()}</Badge><span>{dateTimeLabel(snapshot.importedAt)}</span><small>{snapshot.scores.length}譜面</small></div>
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
