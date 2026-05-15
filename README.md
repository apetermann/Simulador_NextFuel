# 🛢️ HVO Plant Simulator — NextFuel | DeCarbonMine

Simulador financeiro interativo para a Unidade Industrial de Produção de **Diesel Verde (HVO)** a partir de Biomassa Florestal Lignocelulósica.

Baseado no **EVTE Classe 4 (AACE RP 18R-97)** elaborado por Paulo Sérgio de Melo / ETCbio — Abril/2026.

---

## 🔬 Rota Tecnológica

**Pirólise Rápida (BFB) + Hidro-Desoxigenação (HDO)**

- Matéria-prima: Biomassa florestal (eucalipto/pinus) — resíduos lignocelulósicos
- Capacidade de referência: 4.000 t HVO/ano
- TRL: 6-7 (demonstração comercial)
- Redução de GEE: 65–82% vs. diesel fóssil (EN 15940 / RED III)

---

## 📊 O que o Simulador faz

Permite ajustar **todas as variáveis do projeto** em tempo real e visualizar o impacto financeiro imediato:

### Variáveis de Entrada (sliders interativos)
| Categoria | Variáveis |
|-----------|-----------|
| **Produção** | Capacidade (t/ano), Disponibilidade (%) |
| **Preços de venda** | HVO, Nafta Renovável, Biochar |
| **Receitas complementares** | CBIOs (RenovaBio), Créditos de Carbono |
| **Custos de insumos** | Biomassa, H₂ Externo, Autogeração H₂, Energia Elétrica, Catalisadores |
| **CAPEX** | Investimento base (escalonado por capacidade^0,68) |
| **Financeiro** | TMA, Vida Útil do Projeto |

### Métricas Calculadas
- **TIR** do projeto (capital próprio, sem alavancagem)
- **VPL** à TMA definida
- **EBITDA** anual e margem
- **Payback** (incluindo 4 anos de construção)
- **CPV** (Custo de Produção por tonelada, com e sem depreciação)
- **Break-even** do preço do HVO

### Visualizações
- 📈 Fluxo de Caixa Acumulado (24 anos: 4 construção + 20 operação)
- 📋 DRE Simplificado (Receita → EBITDA → EBIT → Lucro → FCO)
- 🥧 Composição do OPEX por componente
- 📊 Receitas e Custos por componente
- 📉 Sensibilidade: TIR × Preço HVO
- 📉 Sensibilidade: TIR × Custo do H₂

### Cenários Rápidos (EVTE)
| Cenário | HVO | H₂ | Resultado |
|---------|-----|----|-----------|
| Pessimista | R$ 4.500/t | R$ 17/kg | EBITDA negativo |
| **Base** | R$ 5.500/t | R$ 14,5/kg | Marginal |
| Otimista | R$ 7.000/t | R$ 9,5/kg | TIR positiva |

---

## 🚀 Como Rodar

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev

# Build para produção
npm run build
```

Acesse: `http://localhost:5173`

---

## 🏗️ Stack Técnica

- **React 18** + **Vite 5**
- **Recharts** — gráficos de linha, área, barra e pizza
- **JetBrains Mono** + **DM Sans** + **Syne** (Google Fonts)
- Tema: Industrial / Control Room Dark

---

## 📐 Modelo Financeiro

| Parâmetro | Valor |
|-----------|-------|
| EBITDA | Receita Bruta − OPEX (convenção EVTE) |
| Escala CAPEX | Expoente 0,68 sobre capacidade |
| Construção | 4 anos (30/40/20/10% do CAPEX) |
| IR/CSLL | 34% sobre EBIT positivo |
| H₂ total | 227 kg/t HVO (base EVTE) |
| Produção nominal | `Capacidade × (Disponibilidade / 91,3%)` |

---

## 🏢 Sobre

**DeCarbonMine** — Consultoria em Descarbonização Industrial  
Belo Horizonte, Brasil  
Setores: Mineração · Siderurgia · Cimento · Agronegócio

---

*EVTE Classe 4 — Precisão ±30% — Data-base Abril/2026*
