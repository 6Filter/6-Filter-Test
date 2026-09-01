export const SPEC_FILTERS_NAV = [
  { key: "f1", label: "F1 Success & growth", bg: "#301A4F", fg: "#C9AEEF" },
  { key: "f2", label: "F2 Net margin", bg: "#1A3E2D", fg: "#7EDCA8" },
  { key: "f3", label: "F3 Price resilient", bg: "#3D2C12", fg: "#E8B563" },
  { key: "f4", label: "F4 Tech & habit", bg: "#1C2C4D", fg: "#8FB8E8" },
  { key: "f5", label: "F5 Revenue target", bg: "#1E2A4B", fg: "#F0A8C8" },
  { key: "f6", label: "F6 Prototype gate", bg: "#401731", fg: "#D9A0C9" },
  { key: "scoreboard", label: "Scoreboard", bg: "#311B4C", fg: "#A8A2B5" },
];

export const DATA_SPINE = [
  {
    fn: "CMI",
    provides:
      "Category sizing model (value, volume, penetration, frequency, growth) · attribute salience · brand shares and ratings · price ladders and elasticity evidence · format and channel trends · all consumer panels (Filter 6) · the analog launch database",
  },
  {
    fn: "BM (proposer)",
    provides:
      "The proposition itself: attribute choice, benchmark choice, declared gap, growth argument, revenue build — argued from CMI data, never from assertion",
  },
  {
    fn: "FINANCE",
    provides: "COGS build, channel margin waterfalls, net margin computation and sensitivity",
  },
  {
    fn: "R&D",
    provides: "Formulation cost and feasibility read · lab panel (Filter 6A) · technology threat view (Filter 4)",
  },
  {
    fn: "PKG",
    provides: "Pack cost · mock-up · competitor pack set · shelf panel (Filter 6C)",
  },
  {
    fn: "SALES",
    provides: "Channel margins and terms, including quick-commerce trajectory · retail price observations",
  },
  {
    fn: "BH forum / CKR",
    provides: "Verdicts. Binary, filter by filter. Escalations to CKR per v4",
  },
];

export const SCOREBOARD_INTRO =
  "Step KPIs above tell us each step was done properly. These process KPIs, reported quarterly, tell us the screen itself is working. Targets are [to set] by CKR after the first two quarters establish the baseline.";

export const SCOREBOARD_KPIS = [
  {
    kpi: "Funnel conversion by filter",
    def: "Propositions passing each filter ÷ propositions reaching it",
    from: "Registry verdicts",
  },
  {
    kpi: "Evidence completeness rate",
    def: "Forum submissions with zero missing-evidence FAILs ÷ total submissions",
    from: "Forum records",
  },
  {
    kpi: "Cycle time per filter",
    def: "Submission to verdict, per filter; prototype-ready to gate decision for Filter 6",
    from: "Registry timestamps",
  },
  {
    kpi: "Kill point distribution",
    def: "Where propositions die: AI screen / paper / lab / consumer / pack. A healthy screen kills early and cheaply",
    from: "Registry",
  },
  {
    kpi: "Escalation rate and outcome",
    def: "Escalations to CKR per v4, and how often the escalation reversed the verdict",
    from: "Escalation log",
  },
  {
    kpi: "Data source freshness",
    def: "Share of CMI inputs (salience, shares, sizing) within their recency limits at time of use",
    from: "CMI source register",
  },
  {
    kpi: "Prediction-to-actual (the learning loop)",
    def: "For launched products: F2 margin path vs actuals · F5 build vs Y1–Y3 actuals · F6 counts vs market repeat. This is what makes the models better every year",
    from: "Post-launch tracking",
  },
];

export const SCOREBOARD_CLOSING =
  "What deliberately comes next, and not now. This document stops at the screen: six filters, every step with its input, owner, validation, output and KPI. Once CKR and CMI agree this specification — the sources, the [to set] blanks, and the model structures — the next build is prioritisation (ranking what the screen clears) and then the launch framework. In that order, as directed.";

export const SIX_FILTERS_SPEC = [
  {
    key: "f1",
    num: "F1",
    title: "Filter 1 — High Success Possibility & Opportunity to Grow",
    accentBg: "#301A4F",
    accentFg: "#C9AEEF",
    v4Test:
      "the proposition declares the attribute (one of the top three consumers use to decide to buy), the benchmark (the named competitor), the gap (what we beat and by how much), parity or better on all remaining attributes — and the growth logic holds either as a low-penetration category that will grow, or as a recognisable advantage strong enough to take share in a mature category. Owned by Marketing (v4).",
    howToThink:
      "Filter 1 is an argument built on consumer evidence — not a computation. The question is salience and differentiation: do consumers actually decide on this attribute, and can we visibly own it against the one strongest competitor? The data can prove the attribute matters; only reasoning can prove the advantage is winnable. So the steps below separate what CMI measures from what the Brand Manager must argue.",
    modelAndAi: [
      "CMI model — attribute salience: derived from U&A / brand track (stated importance + derived importance from correlation of attribute ratings with overall preference). Output: the ranked hierarchy of step 1.1 with salience scores and base sizes.",
      "AI use 1 — attribute language mining: AI reads category reviews (e-commerce), social conversation and search queries to extract the attribute vocabulary consumers actually use and its frequency — a cross-check on the survey hierarchy and the source of consumer-language phrasing for step 1.2.",
      "AI use 2 — the red team: before the forum, AI argues the strongest case AGAINST the proposition (benchmark response scenarios, why the gap may not be perceivable). The BM answers it in writing. The forum reads both.",
    ],
    steps: [
      {
        n: "1.1",
        step: "Establish the category attribute hierarchy",
        input:
          "Ranked list of purchase-decision attributes with salience scores, for the declared category and segment",
        by: "CMI — latest U&A or brand track; where none exists or older than [to set] months, CMI fields a fresh attribute-salience study",
        validation: "CMI head certifies source and recency; method note attached",
        output: "Attribute hierarchy table → KPI: data recency within limit; base size of source study reported",
      },
      {
        n: "1.2",
        step: "Declare the attribute",
        input: "The chosen attribute from step 1.1, phrased in consumer language",
        by: "BM declares attributes 1–3 in rank order; CMI confirms against U&A / track",
        validation: "Attribute 1 required; attributes must be among the top-3 purchase drivers (v4)",
        output:
          "Declared attributes 1–3 → KPI: primary attribute in top-3; phrasing tested for consumer comprehension Y/N",
      },
      {
        n: "1.3",
        step: "Identify the benchmark",
        input:
          "Value share by brand in the declared segment, geography and channel; attribute-level brand ratings for tie-break",
        by: "CMI — retail audit shares; brand ratings from track",
        validation:
          "CMI certifies shares; tie-break rule: within [to set] share points, higher attribute rating wins",
        output:
          "Named benchmark: brand + variant + pack size → KPI: benchmark is verifiably strongest; single brand, no composites",
      },
      {
        n: "1.4",
        step: "Declare the gap",
        input: "Rating spread on the attribute across top brands; erosion history of past advantages in the category",
        by: "CMI provides distributions; BM declares the gap with its derivation",
        validation: "Floor is 2 points on the 10-point scale (v4); derivation reviewed by CMI for arithmetic",
        output: "Declared gap → KPI: gap ≥ 2.0; derivation attached Y/N",
      },
      {
        n: "1.5",
        step: "State the parity claim",
        input:
          "Remaining attributes from 1.1, our intended spec against benchmark ratings, attribute by attribute",
        by: "BM with R&D (product) and PKG (pack attributes)",
        validation: "Listed explicitly; any attribute we expect to lose on is named, not hidden",
        output:
          "Parity table → KPI: count of attributes claimed below parity (target 0; any exception argued)",
      },
      {
        n: "1.6",
        step: "Make the growth argument",
        input:
          "Route A: penetration %, household base, frequency and growth from the CMI sizing model. Route B: share-movement precedent — cases where a comparable advantage moved share in a comparable category",
        by: "CMI sizing model + analog database; BM writes the argument",
        validation:
          "CMI signs the model inputs; the forum judges the argument — this step is argued, not computed (v4)",
        output:
          "One-page growth logic → KPI: every quantitative claim in the argument traceable to a CMI source (target 100%)",
      },
      {
        n: "1.7",
        step: "Commodity exception check",
        input:
          "Whether the product is a pure commodity where no value can be added (v4: toned milk, pure saffron)",
        by: "BM declares; R&D confirms no formulation/mixing/functional differentiation",
        validation:
          "Forum confirms. The moment differentiation enters, commodity status ends (v4)",
        output: "Exception flag on the record → KPI: exception rate across the funnel (monitored, no target)",
      },
      {
        n: "1.8",
        step: "Filter 1 verdict",
        input: "Steps 1.1–1.7 complete",
        by: "BH forum",
        validation: "Binary. Missing evidence = FAIL (v4)",
        output: "F1 PASS/FAIL in the registry → KPI: verdict within 10 working days of submission",
      },
    ],
  },
  {
    key: "f2",
    num: "F2",
    title: "Filter 2 — Net Margin",
    accentBg: "#1A3E2D",
    accentFg: "#7EDCA8",
    v4Test:
      "a clear and visible path to the division net margin floor, demonstrated at launch phase — the path visible at launch, the margin itself need not be delivered at launch — and the path must survive quick-commerce and emerging-channel terms as they will be in three years, not today's rate card. Division floors per the v4 table (Professional Care 60%, Personal Care 50%, Foods 35%, and so on).",
    howToThink:
      "Filter 2 is deterministic arithmetic on disciplined assumptions. Nothing here is a matter of opinion once the inputs are signed — the whole quality of the filter lives in who signs each input and how honestly the sensitivities are shown. The thinking is: every line of cost has an owner, every margin has a source, and the one judgment call (the quick-commerce trajectory) is written down as an assumption, never buried.",
    modelAndAi: [
      "Finance model — the margin waterfall: MRP → channel margins → net realisation → COGS at pilot and scale volume → net margin vs the v4 division floor, with sensitivity on the [to set] largest assumptions (tornado view: which single assumption breaks the floor first).",
      "AI use — assumption completeness check: AI compares the cost build against the cost structures of past propositions in the same category and flags missing lines (wastage, returns, trade load) before Finance signs. It checks completeness, never the numbers themselves.",
    ],
    steps: [
      {
        n: "2.1",
        step: "Set the intended price and pack architecture",
        input:
          "Intended MRP and grammage per pack; the category price ladder — the price points at which category volume actually sits",
        by: "BM proposes; CMI provides the price ladder from retail audit",
        validation: "CMI certifies the ladder; BM's price placed on it explicitly",
        output: "Price-pack statement → KPI: intended price point's share of category volume reported",
      },
      {
        n: "2.2",
        step: "Build the cost",
        input: "Formulation cost at pilot and at scale volume; pack cost; conversion, freight, wastage norms",
        by: "R&D (formulation) · PKG (pack) · Operations (conversion & logistics norms)",
        validation: "Finance assembles and owns the build; each element signed by its providing function",
        output:
          "COGS at two volumes → KPI: % of cost lines from signed sources vs estimated (estimated lines named)",
      },
      {
        n: "2.3",
        step: "Build the channel waterfall",
        input:
          "Distributor, wholesale, retail and platform margins per channel; scheme norms for the category",
        by: "SALES (GT/MT terms) · e-com KAM (platform terms)",
        validation: "Finance reconciles; any term unusual for the category flagged",
        output: "Per-channel price waterfall → KPI: channels covered = all channels in the revenue claim",
      },
      {
        n: "2.4",
        step: "Stress the quick-commerce trajectory",
        input:
          "Current q-com take rates and terms, and a stated three-year trajectory assumption (v4 requires three years out, not today's rate card)",
        by: "e-com KAM proposes trajectory; CMI corroborates with market evidence where available",
        validation: "The assumption is written down and signed — it cannot be implicit",
        output: "Q-com 3-year scenario → KPI: trajectory assumption documented with basis Y/N",
      },
      {
        n: "2.5",
        step: "Compute the margin path",
        input: "Steps 2.1–2.4",
        by: "FINANCE computes net margin at launch and at scale; sensitivity at [to set] % cost and price swings",
        validation:
          "Finance controller signs the computation; forum challenges the path's credibility, not the arithmetic",
        output:
          "Margin path vs division floor (v4 table) → KPI: scale-volume net margin ≥ division floor; sensitivity range reported",
      },
      {
        n: "2.6",
        step: "Filter 2 verdict",
        input: "The margin path statement",
        by: "BH forum",
        validation: "Binary. The threshold is non-negotiable at this stage (v4)",
        output:
          "F2 PASS/FAIL → KPI: % of propositions where the launch-phase path later matched actuals (tracked from pilots, feeds back into Finance norms)",
      },
    ],
  },
  {
    key: "f3",
    num: "F3",
    title: "Filter 3 — Price Resilient",
    accentBg: "#3D2C12",
    accentFg: "#E8B563",
    v4Test:
      "the power to raise price to cover inflation continuously without volume loss; where a steep increase crosses a fixed price point (Re 1, Rs 2, 5, 10), volume loss cannot exceed 10%.",
    howToThink:
      "Filter 3 is econometrics: elasticity is estimated from behaviour, never asserted from conviction. The thinking is that the category's own price history is the best witness — how volume actually moved when prices moved — and that fixed price points behave discontinuously (v4 calls them big drainers), so they are modelled as cliffs, not slopes.",
    modelAndAi: [
      "CMI model — category price elasticity: estimated from retail-audit time series (volume response to observed price moves of our brands and the benchmark, by pack). Where the category has no usable history, CMI states so and a survey-based price module rides on the Filter 6 consumer panel [module design to be agreed with CMI]. Fixed price points carry a separate cliff term, not the smooth elasticity.",
      "AI use — price-event harvesting: AI scans audit data and trade news to build the register of past price events in the category (who moved, when, by how much, what happened to volume) — the raw material for the elasticity estimate and the forum's reference cases.",
    ],
    steps: [
      {
        n: "3.1",
        step: "Price index vs benchmark",
        input: "Our intended price and the benchmark's shelf price at equal grammage, per channel",
        by: "CMI (audited shelf prices) · SALES (observed retail)",
        validation: "CMI certifies; discrepancies between audit and observation resolved before the forum",
        output: "Price index → KPI: index reported per channel, not blended",
      },
      {
        n: "3.2",
        step: "Fixed price point exposure",
        input: "Whether any pack sits on Re1/2/5/10; the share of category volume at those points",
        by: "BM declares; CMI provides the price-point volume distribution",
        validation: 'Forum sees the exposure explicitly — v4 calls fixed points "big drainers"',
        output: "Exposure statement → KPI: % of our intended volume on fixed price points",
      },
      {
        n: "3.3",
        step: "Evidence the elasticity",
        input:
          "Volume response to past price moves: category evidence from retail audit history, or our own brand's past increases in the category",
        by: "CMI — this is a CMI model deliverable; where no history exists, CMI states so and the Filter 6 consumer panel carries a price-sensitivity module [design to be agreed with CMI]",
        validation:
          "Source documented; an elasticity number without provenance is treated as missing evidence (= FAIL, v4)",
        output: "Elasticity estimate with source → KPI: provenance documented Y/N; base of evidence reported",
      },
      {
        n: "3.4",
        step: "Model the resilience",
        input:
          "Steps 3.1–3.3: modelled volume loss at an inflation-covering increase; where a fixed point is crossed, modelled loss vs the 10% cap (v4)",
        by: "CMI models; FINANCE cross-checks against the Filter 2 price",
        validation: "The same price must appear in Filters 2 and 3 — one price, one story",
        output:
          "Resilience statement → KPI: modelled loss ≤ 10% on fixed-point crossings (v4); F2/F3 price identical Y/N",
      },
      {
        n: "3.5",
        step: "Filter 3 verdict",
        input: "The resilience statement",
        by: "BH forum",
        validation: "Binary (v4)",
        output:
          "F3 PASS/FAIL → KPI: post-launch price increases tracked against the modelled loss (feeds the elasticity bank)",
      },
    ],
  },
  {
    key: "f4",
    num: "F4",
    title: "Filter 4 — Survives Technology and Habit Shift",
    accentBg: "#1C2C4D",
    accentFg: "#8FB8E8",
    v4Test:
      "the format must be on the rising side of the shift, not the declining side; at entry there must be no visible downward spiral or emerging threat that could make the format irrelevant within five to ten years. Examples in v4: bar losing to liquid, liquid to pods; physical retail losing to e-commerce and quick commerce; conventional losing to natural and clean-label.",
    howToThink:
      "Filter 4 is about direction of travel, not current size — a format can be large and dying. The thinking is detection: the evidence is trend lines and early signals, and the judgment is whether a visible signal today becomes irrelevance within ten years. This is the filter where AI adds the most, because the early signals live in unstructured data no analyst reads exhaustively.",
    modelAndAi: [
      "CMI model — format trajectory: format-level share of category from retail audit over the past [to set] years, with trend direction and inflection flags (a format that was flat and has turned down is a different signal from one long declining).",
      "AI use — the threat scan: AI sweeps for early signals against this format: D2C launches in adjacent formats, patent and ingredient activity, search-trend growth of substitute formats, regulatory movement, clean-label conversation growth. Output is a threat register: each threat named, with its evidence and an assessed horizon. The register is the input to judgment, not the judgment.",
    ],
    steps: [
      {
        n: "4.1",
        step: "Format trajectory read",
        input: "Format shares of category value over [to set] years, in our geography and channels",
        by: "CMI, from retail audit",
        validation:
          "CMI certifies series and source; trend direction stated (rising / flat / declining), not implied",
        output:
          "Trajectory chart + direction call → KPI: format direction = rising or flat (v4: we do not enter a form losing to its successor)",
      },
      {
        n: "4.2",
        step: "Channel shift exposure",
        input:
          "Category channel mix over time; the format's dependence on channels that are themselves shifting",
        by: "CMI (channel mix) with SALES corroboration",
        validation:
          "Stated as exposure, e.g. share of format volume in channels declining for the format",
        output: "Channel exposure statement → KPI: exposure quantified, not narrated",
      },
      {
        n: "4.3",
        step: "Threat register",
        input:
          "The AI threat scan output: substitute formats, technology, habit and regulatory signals, each with evidence and horizon",
        by: "AI scan run by CMI; R&D adds the technology view",
        validation:
          "Every threat is either answered (why it does not bite within 10 years) or accepted (and the proposition withdrawn or reshaped). Unanswered threats are missing evidence",
        output: "Threat register with responses → KPI: 100% of registered threats carry a written response",
      },
      {
        n: "4.4",
        step: "Filter 4 verdict",
        input: "Steps 4.1–4.3",
        by: "BH forum",
        validation:
          "Binary. The forum judges the 5–10 year call — this is a judgment filter, and the register keeps the judgment honest",
        output:
          "F4 PASS/FAIL → KPI: threats that later materialise on passed propositions, tracked (feeds back into scan design)",
      },
    ],
  },
  {
    key: "f5",
    num: "F5",
    title: "Filter 5 — Revenue Target",
    accentBg: "#1E2A4B",
    accentFg: "#F0A8C8",
    v4Test:
      "a credible pathway to the division revenue target (v4 table: e.g. Personal Care ₹25 Cr all channels / ₹12 Cr e-com-MT; Foods ₹12 Cr) in the third full year. The test is credibility of the number, nothing more — capex, plant, supply chain and sales infrastructure are not screening questions and are not to be declared here (v4).",
    howToThink:
      "Filter 5 is a decomposition exercise: a revenue number is credible when it decomposes into consumer quantities that can each be checked — how many households, buying how often, at what price — and each quantity sits inside what comparable launches have actually achieved. The CMI consumer sizing model is the machine for this filter; the Brand Manager's job is to choose defensible values inside it, and the forum's job is to attack the weakest quantity, not the total.",
    modelAndAi: [
      "CMI model — the consumer sizing model (to be built by CMI; the structure proposed here for agreement): Year-3 revenue = target households reached × trial rate × repeat conversion × purchase frequency × average pack value. Fed by: census household base for the declared geography · category penetration and frequency from CMI panel/track · price from Filter 2. Every factor carries its source and a plausible range, so the output is a range, not a point.",
      "Model cross-check — the analog test: the implied numbers (category share, penetration, throughput per stocking outlet) are compared against CMI's analog database of past launches in comparable categories. An implied penetration no comparable launch has ever reached is not a plan, it is a wish.",
      "AI use — analog retrieval and bound-checking: AI retrieves the most comparable launches (category, price point, brand scale) from the analog base and flags every model factor sitting outside the range those analogs achieved. It flags; the BM argues; the forum decides.",
    ],
    steps: [
      {
        n: "5.1",
        step: "Size the market",
        input:
          "Category value and volume for the declared geography and channel set; household base; penetration; frequency",
        by: "CMI sizing model",
        validation: "CMI head signs the model inputs and their sources; ranges stated per factor",
        output:
          "Category size + factor table → KPI: 100% of factors carry source + range; model recency within [to set] months",
      },
      {
        n: "5.2",
        step: "Build the Year-3 revenue",
        input: "The decomposition: households reached × trial × repeat conversion × frequency × pack value, by year 1–3",
        by: "BM chooses factor values inside the CMI ranges; FINANCE checks arithmetic",
        validation: "Any factor chosen outside the CMI range must be argued in writing",
        output:
          "Y1–Y3 revenue build → KPI: count of out-of-range factors (target 0); arithmetic signed by Finance",
      },
      {
        n: "5.3",
        step: "Run the analog test",
        input: "Implied category share, implied penetration, implied throughput per outlet vs comparable launches",
        by: "AI retrieval from CMI analog base",
        validation: "Every out-of-bound implication flagged and answered",
        output:
          "Analog comparison sheet → KPI: implied share / penetration within analog range, or exception argued",
      },
      {
        n: "5.4",
        step: "State the target coverage",
        input: "The Y3 build against the v4 division target for the declared channel scope",
        by: "BM",
        validation: "The v4 target is quoted next to the build. No infrastructure discussion at this table (v4)",
        output: "Coverage statement → KPI: Y3 build ≥ division target (v4, non-negotiable at this stage)",
      },
      {
        n: "5.5",
        step: "Filter 5 verdict",
        input: "Steps 5.1–5.4",
        by: "BH forum",
        validation: "Binary (v4)",
        output:
          "F5 PASS/FAIL → KPI: for launched products, Y3 actuals vs the build, tracked — the calibration loop for the sizing model",
      },
    ],
  },
  {
    key: "f6",
    num: "F6",
    title: "Filter 6 — Product & Packaging Merit Gate",
    accentBg: "#401731",
    accentFg: "#D9A0C9",
    v4Test:
      "the prototype gate — three verdicts, lab, consumer, pack, all three must pass. Lab: two-point beater vs actual market samples of the benchmark, 30-member internal panel. Consumer: 30 benchmark users, monadic, from memory, 18 of 30 must rate it a two-point beater; the BM attends all 30 interviews. Pack: 30-member shelf panel vs the strongest of the top three competitor packs. Mock-up acceptable, tooling not required.",
    howToThink:
      "Filter 6 is measurement science: the only filter where the evidence is generated, not retrieved. The thinking shifts from arguing to controlling — blind codes, fixed question order, declared occasions, panels that mirror the launch consumer. The enemy here is not a wrong opinion but a contaminated measurement, so every step below is a control on how the number is produced.",
    modelAndAi: [
      "CMI model — panel design and counting: the panel specification (benchmark users, geography, town class, NCCS, buyer/user), the fixed interview order, and the count against the 18-of-30 standard. The statistical layer (what confidence a count carries) is the separate mathematics annexe, to be adopted when prioritisation is built — the v4 standard itself is applied as written.",
      "AI use 1 — verbatim coding: AI codes the open responses (why better, why not, availability asks) against the declared attribute, consistently across every panel — the same code frame, never re-invented per study.",
      "AI use 2 — integrity checks: attendance-log completeness, geo-tag plausibility of interviews, duplicate-respondent detection across panels, and screener-answer consistency. Flags go to the CMI field manager before the verdict is read.",
    ],
    steps: [
      {
        n: "6.1",
        step: "Lab gate (6A)",
        input: "Stable prototype batch + benchmark market samples bought at retail, batch/expiry logged",
        by: "R&D (prototype) · R&D procures benchmark samples · 30-member internal panel",
        validation:
          "Blind coding; randomised order; declared attribute scored on the 10-point scale; R&D declares, Marketing validates (v4)",
        output:
          'Lab verdict, margin to one decimal (v4) → KPI: gap ≥ 2.0; margin reported to 0.1, never "pass"',
      },
      {
        n: "6.2",
        step: "Consumer panel spec (6B design)",
        input:
          "Panel definition: 30 benchmark users (MOUB 3+ months, normal cycle), launch geography, town-class / urban-rural mix per launch plan, NCCS, buyer vs user; the declared occasion and duration",
        by: "CMI writes the spec; BM signs the occasion declaration",
        validation:
          "Spec locked BEFORE recruitment (v4: occasion declared before the panel is recruited). An occasion chosen for convenience invalidates the result (v4)",
        output:
          "Locked panel spec → KPI: spec locked before first recruit Y/N; 100% of members verified benchmark users",
      },
      {
        n: "6.3",
        step: "Consumer panel field (6B field)",
        input:
          "Monadic placement — benchmark never shown or named (v4); interview: our product and her own brand rated from memory in one interview, fixed question order; ease of use judged in use; availability asks logged unprompted",
        by: "CMI fields; the Innovation Marketing BM attends all 30 interviews and signs the log per interview (v4)",
        validation:
          "Report invalid without the complete attendance log (v4); AI integrity checks run before the verdict",
        output:
          "Count of two-point beaters out of 30 → KPI: THE GATE — 18 of 30 (v4; 17 is a fail); attendance 30/30; availability count reported never gated (8 of 30 marks strength, v4)",
      },
      {
        n: "6.4",
        step: "Pack shelf panel (6C)",
        input:
          "Mock-up + top three competitor packs bought at retail, current artwork; separate 30-member panel, shelf display at retail conditions",
        by: "PKG (packs) · CMI (panel)",
        validation:
          "Measured vs the strongest of the top three (v4); shelf position rotated; Packaging declares, Marketing validates (v4)",
        output:
          "Standout verdict + quality parity → KPI: standout two-point beater (v4, mandatory); perceived quality parity or better; ease of use NOT tested here (v4)",
      },
      {
        n: "6.5",
        step: "Gate reading",
        input: "All three verdicts",
        by: "CMI convenes; declaring functions sign",
        validation:
          "Whichever track finishes later opens the gate; no provisional entry on one verdict (v4). Fail routing per v4: lab fail → formulation; consumer fail → new formulation, full cycle; pack fail → pack only",
        output:
          "Gate open/closed in the registry → KPI: all three verdicts filed same day; cycle time from prototype-ready to gate decision",
      },
    ],
  },
];
