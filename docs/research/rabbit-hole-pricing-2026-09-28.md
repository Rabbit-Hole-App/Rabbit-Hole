# Rabbit Hole pricing research and operating model

Research date: 28 September 2026. USD, web subscriptions, US domestic-card processing assumptions. The user subsequently approved displaying these packages on the dev Pricing page as an early-access preview, including resources, services and benefits. This does not implement subscriptions or entitlements. Current customer counts, invoices, acquisition performance, license agreement, founder compensation and development investment were not supplied. All Rabbit Hole financial figures below are assumptions, not observed results.

## Recommendation

Launch **Free + Plus at $19/month** for individual technical learners. Validate a **$39/month Pro** upgrade with heavy users before adding it to the public offer. Introduce teams after collaboration, permissions and administration are ready. Treat $19 as the first price to test, not a proven optimum.

The value is a persistent learning workspace: bring a paper, repository or question, develop understanding through adaptive explanations and practical exercises, and keep a reusable, source-linked learning path. That positioning follows the [Rabbit Hole product brief](../rabbit-hole-home-project-uiux-brief-v2.md), whose initial priority is individual technical learners. A general AI subscription is a strong substitute; the reason to pay us must be better learning continuity, practice and usable artifacts.

Use a subscription with a clear allowance for new AI work. Keep reading saved material, manual notes and revisiting completed exercises outside the generation meter. Do not sell unlimited expensive generation, lifetime AI access, or a low flat team price with unlimited seats. Repeated failed generations should not consume the learner's allowance.

## Market evidence

These are first-party pages checked during this research. Promotions, location and billing period affect comparisons.

| Product | Public price observed | Implication for Rabbit Hole |
| --- | --- | --- |
| [Khanmigo families](https://www.khanmigo.ai/parents) | $4/month or $44/year | Low-price tutor benchmark, supported by a nonprofit; not a commercial margin target. |
| [Recall Plus / Max](https://www.recall.it/pricing) | $10 / $38 per month equivalent, **billed annually** | Source-based knowledge work can support both everyday and power-user tiers. These are not verified month-to-month prices. |
| [Google AI Pro](https://one.google.com/about/google-ai-plans/) | $19.99/month; $199.99 annual option shown | A broad AI/storage bundle competes for the same personal subscription budget. |
| [Brilliant Premium](https://brilliant.org/subscribe/?close_path=/welcome/where-to-start/) | Page served $22.50/month equivalent, **billed annually** | Interactive learning has a paid market; localized checkout must be rechecked. Cached search results differed, so this report uses the opened page, not the older snippet. |

These prices establish alternatives, not willingness to pay for Rabbit Hole. My inference is that a $15–25 core-plan test range is reasonable. A $19 starting point needs fewer explanations than a premium price before learning outcomes and retention are established.

## Proposed packages and benefits

All entitlements are proposals. The product brief contains both implemented previews and future requirements; this research did not validate every paid feature end to end. Publish benefits only once they work in the normal user flow.

| Package | Proposed price | Who it serves and what they get |
| --- | --- | --- |
| Free | $0 | Experience one complete learning outcome: one active project, private-by-default source handling, basic adaptive tutoring, saved notes/citations and a small monthly generation allowance. Saved work remains readable after the allowance runs out. |
| Plus | **$19/month** | A regular personal learning workspace: multiple projects, papers/repositories as learning sources, adaptive follow-ups, quizzes and review, saved paths/history, exports and substantially more generation. Privacy and learning quality remain core product features. |
| Pro | **$39/month**, validate later | More capacity for researchers and heavy learners: larger multi-source work, more advanced reasoning, a larger generation allowance, higher job concurrency and more storage. Do not split ordinary learning quality into a weak and a useful tier. |
| Teams | Test **$29 per active learner/month**, minimum five seats; later | Shared private learning spaces, reusable onboarding material, permissions, shared usage allocation and consolidated billing. Seat price covers collaboration and administration. SSO, compliance promises and service guarantees require separate delivery and costing. |

An initial internal allowance experiment:

| Limit | Free | Plus | Pro |
| --- | ---: | ---: | ---: |
| Active projects | 1 | 10 | 50 |
| Weighted generation credits/month | 20 | 200 | 500 |
| Stored uploads | 100 MB | 2 GB | 10 GB |

These are test values, not finalized entitlements. Source count alone does not control costs: one large paper or repository can exceed many small documents. Meter processed context and all tool calls behind the scenes. Show the learner a simple action estimate before starting unusually large work; never display a surprise bill or demand payment to finish an already quoted job.

For planning, target at most **$0.02 of total provider cost per credit**, including internal retries. Illustrative action weights: one short inexpensive follow-up, two for a standard Sonnet-sized follow-up, eight for a visual learning step, and eighteen for a deep Opus-sized analysis. Actual weights need bounded requests and measured costs. This makes 200 credits a $4 provider-cost ceiling, not 200 unrestricted conversations. Reading, hand-editing and replaying cached results use no credits.

Consider a $9 pack of 100 additional credits for occasional bursts. Keep generated video/other expensive media outside the core unlimited promise: quote a media job or offer a separately priced pack after the replacement provider is verified. Existing cached media should play without another generation charge. No paid add-on is implemented by this research.

After at least two monthly renewal cycles, test $190/year for Plus and $390/year for Pro (two months off), with generation allowances refreshing monthly. Annual cash received is not immediately earned profit; we still owe twelve months of service. For students, test a time-limited discount or sponsored access after the full-price economics are measured. Avoid permanently subsidizing heavy usage through a blanket discount.

## What the current code tells us about costs

This is source inspection, not an audit of live invoices:

- [ask.js](../../packages/control-plane/src/ask.js) maps Auto to `claude-opus-5`, with Sonnet 5 and Haiku 4.5 alternatives. Organization settings and transport configuration can override routing. Planning uses `gpt-4.1-mini` when an OpenAI key exists unless `LEARN_PLAN_MODEL` overrides it; otherwise it uses the Anthropic path. We have not assumed which secrets are present on a shared installation.
- [learn-research.js](../../packages/control-plane/src/learn-research.js) can perform up to nine model invocations in a research loop. [learn-board.js](../../packages/control-plane/src/learn-board.js) includes planning, retrieval, drafting, review and possible repair/revision. One user action can therefore cost several model calls. Ordinary chat does not automatically add a separate teaching-planner call.
- [video-provider.js](../../packages/control-plane/src/video-provider.js) still references Seedance v1 Lite, with 480p in the dev configuration and a two-second default in the schema. The current [fal model page](https://fal.ai/models/fal-ai/bytedance/seedance/v1/lite/text-to-video) says the endpoint is deprecated and requests are rerouted to Pro Fast. The [Pro Fast page](https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/fast/text-to-video) lists approximately $0.245 for a five-second 1080p clip. That does **not** establish the current price or compatibility of our exact two-second request. Revalidate provider, duration, resolution and billed usage before selling video capacity. No paid generation was run here.
- [Scene generation](../features/learn-scene-generation.md) adds a Fly renderer and R2 assets; [video generation](../features/learn-video.md) uses asynchronous jobs and learner/app-scoped caching. Do not budget private generations as a globally shared cache.
- I found usage returned by model responses, but not a complete per-learner dollar-cost ledger in these inspected paths. Do not treat placeholder pricing as enforced billing or assume developer subscription access provides free production inference.

## Provider rates and unit-cost examples

Standard online token rates, per million input/output tokens, from [Anthropic's pricing table](https://platform.claude.com/docs/en/about-claude/pricing) and [OpenAI's GPT-4.1 mini documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Batch discounts are not assumed for interactive learning; caching savings are not assumed without a measured hit rate.

| Model | Input | Output |
| --- | ---: | ---: |
| Claude Opus 5 | $5.00 | $25.00 |
| Claude Sonnet 5 | $2.00 | $10.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |
| GPT-4.1 mini | $0.40 | $1.60 |

Our arithmetic using those rates:

| Total workload, including all calls | Mini | Sonnet 5 | Opus 5 |
| --- | ---: | ---: | ---: |
| 6k input + 1k output tokens | $0.004 | $0.022 | $0.055 |
| 30k input + 6k output tokens | $0.0216 | $0.12 | $0.30 |
| 100k input + 10k output tokens | $0.056 | $0.30 | $0.75 |

These token volumes are examples, not measured session averages. An illustrative month of 80 small Mini follow-ups, twelve Sonnet visual steps and one 30k/6k Opus analysis totals $2.06; a 20% retry allowance takes it to $2.47. We round the scenario budget to **$3 per paying user/month**. This requires a quality-validated routing policy, not simply the current Auto default. Sending all of that workload to Opus would be approximately **$9.96** including the same retry allowance. Do not silently reduce learning quality to meet the cheaper estimate.

Hosting has separate costs:

| Item | Verified price basis / budgeting treatment |
| --- | --- |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) | Paid baseline $5/month, with included request/CPU allowances; additional usage is metered. A low hosting minimum is not the whole business cost. |
| [D1](https://developers.cloudflare.com/d1/platform/pricing/) | Paid plan includes 5 GB storage, 25 billion reads and 50 million writes monthly; overages apply. Shared account quotas are not per customer. |
| [R2](https://developers.cloudflare.com/r2/pricing/) | Standard storage $0.015/GB-month, plus operations; direct egress is free. Upload quotas represent capacity, not assumed full utilization. |
| [Fly](https://docs.fly.io/about/pricing/) | Machine configuration, region, running time, storage and transfer determine the bill. Auto-stop reduces idle compute; storage can still cost money. |
| [tldraw](https://tldraw.dev/pricing) | Commercial production license is quote-based; startup discounts and a trial are offered. We cannot infer our license bill from possession of a key. |
| [Stripe Payments](https://stripe.com/pricing) + [Billing](https://stripe.com/billing/pricing) | US domestic online card assumption: 2.9% + $0.30 per successful charge, plus 0.7% of recurring Billing volume. Country, international cards, conversion and other services change the bill. |

No actual cost total can be established without invoices and usage records. The following budget includes explicit reserves instead of pretending those costs are zero.

## Monthly economics at $19

This model uses monthly subscriptions only, no Pro upsells, no add-ons and no annual prepayments. All amounts are before income tax. Sales tax/VAT collected from customers is not revenue; tax-inclusive pricing and international fees need a separate adjustment.

| Per paying customer per month | Budget |
| --- | ---: |
| Revenue | $19.00 |
| AI/tool usage, including retry headroom | −$3.00 |
| Variable storage/compute | −$0.35 |
| Support allowance | −$0.65 |
| Payments + recurring billing | −$0.984 |
| Refund/dispute reserve, assumed 2% of revenue | −$0.38 |
| Contribution before free users | **$13.636** |
| Free-user subsidy: ten active free users × $0.25 | −$2.50 |
| Contribution available for overhead, acquisition and owner pay | **$11.136** |

The paid service margin is about 72% before free-user costs and fixed expenses; the contribution after the free-user subsidy is about 59%. Neither is net profit. Free users cost money even if they never upgrade. Ten active free users per payer is a stock-ratio assumption, distinct from the conversion rate of newly acquired users. A large existing free audience must be entered separately.

Fixed monthly budget assumption: **$500**, comprising $50 platform baseline/operations reserve, $50 renderer baseline reserve, $75 email/monitoring, **$250 unverified license placeholder**, and $75 administration/other tools. Variable usage is in the per-user rows above, so it should not be counted again here. Add **$4,000/month founder compensation budget**, inclusive of any applicable payroll/benefit burden, when evaluating whether this supports a full-time business. Replace both amounts with actual spending.

At these assumptions, approximately **45 paying customers** cover $500 overhead with no acquisition budget or owner pay. Approximately **405** cover $4,500 overhead plus owner pay, still before acquisition. In the base growth case, $2,000 monthly acquisition spend raises the full threshold to **584 paying customers**, about **$11,096 MRR**. More free usage, higher salaries or license fees raise those thresholds.

## How long until profit?

We cannot responsibly give a calendar date without acquisition and retention data. Month 1 below means the first paid launch month, starting with zero paying customers. Each scenario assumes constant monthly acquisition, no price changes, stable unit costs, full-month billing for new subscribers, churn at the beginning of the month, and the same free-user ratio. Fractional subscribers represent expected cohort counts.

| Scenario | New payers/month | Monthly paid churn | Acquisition cost/new payer | Covers overhead + acquisition, before owner pay | Covers those costs **and $4k owner pay** | Recovers **$20k initial investment plus operating losses** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Slow | 30 | 8% | $45 | Month 8 | Never at these steady assumptions | Not reached |
| Base | 80 | 5% | $25 | Month 3 | **Month 9** | **Month 23** |
| Strong | 160 | 3% | $20 | Month 3 | Month 5 | Month 11 |

The slow case plateaus at 375 payers while requiring 526 to cover full costs, so waiting longer does not fix it. The base case needs roughly **$43,400 total funding**, including the assumed $20,000 initial investment, to cover its deepest cumulative deficit before recovery. The strong case is an upside scenario, not an expectation; both acquisition volume and retention must improve at the same time.

Base case at month 12: approximately 735 paying customers, $13,973 revenue, and **$1,690 monthly operating surplus** after the modeled acquisition and owner-pay costs. Cumulative balance remains about **−$39,793**, including the initial investment. Positive monthly operations do not mean the investment has been recovered.

To acquire 80 paying users monthly at an assumed 5% activated-free-to-paid conversion requires 1,600 new activated free learners monthly. If 20% of qualified visitors activate, that implies 8,000 qualified visits. These are funnel requirements, not measured conversion benchmarks. The $25 acquisition cost includes paid campaigns and attributable acquisition spending; founder marketing time must come from the stated compensation budget or be added separately.

Formulae used in the reproducible model:

```text
paying_users[t] = paying_users[t−1] × (1 − monthly_churn) + new_payers
acquisition_spend = new_payers × cost_per_acquired_payer
contribution = price − paid_service − payment_fees − refund_reserve − free_subsidy
operating_surplus[t] = paying_users[t] × contribution − fixed_costs − owner_pay − acquisition_spend
cumulative_balance[t] = −initial_investment + sum(operating_surplus[1..t])
```

The model treats compensation and reserves as budgeted costs. It is not a tax return, an audited P&L or an annual-contract cohort model. Annual prepaid cash can improve runway while lowering recognized monthly revenue; it does not eliminate the service obligation. Multi-year growth will require revised staffing and fixed-cost assumptions, so distant constant-cost outputs are not reliable forecasts.

## Sensitivities worth paying attention to

Keeping base acquisition spend and other assumptions fixed:

| Change | Contribution/payer/month | Payers needed to cover $6,500 monthly overhead, acquisition and owner pay |
| --- | ---: | ---: |
| Base | $11.14 | 584 |
| AI costs $6 rather than $3 | $8.14 | 799 |
| AI costs $10 rather than $3 | $4.14 | 1,572 |
| 25 active free users per payer | $7.39 | 881 |
| Price is the current placeholder $12, same capped usage | $4.53 | 1,436 |
| Everyone pays $190 annually, revenue/fees spread over 12 months | $8.42 | 772 |

The last row is a unit-economics comparison, not an annual churn forecast. At $12 with $10 AI costs and the same other assumptions, contribution becomes negative: more usage would lose more money. This is why the existing “unlimited threads” placeholder should not become a billing promise.

Every additional $500 of fixed monthly expense requires about 45 more payers at the base contribution. At 50 free active users per payer, contribution drops to $1.14 before fixed costs; free-tier controls become more important than hosting optimization. Media-heavy behavior, full-context retries, larger customer-support needs and poor retention can dominate the outcome.

## First validation cycle

1. Instrument cost per completed learning action, including input/output/cache tokens, every tool/review/retry, media, rendering and storage. Aggregate median, p90 and p95 cost by user and cohort; reconcile totals to provider invoices. Confirm the commercial license amount and separate dev spending from production.
2. Recruit 20–30 target learners with real papers or repositories. Let each complete a meaningful source-to-understanding task. Observe completion, correction quality, next-day return and whether the saved work is useful a week later. Interviews can expose missing value but do not establish price acceptance.
3. Test an actual $19 monthly offer, with clearly communicated limits and cancellation. Compare $15 and $24 in subsequent controlled cohorts with the same benefits. Do not overinterpret a tiny A/B test. Honor the price shown and evaluate revenue/contribution per activated learner, not conversion alone.
4. After two renewal cycles, review retained paid learners, cancellations, cost tails, refunds and allowance complaints. Widen allowances only if quality and margin support it. Promote Pro when observed heavy users want more capacity; do not manufacture a premium tier by making the core plan frustrating.
5. Prefer referral credit after a referred learner completes a real learning milestone. Pilot a reusable course with an educator or a technical community before funding broad ads. Borrowed course content and users' private sources do not become a saleable content library by default.

For a pilot decision, use a provisional target of at least 65–70% paid service margin before the free audience, positive contribution after it, and acquisition payback within three months. These are internal guardrails, not claims about industry averages. If the cost/routing assumptions fail, revise limits, model policy or price before scaling.

The dev Pricing page retains its neutral palette after removal of the rejected key. Following the user's approval, Free/$19 Plus/$39 Pro now replace the old placeholder packages; a separate Teams offer is marked coming later. The page identifies the benefits and allowances as planned, with links to the existing early-access app. No checkout, entitlement enforcement, model routing or paid experiments were implemented.

## Reproducible files

- [Assumptions](rabbit-hole-pricing-assumptions.json): replace provisional inputs with actuals.
- [Calculation script](rabbit-hole-pricing-model.py): Python standard library, no network or paid calls.
- [Monthly projections CSV](rabbit-hole-pricing-projections.csv): 60 months for each of three scenarios; opens in a spreadsheet.
- [Calculated results](rabbit-hole-pricing-results.json): thresholds, break-even dates, peak funding and snapshots.

Regenerate from the repository root with `python docs/research/rabbit-hole-pricing-model.py`. The source rates above were verified on the research date; recheck them before a pricing launch.
