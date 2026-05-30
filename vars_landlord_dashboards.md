# VARS - Landlord Reporting Dashboard Prompts

A structured catalogue of the reports a small UAE property manager (1-2 buildings, mixed-use, or land plots) typically delivers to a landlord. Each entry is written as a prompt you can paste back to Claude to generate the actual visualization, with design notes baked in.

---

## DESIGN SYSTEM (shared across all dashboards)

Before building any individual chart, here are the global design rules so the reports feel like a cohesive product, not a random collection of widgets:

- **Typography**: Inter or SF Pro for UI, tabular numbers (`font-variant-numeric: tabular-nums`) for all financial figures
- **Colour palette**: 
  - Primary: deep navy `#0F1B2D` (VARS brand-ready)
  - Accent: warm gold `#C8A45C` for positive/highlight states
  - Success: `#16A34A`, Warning: `#F59E0B`, Danger: `#DC2626`
  - Neutrals: `#F8F9FB` (canvas), `#E5E7EB` (borders), `#6B7280` (secondary text)
- **Spacing**: 8px grid, 24px card padding, 16px gap between cards
- **Cards**: white background, `border-radius: 12px`, subtle shadow `0 1px 3px rgba(0,0,0,0.04)`, 1px border `#E5E7EB`
- **Currency**: always AED, comma-separated thousands, no decimals for amounts above 1,000
- **Bilingual ready**: structure for EN/AR toggle - keep labels short and avoid baked-in text in SVGs
- **Mobile-first**: landlords often check on phone, so cards should stack cleanly on narrow screens

---

## TIER 1 - THE MONTHLY ONE-PAGER (must-haves)

These are the dashboards every landlord opens first. If VARS only ships five reports at MVP, ship these.

### 1. Portfolio Health Summary (Hero KPI strip)

> Build a top-of-dashboard KPI strip with 6 cards in a single row (stacks to 2x3 on mobile). Each card has a label, a large primary number, and a small delta vs last month with an up/down arrow. Cards to show: (1) Occupancy Rate %, (2) Monthly Revenue Collected AED, (3) Collection Rate %, (4) Outstanding Receivables AED, (5) Open Maintenance Tickets, (6) Net Operating Income AED. Use the navy primary for numbers, gold accent for the active/highlighted card, green/red for positive/negative deltas. Card padding 24px, number font 32px semibold, label 13px uppercase tracking-wide grey, delta 12px. No charts inside, pure typographic cards. This is the "headline" the landlord sees first.

### 2. Occupancy & Vacancy Over Time

> Build a stacked area chart showing the last 12 months of unit status. Three stacked layers from bottom to top: Occupied (navy), Vacant (light grey), Notice Period (gold). Y-axis shows total units (or %), X-axis shows months. Above the chart, three small badges showing current month numbers: "X occupied / Y vacant / Z on notice". On hover, tooltip shows exact unit count and the names of vacant units (e.g. "Unit 402, 805, Studio 12"). Smooth curves, no gridlines except a faint horizontal one at 50% and 100%. Add a subtle annotation marker on any month where occupancy dropped >10%.

### 3. Rent Collection Status (current month)

> Build a horizontal segmented bar (single row, full-width) showing the breakdown of this month's expected rent: Collected (green), Pending (gold), Overdue 1-30 days (orange), Overdue 30+ days (red), Defaulted (dark red). Each segment shows the AED amount and % inside if wide enough, else as a tooltip. Below the bar, a small table listing only the overdue tenants with: Tenant name, Unit, Amount AED, Days overdue, Last contact date. Sort by days overdue descending. Keep the table to 5 rows max with "view all" link. This is the landlord's #1 anxiety - make it scannable in 3 seconds.

### 4. Revenue vs Operating Costs (P&L lite)

> Build a grouped bar chart showing the last 6 months. For each month, two bars side by side: Revenue (navy) and Expenses (light grey with patterned fill). Above each month's pair, show the Net figure in gold if positive, red if negative. Y-axis in AED thousands. Below the chart, a 3-column summary strip: Total Revenue YTD, Total Expenses YTD, Net YTD - each with the % change vs same period last year. This is what landlords actually care about - "am I making money".

### 5. Service Charges Breakdown

> Build a donut chart showing this month's service charge expenditure split by category: Security, Cleaning, MEP/Maintenance, Utilities (common), Landscaping, Pest Control, Insurance, Management Fee, Reserve Fund Contribution, Other. Use a graduated palette from navy through gold (no rainbow). Centre of donut shows total AED. To the right, a vertical legend listing each category with AED amount, % of total, and a small sparkline showing the trend over the last 6 months for that category. Highlight any category that has grown >20% YoY with a small warning dot.

---

## TIER 2 - OPERATIONAL HEALTH (the "is my building running well" reports)

### 6. Maintenance Ticket Funnel

> Build a funnel/horizontal bar chart showing maintenance ticket status this month: Submitted, Assigned, In Progress, Resolved, Closed. Each stage shows count and % of total. Use a gradient from light grey to navy as tickets progress. Below the funnel, three KPI tiles: Average Resolution Time (hours), SLA Breach Count, Tenant Satisfaction Score (1-5 stars based on post-resolution survey). To the right, a small breakdown by category: Plumbing, Electrical, HVAC, Carpentry, Cleaning, Security, Other - as a horizontal bar list sorted by frequency.

### 7. Complaints & Issue Log

> Build a calendar heatmap (GitHub-style) for the last 90 days showing complaint volume per day. Colour intensity from `#F8F9FB` (zero) through gold to red (high). Below the heatmap, a categorised complaint summary: Noise, Neighbour Dispute, Building Cleanliness, Security Concern, Parking, Pet, Maintenance Delay, Service Charge Query, Other. Show count, % change vs prior month, and average resolution time per category. Flag any complaint older than 7 days with a red dot. The landlord wants to know: is there a pattern, is one tenant problematic, is one issue recurring.

### 8. Security Operations Summary

> Build a multi-metric card grid (2x3) for security activities this month: (1) Total Patrols Conducted, (2) Visitor Entries Logged, (3) Incident Reports Filed, (4) Average Guard Response Time, (5) Access Card Issues/Replacements, (6) CCTV Review Requests. Each card has a number, a 7-day sparkline (gold line on transparent background), and a subtle status indicator (green dot = normal, gold = elevated, red = concerning). Below the grid, a chronological feed of the last 5 noteworthy incidents with timestamp, brief description, guard on duty, and resolution status. Limit incident descriptions to 80 chars.

### 9. Announcements & Community Engagement

> Build a two-column layout. Left column: list of announcements sent this month with title, date, channel (Push/SMS/Email/All), and read rate as a horizontal progress bar (gold fill). Right column: a vertical bar chart showing read rates by announcement type (Emergency, Maintenance Notice, Community Event, Policy Update, Payment Reminder, General). Below: total residents reached, average read rate, top performer (highest read rate), and laggard (lowest). This tells the landlord whether the PMC is actually communicating, not just claiming to.

---

## TIER 3 - FINANCIAL DEEP DIVE (quarterly/annual landlord meetings)

### 10. Tenant Ledger & Aging Receivables

> Build a sortable table styled like a modern fintech app (Linear / Stripe aesthetic). Columns: Tenant Name, Unit, Lease End Date, Monthly Rent AED, Current Balance, 0-30 days, 31-60, 61-90, 90+, Status (chip: Current/Warning/Critical/Legal). Row hover reveals a small expansion with last 3 payment dates and a "Send Reminder" action. Rows in the 90+ column get a subtle red left border. Top of table shows aggregate aging totals as 4 KPI tiles in the same colour bands. Add filters at the top: All / Critical Only / Active Leases / Expiring Soon.

### 11. Lease Expiry Timeline

> Build a horizontal Gantt-style timeline showing the next 12 months. Each row is a unit. Each lease shown as a coloured bar starting at lease start, ending at lease end. Colour code: green (>6 months remaining), gold (3-6 months), red (<3 months or expired). Add vertical "today" line in navy. To the right of each bar, show tenant name and current rent. Above the timeline, a KPI strip: Total Active Leases, Expiring in 30/60/90 days, Already Expired (holdover), Renewed YTD %. This drives the renewal pipeline.

### 12. Rent Roll & Market Comparison

> Build a table-meets-chart hybrid. Each row is a unit with: Unit number, Type (Studio/1BR/2BR/etc), Size sqft, Current Rent AED/year, AED/sqft, Market Rent AED/sqft (external benchmark), Variance %. Variance shown as a small inline horizontal bar - green if above market, red if below, centred on zero. Sort by variance descending so under-rented units float to top. Above the table, a scatter plot summary: each unit as a dot, X-axis = sqft, Y-axis = AED/sqft, with a market trend line. Outliers labelled. This tells landlord: "which of my units are leaving money on the table".

### 13. Cash Flow Waterfall

> Build a waterfall chart for the selected month or quarter. Start at left with Gross Rental Income (positive bar, navy). Subtract: Vacancy Loss (red), Bad Debt (red), Service Charges Recovered/Not Recovered (variable), Operating Expenses (red), Capex/Reserve (red), Management Fee (red). End at right with Net Distribution to Landlord (gold, larger bar). Connect bars with thin dashed lines showing the running total. Each bar labelled with AED amount above and % of gross below. This is the landlord's cleanest "where did my money go" view.

### 14. Capex & Reserve Fund Tracker

> Build a dual-axis chart. Left axis (bars): Capex spend per quarter for the last 8 quarters, split by category (Major MEP, Façade, Lifts, Common Area Refurb, Emergency). Right axis (line, gold): Reserve Fund balance over time. Add horizontal dashed lines for "Minimum recommended reserve" and "Target reserve". Below, a forthcoming capex list (next 12 months) with item, estimated cost, planned quarter, and a confidence chip (Quoted / Estimated / Speculative). UAE landlords are obsessed with surprise capex, so making this proactive builds enormous trust.

---

## TIER 4 - LAND & MIXED ASSETS (since some VARS clients hold land plots)

### 15. Land/Plot Performance Card

> Build a simplified single-card view for non-building assets (land, undeveloped plots, parking lots). Top: plot name, location (with embedded mini-map if possible), area in sqm, ownership status. Middle: 3 KPI tiles - Current Use (Leased / Vacant / Under Development), Monthly Income AED (if any), Annual Holding Cost (DM fees, security, insurance). Bottom: a simple events log - recent inspections, regulatory notices, lease activity, valuation updates. Land doesn't need fancy charts, it needs a clean "status card" the landlord can glance at quarterly.

### 16. Multi-Asset Portfolio Roll-up

> Build a master dashboard for landlords with 2+ assets. Top: a sortable asset list with columns: Asset Name, Type (Building/Land/Mixed), Units, Occupancy %, Monthly NOI, YoY %. Each row clickable to drill into that asset's dashboard. Middle: a treemap visualization where each rectangle is one asset, size = % of total portfolio income, colour = NOI margin (red <20%, gold 20-40%, green >40%). Bottom: a comparison radar chart showing all assets across 5 axes: Occupancy, Collection Rate, Tenant Satisfaction, Maintenance Health, NOI Margin. This is what differentiates VARS from spreadsheet-based competitors.

---

## TIER 5 - NICE-TO-HAVES (Phase 2 features)

### 17. Tenant Satisfaction Pulse

> Build a 5-star rating widget showing average satisfaction score (large, prominent), with a horizontal stacked bar showing distribution of 1-5 star responses. Below, the last 4 quarterly trend dots on a sparkline. To the side, top positive and negative themes extracted from survey free-text (use simple tag pills, gold for positive, grey for negative). Response rate shown as a small secondary metric.

### 18. Energy & Utility Consumption (sustainability angle)

> Build a line chart showing monthly common-area electricity, water, and chiller consumption for the last 24 months. One line per utility, normalised so they fit on same axis (use indexed values, base 100 = 24 months ago). Add a horizontal benchmark band showing typical consumption for similar building. Below, AED savings/overspend vs benchmark. This positions VARS as ESG-aware, which matters more in UAE every year, and helps landlord justify capex on efficiency.

### 19. Visitor & Delivery Analytics

> Build a polar/radial chart showing visitor entries by hour of day (24 spokes), one ring per day-of-week. Colour intensity by volume. Below: peak hour, peak day, average daily visitors, delivery volume trend (7-day rolling). Operational insight for staffing security and concierge.

### 20. PMC Performance Scorecard (the meta-report)

> Build a scorecard the PMC voluntarily shows the landlord, demonstrating their own performance. Five metrics: SLA Compliance %, Response Time Average, Resolution Rate, Tenant NPS, Collection Efficiency. Each shown as a gauge (0-100) with current value, target value, and traffic-light status. Below, three "what we did this month" highlights as text bullets and three "focus areas next month". This is brilliant retention - it makes the PMC indispensable and gives the landlord confidence they're getting value. Most PMCs don't do this; if VARS makes it default, it becomes a sales weapon.

---

## IMPLEMENTATION NOTES

- **Order of build**: ship Tier 1 (5 reports) for MVP - that's enough to demo and get LOIs. Tier 2 for first paying customers. Tier 3-4 for retention. Tier 5 as competitive moat.
- **Tech stack suggestion**: Recharts or Visx for React, or Chart.js if simpler. Avoid heavy libraries like Plotly for landlord-facing views - keep bundle light for mobile.
- **PDF export**: every dashboard should export to a branded PDF for landlords who want a monthly emailed report - this is non-negotiable in UAE.
- **Drill-down rule**: every aggregate number should be clickable to reveal its underlying records. Landlords trust what they can verify.
- **Empty states**: design these properly - small PMCs will have months with zero complaints, zero capex, etc. Don't show empty charts; show a friendly "nothing to report" state with the PMC's branding.

---

## PROMPT TEMPLATE TO USE THESE

When you want to generate any specific report, paste this back:

> Build dashboard #[number] from the VARS landlord reports list. Use the global design system (navy #0F1B2D primary, gold #C8A45C accent, Inter font, 12px border radius cards). Generate as a React component with TailwindCSS and Recharts. Mock realistic UAE PMC data (AED amounts, Arabic/English tenant names, Dubai/Abu Dhabi unit numbers like "Marina Heights Tower A - Unit 1204"). Make it production-ready, mobile-responsive, and include subtle interactions on hover.
