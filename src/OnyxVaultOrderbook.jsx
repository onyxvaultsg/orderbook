import { useState, useCallback, useRef, useEffect } from "react";

// ── Orderbook Engine (JS port) ──────────────────────────────────
let orderCounter = 0;
const genId = () => (++orderCounter).toString(36).padStart(4, "0");
const genTradeId = () => Math.random().toString(36).slice(2, 10);

function createOrder(side, price, qty, trader) {
  return {
    id: genId(),
    side,
    price: parseFloat(price),
    qty: parseInt(qty),
    filledQty: 0,
    trader,
    timestamp: Date.now(),
    get remaining() { return this.qty - this.filledQty; },
  };
}

function createEngine(cardId, feeBps = 150) {
  return {
    cardId,
    feeBps,
    bids: [],
    asks: [],
    trades: [],
    totalRevenue: 0,
  };
}

function submitOrder(engine, order) {
  const e = { ...engine, bids: [...engine.bids], asks: [...engine.asks], trades: [...engine.trades] };
  const newTrades = [];
  const opposite = order.side === "BID" ? e.asks : e.bids;

  while (order.remaining > 0 && opposite.length > 0) {
    const best = opposite[0];
    if (order.side === "BID" && order.price < best.price) break;
    if (order.side === "ASK" && order.price > best.price) break;

    const fillQty = Math.min(order.remaining, best.remaining);
    const fillPrice = best.price;
    const notional = fillPrice * fillQty;
    const feeSide = notional * (e.feeBps / 10000);
    const platRev = feeSide * 2;

    const trade = {
      id: genTradeId(),
      cardId: e.cardId,
      price: fillPrice,
      qty: fillQty,
      buyer: order.side === "BID" ? order.trader : best.trader,
      seller: order.side === "ASK" ? order.trader : best.trader,
      buyerFee: feeSide,
      sellerFee: feeSide,
      platformRevenue: platRev,
      timestamp: Date.now(),
    };
    newTrades.push(trade);
    e.trades = [trade, ...e.trades];
    e.totalRevenue += platRev;

    order.filledQty += fillQty;
    best.filledQty += fillQty;

    if (best.remaining <= 0) opposite.shift();
  }

  if (order.remaining > 0) {
    if (order.side === "BID") {
      e.bids = [...e.bids, order].sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    } else {
      e.asks = [...e.asks, order].sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
    }
  }
  return { engine: e, trades: newTrades };
}

function getDepth(orders, levels = 8) {
  const map = {};
  for (const o of orders) {
    map[o.price] = (map[o.price] || 0) + o.remaining;
  }
  return Object.entries(map).slice(0, levels).map(([p, q]) => ({ price: parseFloat(p), qty: q }));
}

// ── Seed Data ───────────────────────────────────────────────────
const CARDS = [
  { id: "SV01-025-PSA10", name: "Charizard ex SV", set: "Scarlet & Violet", grade: "PSA 10" },
  { id: "SWSH12-GG70-PSA10", name: "Giratina V Alt Art", set: "Crown Zenith", grade: "PSA 10" },
  { id: "SM12-SV49-PSA10", name: "Charizard VMAX", set: "Cosmic Eclipse", grade: "PSA 10" },
];

const TRADERS = ["KantoKid", "JohtoTrader", "HoennVault", "SinnohDeals", "UnovaFlips", "KalosKing", "AlolaArb", "GalarGains"];

function seedBook(card) {
  let engine = createEngine(card.id, 150);
  const basePrice = card.id.includes("SV01") ? 285 : card.id.includes("GG70") ? 165 : 420;

  for (let i = 0; i < 6; i++) {
    const bidPrice = basePrice - 2 - i * (1 + Math.random() * 2);
    const askPrice = basePrice + 2 + i * (1 + Math.random() * 2);
    const bidOrder = createOrder("BID", bidPrice.toFixed(2), Math.ceil(Math.random() * 4), TRADERS[Math.floor(Math.random() * TRADERS.length)]);
    const askOrder = createOrder("ASK", askPrice.toFixed(2), Math.ceil(Math.random() * 4), TRADERS[Math.floor(Math.random() * TRADERS.length)]);
    const r1 = submitOrder(engine, bidOrder);
    engine = r1.engine;
    const r2 = submitOrder(engine, askOrder);
    engine = r2.engine;
  }
  return engine;
}

// ── Styles ──────────────────────────────────────────────────────
const font = `'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`;
const fontSans = `'DM Sans', 'Segoe UI', system-ui, sans-serif`;

const C = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surface2: "#1a1a26",
  border: "#2a2a3a",
  borderActive: "#4a4a6a",
  text: "#e8e8f0",
  textDim: "#8888a8",
  textMuted: "#55556a",
  bid: "#00e676",
  bidBg: "rgba(0,230,118,0.06)",
  bidGlow: "rgba(0,230,118,0.15)",
  ask: "#ff5252",
  askBg: "rgba(255,82,82,0.06)",
  askGlow: "rgba(255,82,82,0.15)",
  accent: "#bb86fc",
  accentDim: "rgba(187,134,252,0.15)",
  gold: "#ffd740",
  goldDim: "rgba(255,215,64,0.12)",
};

// ── Components ──────────────────────────────────────────────────

const DepthBar = ({ side, pct }) => (
  <div style={{
    position: "absolute", top: 0, bottom: 0,
    [side === "BID" ? "right" : "left"]: 0,
    width: `${Math.min(pct, 100)}%`,
    background: side === "BID"
      ? `linear-gradient(${side === "BID" ? "to left" : "to right"}, ${C.bidBg}, transparent)`
      : `linear-gradient(${side === "ASK" ? "to right" : "to left"}, ${C.askBg}, transparent)`,
    transition: "width 0.3s ease",
  }} />
);

const PriceLevel = ({ price, qty, side, maxQty }) => (
  <div style={{
    position: "relative",
    display: "flex", justifyContent: "space-between",
    padding: "3px 10px",
    fontSize: 13, fontFamily: font,
    borderBottom: `1px solid ${C.bg}`,
  }}>
    <DepthBar side={side} pct={(qty / maxQty) * 100} />
    <span style={{ color: side === "BID" ? C.bid : C.ask, zIndex: 1, fontWeight: 600 }}>
      ${price.toFixed(2)}
    </span>
    <span style={{ color: C.textDim, zIndex: 1 }}>{qty}</span>
  </div>
);

const Stat = ({ label, value, color }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3, fontFamily: fontSans }}>{label}</div>
    <div style={{ fontSize: 16, color: color || C.text, fontFamily: font, fontWeight: 700 }}>{value}</div>
  </div>
);

const FlashTrade = ({ trade }) => {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setOpacity(0.5), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 10px", fontSize: 12, fontFamily: font,
      borderBottom: `1px solid ${C.bg}`,
      opacity, transition: "opacity 0.5s ease",
      background: C.surface,
    }}>
      <span style={{ color: C.textMuted, width: 70 }}>{new Date(trade.timestamp).toLocaleTimeString()}</span>
      <span style={{ color: C.text, fontWeight: 600 }}>${trade.price.toFixed(2)}</span>
      <span style={{ color: C.textDim }}>{trade.qty}x</span>
      <span style={{ color: C.gold, fontSize: 11 }}>+${trade.platformRevenue.toFixed(2)}</span>
    </div>
  );
};

// ── Main App ────────────────────────────────────────────────────
export default function OnyxVaultOrderbook() {
  const [selectedCard, setSelectedCard] = useState(0);
  const [engines, setEngines] = useState(() => CARDS.map(seedBook));
  const [side, setSide] = useState("BID");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [trader, setTrader] = useState("OnyxVault");
  const [flash, setFlash] = useState(null);

  const engine = engines[selectedCard];
  const card = CARDS[selectedCard];
  const bids = getDepth(engine.bids);
  const asks = getDepth(engine.asks);
  const maxQty = Math.max(...[...bids, ...asks].map(l => l.qty), 1);
  const bestBid = engine.bids.length > 0 ? engine.bids[0].price : null;
  const bestAsk = engine.asks.length > 0 ? engine.asks[0].price : null;
  const spread = bestBid != null && bestAsk != null ? (bestAsk - bestBid).toFixed(2) : "—";
  const mid = bestBid != null && bestAsk != null ? ((bestBid + bestAsk) / 2).toFixed(2) : "—";

  const handleSubmit = useCallback(() => {
    if (!price || !qty) return;
    const order = createOrder(side, price, qty, trader);
    const result = submitOrder(engines[selectedCard], order);
    const updated = [...engines];
    updated[selectedCard] = result.engine;
    setEngines(updated);
    if (result.trades.length > 0) {
      setFlash(result.trades[0]);
      setTimeout(() => setFlash(null), 2000);
    }
    setPrice("");
    setQty("1");
  }, [side, price, qty, trader, engines, selectedCard]);

  const handleSimTrade = useCallback(() => {
    const isBuy = Math.random() > 0.5;
    const base = isBuy
      ? (bestAsk != null ? bestAsk + (Math.random() - 0.5) * 3 : 100)
      : (bestBid != null ? bestBid + (Math.random() - 0.5) * 3 : 95);
    const order = createOrder(
      isBuy ? "BID" : "ASK",
      Math.max(1, base).toFixed(2),
      Math.ceil(Math.random() * 3),
      TRADERS[Math.floor(Math.random() * TRADERS.length)]
    );
    const result = submitOrder(engines[selectedCard], order);
    const updated = [...engines];
    updated[selectedCard] = result.engine;
    setEngines(updated);
    if (result.trades.length > 0) {
      setFlash(result.trades[0]);
      setTimeout(() => setFlash(null), 2000);
    }
  }, [engines, selectedCard, bestBid, bestAsk]);

  // Auto-simulate
  const intervalRef = useRef(null);
  const [autoSim, setAutoSim] = useState(false);
  useEffect(() => {
    if (autoSim) {
      intervalRef.current = setInterval(handleSimTrade, 1200);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoSim, handleSimTrade]);

  const inputStyle = {
    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, fontFamily: font, fontSize: 13, padding: "8px 10px",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{
      background: C.bg, color: C.text, fontFamily: fontSans,
      minHeight: "100vh", padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 2,
            fontFamily: font,
            background: `linear-gradient(135deg, ${C.accent}, ${C.gold})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            ONYX VAULT
          </h1>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, marginTop: 2 }}>
            ANALYZE · ACQUIRE · PROFIT
          </div>
        </div>
        <div style={{
          background: C.goldDim, border: `1px solid ${C.gold}40`, borderRadius: 8,
          padding: "8px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1.5, marginBottom: 2 }}>PLATFORM REVENUE</div>
          <div style={{ fontSize: 18, fontFamily: font, color: C.gold, fontWeight: 700 }}>
            ${engine.totalRevenue.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Card Selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {CARDS.map((c, i) => (
          <button key={c.id} onClick={() => setSelectedCard(i)} style={{
            flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${i === selectedCard ? C.accent : C.border}`,
            background: i === selectedCard ? C.accentDim : C.surface,
            color: i === selectedCard ? C.accent : C.textDim,
            cursor: "pointer", fontFamily: fontSans, fontSize: 12, fontWeight: 600,
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 13, color: i === selectedCard ? C.text : C.textDim }}>{c.name}</div>
            <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{c.grade}</div>
          </button>
        ))}
      </div>

      {/* Flash notification */}
      {flash && (
        <div style={{
          background: `linear-gradient(90deg, ${C.bidGlow}, ${C.askGlow})`,
          border: `1px solid ${C.borderActive}`, borderRadius: 8,
          padding: "8px 16px", marginBottom: 12, display: "flex",
          justifyContent: "space-between", alignItems: "center",
          fontFamily: font, fontSize: 13,
          animation: "fadeIn 0.3s ease",
        }}>
          <span>FILL: {flash.qty}x @ ${flash.price.toFixed(2)}</span>
          <span style={{ color: C.bid }}>{flash.buyer}</span>
          <span style={{ color: C.textMuted }}>←</span>
          <span style={{ color: C.ask }}>{flash.seller}</span>
          <span style={{ color: C.gold }}>fee: ${flash.platformRevenue.toFixed(2)}</span>
        </div>
      )}

      {/* Stats bar */}
      <div style={{
        display: "flex", justifyContent: "space-around",
        background: C.surface, borderRadius: 10, padding: "12px 8px",
        marginBottom: 16, border: `1px solid ${C.border}`,
      }}>
        <Stat label="Best Bid" value={bestBid ? `$${bestBid.toFixed(2)}` : "—"} color={C.bid} />
        <Stat label="Best Ask" value={bestAsk ? `$${bestAsk.toFixed(2)}` : "—"} color={C.ask} />
        <Stat label="Spread" value={spread !== "—" ? `$${spread}` : "—"} />
        <Stat label="Mid" value={mid !== "—" ? `$${mid}` : "—"} color={C.accent} />
        <Stat label="Trades" value={engine.trades.length} />
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Bids */}
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            color: C.bid, borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>BIDS</span><span style={{ color: C.textMuted }}>PRICE / QTY</span>
          </div>
          {bids.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No bids</div>
            : bids.map((l, i) => <PriceLevel key={i} {...l} side="BID" maxQty={maxQty} />)
          }
        </div>

        {/* Asks */}
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            color: C.ask, borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>ASKS</span><span style={{ color: C.textMuted }}>PRICE / QTY</span>
          </div>
          {asks.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No asks</div>
            : asks.map((l, i) => <PriceLevel key={i} {...l} side="ASK" maxQty={maxQty} />)
          }
        </div>
      </div>

      {/* Order Entry + Trade Tape */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Order entry */}
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.textMuted, marginBottom: 12 }}>
            ORDER ENTRY
          </div>

          {/* Side toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["BID", "ASK"].map(s => (
              <button key={s} onClick={() => setSide(s)} style={{
                flex: 1, padding: "8px 0", borderRadius: 6, border: "none",
                background: side === s
                  ? (s === "BID" ? C.bidGlow : C.askGlow)
                  : C.surface2,
                color: side === s
                  ? (s === "BID" ? C.bid : C.ask)
                  : C.textMuted,
                fontFamily: font, fontSize: 13, fontWeight: 700,
                cursor: "pointer", transition: "all 0.2s",
                borderWidth: 1, borderStyle: "solid",
                borderColor: side === s
                  ? (s === "BID" ? `${C.bid}40` : `${C.ask}40`)
                  : C.border,
              }}>{s === "BID" ? "BUY" : "SELL"}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1 }}>PRICE ($)</label>
              <input
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder={bestBid ? bestBid.toFixed(2) : "0.00"}
                style={inputStyle}
                type="number" step="0.50"
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1 }}>QTY</label>
              <input
                value={qty}
                onChange={e => setQty(e.target.value)}
                style={inputStyle}
                type="number" min="1"
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1 }}>TRADER</label>
            <input value={trader} onChange={e => setTrader(e.target.value)} style={inputStyle} />
          </div>

          <button onClick={handleSubmit} style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
            background: side === "BID"
              ? `linear-gradient(135deg, ${C.bid}, #00c853)`
              : `linear-gradient(135deg, ${C.ask}, #d50000)`,
            color: "#fff", fontFamily: font, fontSize: 14, fontWeight: 700,
            cursor: "pointer", letterSpacing: 1,
            boxShadow: side === "BID" ? `0 4px 20px ${C.bidGlow}` : `0 4px 20px ${C.askGlow}`,
          }}>
            SUBMIT {side === "BID" ? "BUY" : "SELL"} ORDER
          </button>

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={handleSimTrade} style={{
              flex: 1, padding: "7px 0", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.surface2,
              color: C.textDim, fontFamily: font, fontSize: 11,
              cursor: "pointer",
            }}>
              SIM TRADE
            </button>
            <button onClick={() => setAutoSim(!autoSim)} style={{
              flex: 1, padding: "7px 0", borderRadius: 6,
              border: `1px solid ${autoSim ? C.accent : C.border}`,
              background: autoSim ? C.accentDim : C.surface2,
              color: autoSim ? C.accent : C.textDim,
              fontFamily: font, fontSize: 11, cursor: "pointer",
            }}>
              {autoSim ? "⏸ STOP AUTO" : "▶ AUTO SIM"}
            </button>
          </div>
        </div>

        {/* Trade tape */}
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            color: C.gold, borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>TRADE TAPE</span>
            <span style={{ color: C.textMuted }}>TIME / PRICE / QTY / FEE</span>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {engine.trades.length === 0
              ? <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No trades yet</div>
              : engine.trades.slice(0, 20).map(t => <FlashTrade key={t.id} trade={t} />)
            }
          </div>
        </div>
      </div>

      {/* Fee info */}
      <div style={{
        marginTop: 16, padding: "10px 16px", borderRadius: 8,
        background: C.surface, border: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, fontFamily: font, color: C.textMuted,
      }}>
        <span>FEE: {engine.feeBps} bps ({(engine.feeBps / 100).toFixed(1)}%) per side</span>
        <span>CARD: {card.id}</span>
        <span style={{ color: C.textDim }}>Engine: Price-Time Priority · Maker Price Execution</span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        input:focus { border-color: ${C.borderActive} !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
