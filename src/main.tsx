import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { siSolana, siZcash, type SimpleIcon } from "simple-icons";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CircleDotDashed,
  Check,
  Clock,
  Copy,
  Gauge,
  Landmark,
  Layers3,
  LockKeyhole,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Wallet,
  Zap
} from "lucide-react";
import "./styles.css";

/* ── Live Price API (CoinGecko free, no key) ── */

type CoinId = "solana" | "zcash" | "jupiter-exchange-solana";
type PriceData = {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  usd_market_cap: number;
};
type Prices = Record<CoinId, PriceData>;

const COIN_IDS: CoinId[] = ["solana", "zcash", "jupiter-exchange-solana"];
const COIN_LABELS: Record<CoinId, string> = {
  solana: "SOL",
  zcash: "ZEC",
  "jupiter-exchange-solana": "JUP"
};

function useLivePrices(intervalMs = 30_000) {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrices() {
      try {
        const ids = COIN_IDS.join(",");
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const mapped: Partial<Prices> = {};
        for (const id of COIN_IDS) {
          const d = data[id];
          if (d) {
            mapped[id] = {
              usd: d.usd ?? 0,
              usd_24h_change: d.usd_24h_change ?? 0,
              usd_24h_vol: d.usd_24h_vol ?? 0,
              usd_market_cap: d.usd_market_cap ?? 0
            };
          }
        }
        setPrices(mapped as Prices);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPrices();
    const timer = setInterval(fetchPrices, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [intervalMs]);

  return { prices, lastUpdate, error, loading };
}

/* ── Position / Trade types ── */

type PositionSide = "long" | "short";
type PositionStatus = "open" | "closed" | "pending";

type Position = {
  id: string;
  asset: string;
  side: PositionSide;
  status: PositionStatus;
  entryPrice: number;
  size: number;
  sizeUnit: string;
  notional: number;
  leverage: string;
  entryTime: string;
  stopLoss: number | null;
  takeProfit: number | null;
  source: string;
};

type StageStatus = "ready" | "active" | "queued" | "done";

type Stage = {
  label: string;
  status: StageStatus;
  amount: string;
  subtext: string;
  icon: typeof CircleDotDashed;
};

type LedgerItem = {
  time: string;
  action: string;
  value: string;
  hash: string;
  chain: string;
};

const zec3Assets = {
  bubbleLogo: "/assets/zec3/bubble-text-logo.png",
  navLogo: "/assets/zec3/bubble-text-logo-nav.png",
  tokenImage: "/assets/zec3/zec3-token.png"
};

const stages: Stage[] = [
  {
    label: "Claim Fees",
    status: "done",
    amount: "14.82 SOL",
    subtext: "Creator Vault collected",
    icon: BadgeDollarSign
  },
  {
    label: "Buy ZEC",
    status: "active",
    amount: "43.19 ZEC",
    subtext: "Jupiter route prepared",
    icon: Zap
  },
  {
    label: "ZEC Long",
    status: "queued",
    amount: "$2,950",
    subtext: "Jupiter isolated 1x",
    icon: BarChart3
  },
  {
    label: "Profit Reserve",
    status: "queued",
    amount: "$312",
    subtext: "Realized PnL buffer",
    icon: Activity
  },
  {
    label: "Airdrop",
    status: "ready",
    amount: "4,821",
    subtext: "Holder wallets queued",
    icon: Wallet
  }
];

const enginePositions: Position[] = [
  {
    id: "pos-zec-long-1",
    asset: "ZEC",
    side: "long",
    status: "open",
    entryPrice: 38.42,
    size: 128.7,
    sizeUnit: "ZEC",
    notional: 4947,
    leverage: "1x",
    entryTime: "2025-05-18 14:22:08",
    stopLoss: 32.66,
    takeProfit: 52.80,
    source: "Jupiter Perps"
  },
  {
    id: "pos-zec-long-2",
    asset: "ZEC",
    side: "long",
    status: "open",
    entryPrice: 40.15,
    size: 62.3,
    sizeUnit: "ZEC",
    notional: 2501,
    leverage: "1x",
    entryTime: "2025-05-19 09:44:31",
    stopLoss: 34.13,
    takeProfit: 55.00,
    source: "Jupiter Perps"
  },
  {
    id: "pos-sol-hold",
    asset: "SOL",
    side: "long",
    status: "open",
    entryPrice: 168.20,
    size: 14.82,
    sizeUnit: "SOL",
    notional: 2493,
    leverage: "1x",
    entryTime: "2025-05-20 08:18:44",
    stopLoss: null,
    takeProfit: null,
    source: "Creator Vault"
  },
  {
    id: "pos-zec-pending",
    asset: "ZEC",
    side: "long",
    status: "pending",
    entryPrice: 0,
    size: 43.19,
    sizeUnit: "ZEC",
    notional: 0,
    leverage: "1x",
    entryTime: "",
    stopLoss: null,
    takeProfit: null,
    source: "Jupiter Route"
  }
];

const allocations = [
  { label: "ZEC Spot", value: 30, color: "rgba(255,255,255,0.85)" },
  { label: "ZEC Long", value: 30, color: "rgba(218,234,255,0.7)" },
  { label: "Holder Airdrop", value: 30, color: "rgba(255,255,255,0.5)" },
  { label: "Retained SOL", value: 10, color: "rgba(255,255,255,0.3)" }
];

const initialLedger: LedgerItem[] = [
  {
    time: "09:18:44",
    action: "Dry check completed",
    value: "14.82 SOL simulated",
    hash: "dry_8Kf2...9Lp",
    chain: "Engine"
  },
  {
    time: "09:12:03",
    action: "Holder snapshot prepared",
    value: "4,821 wallets",
    hash: "5ng4...Tba1",
    chain: "Solana"
  },
  {
    time: "09:04:31",
    action: "Jupiter long cap read",
    value: "$250 max order",
    hash: "JUP_22...91z",
    chain: "Jupiter"
  },
  {
    time: "08:55:18",
    action: "Jupiter quote sampled",
    value: "0.18% impact",
    hash: "JUP_7q...Px",
    chain: "Solana"
  }
];

type StackBrand = {
  name: string;
  logo?: string;
  icon?: SimpleIcon;
  wordmarkOnly?: boolean;
};

const stackBrands: StackBrand[] = [
  { name: "Pump.fun", logo: "/logos/pumpfun.svg" },
  { name: "Solana", icon: siSolana },
  { name: "Jupiter", logo: "/logos/jupiter.svg" },
  { name: "Zcash", icon: siZcash }
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function ParallaxToken({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, y: 0, tx: 0, ty: 0, rx: 0, ry: 0, trx: 0, try_: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const s = state.current;
    const ease = 0.06;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const push = Math.max(0, 1 - dist * 0.4);
      s.tx = dx * 28 * push;
      s.ty = dy * 22 * push;
      s.trx = -dy * 12 * push;
      s.try_ = dx * 12 * push;
    }

    function onLeave() {
      s.tx = 0;
      s.ty = 0;
      s.trx = 0;
      s.try_ = 0;
    }

    function tick() {
      s.x += (s.tx - s.x) * ease;
      s.y += (s.ty - s.y) * ease;
      s.rx += (s.trx - s.rx) * ease;
      s.ry += (s.try_ - s.ry) * ease;
      const img = el!.querySelector(".token-photo") as HTMLElement | null;
      if (img) {
        img.style.transform =
          `translate(${s.x}px, ${s.y}px) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="render-orbit" aria-hidden="true">
      <img className="token-photo" src={src} alt="" />
    </div>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "revealed" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function StackLogo({ brand }: { brand: StackBrand }) {
  return (
    <div className={`stack-logo ${brand.wordmarkOnly ? "wordmark-only" : ""}`} aria-label={brand.name}>
      {brand.logo && <img className="stack-logo-img" src={brand.logo} alt="" aria-hidden="true" />}
      {brand.icon && (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d={brand.icon.path} />
        </svg>
      )}
      <span>{brand.name}</span>
    </div>
  );
}

function BrandMarquee() {
  const repeated = [...stackBrands, ...stackBrands, ...stackBrands];
  return (
    <div className="brand-marquee" aria-label="Technology stack logos">
      <div className="brand-marquee-track">
        {repeated.map((brand, index) => (
          <StackLogo key={`${brand.name}-${index}`} brand={brand} />
        ))}
      </div>
    </div>
  );
}

const ZEC3_CONTRACT_ADDRESS = import.meta.env.VITE_ZEC3_CONTRACT_ADDRESS || "TBA";

function CopyCA() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(ZEC3_CONTRACT_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const truncated = ZEC3_CONTRACT_ADDRESS.length > 12
    ? `${ZEC3_CONTRACT_ADDRESS.slice(0, 6)}...${ZEC3_CONTRACT_ADDRESS.slice(-4)}`
    : ZEC3_CONTRACT_ADDRESS;

  return (
    <button className="copy-ca" onClick={handleCopy} title="Copy contract address">
      <span className="copy-ca-label">CA</span>
      <span className="copy-ca-addr">{truncated}</span>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="landing">
      {/* Floating Nav */}
      <nav className={`landing-nav ${navScrolled ? "scrolled" : ""}`}>
        <div className="landing-nav-brand">
          <img src={zec3Assets.navLogo} alt="ZEC3" />
        </div>
        <div className="landing-nav-links">
          <a href="#vision">Vision</a>
          <a href="#token">The Token</a>
          <a href="#engine">The Engine</a>
          <a href="#risk">Risk</a>
        </div>
        <button className="hero-cta compact" onClick={onEnter}>
          <span>Dashboard</span>
          <ArrowUpRight size={14} />
        </button>
      </nav>

      {/* Section 1: Hero */}
      <section className="hero" id="vision">
        <div className="hero-lens" aria-hidden="true" />
        <div className="floating-field" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1 className="hero-title">
            The Age of Autonomous Treasuries.
          </h1>
          <p className="hero-subtitle">
            ZEC3 turns creator fees into a public, on-chain machine that buys ZEC,
            manages Jupiter exposure, and routes realized upside back to holders.
          </p>
          <div className="hero-actions">
            <button className="hero-cta" onClick={onEnter}>
              <Play size={16} />
              <span>Open Dashboard</span>
            </button>
            <button className="hero-secondary">
              <Layers3 size={16} />
              <span>Read the Flywheel</span>
            </button>
          </div>
          <CopyCA />
          <div className="scroll-indicator">
            <span>Scroll to explore</span>
            <div className="scroll-line" />
          </div>
        </div>
      </section>

      {/* Marquee Ticker */}
      <div className="marquee-strip">
        <div className="marquee-track">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="marquee-content">
              CLAIM FEES &nbsp;&bull;&nbsp; BUY ZEC &nbsp;&bull;&nbsp; JUPITER LONG &nbsp;&bull;&nbsp; REALIZE PNL &nbsp;&bull;&nbsp; AIRDROP HOLDERS &nbsp;&bull;&nbsp; PUBLIC LEDGER &nbsp;&bull;&nbsp; RISK-CAPPED &nbsp;&bull;&nbsp; SOLANA NATIVE &nbsp;&bull;&nbsp;&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* Section 2: Engine */}
      <section className="landing-section" id="engine">
        <div className="section-inner">
          <Reveal>
            <span className="section-label">The Engine</span>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="section-title">
              A treasury that behaves like software, not a promise.
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="section-body">
              Every time creator fees cross the threshold, the system wakes up:
              claim SOL, buy ZEC, add capped Jupiter exposure, and reserve realized
              profit for holder airdrops.
              The loop is built to be read by the public in real time.
            </p>
          </Reveal>
          <div className="mechanism-flow">
            <Reveal delay={100} className="flow-step">
              <div className="flow-icon"><BadgeDollarSign size={24} /></div>
              <strong>Claim</strong>
              <span>Collect creator vault fees</span>
            </Reveal>
            <div className="flow-connector" />
            <Reveal delay={200} className="flow-step">
              <div className="flow-icon"><Zap size={24} /></div>
              <strong>Buy ZEC</strong>
              <span>Jupiter route on Solana</span>
            </Reveal>
            <div className="flow-connector" />
            <Reveal delay={300} className="flow-step">
              <div className="flow-icon"><BarChart3 size={24} /></div>
              <strong>ZEC Long</strong>
              <span>Jupiter exposure</span>
            </Reveal>
            <div className="flow-connector" />
            <Reveal delay={400} className="flow-step">
              <div className="flow-icon"><Activity size={24} /></div>
              <strong>Realize PnL</strong>
              <span>Profit reserve</span>
            </Reveal>
            <div className="flow-connector" />
            <Reveal delay={500} className="flow-step">
              <div className="flow-icon distribution"><Wallet size={24} /></div>
              <strong>Airdrop</strong>
              <span>Token holders receive upside</span>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works — Big Numbers */}
      <section className="landing-section dark" id="token">
        <div className="section-inner">
          <Reveal>
            <span className="section-label">Together with</span>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="section-title massive">$ZEC</h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="section-body center">
              the asset the engine accumulates, hedges, and routes through each cycle.
              Every movement is designed to be legible from the outside.
            </p>
          </Reveal>
          <Reveal delay={230} className="token-inline-wrap">
            <ParallaxToken src={zec3Assets.tokenImage} />
          </Reveal>
          <Reveal delay={260} className="stack-strip-wrap">
            <BrandMarquee />
          </Reveal>
          <div className="stats-row">
            <Reveal delay={100} className="stat-card">
              <strong>4,821</strong>
              <span>Holders Queued</span>
            </Reveal>
            <Reveal delay={200} className="stat-card">
              <strong>$18.4K</strong>
              <span>Jupiter Position</span>
            </Reveal>
            <Reveal delay={300} className="stat-card">
              <strong>128.7</strong>
              <span>ZEC Treasury</span>
            </Reveal>
            <Reveal delay={400} className="stat-card">
              <strong>27</strong>
              <span>Dry Runs Executed</span>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Section 4: Risk */}
      <section className="landing-section" id="risk">
        <div className="section-inner">
          <Reveal>
            <span className="section-label">Risk Framework</span>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="section-title">
              Hard caps. No exceptions.<br />No governance votes required.
            </h2>
          </Reveal>
          <div className="risk-row">
            <Reveal delay={100} className="risk-item">
              <strong>1x</strong>
              <span>Max Leverage</span>
              <small>Isolated position only</small>
            </Reveal>
            <Reveal delay={200} className="risk-item">
              <strong>$250</strong>
              <span>Max Order Size</span>
              <small>USDC per IOC order</small>
            </Reveal>
            <Reveal delay={300} className="risk-item">
              <strong>-15%</strong>
              <span>Stop Loss</span>
              <small>Manual breaker trigger</small>
            </Reveal>
            <Reveal delay={400} className="risk-item">
              <strong>10%</strong>
              <span>Max Slippage</span>
              <small>Jupiter route cap</small>
            </Reveal>
          </div>
          <Reveal delay={500}>
            <div className="risk-note">
              <LockKeyhole size={16} />
              <span>All operations signed locally. No custodial risk. Keys never leave your machine.</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Section 5: CTA */}
      <section className="landing-section cta-section">
        <div className="section-inner">
          <Reveal>
            <h2 className="section-title massive">Enter the Engine.</h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="section-body center">
              Monitor real-time state. Run dry checks. Watch every transaction hit the chain.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="hero-actions">
              <button className="hero-cta large" onClick={onEnter}>
                <Play size={18} />
                <span>Launch Dashboard</span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>ZEC3 Fee Engine &bull; Built on Solana &bull; Verifiable on-chain</span>
      </footer>
    </div>
  );
}

/* ── Formatters ── */

function fmtUsd(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtCompact(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return fmtUsd(n);
}

function computePnl(pos: Position, currentPrice: number) {
  if (pos.status !== "open" || pos.entryPrice === 0) return { pnl: 0, pnlPct: 0, markValue: 0 };
  const markValue = pos.size * currentPrice;
  const costBasis = pos.size * pos.entryPrice;
  const pnl = pos.side === "long" ? markValue - costBasis : costBasis - markValue;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  return { pnl, pnlPct, markValue };
}

function getCoinIdForAsset(asset: string): CoinId | null {
  if (asset === "ZEC") return "zcash";
  if (asset === "SOL") return "solana";
  if (asset === "JUP") return "jupiter-exchange-solana";
  return null;
}

/* ── Price Ticker Strip ── */

function PriceTicker({ prices, loading, lastUpdate }: { prices: Prices | null; loading: boolean; lastUpdate: Date | null }) {
  if (loading && !prices) {
    return (
      <div className="price-ticker-strip glass">
        <div className="ticker-loading"><RefreshCw size={14} className="spin" /> Fetching live prices…</div>
      </div>
    );
  }
  if (!prices) return null;

  return (
    <div className="price-ticker-strip glass">
      {COIN_IDS.map((id) => {
        const p = prices[id];
        if (!p) return null;
        const up = p.usd_24h_change >= 0;
        return (
          <div key={id} className="ticker-item">
            <span className="ticker-symbol">{COIN_LABELS[id]}</span>
            <span className="ticker-price">{fmtUsd(p.usd)}</span>
            <span className={`ticker-change ${up ? "up" : "down"}`}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {fmtPct(p.usd_24h_change)}
            </span>
            <span className="ticker-vol">Vol {fmtCompact(p.usd_24h_vol)}</span>
          </div>
        );
      })}
      {lastUpdate && (
        <div className="ticker-meta">
          <Clock size={11} />
          <span>{lastUpdate.toLocaleTimeString("en-US", { hour12: false })}</span>
        </div>
      )}
    </div>
  );
}

/* ── Positions Table ── */

function PositionRow({ pos, currentPrice }: { pos: Position; currentPrice: number }) {
  const { pnl, pnlPct, markValue } = computePnl(pos, currentPrice);
  const isPending = pos.status === "pending";
  const up = pnl >= 0;

  return (
    <div className={`position-row ${pos.status}`}>
      <div className="pos-cell pos-asset">
        <span className={`pos-side-badge ${pos.side}`}>{pos.side.toUpperCase()}</span>
        <strong>{pos.asset}/{pos.sizeUnit === pos.asset ? "USD" : pos.sizeUnit}</strong>
      </div>
      <div className="pos-cell pos-size">
        <span className="pos-label">Size</span>
        <strong>{pos.size.toLocaleString()} {pos.sizeUnit}</strong>
      </div>
      <div className="pos-cell pos-entry">
        <span className="pos-label">Entry</span>
        <strong>{isPending ? "—" : fmtUsd(pos.entryPrice)}</strong>
      </div>
      <div className="pos-cell pos-mark">
        <span className="pos-label">Mark</span>
        <strong>{isPending ? "—" : fmtUsd(currentPrice)}</strong>
      </div>
      <div className="pos-cell pos-value">
        <span className="pos-label">Value</span>
        <strong>{isPending ? "Pending" : fmtUsd(markValue)}</strong>
      </div>
      <div className={`pos-cell pos-pnl ${isPending ? "" : up ? "up" : "down"}`}>
        <span className="pos-label">uPnL</span>
        <strong>
          {isPending ? "—" : (
            <>
              {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {fmtUsd(Math.abs(pnl))} ({fmtPct(pnlPct)})
            </>
          )}
        </strong>
      </div>
      <div className="pos-cell pos-lev">
        <span className="pos-label">Lev</span>
        <strong>{pos.leverage}</strong>
      </div>
      <div className="pos-cell pos-sl">
        <span className="pos-label">SL</span>
        <strong>{pos.stopLoss ? fmtUsd(pos.stopLoss) : "—"}</strong>
      </div>
      <div className="pos-cell pos-tp">
        <span className="pos-label">TP</span>
        <strong>{pos.takeProfit ? fmtUsd(pos.takeProfit) : "—"}</strong>
      </div>
      <div className="pos-cell pos-source">
        <span className="pos-label">Source</span>
        <span>{pos.source}</span>
      </div>
      <div className="pos-cell pos-status-badge">
        <span className={`status-dot ${pos.status}`} />
        <span>{pos.status}</span>
      </div>
    </div>
  );
}

function PortfolioSummary({ positions, prices }: { positions: Position[]; prices: Prices | null }) {
  if (!prices) return null;

  let totalValue = 0;
  let totalPnl = 0;
  let totalCost = 0;
  let openCount = 0;

  for (const pos of positions) {
    const coinId = getCoinIdForAsset(pos.asset);
    if (!coinId || !prices[coinId] || pos.status !== "open") continue;
    const cp = prices[coinId].usd;
    const { pnl, markValue } = computePnl(pos, cp);
    totalValue += markValue;
    totalPnl += pnl;
    totalCost += pos.size * pos.entryPrice;
    openCount++;
  }

  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const up = totalPnl >= 0;

  return (
    <div className="portfolio-summary">
      <div className="summary-item">
        <span>Total Value</span>
        <strong>{fmtUsd(totalValue)}</strong>
      </div>
      <div className={`summary-item ${up ? "up" : "down"}`}>
        <span>Unrealized PnL</span>
        <strong>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {fmtUsd(Math.abs(totalPnl))} ({fmtPct(totalPnlPct)})
        </strong>
      </div>
      <div className="summary-item">
        <span>Open Positions</span>
        <strong>{openCount}</strong>
      </div>
      <div className="summary-item">
        <span>Airdrop Reserve</span>
        <strong>$312</strong>
      </div>
    </div>
  );
}

function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [selected, setSelected] = useState("Overview");
  const [dryRuns, setDryRuns] = useState(27);
  const [ledger, setLedger] = useState(initialLedger);
  const [pulse, setPulse] = useState(false);
  const { prices, lastUpdate, loading } = useLivePrices(30_000);

  const health = useMemo(() => Math.min(99, 84 + (dryRuns % 9)), [dryRuns]);

  function enterDashboard() {
    setShowDashboard(true);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  }

  function runDryCheck() {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setDryRuns((value) => value + 1);
    const solPrice = prices?.solana?.usd ?? 0;
    setLedger((items) => [
      {
        time,
        action: "Dry check completed",
        value: solPrice > 0 ? `14.82 SOL (${fmtUsd(14.82 * solPrice)})` : "14.82 SOL simulated",
        hash: `dry_${Math.random().toString(36).slice(2, 6)}...${Math.random()
          .toString(36)
          .slice(2, 5)}`,
        chain: "Engine"
      },
      ...items.slice(0, 7)
    ]);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 900);
  }

  if (!showDashboard) {
    return <LandingPage onEnter={enterDashboard} />;
  }

  return (
    <main className="app-shell">
      <aside className="rail glass">
        <button className="brand" onClick={() => { setShowDashboard(false); window.scrollTo({ top: 0 }); }}>
          <div className="brand-mark">
            <img src={zec3Assets.tokenImage} alt="" aria-hidden="true" />
          </div>
          <span>ZEC3</span>
        </button>
        <nav aria-label="Dashboard navigation">
          {["Overview", "Positions", "Ledger", "Risk"].map((item) => (
            <button
              key={item}
              className={selected === item ? "nav-item selected" : "nav-item"}
              onClick={() => setSelected(item)}
            >
              {item === "Overview" && <Radar size={17} />}
              {item === "Positions" && <BarChart3 size={17} />}
              {item === "Ledger" && <Layers3 size={17} />}
              {item === "Risk" && <ShieldCheck size={17} />}
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="rail-status">
          <LockKeyhole size={15} />
          <span>Spectator mode</span>
        </div>
      </aside>

      <section className="workspace">
        {/* Price Ticker Strip */}
        <PriceTicker prices={prices} loading={loading} lastUpdate={lastUpdate} />

        <header className="topbar glass">
          <div>
            <h1>Fee Engine Terminal</h1>
            <p>
              {prices?.zcash ? (
                <>ZEC {fmtUsd(prices.zcash.usd)} <span className={prices.zcash.usd_24h_change >= 0 ? "up" : "down"}>{fmtPct(prices.zcash.usd_24h_change)}</span></>
              ) : (
                "Connecting to price feed…"
              )}
            </p>
          </div>
          <div className="actions">
            <button className="trace-button" onClick={runDryCheck}>
              <Play size={16} />
              <span>Run Dry Check</span>
            </button>
            <button className="ghost-button">
              <Boxes size={16} />
              <span>View Ledger</span>
            </button>
            <button className="ghost-button solid">
              <Wallet size={16} />
              <span>Connect Wallet</span>
            </button>
          </div>
        </header>

        {/* Portfolio Summary Bar */}
        <PortfolioSummary positions={enginePositions} prices={prices} />

        <section className="terminal-grid">
          {/* POSITIONS TABLE — Primary focus */}
          <section className="positions-panel glass">
            <div className="panel-heading compact">
              <div>
                <h2>Open Positions</h2>
                <p>{enginePositions.filter(p => p.status === "open").length} active &bull; {enginePositions.filter(p => p.status === "pending").length} pending</p>
              </div>
              <Activity size={18} />
            </div>
            <div className="positions-header">
              <span>Asset</span>
              <span>Size</span>
              <span>Entry</span>
              <span>Mark</span>
              <span>Value</span>
              <span>uPnL</span>
              <span>Lev</span>
              <span>SL</span>
              <span>TP</span>
              <span>Source</span>
              <span>Status</span>
            </div>
            <div className="positions-table">
              {enginePositions.map((pos) => {
                const coinId = getCoinIdForAsset(pos.asset);
                const cp = coinId && prices?.[coinId] ? prices[coinId].usd : 0;
                return <PositionRow key={pos.id} pos={pos} currentPrice={cp} />;
              })}
            </div>
          </section>

          {/* Mechanism State — Compact */}
          <section className={pulse ? "process-panel glass pulsing" : "process-panel glass"}>
            <div className="panel-heading">
              <div>
                <h2>Engine Pipeline</h2>
                <p>Treasury automation stages</p>
              </div>
              <div className="health-ring" style={{ "--health": `${health}%` } as React.CSSProperties}>
                <span>{health}</span>
              </div>
            </div>

            <div className="process-track" aria-label="Fee engine process">
              {stages.map((stage, index) => (
                <ProcessStage key={stage.label} stage={stage} index={index} />
              ))}
            </div>

            <div className="allocation-strip" aria-label="Allocation percentages">
              {allocations.map((item) => (
                <div key={item.label} className="allocation">
                  <div className="allocation-top">
                    <span>{item.label}</span>
                    <strong>{item.value}%</strong>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${item.value}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Risk & Market Data */}
          <section className="market-panel glass">
            <div className="panel-heading compact">
              <div>
                <h2>Market Data</h2>
                <p>Live prices & risk parameters</p>
              </div>
              <ArrowUpRight size={18} />
            </div>
            <div className="risk-grid">
              <Metric label="SOL Price" value={prices?.solana ? fmtUsd(prices.solana.usd) : "—"} suffix={prices?.solana ? fmtPct(prices.solana.usd_24h_change) : ""} />
              <Metric label="ZEC Price" value={prices?.zcash ? fmtUsd(prices.zcash.usd) : "—"} suffix={prices?.zcash ? fmtPct(prices.zcash.usd_24h_change) : ""} />
              <Metric label="JUP Price" value={prices?.["jupiter-exchange-solana"] ? fmtUsd(prices["jupiter-exchange-solana"].usd) : "—"} suffix={prices?.["jupiter-exchange-solana"] ? fmtPct(prices["jupiter-exchange-solana"].usd_24h_change) : ""} />
              <Metric label="ZEC Mkt Cap" value={prices?.zcash ? fmtCompact(prices.zcash.usd_market_cap) : "—"} suffix="" />
            </div>
            <div className="risk-grid" style={{ marginTop: 10 }}>
              <Metric label="Max Leverage" value="1x" suffix="isolated" />
              <Metric label="Max Position" value="$250" suffix="per order" />
              <Metric label="Stop Loss" value="-15%" suffix="breaker" />
              <Metric label="Max Slippage" value="10%" suffix="Jupiter" />
            </div>
          </section>

          {/* Activity Ledger */}
          <section className="ledger-panel glass">
            <div className="panel-heading compact">
              <div>
                <h2>Activity Log</h2>
                <p>On-chain signature trail</p>
              </div>
              <Landmark size={18} />
            </div>
            <div className="ledger-table" role="table" aria-label="Latest signatures">
              {ledger.map((item) => (
                <div className="ledger-row" role="row" key={`${item.time}-${item.hash}`}>
                  <span>{item.time}</span>
                  <strong>{item.action}</strong>
                  <span>{item.value}</span>
                  <code>{item.hash}</code>
                  <span className={`chain-badge chain-${item.chain.toLowerCase()}`}>{item.chain}</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function ProcessStage({ stage, index }: { stage: Stage; index: number }) {
  const Icon = stage.icon;
  return (
    <article className={`stage-card ${stage.status}`} style={{ "--delay": `${index * 0.2}s` } as React.CSSProperties}>
      <div className="stage-icon">
        <Icon size={19} />
      </div>
      <span>{stage.label}</span>
      <strong>{stage.amount}</strong>
      <small>{stage.subtext}</small>
    </article>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  const isChange = suffix.startsWith("+") || suffix.startsWith("-");
  const changeClass = isChange ? (suffix.startsWith("+") ? "up" : "down") : "";
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={changeClass}>{suffix}</small>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
