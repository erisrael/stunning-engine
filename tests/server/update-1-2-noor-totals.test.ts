// Noor's own numbers: its dashboard cards (loaded lazily by Livewire) and its menu badges are read from Noor's
// markup, so ops shows what Noor shows.
import { lazyWidgets, noorNumber, parseNoorBadges, parseNoorStats } from "../../src/server/noor-totals";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const enc = (o: unknown) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const stat = (label: string, value: string, d: string) =>
  `<div class="fi-wi-stats-overview-stat"><div class="fi-wi-stats-overview-stat-content"><span class="fi-wi-stats-overview-stat-label"> ${label} </span><div class="fi-wi-stats-overview-stat-value"> ${value} </div><div class="fi-wi-stats-overview-stat-description"><span>${d}</span></div></div></div>`;
const stats = parseNoorStats(`<div>${stat("Total Students", "6218", "All time")}${stat("Revenue", "468,528.00 ETB", "All time")}${stat("Bank — Pending Review", "79", "Tap to review bank receipts")}</div>`);
check("the dashboard cards are read with their values", stats.map((s) => `${s.label}=${s.number}`).join() === "Total Students=6218,Revenue=468528,Bank — Pending Review=79", stats);
check("and their descriptions", stats[1]?.description === "All time" && stats[1]?.value === "468,528.00 ETB");
check("numbers keep their thousands", noorNumber("1,699") === 1699 && noorNumber("—") === null);

const badges = parseNoorBadges(`<ul><li class="fi-sidebar-item"><a><span class="fi-sidebar-item-label"> Invoices <!-- x --></span><span class="fi-sidebar-item-badge-ctn"><span class="fi-color fi-badge fi-size-md"><span class="fi-badge-label-ctn"><span class="fi-badge-label"> 79 </span></span></span></span></a></li><li class="fi-sidebar-item"><a><span class="fi-sidebar-item-label">Students</span></a></li></ul>`);
check("the menu's badges are read", JSON.stringify(badges) === JSON.stringify({ Invoices: 79 }), badges);

const snap = (name: string) => enc({ data: {}, memo: { name } });
const page = `<div wire:snapshot="${snap("App\\Filament\\Pages\\Dashboard")}" wire:effects="{}"></div>
  <div wire:snapshot="${snap("App\\Filament\\Widgets\\StatsOverview")}" wire:effects="{&quot;partials&quot;:[]}" x-intersect="$wire.__lazyLoad(&#039;eyJhIjoxfQ==&#039;)"></div>
  <div wire:snapshot="${snap("Filament\\Livewire\\Notifications")}"></div>`;
const w = lazyWidgets(page);
check("lazily loaded widgets are found with what loads them", w.length === 1 && w[0]!.name.endsWith("StatsOverview") && w[0]!.arg === "eyJhIjoxfQ==", w);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
