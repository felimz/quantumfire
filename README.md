# QuantumFire

**Interactive retirement planning tool with real-time Monte Carlo projections and multi-account financial modeling.**

## Features

- **Monte Carlo Simulation** — 20,000 stochastic paths with correlated asset-class returns
- **Deterministic Baseline** — Geometric-mean projection for comparison
- **Multi-Account Modeling** — Separate 401(k), Roth IRA, and Brokerage buckets with distinct risk profiles
- **RMD Engine** — Uses the actual IRS Uniform Lifetime Table (SECURE 2.0 Act)
- **Configurable Tax Rates** — Effective income tax, capital gains, and brokerage tax drag
- **Withdrawal Waterfall** — Implements Taxable → Deferred → Roth drawdown strategy
- **Interactive Charts** — Percentile fan chart, stacked breakdown, log-scale auto-detection

## Tech Stack

| Layer   | Technology                               |
| ------- | ---------------------------------------- |
| UI      | React 18 + TypeScript                    |
| Styling | Tailwind CSS v4 (PostCSS)                |
| Charts  | Recharts                                 |
| Icons   | Lucide React                             |
| Build   | Vite 6                                   |
| Testing | Vitest                                   |
| Linting | ESLint (flat config + typescript-eslint) |

## Getting Started

```bash
# Use Node 22.23.3 and npm 12.2.0 (see .node-version and .npm-version).
npm ci
npm run dev         # Start dev server on http://localhost:4000
```

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start Vite dev server                    |
| `npm run build`     | Type-check + production build            |
| `npm run test`      | Run Vitest test suite                    |
| `npm run lint`      | Run ESLint on `src/`                     |
| `npm run typecheck` | TypeScript strict-mode check             |
| `npm run validate`  | Run all checks (typecheck → lint → test) |

## Project Structure

```
src/
├── app/           App.tsx (root component)
├── components/
│   ├── charts/    ResultsChart, CustomTooltip
│   ├── inputs/    InputSlider
│   ├── metrics/   MetricsCard
│   └── tables/    SummaryTable
├── engine/        Financial simulation core
│   ├── math.ts         Gaussian RNG, lognormal model
│   ├── rmd.ts          IRS RMD divisor table
│   ├── simulation.ts   Single-path simulator
│   └── monteCarlo.ts   N-path aggregator
├── hooks/         useSimulation (state management)
├── types/         TypeScript interfaces
├── constants/     Default params, color palette
└── utils/         Currency formatting
```
