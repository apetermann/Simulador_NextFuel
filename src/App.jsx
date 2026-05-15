import { useState, useMemo } from "react";
import {
  ComposedChart, Area, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";

// ══════════════════════════════════════════════════════════════
//  FINANCIAL ENGINE
// ══════════════════════════════════════════════════════════════

const calcNPV = (cfs, r) =>
  cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);

function calcIRR(cfs) {
  if (calcNPV(cfs, 0) <= 0) return null;
  let lo = 0, hi = 5;
  while (calcNPV(cfs, hi) > 0 && hi < 200) hi *= 2;
  if (calcNPV(cfs, hi) > 0) return null;
  for (let i = 0; i < 500; i++) {
    const m = (lo + hi) / 2;
    if (hi - lo < 1e-9) return m;
    calcNPV(cfs, m) > 0 ? (lo = m) : (hi = m);
  }
  return (lo + hi) / 2;
}

function compute(p) {
  // ── Production ──────────────────────────────────────────────
  const prod    = p.capacity * (p.availability / 91.3);
  const nafta   = prod * 0.275;
  const biochar = prod * 0.20;

  // ── Revenues (M R$) ─────────────────────────────────────────
  const rHVO    = prod * p.hvoPrice / 1e6;
  const rNafta  = nafta * p.naftaPrice / 1e6;
  const rBioc   = biochar * p.biocharPrice / 1e6;
  const rCBIOs  = p.cbios  * (prod / 4000);
  const rCarbon = p.carbon * (prod / 4000);
  const rBruto  = rHVO + rNafta + rBioc + rCBIOs + rCarbon;

  // ── CAPEX (M R$), scaled capacity^0.68 ──────────────────────
  const cx      = p.capex * Math.pow(p.capacity / 4000, 0.68);
  const wc      = cx * 0.10;
  const totInv  = cx + wc;
  const cxISBL  = cx * 0.578;
  const dep     = cx / p.life;

  // ── OPEX Variable (M R$) ────────────────────────────────────
  const h2ExtKg = 227 * (1 - p.h2Self / 100);
  const oBiom   = prod * 7.5   * p.biomassCost / 1e6;
  const oH2     = prod * h2ExtKg * p.h2Cost   / 1e6;
  const oElec   = prod * 3.4   * p.elecCost   / 1e6;
  const oCat    = prod * 0.015 * p.catCost    / 1e6;
  const oN2W    = 0.35;
  const opxV    = oBiom + oH2 + oElec + oCat + oN2W;

  // ── OPEX Fixed (M R$) ───────────────────────────────────────
  const oLab   = 4.50;
  const oMaint = cxISBL * 0.03;
  const oIns   = cx * 0.008;
  const oOvhd  = 0.90;
  const opxF   = oLab + oMaint + oIns + oOvhd;

  const opex   = opxV + opxF;

  // ── P&L (following EVTE convention: EBITDA = Revenue − OPEX) ─
  const ebitda = rBruto - opex;
  const ebit   = ebitda - dep;
  const tax    = Math.max(0, ebit) * 0.34;
  const netInc = ebit - tax;
  const ocf    = netInc + dep;

  const cpvSD  = opex        * 1e6 / prod;
  const cpvCD  = (opex + dep)* 1e6 / prod;
  const bePrice= cpvSD;   // approx break-even

  // ── Cash Flows: 4yr construction + life-yr operations ────────
  const cfs = [
    -cx * 0.30,           // year 0
    -cx * 0.40,           // year 1
    -cx * 0.20,           // year 2
    -cx * 0.10 - wc,      // year 3: final tranche + WC
  ];
  for (let i = 1; i <= p.life; i++) {
    cfs.push(i === p.life ? ocf + wc : ocf);
  }

  const irrV = calcIRR(cfs);
  const vpnV = calcNPV(cfs, p.tma / 100);

  // ── Cumulative CF + payback ──────────────────────────────────
  let payback = null, cum = 0;
  const cumCF = cfs.map((cf, i) => {
    cum += cf;
    if (cum >= 0 && payback === null) payback = i;
    return { yr: i, v: parseFloat(cum.toFixed(1)) };
  });

  // ── Sensitivity: TIR vs HVO price ───────────────────────────
  const hvoSens = [];
  for (let pr = 3000; pr <= 10000; pr += 500) {
    const r2 = { ...p, hvoPrice: pr };
    const m2 = compute_simple(r2, cx, wc, opxV, opxF, dep);
    const iv  = calcIRR(m2.cfs);
    hvoSens.push({ price: pr, tir: iv != null ? parseFloat((iv*100).toFixed(1)) : -5 });
  }

  // ── Sensitivity: TIR vs H2 cost ─────────────────────────────
  const h2Sens = [];
  for (let hc = 4; hc <= 30; hc += 2) {
    const r2   = { ...p, h2Cost: hc };
    const oH2b = prod * h2ExtKg * hc / 1e6;
    const opxVb= oBiom + oH2b + oElec + oCat + oN2W;
    const m2   = compute_simple(r2, cx, wc, opxVb, opxF, dep);
    const iv   = calcIRR(m2.cfs);
    h2Sens.push({ cost: hc, tir: iv != null ? parseFloat((iv*100).toFixed(1)) : -5 });
  }

  // ── Charts data ──────────────────────────────────────────────
  const opxPie = [
    { n: 'H₂ Externo',      v: oH2,          c: '#f87171' },
    { n: 'Energia',          v: oElec,         c: '#60a5fa' },
    { n: 'Biomassa',         v: oBiom,         c: '#4ade80' },
    { n: 'Catalisadores',    v: oCat,          c: '#c084fc' },
    { n: 'Mão de Obra',      v: oLab,          c: '#fbbf24' },
    { n: 'Manutenção',       v: oMaint,        c: '#22d3ee' },
    { n: 'Seguros',          v: oIns,          c: '#fb923c' },
    { n: 'Overhead+N₂+H₂O', v: oOvhd + oN2W,  c: '#a78bfa' },
  ];

  const bars = [
    { n: 'HVO',      rev: rHVO,   cost: 0        },
    { n: 'Nafta',    rev: rNafta, cost: 0        },
    { n: 'Biochar',  rev: rBioc,  cost: 0        },
    { n: 'CBIOs',    rev: rCBIOs, cost: 0        },
    { n: 'Carbono',  rev: rCarbon,cost: 0        },
    { n: 'H₂ Ext.',  rev: 0, cost: -oH2          },
    { n: 'Energia',  rev: 0, cost: -oElec        },
    { n: 'Biomassa', rev: 0, cost: -oBiom        },
    { n: 'Catalis.', rev: 0, cost: -oCat         },
    { n: 'MO+Fixos', rev: 0, cost: -opxF        },
  ];

  return {
    prod, nafta, biochar,
    rHVO, rNafta, rBioc, rCBIOs, rCarbon, rBruto,
    oBiom, oH2, oElec, oCat, oN2W, opxV,
    oLab, oMaint, oIns, oOvhd, opxF, opex,
    cx, wc, totInv, dep,
    ebitda, ebit, tax, netInc, ocf,
    cpvSD, cpvCD, bePrice,
    irrV, vpnV, payback, cumCF,
    opxPie, bars, hvoSens, h2Sens,
  };
}

// simplified re-compute for sensitivity (avoids recursion)
function compute_simple(p, cx, wc, opxVb, opxF, dep) {
  const prod    = p.capacity * (p.availability / 91.3);
  const nafta   = prod * 0.275;
  const biochar = prod * 0.20;
  const rHVO    = prod * p.hvoPrice / 1e6;
  const rNafta  = nafta * p.naftaPrice / 1e6;
  const rBioc   = biochar * p.biocharPrice / 1e6;
  const rCBIOs  = p.cbios  * (prod / 4000);
  const rCarbon = p.carbon * (prod / 4000);
  const rBruto  = rHVO + rNafta + rBioc + rCBIOs + rCarbon;
  const opex    = opxVb + opxF;
  const ebitda  = rBruto - opex;
  const ebit    = ebitda - dep;
  const tax     = Math.max(0, ebit) * 0.34;
  const netInc  = ebit - tax;
  const ocf     = netInc + dep;
  const cfs = [-cx*0.30, -cx*0.40, -cx*0.20, -cx*0.10 - wc];
  for (let i = 1; i <= p.life; i++) cfs.push(i === p.life ? ocf + wc : ocf);
  return { cfs };
}

// ══════════════════════════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════════════════════════
const TH = {
  bg:   '#060b16',
  sur:  '#0b1120',
  sur2: '#101828',
  bd:   '#172033',
  acc:  '#00e09a',
  ad:   '#009e6e',
  amb:  '#f59e0b',
  red:  '#f87171',
  blu:  '#60a5fa',
  tx:   '#ccd8eb',
  txS:  '#526a84',
  txM:  '#253347',
  mono: '"JetBrains Mono","Fira Code",monospace',
};

// ══════════════════════════════════════════════════════════════
//  SCENARIOS
// ══════════════════════════════════════════════════════════════
const SCENES = {
  pessimista: {
    capacity:4000, availability:85,
    hvoPrice:4500, naftaPrice:3200, biocharPrice:200,
    cbios:0.5, carbon:0.2,
    biomassCost:160, h2Cost:17, h2Self:30, elecCost:460, catCost:60000,
    capex:290, life:20, tma:15,
  },
  base: {
    capacity:4000, availability:91.3,
    hvoPrice:5500, naftaPrice:3800, biocharPrice:400,
    cbios:1.5, carbon:0.9,
    biomassCost:135, h2Cost:14.5, h2Self:35, elecCost:415, catCost:55000,
    capex:258, life:20, tma:15,
  },
  otimista: {
    capacity:4000, availability:93,
    hvoPrice:7000, naftaPrice:4500, biocharPrice:1500,
    cbios:3.0, carbon:3.6,
    biomassCost:120, h2Cost:9.5, h2Self:45, elecCost:380, catCost:48000,
    capex:240, life:20, tma:15,
  },
};

// ══════════════════════════════════════════════════════════════
//  SMALL COMPONENTS
// ══════════════════════════════════════════════════════════════

function Slider({ label, value, min, max, step, fmt, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 9.5, color: TH.txS, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <span style={{ fontSize: 10.5, color: TH.acc, fontFamily: TH.mono, fontWeight: 500 }}>{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: TH.acc, cursor: 'pointer', display: 'block' }}
      />
    </div>
  );
}

function KPI({ label, value, sub, pos, big }) {
  const col = pos === true ? TH.acc : pos === false ? TH.red : TH.tx;
  const bdc = pos === true ? '#009e6e70' : pos === false ? '#f8717160' : TH.bd;
  return (
    <div style={{ background: TH.sur2, border: `1px solid ${bdc}`, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: TH.txS, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: TH.mono, fontSize: big ? 20 : 15, fontWeight: 600, color: col, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: TH.txM, marginTop: 5, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Sec({ title }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: TH.mono, color: TH.ad,
      letterSpacing: '0.15em', textTransform: 'uppercase',
      margin: '16px 0 10px', paddingBottom: 6,
      borderBottom: `1px solid ${TH.bd}`,
    }}>{title}</div>
  );
}

function Card({ title, h, children }) {
  return (
    <div style={{ background: TH.sur, border: `1px solid ${TH.bd}`, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, fontFamily: TH.mono, color: TH.txS, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ height: h }}>{children}</div>
    </div>
  );
}

const CTip = ({ active, payload, label, isYr }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: TH.sur2, border: `1px solid ${TH.bd}`, borderRadius: 6, padding: '8px 12px', fontSize: 10 }}>
      <div style={{ color: TH.txS, marginBottom: 4, fontWeight: 500 }}>{isYr ? `Ano ${label}` : label}</div>
      {payload.map((p, i) => p.value !== 0 && (
        <div key={i} style={{ color: p.value >= 0 ? TH.acc : TH.red, lineHeight: 1.6 }}>
          {p.name && <span style={{ color: TH.txS }}>{p.name}: </span>}
          {p.value < 0 ? '−' : ''}R$ {Math.abs(p.value).toFixed(2)} M
        </div>
      ))}
    </div>
  );
};

const SensTip = ({ active, payload, label, xLabel, yLabel }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: TH.sur2, border: `1px solid ${TH.bd}`, borderRadius: 6, padding: '8px 12px', fontSize: 10 }}>
      <div style={{ color: TH.txS, marginBottom: 3 }}>{xLabel}: {label}</div>
      <div style={{ color: TH.acc }}>{yLabel}: {payload[0]?.value != null ? payload[0].value.toFixed(1) : '--'}% a.a.</div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [p, setP]     = useState(SCENES.base);
  const [scene, setScene] = useState('base');

  const set = k => v => { setP(prev => ({ ...prev, [k]: v })); setScene('custom'); };
  const loadScene = k => { setP(SCENES[k]); setScene(k); };

  const m = useMemo(() => compute(p), [p]);

  const irrPct  = m.irrV != null ? (m.irrV * 100).toFixed(1) : null;
  const irrPos  = m.irrV != null && m.irrV > p.tma / 100;
  const ebitPos = m.ebitda > 0;
  const vpnPos  = m.vpnV  > 0;

  const plRows = [
    { l: 'Receita Bruta',        v:  m.rBruto, bold: true },
    { l: '  (-) OPEX Variavel',  v: -m.opxV },
    { l: '  (-) OPEX Fixo',      v: -m.opxF },
    { l: 'EBITDA',                v:  m.ebitda, bold: true, hi: true },
    { l: '  (-) Depreciacao',     v: -m.dep },
    { l: 'EBIT',                  v:  m.ebit,   bold: true },
    { l: '  (-) IR/CSLL 34%',    v: -m.tax },
    { l: 'Lucro Liquido',         v:  m.netInc, bold: true, hi: true },
    { l: '  (+) Depreciacao',     v:  m.dep },
    { l: 'Fluxo de Caixa Op.',    v:  m.ocf,   bold: true, hi: true },
  ];

  const scBtn = k => ({
    flex: 1, padding: '5px 4px', borderRadius: 5, cursor: 'pointer',
    fontSize: 9.5, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
    border: `1px solid ${scene === k ? TH.acc : TH.bd}`,
    background: scene === k ? TH.acc + '18' : 'transparent',
    color: scene === k ? TH.acc : TH.txS,
    transition: 'all 0.15s',
  });

  const fM = (v, d = 1) => `${v < 0 ? '−' : ''}R$ ${Math.abs(v).toFixed(d)} M`;
  const paybackLabel = m.payback != null
    ? `Ano ${m.payback}  (${m.payback - 3}a pós startup)`
    : `> ${3 + p.life} anos`;

  return (
    <div style={{ fontFamily: '"DM Sans",system-ui,sans-serif', background: TH.bg, color: TH.tx, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input[type=range]{-webkit-appearance:none;appearance:none;background:${TH.bd};border-radius:2px;height:3px}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:${TH.acc};cursor:pointer;box-shadow:0 0 8px ${TH.acc}60}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${TH.bg}}
        ::-webkit-scrollbar-thumb{background:${TH.bd};border-radius:2px}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header style={{
        background: TH.sur, borderBottom: `1px solid ${TH.bd}`,
        padding: '9px 18px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 800, color: TH.acc, letterSpacing: '-0.01em' }}>
            HVO PLANT SIMULATOR
          </span>
          <span style={{ fontSize: 10, color: TH.txS }}>
            Pirolise Rápida BFB + HDO · Biomassa Florestal Lignocelulósica · EVTE Classe 4 · Abr/2026
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 9.5, color: TH.txM }}>Baseado em: EVTE — Paulo Sérgio de Melo / ETCbio</span>
          <button onClick={() => loadScene('base')} style={{
            background: 'transparent', border: `1px solid ${TH.bd}`, color: TH.txS,
            padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 9.5,
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>↺ Reset</button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── SIDEBAR ──────────────────────────────────────────── */}
        <aside style={{
          width: 276, flexShrink: 0, background: TH.sur,
          borderRight: `1px solid ${TH.bd}`, overflowY: 'auto', padding: '12px 14px',
        }}>

          {/* Scenario Presets */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, color: TH.ad, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: TH.mono, marginBottom: 8 }}>
              Cenário EVTE
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {['pessimista', 'base', 'otimista'].map(k => (
                <button key={k} style={scBtn(k)} onClick={() => loadScene(k)}>{k}</button>
              ))}
            </div>
          </div>

          <Sec title="Produção" />
          <Slider label="Capacidade HVO" value={p.capacity} min={1000} max={35000} step={500}
            fmt={v => `${v.toLocaleString('pt-BR')} t/ano`} onChange={set('capacity')} />
          <Slider label="Disponibilidade" value={p.availability} min={60} max={100} step={0.5}
            fmt={v => `${v.toFixed(1)}%  ·  ${Math.round(v * 3.65)} dias/ano`} onChange={set('availability')} />

          <Sec title="Preços de Venda" />
          <Slider label="HVO — Diesel Verde" value={p.hvoPrice} min={3000} max={12000} step={100}
            fmt={v => `R$ ${v.toLocaleString('pt-BR')}/t`} onChange={set('hvoPrice')} />
          <Slider label="Nafta Renovável" value={p.naftaPrice} min={1500} max={7000} step={100}
            fmt={v => `R$ ${v.toLocaleString('pt-BR')}/t`} onChange={set('naftaPrice')} />
          <Slider label="Biochar" value={p.biocharPrice} min={100} max={2000} step={50}
            fmt={v => `R$ ${v.toLocaleString('pt-BR')}/t`} onChange={set('biocharPrice')} />

          <Sec title="Receitas Complementares" />
          <Slider label="CBIOs — RenovaBio" value={p.cbios} min={0} max={8} step={0.1}
            fmt={v => `R$ ${v.toFixed(1)} M/ano base`} onChange={set('cbios')} />
          <Slider label="Créditos de Carbono" value={p.carbon} min={0} max={8} step={0.1}
            fmt={v => `R$ ${v.toFixed(1)} M/ano base`} onChange={set('carbon')} />

          <Sec title="Custos de Insumos" />
          <Slider label="Biomassa (coleta+frete)" value={p.biomassCost} min={50} max={350} step={5}
            fmt={v => `R$ ${v}/t úmida`} onChange={set('biomassCost')} />
          <Slider label="H₂ Externo (SMR/Verde)" value={p.h2Cost} min={4} max={35} step={0.5}
            fmt={v => `R$ ${v.toFixed(1)}/kg`} onChange={set('h2Cost')} />
          <Slider label="Autogeração de H₂ (char+gases)" value={p.h2Self} min={0} max={60} step={1}
            fmt={v => `${v}% do consumo total`} onChange={set('h2Self')} />
          <Slider label="Energia Elétrica" value={p.elecCost} min={200} max={800} step={10}
            fmt={v => `R$ ${v}/MWh`} onChange={set('elecCost')} />
          <Slider label="Catalisadores NiMo+RuC" value={p.catCost} min={20000} max={120000} step={2500}
            fmt={v => `R$ ${(v / 1000).toFixed(0)}k/t`} onChange={set('catCost')} />

          <Sec title="CAPEX" />
          <Slider label="CAPEX Base (ref. 4.000 t/ano)" value={p.capex} min={130} max={450} step={5}
            fmt={v => `R$ ${v} M`} onChange={set('capex')} />
          <div style={{ background: TH.sur2, borderRadius: 6, padding: '8px 10px', fontSize: 10, color: TH.txS, lineHeight: 2.1, marginBottom: 4 }}>
            <div>CAPEX escalado:{' '}
              <span style={{ color: TH.tx, fontFamily: TH.mono }}>R$ {m.cx.toFixed(0)} M</span>
            </div>
            <div>Cap. de giro (+10%):{' '}
              <span style={{ color: TH.tx, fontFamily: TH.mono }}>R$ {m.wc.toFixed(0)} M</span>
            </div>
            <div style={{ color: TH.acc }}>Invest. Total:{' '}
              <span style={{ fontFamily: TH.mono, fontWeight: 600 }}>R$ {m.totInv.toFixed(0)} M</span>
            </div>
          </div>

          <Sec title="Parâmetros Financeiros" />
          <Slider label="TMA (Taxa Mín. Atratividade)" value={p.tma} min={5} max={30} step={0.5}
            fmt={v => `${v.toFixed(1)}% a.a.`} onChange={set('tma')} />
          <Slider label="Vida Útil do Projeto" value={p.life} min={10} max={30} step={1}
            fmt={v => `${v} anos`} onChange={set('life')} />

          <div style={{ marginTop: 14, padding: '8px 10px', background: TH.sur2, borderRadius: 6, fontSize: 9.5, color: TH.txM, lineHeight: 1.8 }}>
            <div>• Constr. 4 anos (30/40/20/10% CAPEX)</div>
            <div>• Escalonamento: exp. 0,68</div>
            <div>• IR/CSLL: 34% sobre EBIT positivo</div>
            <div>• H₂ total: 227 kg/t HVO (EVTE base)</div>
          </div>
        </aside>

        {/* ── MAIN PANEL ───────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── KPI Row 1 ────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <KPI big label="TIR do Projeto"
              pos={irrPct != null ? irrPos : false}
              value={irrPct != null ? `${irrPct}% a.a.` : '< 0%  (N/D)'}
              sub={`TMA: ${p.tma}% a.a.  ·  ${irrPct != null ? (irrPos ? '✓ Acima da TMA' : '✗ Abaixo da TMA') : '✗ Sem TIR positiva'}`} />
            <KPI big label="VPL do Projeto"
              pos={vpnPos}
              value={fM(m.vpnV, 0)}
              sub={`TMA = ${p.tma}%  ·  Constr. 4a + ${p.life}a operação`} />
            <KPI big label="EBITDA Anual"
              pos={ebitPos}
              value={fM(m.ebitda)}
              sub={`Margem: ${(m.ebitda / m.rBruto * 100).toFixed(1)}%  ·  FCO: ${fM(m.ocf)}`} />
            <KPI big label="Payback (pós ano 0)"
              pos={m.payback != null && (m.payback - 3) <= Math.floor(p.life * 0.6)}
              value={paybackLabel}
              sub={`Investimento total: R$ ${m.totInv.toFixed(0)} M`} />
          </div>

          {/* ── KPI Row 2 ────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            <KPI label="Receita Bruta" pos={null}
              value={`R$ ${m.rBruto.toFixed(1)} M`}
              sub={`HVO ${((m.rHVO/m.rBruto)*100).toFixed(0)}%  ·  Nafta ${((m.rNafta/m.rBruto)*100).toFixed(0)}%  ·  Outros ${(((m.rBioc+m.rCBIOs+m.rCarbon)/m.rBruto)*100).toFixed(0)}%`} />
            <KPI label="OPEX Total" pos={null}
              value={`R$ ${m.opex.toFixed(1)} M`}
              sub={`Var: R$ ${m.opxV.toFixed(1)} M  ·  Fix: R$ ${m.opxF.toFixed(1)} M`} />
            <KPI label="CPV s/ Depreciação"
              pos={p.hvoPrice > m.cpvSD}
              value={`R$ ${Math.round(m.cpvSD).toLocaleString('pt-BR')}/t`}
              sub={`Preço HVO: R$ ${p.hvoPrice.toLocaleString('pt-BR')}/t  ·  ${p.hvoPrice > m.cpvSD ? '✓ Cobre CPV' : '✗ Abaixo do CPV'}`} />
            <KPI label="Produção Anual" pos={null}
              value={`${Math.round(m.prod).toLocaleString('pt-BR')} t HVO`}
              sub={`Nafta: ${Math.round(m.nafta).toLocaleString('pt-BR')} t  ·  Biochar: ${Math.round(m.biochar).toLocaleString('pt-BR')} t`} />
            <KPI label="Custo do H₂ Externo" pos={null}
              value={`R$ ${m.oH2.toFixed(1)} M/ano`}
              sub={`${(m.oH2 / m.opex * 100).toFixed(0)}% do OPEX  ·  ${Math.round(m.prod * 227 * (1 - p.h2Self/100)).toLocaleString('pt-BR')} t/ano`} />
          </div>

          {/* ── Charts Row 1 ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10 }}>

            {/* Cumulative Cash Flow */}
            <Card title="Fluxo de Caixa Acumulado do Projeto (M R$)" h={210}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.cumCF} margin={{ top: 4, right: 10, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={ebitPos ? TH.acc : TH.red} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={ebitPos ? TH.acc : TH.red} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={TH.bd} vertical={false} />
                  <XAxis dataKey="yr" stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    label={{ value: 'Ano', position: 'insideBottom', fill: TH.txM, fontSize: 9 }} />
                  <YAxis stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `${v < 0 ? '−' : ''}R$${Math.abs(v).toFixed(0)}M`} />
                  <Tooltip content={<CTip isYr />} />
                  <ReferenceLine y={0} stroke={TH.amb} strokeDasharray="5 3" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="v" name="Acumulado"
                    stroke={ebitPos ? TH.acc : TH.red} strokeWidth={2.5}
                    fill="url(#cfGrad)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* P&L Table */}
            <Card title="DRE Simplificado — M R$/ano" h={210}>
              <div style={{ overflowY: 'auto', height: '100%', paddingRight: 4 }}>
                {plRows.map((r, i) => {
                  const pos = r.v >= 0;
                  const col = r.hi
                    ? (pos ? TH.acc : TH.red)
                    : (r.bold ? TH.tx : TH.txS);
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '3.5px 0',
                      borderTop: r.bold && i > 0 ? `1px solid ${TH.bd}` : 'none',
                      marginTop: r.bold && i > 0 ? 2 : 0,
                    }}>
                      <span style={{ fontSize: 10.5, color: r.bold ? TH.tx : TH.txS }}>{r.l}</span>
                      <span style={{ fontSize: 10.5, fontFamily: TH.mono, fontWeight: r.bold ? 600 : 400, color: col }}>
                        {r.v < 0 ? '−' : ''}R$ {Math.abs(r.v).toFixed(1)} M
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ── Charts Row 2 ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 10 }}>

            {/* OPEX Pie */}
            <Card title="Composição do OPEX Anual" h={200}>
              <div style={{ display: 'flex', height: '100%' }}>
                <div style={{ width: '46%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={m.opxPie} cx="50%" cy="50%"
                        innerRadius={44} outerRadius={74}
                        dataKey="v" paddingAngle={2}
                        startAngle={90} endAngle={-270}>
                        {m.opxPie.map((e, i) => <Cell key={i} fill={e.c} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: TH.sur2, border: `1px solid ${TH.bd}`, borderRadius: 5, fontSize: 10 }}
                        formatter={(v) => [`R$ ${v.toFixed(2)} M`, '']}
                        labelFormatter={() => ''} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                  {m.opxPie.map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 1.5, background: it.c, flexShrink: 0 }} />
                      <span style={{ fontSize: 9.5, color: TH.txS, flex: 1, lineHeight: 1 }}>{it.n}</span>
                      <span style={{ fontSize: 9.5, fontFamily: TH.mono, color: TH.tx }}>{it.v.toFixed(1)} M</span>
                      <span style={{ fontSize: 8.5, color: TH.txM, width: 26, textAlign: 'right' }}>
                        {(it.v / m.opex * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${TH.bd}`, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 9.5, color: TH.tx, fontWeight: 600 }}>Total OPEX</span>
                    <span style={{ fontSize: 9.5, fontFamily: TH.mono, color: TH.acc, fontWeight: 600 }}>R$ {m.opex.toFixed(1)} M</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Revenue vs Cost Bar */}
            <Card title="Receitas e Custos por Componente (M R$/ano)" h={200}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.bars} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={TH.bd} vertical={false} />
                  <XAxis dataKey="n" stroke={TH.txM} tick={{ fontSize: 8.5, fill: TH.txS }} tickLine={false} />
                  <YAxis stroke={TH.txM} tick={{ fontSize: 8.5, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}`} />
                  <Tooltip content={<CTip />} />
                  <ReferenceLine y={0} stroke={TH.bd} />
                  <Bar dataKey="rev"  name="Receita" fill={TH.acc} fillOpacity={0.85} radius={[3,3,0,0]} />
                  <Bar dataKey="cost" name="Custo"   fill={TH.red} fillOpacity={0.75} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Charts Row 3 — Sensitivity ───────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

            {/* Sensitivity: TIR vs HVO price */}
            <Card title="Sensibilidade — TIR × Preço de Venda do HVO" h={185}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.hvoSens} margin={{ top: 4, right: 10, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={TH.bd} vertical={false} />
                  <XAxis dataKey="price" stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                    label={{ value: 'R$/t', position: 'insideBottom', fill: TH.txM, fontSize: 9 }} />
                  <YAxis stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip content={<SensTip xLabel="HVO" yLabel="TIR" />} />
                  <ReferenceLine y={p.tma} stroke={TH.amb} strokeDasharray="4 3"
                    label={{ value: `TMA ${p.tma}%`, fill: TH.amb, fontSize: 9, position: 'right' }} />
                  <ReferenceLine y={0} stroke={TH.bd} />
                  <ReferenceLine x={p.hvoPrice} stroke={TH.acc} strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Area type="monotone" dataKey="tir" name="TIR"
                    stroke={TH.blu} strokeWidth={2} fill={TH.blu + '20'} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* Sensitivity: TIR vs H2 cost */}
            <Card title="Sensibilidade — TIR × Custo do H₂ Externo" h={185}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={m.h2Sens} margin={{ top: 4, right: 10, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={TH.bd} vertical={false} />
                  <XAxis dataKey="cost" stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `R$${v}/kg`}
                    label={{ value: 'R$/kg', position: 'insideBottom', fill: TH.txM, fontSize: 9 }} />
                  <YAxis stroke={TH.txM} tick={{ fontSize: 9, fill: TH.txS }} tickLine={false}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip content={<SensTip xLabel="H₂" yLabel="TIR" />} />
                  <ReferenceLine y={p.tma} stroke={TH.amb} strokeDasharray="4 3"
                    label={{ value: `TMA ${p.tma}%`, fill: TH.amb, fontSize: 9, position: 'right' }} />
                  <ReferenceLine y={0} stroke={TH.bd} />
                  <ReferenceLine x={p.h2Cost} stroke={TH.red} strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Area type="monotone" dataKey="tir" name="TIR"
                    stroke={TH.red} strokeWidth={2} fill={TH.red + '20'} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Footer note ──────────────────────────────────── */}
          <div style={{ fontSize: 9, color: TH.txM, padding: '4px 0 8px', lineHeight: 1.9 }}>
            <span style={{ color: TH.ad, fontFamily: TH.mono, marginRight: 8 }}>NOTA:</span>
            TIR calculada sobre capital próprio sem alavancagem (unlevered project IRR), com CAPEX distribuído em 4 anos de construção.
            EBITDA = Receita Bruta − OPEX (convenção EVTE). Deprec. linear {p.life} anos. IR/CSLL 34% sobre EBIT positivo.
            Escalonamento CAPEX: expoente 0,68 sobre capacidade. CBIOs e Créditos de Carbono escalados pro-rata com produção.
            Sensibilidade calculada com demais parâmetros mantidos constantes.
          </div>
        </main>
      </div>
    </div>
  );
}
