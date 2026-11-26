import { Check, ChartNoAxesCombined } from 'lucide-react';
import { illustrativeStocks, WeeklyIllustration } from '@/components/illustrative-preview';
import styles from './login.module.css';

export function LoginPreview() {
  return (
    <figure className={styles.preview} aria-labelledby="login-preview-caption">
      <figcaption id="login-preview-caption">
        <span className={styles.previewTitle}>
          <ChartNoAxesCombined size={18} aria-hidden="true" />A disciplined view of the market
        </span>
        <strong>Illustrative Preview — Not Live Market Data</strong>
      </figcaption>
      <div className={styles.stockHeading}>
        <h2>Eligible stocks</h2>
        <span>Example screening view</span>
      </div>
      <div className={styles.stocks}>
        {illustrativeStocks.map((stock) => (
          <article
            key={stock.symbol}
            className={styles.stock}
            aria-label={`${stock.symbol} illustrative stock`}
          >
            <div className={styles.stockTop}>
              <h3>{stock.symbol}</h3>
              <span>
                Example price <strong>{stock.price}</strong>
              </span>
            </div>
            <p>{stock.name}</p>
            <div className={styles.badges}>
              <span>
                <Check size={12} aria-hidden="true" />
                DMA Bull Run
              </span>
              <span>
                <Check size={12} aria-hidden="true" />
                CAR confirmed
              </span>
            </div>
            <p className={styles.trigger}>
              Example weekly trigger <strong>{stock.high}</strong>
            </p>
          </article>
        ))}
      </div>
      <WeeklyIllustration />
      <p className={styles.previewNote}>
        Fixed examples only. No screening calculations or live market data. Every trade remains a
        manual decision.
      </p>
    </figure>
  );
}
