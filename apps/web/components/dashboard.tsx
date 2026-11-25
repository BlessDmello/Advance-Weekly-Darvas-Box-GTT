import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  Compass,
  Eye,
  LayoutGrid,
  LockKeyhole,
  PanelLeftClose,
  ScanLine,
  ShieldCheck,
  Wallet,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { ServiceStatus } from '@/components/service-status';

const navigation = [
  { label: 'Overview', icon: LayoutGrid, active: true },
  { label: 'Screener', icon: ScanLine, active: false },
  { label: 'Watchlists', icon: Eye, active: false },
  { label: 'Portfolio', icon: Wallet, active: false },
  { label: 'Transactions', icon: ArrowDownToLine, active: false },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="#main"
      className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
      aria-label="Advanced Darvas Box home"
    >
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span
        className={
          compact
            ? 'text-sm font-semibold tracking-tight'
            : 'text-[15px] font-semibold leading-5 tracking-tight'
        }
      >
        Darvas<span className="text-primary">.</span>
        {!compact && (
          <span className="block text-[10px] font-medium tracking-[0.2em] text-muted-foreground">
            ADVANCED BOX
          </span>
        )}
      </span>
    </a>
  );
}

export function Dashboard() {
  return (
    <div className="min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-sidebar px-5 py-7 lg:flex"
        aria-label="Workspace sidebar"
      >
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-10 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold">Personal workspace</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">A space for your strategy</p>
          </div>
        </div>
        <p className="mb-3 mt-8 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          WORKSPACE
        </p>
        <nav aria-label="Main navigation" className="space-y-1">
          {navigation.map(({ label, icon: Icon, active }) =>
            active ? (
              <a
                key={label}
                href="#main"
                aria-current="page"
                className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-3 text-[13px] font-semibold text-primary"
              >
                <Icon className="size-[17px]" aria-hidden="true" />
                {label}
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              </a>
            ) : (
              <button
                key={label}
                disabled
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13px] text-muted-foreground/70"
                title={`${label} is coming soon`}
              >
                <Icon className="size-[17px]" aria-hidden="true" />
                {label}
                <span className="ml-auto text-[9px] tracking-wider">SOON</span>
              </button>
            ),
          )}
        </nav>
        <div className="mt-auto">
          <div className="mb-6 rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
            <ShieldCheck className="mb-3 size-5 text-primary" aria-hidden="true" />
            <p className="text-xs font-semibold">Your decisions. Your pace.</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              A thoughtful home for a disciplined trading process.
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-border px-2 pt-5">
            <span className="text-[11px] text-muted-foreground">Advanced Darvas Box</span>
            <PanelLeftClose className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="flex h-[76px] items-center justify-between gap-3 border-b border-border bg-card/60 px-5 sm:px-8 xl:px-12">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <span>Workspace</span>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="font-medium text-foreground">Overview</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
              <LockKeyhole className="size-3" aria-hidden="true" />
              Personal workspace
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main
          id="main"
          className="mx-auto max-w-[1440px] px-5 pb-28 pt-9 sm:px-8 sm:pt-12 lg:pb-8 xl:px-12"
        >
          <div className="mb-8 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />A considered approach to the market
          </div>
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-[38px]">
                A little clarity. A better perspective.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Welcome to your workspace. Make room for a more deliberate trading process.
              </p>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">
              WORKSPACE PREVIEW
            </span>
          </div>

          <section
            className="hero-panel relative overflow-hidden rounded-[22px] border border-primary/15 px-6 py-9 sm:px-10 sm:py-12"
            aria-labelledby="welcome-title"
          >
            <div className="hero-grid absolute inset-0" aria-hidden="true" />
            <div className="relative z-10 max-w-lg">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1.5 text-[10px] font-medium text-primary">
                <Compass className="size-3.5" aria-hidden="true" />
                Built around your strategy
              </div>
              <h2
                id="welcome-title"
                className="max-w-sm text-3xl font-semibold leading-[1.2] tracking-[-0.035em] sm:text-[36px]"
              >
                Less noise.
                <br />
                More intention.
              </h2>
              <p className="mt-4 max-w-[340px] text-sm leading-6 text-muted-foreground">
                A single place to review opportunities, follow your strategy, and keep your
                decisions in focus.
              </p>
              <Button asChild className="mt-7">
                <a href="#workspace">
                  Explore your workspace
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </div>
            <div className="box-art hidden sm:block" aria-hidden="true">
              <div className="art-box art-box-back" />
              <div className="art-box art-box-front">
                <span className="art-corner top-left" />
                <span className="art-corner bottom-right" />
                <ChartNoAxesCombined className="size-16 text-primary/70" strokeWidth={1} />
              </div>
              <div className="art-label">
                <span className="size-1.5 rounded-full bg-primary" />
                PERSPECTIVE OVER PREDICTION
              </div>
            </div>
          </section>

          <section id="workspace" className="mt-10 scroll-mt-6" aria-labelledby="workspace-title">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 id="workspace-title" className="text-base font-semibold tracking-tight">
                Your workspace, taking shape
              </h2>
              <span className="text-[11px] text-muted-foreground">
                A foundation for what comes next
              </span>
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
              <Card className="flex min-h-[300px] flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ScanLine className="size-4 text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-semibold">Market overview</h3>
                    </div>
                    <span className="text-[10px] text-muted-foreground">COMING SOON</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col items-center justify-center text-center">
                  <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04]">
                    <Waves className="size-6 text-primary" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <h4 className="text-sm font-medium">A clearer view starts here</h4>
                  <p className="mt-2 max-w-[290px] text-xs leading-5 text-muted-foreground">
                    Your market overview will appear here as your workspace grows. No market data is
                    loaded yet.
                  </p>
                </CardContent>
                <div className="flex items-center gap-2 border-t border-border px-6 py-3 text-[10px] text-muted-foreground">
                  <span className="size-1 rounded-full bg-muted-foreground/50" />
                  Designed for NSE equities
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <Compass className="size-4 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold">Made for your process</h3>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  {[
                    {
                      icon: ScanLine,
                      title: 'Find your focus',
                      copy: 'A considered view of potential opportunities.',
                    },
                    {
                      icon: Wallet,
                      title: 'Keep the bigger picture',
                      copy: 'Your positions and decisions, together.',
                    },
                    {
                      icon: Eye,
                      title: 'Review at your pace',
                      copy: 'A calmer space for your weekly review.',
                    },
                  ].map(({ icon: Icon, title, copy }) => (
                    <div key={title} className="flex items-start gap-3.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <h4 className="text-xs font-semibold">{title}</h4>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy}</p>
                      </div>
                      <ArrowUpRight
                        className="ml-auto mt-1 size-3.5 shrink-0 text-muted-foreground/40"
                        aria-hidden="true"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </section>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <p className="text-[10px] text-muted-foreground">
              Built for patience. Designed for perspective.
            </p>
            <ServiceStatus />
          </footer>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
          aria-label="Mobile navigation"
        >
          {navigation.slice(0, 4).map(({ label, icon: Icon, active }) =>
            active ? (
              <a
                key={label}
                href="#main"
                aria-current="page"
                className="flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] font-medium text-primary"
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </a>
            ) : (
              <button
                key={label}
                disabled
                className="flex flex-col items-center gap-1 p-2 text-[10px] text-muted-foreground/65"
                aria-label={`${label}, coming soon`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </button>
            ),
          )}
        </nav>
      </div>
    </div>
  );
}
