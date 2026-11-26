import { illustrativeStocks, WeeklyIllustration } from '@/components/illustrative-preview';
import { Bell, ChartNoAxesCombined, CircleDollarSign, Filter, LockKeyhole } from 'lucide-react';

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
              {illustrativeStocks.map((stock) => (
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
