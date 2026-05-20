import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { siSolana, siZcash, type SimpleIcon } from "simple-icons";
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CircleDotDashed,
  Gauge,
  Landmark,
  Layers3,
  LockKeyhole,
  Play,
  Radar,
  ShieldCheck,
  Wallet,
  Zap
} from "lucide-react";
import "./styles.css";

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

const statePanels = [
  { label: "Creator Vault", value: "2.38 SOL", detail: "Below run threshold", tone: "gold" },
  { label: "Solana ZEC", value: "128.7 ZEC", detail: "Treasury balance", tone: "cyan" },
  { label: "Jupiter ZEC Long", value: "$18.4K", detail: "+0.42% unrealized", tone: "cyan" },
  { label: "Airdrop Reserve", value: "$312", detail: "Realized PnL queued", tone: "gold" },
  { label: "Holder Queue", value: "4,821", detail: "Snapshot recipients", tone: "gold" }
];

const allocations = [
  { label: "Solana ZEC", value: 30, color: "var(--cyan)" },
  { label: "Jupiter Long", value: 30, color: "var(--blue)" },
  { label: "Holder Airdrop", value: 30, color: "var(--gold)" },
  { label: "Retained SOL", value: 10, color: "var(--platinum)" }
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

function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [selected, setSelected] = useState("Overview");
  const [dryRuns, setDryRuns] = useState(27);
  const [ledger, setLedger] = useState(initialLedger);
  const [pulse, setPulse] = useState(false);

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
    setLedger((items) => [
      {
        time,
        action: "Dry check completed",
        value: `${(14.82 + (dryRuns % 4) * 0.13).toFixed(2)} SOL simulated`,
        hash: `dry_${Math.random().toString(36).slice(2, 6)}...${Math.random()
          .toString(36)
          .slice(2, 5)}`,
        chain: "Engine"
      },
      ...items.slice(0, 5)
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
        <div className="brand">
          <div className="brand-mark">
            <img src={zec3Assets.tokenImage} alt="" aria-hidden="true" />
          </div>
          <span>ZEC3</span>
        </div>
        <nav aria-label="Dashboard navigation">
          {["Overview", "Ledger", "Risk", "Settings"].map((item) => (
            <button
              key={item}
              className={selected === item ? "nav-item selected" : "nav-item"}
              onClick={() => setSelected(item)}
            >
              {item === "Overview" && <Radar size={17} />}
              {item === "Ledger" && <Layers3 size={17} />}
              {item === "Risk" && <ShieldCheck size={17} />}
              {item === "Settings" && <Gauge size={17} />}
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="rail-status">
          <LockKeyhole size={15} />
          <span>Local signer only</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar glass">
          <div>
            <h1>Fee Engine Dashboard</h1>
            <p>Live automation: dry-run armed</p>
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

        <section className="dashboard-grid">
          <section className={pulse ? "process-panel glass pulsing" : "process-panel glass"}>
            <div className="panel-heading">
              <div>
                <h2>Mechanism State</h2>
                <p>Each module shows the next executable treasury action.</p>
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

            <div className="risk-caps" aria-label="Risk caps">
              <Metric label="Max Leverage" value="1x" suffix="isolated" />
              <Metric label="Max Position" value="250" suffix="USDC per order" />
              <Metric label="Stop Loss" value="-15%" suffix="manual breaker" />
              <Metric label="Max Slippage" value="10%" suffix="Jupiter route" />
            </div>
          </section>

          <aside className="state-stack">
            {statePanels.map((panel) => (
              <div key={panel.label} className={`state-panel glass ${panel.tone}`}>
                <span>{panel.label}</span>
                <strong>{panel.value}</strong>
                <small>{panel.detail}</small>
              </div>
            ))}
          </aside>

          <section className="market-panel glass">
            <div className="panel-heading compact">
              <div>
                <h2>Execution Map</h2>
                <p>Route spot accumulation, exposure, and holder distributions.</p>
              </div>
              <ArrowUpRight size={18} />
            </div>
            <div className="route-map">
              <div className="node primary">Pump.fun</div>
              <div className="path path-one" />
              <div className="node">Jupiter</div>
              <div className="path path-two" />
              <div className="node">ZEC Long</div>
              <div className="path path-three" />
              <div className="node distribution-node">Airdrop</div>
            </div>
            <div className="risk-grid">
              <Metric label="Claimed SOL" value="14.82" suffix="SOL" />
              <Metric label="ZEC Acquired" value="43.19" suffix="ZEC" />
              <Metric label="Jupiter Notional" value="2,950" suffix="USDC" />
              <Metric label="Airdrop Reserve" value="312" suffix="USDC" />
            </div>
          </section>

          <section className="ledger-panel glass">
            <div className="panel-heading compact">
              <div>
                <h2>Latest Signatures</h2>
                <p>Public activity trail for every automated run.</p>
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
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{suffix}</small>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
