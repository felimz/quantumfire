# QuantumFire Technical Manual

QuantumFire is an institutional-grade retirement planning engine that moves beyond simple deterministic projections. By integrating advanced actuarial science, non-normal market dynamics, and true progressive tax modeling, it provides a highly realistic analysis of Sequence of Returns Risk (SORR) and portfolio longevity.

This manual details the theoretical foundation, mathematical formulations, implementation mechanics, and parameter justifications for every model powering the simulation engine.

---

## Table of Contents

1. [Architecture & Simulation Workflow](#1-architecture--simulation-workflow)
2. [Market Return & Risk Modeling](#2-market-return--risk-modeling)
3. [Account Structure & Portfolio Management](#3-account-structure--portfolio-management)
4. [Tax Engine & Estate Mechanics](#4-tax-engine--estate-mechanics)
5. [Income Sources & Expense Streams](#5-income-sources--expense-streams)
6. [Withdrawal Mechanics & Spending Strategies](#6-withdrawal-mechanics--spending-strategies)
7. [Actuarial & Analytical Models](#7-actuarial--analytical-models)
8. [Test Infrastructure & Coverage](#8-test-infrastructure--coverage)

---

## 1. Architecture & Simulation Workflow

### 1.1 Module Architecture

The engine is organized into focused, composable modules:

| Module                  | File            | Responsibility                                                                                                        |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Simulation Core**     | `simulation.ts` | Single-path simulator — loops from `currentAge` → `deathAge` handling accumulation, retirement, and estate settlement |
| **Monte Carlo**         | `monteCarlo.ts` | Orchestrates _N_ stochastic paths + 1 deterministic baseline; aggregates percentile statistics and path scrubber data |
| **Market Math**         | `math.ts`       | Gaussian and Poisson RNG, market factor calculations, Jump-Diffusion model                                            |
| **Copula / Dependence** | `dependence.ts` | Clayton Copula for asymmetric lower-tail dependence between asset classes                                             |
| **Tax Engine**          | `taxEngine.ts`  | Progressive income tax with stacked capital gains, NIIT, Social Security taxation                                     |
| **Lot Tracker**         | `portfolio.ts`  | Per-lot cost basis tracking with HIFO / FIFO / LOFO / LIFO selling strategies                                         |
| **Spending Policies**   | `spending.ts`   | Fixed Real, Guyton-Klinger, and Vanguard Dynamic spending rules                                                       |
| **Healthcare**          | `healthcare.ts` | Long-Term Care (LTC) shock modeling with actuarial probability                                                        |
| **Mortality**           | `mortality.ts`  | Gompertz-Makeham survival curve for mortality-weighted success rates                                                  |
| **RMD**                 | `rmd.ts`        | IRS Required Minimum Distribution divisors (Uniform Lifetime Table)                                                   |

**Module dependency graph:**

:::mermaid
graph TD
MC["monteCarlo.ts"] --> SIM["simulation.ts"]
SIM --> MATH["math.ts"]
SIM --> DEP["dependence.ts"]
SIM --> TAX["taxEngine.ts"]
SIM --> PORT["portfolio.ts"]
SIM --> SPEND["spending.ts"]
SIM --> HC["healthcare.ts"]
SIM --> RMD["rmd.ts"]
MC --> MORT["mortality.ts"]
DEP --> MATH

style MC fill:#4a90d9,stroke:#2c5f8a,color:#fff
style SIM fill:#d94a4a,stroke:#8a2c2c,color:#fff
style MATH fill:#6b8e23,stroke:#4a6310,color:#fff
style DEP fill:#6b8e23,stroke:#4a6310,color:#fff
style TAX fill:#b8860b,stroke:#8b6508,color:#fff
style PORT fill:#b8860b,stroke:#8b6508,color:#fff
style SPEND fill:#9370db,stroke:#6a4fb5,color:#fff
style HC fill:#9370db,stroke:#6a4fb5,color:#fff
style MORT fill:#9370db,stroke:#6a4fb5,color:#fff
style RMD fill:#b8860b,stroke:#8b6508,color:#fff

:::

### 1.2 Dual-Mode Execution

Every simulation path is executed by `runPath(params, isDeterministic)`. The boolean flag controls the noise profile across all stochastic dimensions:

| Dimension      | Deterministic Mode                                            | Stochastic Mode                                           |
| -------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| Equity returns | `getGeometricRate(μ, σ)` — locked to geometric mean           | `getMarketFactor(μ, σ, z)` with Gaussian z-score          |
| Bond returns   | `getGeometricRate(μ_b, σ_b)` — locked to geometric mean       | `getMarketFactor(μ_b, σ_b, z_b)` with independent z-score |
| Inflation      | Fixed at `inflationRate` per year                             | Ornstein-Uhlenbeck process with mean reversion            |
| Jump Diffusion | Disabled — no jumps applied                                   | Poisson-distributed crash events with log-normal severity |
| Copula         | Bypassed — shocks array zeroed                                | Clayton Copula generates correlated uniform shocks        |
| LTC shocks     | Expected-value model: `cost = P × baseCost` at mean start age | Random roll: `random() < P` per path                      |

> **Reproducibility guarantee:** Two calls to `runPath(params, true)` with identical parameters produce bitwise-identical output arrays. This is ensured by eliminating every `random()` call in deterministic mode, including the LTC shock roll in `HealthEngine`.

### 1.3 Monte Carlo Orchestration

`runMonteCarlo(params, N)` executes the following pipeline (default _N_ = 20,000):

:::mermaid
flowchart LR
A["1. Run N stochastic paths"] --> B["2. Run 1 deterministic baseline"]
B --> C["3. Percentile aggregation"]
C --> D["4. Path scrubber extraction"]
D --> E["5. Mortality weighting"]

A -.- A1["N × runPath(params, false)"]
B -.- B1["runPath(params, true)"]
C -.- C1["P5, P10, P25, P50, P75, P90, P95"]
D -.- D1["99 representative longitudinal paths"]
E -.- E1["Gompertz-Makeham weighted success rate"]

style A fill:#4a90d9,stroke:#2c5f8a,color:#fff
style B fill:#4a90d9,stroke:#2c5f8a,color:#fff
style C fill:#6b8e23,stroke:#4a6310,color:#fff
style D fill:#6b8e23,stroke:#4a6310,color:#fff
style E fill:#b8860b,stroke:#8b6508,color:#fff

:::

### 1.4 Single-Path Lifecycle

:::mermaid
%%{init: {'themeVariables': {'fontSize': '10px', 'fontFamily': 'sans-serif'}}}%%
stateDiagram-v2
direction LR

state "ACCUMULATION" as ACC {
direction TB
Salary: Salary Growth
Contrib: Contributions
Market1: Market Growth
Roth: Roth Conversions
Glide: Glidepath

Salary --> Contrib
Contrib --> Market1
Market1 --> Roth
Roth --> Glide
}

state "RETIREMENT" as RET {
direction TB
Spend: Spending Policy
Water: Withdrawal Waterfall
RMD: RMDs (75+)
Income: SS/Pension
LTC: Healthcare/LTC
Buffer: Cash Buffer
Bracket: Bracket Filling
Market2: Market Growth

Spend --> Water
Water --> RMD
RMD --> Income
Income --> LTC
LTC --> Buffer
Buffer --> Bracket
Bracket --> Market2
}

state "ESTATE" as EST {
direction TB
StepUp: Step-up Basis
HeirTax: Heir Tax
Final: Estate Sum

StepUp --> HeirTax
HeirTax --> Final
}

ACC --> RET
RET --> EST
:::

---

## 2. Market Return & Risk Modeling

Traditional Monte Carlo simulators use simple log-normal random walks, which structurally fail to model crash severity ("fat tails") and cross-asset contagion. QuantumFire replaces this with a multi-factor risk engine.

### 2.1 Base Model: Geometric Brownian Motion (GBM)

**Continuous-time SDE:**

$$dS_t = \mu S_t \, dt + \sigma S_t \, dW_t$$

**Discrete annual implementation** (`math.ts`):

```text
geometricRate = exp(ln(1 + μ) − ½σ²)           // deterministic drift
marketFactor  = exp(ln(1 + μ) − ½σ² + σ × z)  // stochastic, z ~ N(0,1)
```

The deterministic path tracks the _median_ of the log-normal distribution, which is the most probable long-run growth trajectory (the geometric mean).

Random z-scores are drawn via the **Box-Muller transform** in `gaussianRandom()`.

### 2.2 Merton Jump-Diffusion

**Theory.** Equity markets experience sudden, discontinuous shocks — crashes, flash events, liquidity crises — that continuous Brownian motion cannot model. The Merton Jump-Diffusion augments GBM with a compound Poisson process to inject rare, severe negative shocks.

**SDE:**

$$dS_t = (\mu - \lambda \bar{k}) S_t \, dt + \sigma S_t \, dW_t + S_t \, dJ_t$$

where $J_t$ is a compound Poisson process with intensity $\lambda$ and each jump magnitude $Y_i \sim \mathcal{N}(\mu_j, \sigma_j^2)$ in log space.

**Algorithm** (`math.ts → getJumpDiffusionFactor()`):

1. Sample the number of jumps this year: $N \sim \text{Poisson}(\lambda)$
2. For each jump $i$, draw the log-severity: $y_i \sim \mathcal{N}(\mu_j, \sigma_j)$
3. Compute the cumulative jump multiplier: $J = \prod_{i=1}^{N} e^{y_i}$
4. Multiply into the base GBM factor: `finalFactor = marketFactor × J`

Poisson sampling uses the **Knuth algorithm**:

```text
// Knuth's Poisson Sampling Algorithm
L = exp(-λ)
k = 0
p = 1

do:
    k = k + 1
    p = p × random(0, 1)
while p > L

return k - 1
```

**Default parameters:**

| Parameter       | Symbol | Default | Rationale                                                              |
| --------------- | :----: | :-----: | ---------------------------------------------------------------------- |
| Jump Intensity  |   λ    |  0.10   | ≈ 1 severe crash per decade (matches historical bear market frequency) |
| Jump Mean       |  μ_j   |  −0.20  | Average crash magnitude of −20% in log space                           |
| Jump Volatility |  σ_j   |  0.05   | Crash severity ranges from roughly −10% to −30%+                       |

> **Deterministic bypass:** When `isDeterministic = true`, the engine uses `getGeometricRate()` with `zScore = 0`, completely bypassing all jump components.

### 2.3 Multi-Asset Correlation: Clayton Copula

**Theory.** During extreme market stress, cross-asset correlations spike toward 1.0 — diversification fails precisely when it's needed most. Simple Cholesky decomposition of a correlation matrix models _linear_ dependence but cannot capture asymmetric _tail_ dependence (lower-tail clustering without upper-tail clustering).

**Clayton copula CDF:**

$$C(u_1, u_2; \theta) = \left(u_1^{-\theta} + u_2^{-\theta} - 1\right)^{-1/\theta}$$

- $\theta > 0$ controls the strength of lower-tail dependence
- As $\theta \to \infty$: perfect comonotonicity in the lower tail
- As $\theta \to 0$: independence
- **Kendall's tau** (rank correlation): $\tau = \theta / (\theta + 2)$

**Algorithm** (`dependence.ts → generateCorrelatedShocks()`):

| Step | Operation                                                                               |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | Draw $u_1 \sim \text{Uniform}(0,1)$ and $t \sim \text{Uniform}(0,1)$                    |
| 2    | Compute $u_2 = u_1 \left(t^{-\theta/(\theta+1)} - 1 + u_1^{-\theta}\right)^{-1/\theta}$ |
| 3    | Repeat to generate 4 copula-linked uniforms (one per asset class)                       |
| 4    | Convert uniforms to normal z-scores via the **inverse CDF** (`normInv()`)               |

The `normInv()` function implements the **Beasley-Springer-Moro rational approximation**, accurate to ~7 decimal places across the full (0, 1) range.

**Shock assignment:**

|    Index    | Asset Class     |
| :---------: | --------------- |
| `shocks[0]` | Taxable equity  |
| `shocks[1]` | Deferred equity |
| `shocks[2]` | Bonds           |
| `shocks[3]` | Roth equity     |

**Default parameters:**

| Parameter    | Symbol | Default | Rationale                                          |
| ------------ | :----: | :-----: | -------------------------------------------------- |
| Copula Theta |   θ    |   2.0   | Moderate lower-tail dependence (Kendall's τ = 0.5) |

> **Without copula:** All equity buckets share a single z-score; the bond z-score is drawn independently.

### 2.4 Stochastic Inflation: Ornstein-Uhlenbeck Process

**Theory.** Inflation is persistent (serially correlated) but mean-reverting. Assuming flat 2.5% inflation across 30 years ignores the devastating portfolio impact of stagflationary episodes where inflation surges _while_ equities crash.

**Vasicek/OU SDE:**

$$dr_t = a(b - r_t) \, dt + \sigma \, dW_t$$

|  Symbol  | Meaning                         | Default |
| :------: | ------------------------------- | :-----: |
|  $r_t$   | Current inflation rate          |    —    |
|   $b$    | Long-run mean (`inflationRate`) |  0.025  |
|   $a$    | Mean-reversion speed            |   0.3   |
| $\sigma$ | Inflation volatility            |  0.015  |

**Discrete annual implementation** (`simulation.ts`):

```text
// Mean-Reverting Ornstein-Uhlenbeck Process
z = normalRandom(0, 1)

inflationChange = reversionSpeed × (longRunMean − currentInflation) + volatility × z
currentInflation = max(-0.02, currentInflation + inflationChange)  // Floor at -2%

cumulativeInflationMultiplier = cumulativeInflationMultiplier × (1 + currentInflation)
```

> **Floor constraint:** Inflation is hard-floored at −2% to prevent unrealistic persistent deflation spirals.
>
> **Deterministic bypass:** When `isDeterministic = true`, inflation is fixed at the configured `inflationRate` per year — no OU shocks applied.

### 2.5 Glidepath & Asset Allocation

**Theory.** A declining equity allocation ("glide path") approaching retirement reduces SORR exposure while maintaining enough growth to sustain a 30-year withdrawal plan.

**Pre-retirement (linear interpolation):**

```text
yearsToRetirement = retirementAge − currentAge
elapsed           = age − currentAge
equityPct         = startEquity + (targetEquity − startEquity) × (elapsed / yearsToRetirement)
```

**Post-retirement:** The allocation locks at `glidepathTargetEquity`. Each year, the deferred equity and bond sub-accounts are rebalanced to match the target split.

**Blended portfolio return:**

```text
totalReturn = equityPct × equityFactor + (1 − equityPct) × bondFactor
```

---

## 3. Account Structure & Portfolio Management

### 3.1 Five-Bucket Architecture

The engine tracks five independent account buckets with distinct tax treatment, growth mechanics, and withdrawal rules:

| Bucket                    | Tax Treatment                               | Growth Model                                      | Withdrawal Tax                                  |
| ------------------------- | ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| **Taxable** (Brokerage)   | Annual tax drag on dividends + LTCG on sale | Market returns × (1 − `taxDragBrokerage`)         | Capital gains on realized gains above lot basis |
| **Deferred** (401k / IRA) | Tax-deferred; RMDs forced at 75+            | Equity + bond sub-accounts at full market returns | 100% taxed as ordinary income                   |
| **Roth IRA**              | Tax-free growth                             | Full market returns                               | Tax-free (qualified)                            |
| **HSA**                   | Triple tax-advantaged                       | Full market returns                               | Tax-free if used for qualified medical expenses |
| **Cash Buffer**           | Low-risk yield                              | Fixed annual yield (`cashBufferTargetYield`)      | No tax — SORR mitigation reserve                |

### 3.2 Deferred Sub-Accounts

The Deferred (401k) bucket is split into two sub-accounts to model the bond-versus-equity allocation:

- **`deferredEquity`** — grows at the equity market factor each year
- **`deferredBond`** — grows at the bond market factor each year

Each year, the engine rebalances these sub-accounts to match the current target allocation from the glidepath calculator (§2.5).

### 3.3 Taxable Lot Tracking

**Theory.** Tracking the cost basis of individual tax lots enables tax-optimized selling strategies that minimize capital gains realization during the critical early retirement years.

**Data structure.** Each lot stores a triplet: `(shares, costBasisPerShare, yearPurchased)`.

**Selling strategies:**

| Strategy           | Sort Order               | Tax Effect                                                         |
| ------------------ | ------------------------ | ------------------------------------------------------------------ |
| **HIFO** (default) | Cost basis descending    | Minimizes realized gains — sells highest-basis lots first          |
| **FIFO**           | Purchase year ascending  | Sells oldest lots first — regulatory default in many jurisdictions |
| **LIFO**           | Purchase year descending | Sells newest lots first — defers gains on oldest lots              |
| **LOFO**           | Cost basis ascending     | Maximizes realized gains — useful for tax-loss harvesting          |

**Selling algorithm** (`portfolio.ts → sellForCash()`):

```text
sortLots(strategy)
for each lot in sortedLots:
    if amountNeeded ≤ 0 → break
    saleValue    = min(lot.marketValue, amountNeeded)
    fractionSold = saleValue / lot.marketValue
    gainOnSale   = max(0, saleValue − lot.costBasis × fractionSold)
    lot.shares  -= lot.shares × fractionSold
    cashRaised  += saleValue
    totalGains  += gainOnSale
    amountNeeded -= saleValue
return { cashRaised, realizedGains }
```

**Step-up in basis.** At death, `applyStepUpInBasis()` resets every lot's cost basis to current market value, eliminating all unrealized capital gains for heirs.

---

## 4. Tax Engine & Estate Mechanics

### 4.1 Progressive Tax Engine

**Theory.** Flat effective tax rates fundamentally miscalculate after-tax cash flow. The US tax code is highly progressive, and long-term capital gains _stack on top_ of ordinary income when determining the applicable CG bracket.

The engine computes taxes in four sequential steps:

---

#### Step 1 — Standard Deduction

```text
taxableOrdinary = max(0, grossIncome − STANDARD_DEDUCTION × inflationMult)
```

Standard deduction (2026, Single): **$16,100**

---

#### Step 2 — Progressive Ordinary Income Tax

All bracket thresholds are multiplied by `inflationMult` to model IRS inflation indexing over the simulation horizon.

| Bracket             | Marginal Rate |
| ------------------- | :-----------: |
| $0 – $12,400        |      10%      |
| $12,401 – $50,400   |      12%      |
| $50,401 – $105,700  |      22%      |
| $105,701 – $201,775 |      24%      |
| $201,776 – $256,225 |      32%      |
| $256,226 – $640,600 |      35%      |
| $640,601+           |      37%      |

---

#### Step 3 — Stacked Capital Gains Tax

Long-term capital gains (LTCG) are _stacked on top of_ taxable ordinary income. CG brackets are filled starting from where ordinary income ended:

| CG Bracket Cap     | Rate |
| ------------------ | :--: |
| $0 – $49,450       |  0%  |
| $49,451 – $545,500 | 15%  |
| $545,501+          | 20%  |

```text
gainsRemaining = LTCG
totalTax = 0

for each bracket in CAPITAL_GAINS_BRACKETS:
    adjustedCap = bracket.cap × inflationMultiplier
    roomInBracket = max(0, adjustedCap − ordinaryIncome)

    gainsInBracket = min(gainsRemaining, roomInBracket)
    totalTax += gainsInBracket × bracket.rate

    gainsRemaining -= gainsInBracket
    ordinaryIncome += gainsInBracket  // Push boundaries up for next bracket
```

---

#### Step 4 — Net Investment Income Tax (NIIT)

```text
MAGI        = grossIncome + LTCG
excessMAGI  = max(0, MAGI − $200,000 × inflationMult)
NIIT        = min(excessMAGI, LTCG) × 3.8%
```

### 4.2 Social Security Taxation

Social Security benefits are taxed based on "provisional income" as defined by IRS Publication 915:

```text
combinedIncome = otherIncome + 0.5 × ssBenefit
```

| Combined Income Range        | Taxable Portion                           |
| ---------------------------- | ----------------------------------------- |
| Below $25,000 × inflMult     | 0%                                        |
| $25,000 – $34,000 × inflMult | 50% of excess above base                  |
| Above $34,000 × inflMult     | 50% of Tier 1 + 85% of excess above upper |

The final taxable SS amount is capped at `min(computed, 0.85 × ssBenefit)`.

### 4.3 Required Minimum Distributions

**Theory.** At age 75 (SECURE 2.0 Act), the IRS mandates minimum withdrawals from tax-deferred accounts, creating forced ordinary income that can trigger a compounding "tax torpedo" when combined with Social Security.

```text
rmdDivisor = uniformLifetimeTable[age]
rmdAmount  = totalDeferred / rmdDivisor
```

**IRS Uniform Lifetime Table (excerpt):**

| Age | Divisor |     | Age | Divisor |
| :-: | :-----: | --- | :-: | :-----: |
| 75  |  24.6   |     | 85  |  16.0   |
| 76  |  23.7   |     | 90  |  12.2   |
| 77  |  22.9   |     | 95  |   8.9   |
| 80  |  20.2   |     | 100 |   6.4   |

For ages beyond the table (120+), a floor divisor of **2.0** is applied.

**Excess RMD reinvestment.** If `rmdAmount > remainingSpendingNeed`, the surplus is reinvested into the taxable lot tracker as a new lot with full cost basis:

```text
excess = rmdAmount − need
lotTracker.addContribution(excess, yearIndex)
```

### 4.4 Tax-Aware Bracket Filling

An aggressive strategy to mitigate the RMD tax torpedo by proactively draining the deferred account during the low-income "gap years" between retirement and Social Security:

```text
if taxAwareBracketFill AND age ≥ socialSecurityAge:
    ssIncome   = ssMonthly × 12
    bracketRoom = bracketCap × cumulativeInflation − ssIncome
    fillAmount = max(0, min(bracketRoom, deferredBalance))
    deferred  -= fillAmount
    roth      += fillAmount
    // Ordinary income tax paid on fillAmount at marginal rate
```

This converts deferred dollars to Roth at today's lower marginal rate, preventing them from being forced out later at a higher effective rate due to RMD + SS stacking.

### 4.5 Roth Conversions

```text
if rothConversionEnabled AND age < rothConversionEndAge:
    conversionAmount = min(rothConversionAmount, deferredBalance)
    deferred -= conversionAmount
    roth     += conversionAmount
    // Ordinary income tax paid on conversionAmount
```

### 4.6 Estate Value & Step-Up in Basis

At the terminal `deathAge`, the engine calculates the after-tax estate value passed to heirs:

```text
if stepUpEnabled:
    taxableEstate = taxableBalance                        // gains wiped at death
else:
    taxableEstate = taxableBalance − unrealizedGains × capGainsRate

deferredEstate = deferredBalance × (1 − heirTaxRate)      // SECURE Act 10-year rule

rothEstate = rothBalance                                   // Tax-free
hsaEstate  = hsaBalance                                    // Tax-free

totalEstate = taxableEstate + deferredEstate + rothEstate + hsaEstate
```

---

## 5. Income Sources & Expense Streams

### 5.1 Social Security Income

Social Security reduces the withdrawal need starting at `socialSecurityAge`:

```text
if age ≥ socialSecurityAge:
    ssAnnual = socialSecurityMonthly × 12
    need    -= ssAnnual
```

The taxable portion of SS is computed via `calculateTaxableSS()` (§4.2) and added to ordinary income for progressive taxation when the advanced tax engine is enabled.

### 5.2 Pension Income

Pension support includes both nominal and inflation-adjusted modes:

```text
if pensionEnabled AND age ≥ pensionStartAge:
    pensionAnnual = pensionMonthly × 12
    if pensionInflationAdjusted:
        pensionAnnual *= cumulativeInflation
    need -= pensionAnnual
```

### 5.3 Real Estate Downsizing

At the specified `realEstateDownsizeAge`, a lump sum is injected directly into the taxable lot tracker as a new lot with full cost basis:

```text
if realEstateDownsizeEnabled AND age == realEstateDownsizeAge:
    lotTracker.addContribution(realEstateDownsizeNetProceeds, yearIndex)
```

### 5.4 Healthcare Costs

Healthcare costs grow at a structural inflation rate separate from (and typically higher than) general CPI:

```text
healthcareCost = healthcareAnnualBaseCost × cumulativeHealthcareInflation
cumulativeHealthcareInflation *= (1 + healthcareInflationRate)
```

The full healthcare cost is added to the spending need each year (before the withdrawal waterfall executes).

### 5.5 Long-Term Care Shocks

**Theory.** LTC represents a catastrophic, low-probability expense that can deplete even large portfolios. It must be modeled actuarially per Monte Carlo path.

**Stochastic mode** (per path):

```text
roll = random()
if roll < lifetimeProbability:
    ltcStartAge = round(normalRandom(meanStartAge, 3))
    hasLTC = true, costPerYear = baseAnnualCost
else:
    hasLTC = false
```

**Deterministic mode** (expected value):

```text
hasLTC      = (lifetimeProbability > 0)
ltcStartAge = meanStartAge
costPerYear = baseAnnualCost × lifetimeProbability      // Probability-weighted
```

**Annual cost injection** (`healthcare.ts → getLTCCostForYear()`):

```text
yearsSinceStart = age − ltcStartAge
if yearsSinceStart ≥ 0 AND yearsSinceStart < duration:
    return costPerYear × cumulativeHealthcareInflation
return 0
```

### 5.6 HSA as First-Priority Funding Source

Before the standard investment waterfall executes, _all_ healthcare-related costs (base + LTC) are funded from the HSA:

```text
hsaDrain = min(totalHealthcareCost, hsaBalance)
hsa     -= hsaDrain
need     = totalNeed − hsaDrain
// Only the remainder flows into the investment waterfall
```

This preserves pre-tax capital by fully utilizing the triple-tax-advantaged HSA before touching any investment account.

---

## 6. Withdrawal Mechanics & Spending Strategies

### 6.1 Retirement-Year Simulation Loop

Each post-retirement year in `runPath()` executes the following sequence:

:::mermaid
flowchart TD
S1["1. Compute spending need"]
S1a["Base need + Healthcare + LTC"]
S1 --> S1a

S1a --> S2["2. Subtract external income"]
S2a["Social Security + Pension"]
S2 --> S2a

S2a --> S3["3. Fund healthcare from HSA"]
S3a["hsaDrain = min(cost, hsaBalance)"]
S3 --> S3a

S3a --> S4{"4. Age ≥ 75?"}
S4 -->|Yes| S4a["Execute RMD Excess → reinvest to taxable"]
S4 -->|No| S5
S4a --> S5

S5["5. Execute withdrawal waterfall"]
S5 --> S5a{"Cash buffer triggered?"}
S5a -->|Yes| S5b["Drain cash buffer first"]
S5a -->|No| S5c{"Proportional mode?"}
S5c -->|Yes| S5d["Withdraw pro-rata"]
S5c -->|No| S5e["Sequential: Taxable → Deferred → Roth"]
S5b --> S6
S5d --> S6
S5e --> S6

S6["6. Tax-aware bracket fill"]
S6 --> S7["7. Roth conversions"]
S7 --> S8["8. Apply market growth"]
S8 --> S9["9. Apply tax drag"]
S9 --> S10["10. Record path arrays"]

style S1 fill:#4a90d9,stroke:#2c5f8a,color:#fff
style S2 fill:#4a90d9,stroke:#2c5f8a,color:#fff
style S3 fill:#6b8e23,stroke:#4a6310,color:#fff
style S4 fill:#b8860b,stroke:#8b6508,color:#fff
style S5 fill:#d94a4a,stroke:#8a2c2c,color:#fff
style S6 fill:#9370db,stroke:#6a4fb5,color:#fff
style S7 fill:#9370db,stroke:#6a4fb5,color:#fff
style S8 fill:#6b8e23,stroke:#4a6310,color:#fff
style S9 fill:#b8860b,stroke:#8b6508,color:#fff
style S10 fill:#555,stroke:#333,color:#fff

:::

### 6.2 Sequential Waterfall (Default)

The standard waterfall depletes accounts in a fixed priority order:

:::mermaid
flowchart LR
NEED["Remaining Spending Need"] --> TAX["Taxable"]
TAX --> DEF["Deferred (Equity → Bond)"]
DEF --> ROTH["Roth"]
ROTH --> HSA["HSA"]

TAX -.- T1["sellForCash(need, HIFO) Tracks realized gains"]
DEF -.- D1["Split proportionally across equity & bond"]
ROTH -.- R1["Tax-free withdrawal"]
HSA -.- H1["Last resort (medical only)"]

style NEED fill:#d94a4a,stroke:#8a2c2c,color:#fff
style TAX fill:#b8860b,stroke:#8b6508,color:#fff
style DEF fill:#4a90d9,stroke:#2c5f8a,color:#fff
style ROTH fill:#6b8e23,stroke:#4a6310,color:#fff
style HSA fill:#9370db,stroke:#6a4fb5,color:#fff

:::

For each bucket:

1. Compute available balance
2. Withdraw `min(remainingNeed, balance)`
3. **Taxable** — uses lot tracker `sellForCash(need, "HIFO")` to track realized gains
4. **Deferred** — splits withdrawal proportionally across equity and bond sub-accounts
5. Reduce remaining need and continue to next bucket

### 6.3 Proportional Withdrawals (Alternative)

When `proportionalWithdrawals = true`, the engine replaces the sequential waterfall with balanced depletion:

```text
totalPortfolio = taxable + deferred + roth
for each bucket in [taxable, deferred, roth]:
    bucketWithdrawal = need × (bucket / totalPortfolio)
```

This smoothly amortizes the tax burden across the full retirement horizon instead of front-loading it on one account.

### 6.4 Cash Buffer: SORR Mitigation

**Theory.** Selling equities after a 30% crash permanently destroys capital. A cash buffer provides uncorrelated liquidity to ride out the storm without forced equity liquidation at depressed prices.

**Trigger condition:**

```text
equityReturn = equityFactor − 1
if equityReturn < dropTrigger:              // default: −10%
    ⟶ CRISIS MODE: fund spending from cash buffer, not equities
```

**Drain logic:**

```text
cashDrain    = min(need, cashBuffer)
cashBuffer  -= cashDrain
need        -= cashDrain
// Any remaining need falls through to the standard waterfall
```

**Replenishment logic** (strong bull years, `equityReturn > 0.05`):

```text
targetCash = 2 × annualSpend
deficit    = targetCash − cashBuffer
replenish  = min(deficit, taxable × 0.10)
cashBuffer += replenish
taxable    -= replenish
```

**Yield.** Each year, `cashBuffer *= (1 + cashBufferTargetYield)` to model money-market / T-bill income.

### 6.5 Spending Policies

All three policies implement the same interface:

```text
calculateTargetSpend(portfolio, prevSpend, inflation, rate, initPortfolio) → annualSpend
```

---

#### 6.5.1 Fixed Real

The simplest policy — adjust previous spending by current inflation only:

```text
spend = previousSpend × (1 + inflation)
```

Completely ignores portfolio performance.

---

#### 6.5.2 Guyton-Klinger Guardrails

Adds two guardrail tests each year:

```text
currentWR = previousSpend / currentPortfolio

if currentWR > initialWR × 1.2:              // capital preservation threshold
    // Portfolio shrunk too far → CUT spending
    spend = previousSpend × (1 − adjustmentRate) × (1 + inflation)

elif currentWR < initialWR × 0.8:             // prosperity threshold
    // Portfolio boomed → RAISE spending
    spend = previousSpend × (1 + adjustmentRate) × (1 + inflation)

else:
    // Within safe corridor → inflation-adjust only
    spend = previousSpend × (1 + inflation)
```

> **Zero-portfolio guard:** If `currentPortfolio ≤ 0`, returns `0` immediately to prevent division by zero.

---

#### 6.5.3 Vanguard Dynamic

Withdraws a fixed percentage of the _current_ portfolio, but constrains the year-over-year change to prevent lifestyle whiplash:

```text
unconstrained    = currentPortfolio × withdrawalRate
inflationAdjusted = previousSpend × (1 + inflation)
ceiling          = inflationAdjusted × (1 + ceilingPct)       // e.g. +5%
floor            = inflationAdjusted × (1 + floorPct)         // e.g. −2.5%

spend = clamp(unconstrained, floor, ceiling)
```

Spending can never surge more than `ceilingPct` or crash more than `|floorPct|` relative to the inflation-adjusted prior year, regardless of portfolio performance.

---

## 7. Actuarial & Analytical Models

### 7.1 Mortality-Weighted Success Rate

**Gompertz-Makeham survival model:**

$$S(x) = \exp\left[-\frac{b}{\ln c}(c^x - 1)\right] \cdot e^{-ax}$$

| Constant |  Value  | Meaning                                  |
| :------: | :-----: | ---------------------------------------- |
|   $a$    | 0.0001  | Background (age-independent) hazard rate |
|   $b$    | 0.00003 | Gompertz scale parameter                 |
|   $c$    | 1.0825  | Exponential aging factor                 |

```text
// Gompertz-Makeham Survival Probability
if targetAge ≤ currentAge:
    return 100%

exponent = −(b / ln(c)) × (c^targetAge − c^currentAge) − a × (targetAge − currentAge)
survivalProbability = exp(exponent)
```

**Application.** Failed paths are weighted by the probability the individual was still alive at the bankruptcy age:

```text
for each failed path:
    weight = getSurvivalProbability(currentAge, bankruptcyAge)
    mortalityWeightedFailures += weight
```

A path failing at age 94 is _heavily_ discounted compared to a path failing at age 71, producing a truer assessment of actuarial risk.

### 7.2 Accumulation Phase Model

During the pre-retirement phase (`age < retirementAge`), each year:

1. **Salary growth:** `salary *= (1 + salaryGrowth)`
2. **Contribution calculation:**

   ```text
   total401k      = contribution401k + salary × companyMatchRate + salary × companyDiscretionaryRate
   totalRoth      = contributionRoth
   totalBrokerage = contributionBrokerage
   totalHSA       = contributionHSA
   ```

3. **Market growth** applied to all existing balances
4. **New contributions** added to each bucket (taxable contributions create new lots in the tracker)
5. **Glidepath rebalancing** between deferred equity and bond sub-accounts
6. **Roth conversions** if enabled and `age < rothConversionEndAge`

### 7.3 Interactive Path Scrubber

Located on the Net Worth chart. This isolates 99 specific longitudinal paths — one per percentile of terminal wealth — allowing users to interactively scrub through exactly which sequence of returns produced each outcome.

For each selected path, the engine reports:

| Metric            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| Number of crashes | Years with >15% portfolio decline                     |
| Maximum drawdown  | Peak-to-trough decline over the full path             |
| Average inflation | Mean annual inflation experienced                     |
| Depletion age     | First year where portfolio ≤ 0, or _null_ if survived |

### 7.4 SWR Sensitivity Heatmap

Exhaustively runs a matrix of simulations across two varying dimensions:

| Axis    | Parameter               | Typical Range |
| ------- | ----------------------- | ------------- |
| Rows    | Initial withdrawal rate | 2.0% – 6.0%   |
| Columns | Bond allocation         | 0% – 80%      |

Each cell renders the mortality-weighted success rate, color-scaled:

| Success Rate | Color              |
| :----------: | ------------------ |
|    < 70%     | Red (danger zone)  |
|  70% – 80%   | Amber (caution)    |
|  80% – 90%   | White (acceptable) |
|    > 90%     | Green (safe)       |

This produces a 2D topographical map of the efficient frontier for withdrawal planning.

---

## 8. Test Infrastructure & Coverage

### 8.1 Framework & Execution

All tests use **Vitest** as the test runner:

```bash
npx vitest run src/engine/__tests__/         # Run all 145 engine tests
npx vitest run --reporter=verbose            # Per-test timing output
```

### 8.2 Test Suite Inventory

| File                          |   Tests |    Type     | Coverage                                                                                     |
| ----------------------------- | ------: | :---------: | -------------------------------------------------------------------------------------------- |
| `math.test.ts`                |      20 |    Unit     | Gaussian/Poisson RNG, market factor, geometric rate, jump-diffusion edge cases               |
| `taxEngine.test.ts`           |      17 |    Unit     | Progressive brackets, CG stacking, NIIT boundary, SS taxation tiers, inflation scaling       |
| `portfolio.test.ts`           |      16 |    Unit     | All 4 selling strategies, step-up, full liquidation, crash recovery, multi-lot partial sells |
| `spending.test.ts`            |      15 |    Unit     | All 3 policies: normal + edge cases (zero portfolio, negative inflation, exact boundaries)   |
| `healthcare.test.ts`          |       8 |    Unit     | LTC trigger, duration boundaries (0 / 1 / 3 years), extreme inflation, start-age edge cases  |
| `dependence.test.ts`          |       4 |    Unit     | Clayton Copula uniform generation, correlated shocks, tail dependence verification           |
| `mortality.test.ts`           |       4 |    Unit     | Survival probability monotonicity, extreme ages, boundary conditions                         |
| `rmd.test.ts`                 |       4 |    Unit     | IRS table lookup, age 120+ floor, known-value verification                                   |
| `simulation.test.ts`          |      13 | Integration | Full path: accumulation, retirement, spending policies, Roth conversions, glidepath          |
| `simulation-features.test.ts` |      30 | Integration | All 14 features tested in isolation (see §8.3)                                               |
| `monteCarlo.test.ts`          |      13 | Integration | Success rates, percentile convergence, 20k-path stability, geometric integrity               |
| `transition.test.ts`          |       1 | Integration | Sequential waterfall depletion ordering                                                      |
| **Total**                     | **145** |             |                                                                                              |

### 8.3 Feature-Isolation Test Strategy

The `simulation-features.test.ts` file uses a **clean baseline** approach to test each simulation feature in complete isolation:

1. Construct a zero-noise, zero-tax, zero-feature `BASELINE` params object
2. For each feature test, copy `BASELINE` and toggle exactly **one** feature ON
3. Run deterministic paths and compare with / without the feature
4. Assert the expected directional effect (e.g. "pension reduces withdrawals", "RMD forces deferred depletion")

**Features covered:**

|  #  | Feature                                                | Tests |
| :-: | ------------------------------------------------------ | :---: |
|  1  | Cash Buffer SORR Mitigation                            |   3   |
|  2  | Pension Income (fixed + inflation-adjusted)            |   3   |
|  3  | Social Security Income                                 |   2   |
|  4  | RMD Mechanics (trigger + excess reinvestment)          |   3   |
|  5  | HSA Waterfall Priority                                 |   1   |
|  6  | Real Estate Downsize                                   |   2   |
|  7  | Step-Up in Basis / Estate Value                        |   2   |
|  8  | Stochastic Inflation (OU floor + deterministic bypass) |   2   |
|  9  | Jump Diffusion (median impact)                         |   1   |
| 10  | Copula Tail Dependence (equity-bond synchronization)   |   1   |
| 11  | Glidepath Rebalancing (target + maintenance)           |   2   |
| 12  | Tax-Aware Bracket Filling                              |   2   |
| 13  | Advanced vs. Simple Tax                                |   2   |
| 14  | Vanguard Dynamic Spending (ceiling + floor)            |   2   |
| 15  | Deterministic Baseline Reproducibility                 |   2   |
