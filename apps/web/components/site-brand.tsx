import Link from 'next/link';

export function SiteBrand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="landing-brand" aria-label="Advanced Darvas Box home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        Advanced <span className="landing-brand-second">Darvas Box</span>
      </span>
    </Link>
  );
}
