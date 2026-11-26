import {
  BadgeCheck,
  Bell,
  ChartNoAxesCombined,
  CircleDollarSign,
  Filter,
  LockKeyhole,
} from 'lucide-react';

// Fixed presentation examples only. These are not market observations or calculated signals.
const stocks = [
  {
    symbol: 'TRENT',
    name: 'Trent Ltd',
    sector: 'Retail',
    price: '₹7,645.00',
    high: '₹7,620.00',
    target: '₹8,103.70',
    note: 'Example touch',
    band: '₹7,410.45 – ₹7,829.55',
  },
  {
    symbol: 'BEL',
    name: 'Bharat Electronics Ltd',
    sector: 'Defence',
    price: '₹312.40',
    high: '₹310.00',
    target: '₹331.14',
    note: 'Example watch',
    band: '±2.75% ignore band',
  },
] as const;

function WeeklyIllustration() {
  return (
    <div className="preview-chart">
      <div className="preview-chart-heading">
        <div>
          <p className="preview-label">Weekly context</p>
          <h3>TRENT · Example weekly candles</h3>
        </div>
        <span className="preview-soft-badge">Illustration</span>
      </div>
      <svg
        viewBox="0 0 560 300"
        className="preview-chart-svg"
        role="img"
        aria-labelledby="preview-chart-title"
        aria-describedby="preview-chart-description"
      >
        <title id="preview-chart-title">Illustrative weekly price chart</title>
        <desc id="preview-chart-description">
          Static example candles, a prior-week high and a target level. This chart contains no live
          market data and does not represent trading performance.
        </desc>
        <g className="preview-chart-grid">
          <path d="M30 55H530M30 105H530M30 155H530M30 205H530M30 255H530" />
          <path d="M80 40V270M180 40V270M280 40V270M380 40V270M480 40V270" />
        </g>
        <rect x="65" y="160" width="155" height="75" rx="6" className="preview-chart-prior-box" />
        <rect
          x="250"
          y="102"
          width="225"
          height="102"
          rx="6"
          className="preview-chart-current-box"
        />
        <g className="preview-chart-candles">
          <path d="M95 177V245M143 157V225M191 172V239M280 125V207M328 117V189M376 130V199M424 101V175M472 73V146" />
          <rect x="87" y="192" width="16" height="34" rx="2" />
          <rect x="135" y="172" width="16" height="37" rx="2" />
          <rect x="183" y="190" width="16" height="34" rx="2" className="preview-chart-down" />
          <rect x="272" y="142" width="16" height="48" rx="2" />
          <rect x="320" y="134" width="16" height="35" rx="2" />
          <rect x="368" y="150" width="16" height="30" rx="2" className="preview-chart-down" />
          <rect x="416" y="120" width="16" height="37" rx="2" />
          <rect x="464" y="91" width="16" height="36" rx="2" />
        </g>
        <path d="M250 102H525" className="preview-chart-trigger-line" />
        <path d="M250 55H525" className="preview-chart-target-line" />
        <g className="preview-chart-annotations">
          <text x="252" y="91">
            Prior-week high · ₹7,620.00
          </text>
          <text x="330" y="43">
            Example target · ₹8,103.70
          </text>
          <text x="80" y="260">
            Prior week
          </text>
          <text x="280" y="227">
            Illustrative ±2.75% context
          </text>
          <text x="455" y="280">
            Sample weeks
          </text>
        </g>
      </svg>
      <div className="preview-manual-note">
        <BadgeCheck size={20} aria-hidden="true" />
        <div>
          <strong>A touch is a signal.</strong>
          <span>Every purchase and sale remains your decision.</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <figure
      id="preview"
      className="landing-container landing-preview"
      aria-labelledby="preview-caption"
    >
      <figcaption id="preview-caption">
        <span className="landing-eyebrow">A look inside</span>
        <strong>Illustrative Preview — Not Live Market Data</strong>
      </figcaption>
      <div className="preview-window">
        <div className="preview-window-bar">
          <div className="preview-window-title">
            <span className="preview-window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <ChartNoAxesCombined size={16} aria-hidden="true" />
            <span>
              Advanced Darvas Box <span className="preview-terminal-word">Terminal</span>
            </span>
          </div>
          <span className="preview-soft-badge">Static example</span>
        </div>
        <div className="preview-content">
          <div className="preview-metrics">
            <div>
              <p className="preview-label">
                Example candidates
                <Filter size={16} aria-hidden="true" />
              </p>
              <p className="preview-metric">
                19<span>/ 100 stocks</span>
              </p>
              <p className="preview-metric-footnote">A sample screening view</p>
            </div>
            <div>
              <p className="preview-label">
                Example weekly triggers
                <Bell size={16} aria-hidden="true" />
              </p>
              <p className="preview-metric">
                4<span>to review</span>
              </p>
              <p className="preview-metric-footnote">TRENT · BEL · COALINDIA · NTPC</p>
            </div>
            <div>
              <p className="preview-label">
                Example stock allocation
                <CircleDollarSign size={16} aria-hidden="true" />
              </p>
              <p className="preview-metric">₹50,000</p>
              <p className="preview-metric-footnote">Illustrative planning amount</p>
            </div>
          </div>
          <div className="preview-main-grid">
            <div className="preview-stock-list">
              <div className="preview-stock-heading">
                <h3>Weekly triggers</h3>
                <span className="preview-label">Sample values</span>
              </div>
              {stocks.map((stock) => (
                <article
                  className="preview-stock-card"
                  key={stock.symbol}
                  aria-label={`${stock.symbol} illustrative stock`}
                >
                  <div className="preview-stock-top">
                    <div>
                      <h4>
                        {stock.symbol}
                        <span>{stock.sector}</span>
                      </h4>
                      <p>{stock.name} · NSE Equity</p>
                    </div>
                    <span className="preview-stock-status">{stock.note}</span>
                  </div>
                  <dl className="preview-stock-values">
                    <div>
                      <dt>Example price</dt>
                      <dd>{stock.price}</dd>
                    </div>
                    <div>
                      <dt>Prior-week high</dt>
                      <dd>{stock.high}</dd>
                    </div>
                    <div>
                      <dt>Example 6% target</dt>
                      <dd>{stock.target}</dd>
                    </div>
                  </dl>
                  <div className="preview-stock-band">
                    <div>
                      <span>Ignore band</span>
                      <span>{stock.band}</span>
                    </div>
                    <span className="preview-band-bar" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <WeeklyIllustration />
          </div>
        </div>
        <div className="preview-window-footer">
          <span>
            <LockKeyhole size={13} aria-hidden="true" />
            Examples only. Not a buy or sell recommendation.
          </span>
          <span className="preview-footer-desktop">No live market data</span>
        </div>
      </div>
    </figure>
  );
}
