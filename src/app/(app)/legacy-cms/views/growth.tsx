"use client";

// Legacy CMS: the growth view (split from legacy-cms-client.tsx; Update 1.0 u2). Its state lives in
// useLegacyCmsState (state.tsx) and comes through the page's context.
import { RefreshCwIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLegacyCms } from "../context";

export function GrowthView() {
  const { analyticsProgress, records, growthData, refreshLiveAnalytics } = useLegacyCms();
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"><p className="text-sm text-muted-foreground">{analyticsProgress || "Insights use the most recent complete synchronized records."}</p><Button disabled={!!analyticsProgress} onClick={refreshLiveAnalytics}><RefreshCwIcon className="mr-2 size-4"/>Refresh from live Noor</Button></div>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-indigo-600" /> Noor Ethiopia Growth &amp; Analytics
            </CardTitle>
            <CardDescription className="text-xs">
              Academic enrollment distribution, grade levels, and subscription conversion analytics.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grade distribution */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Students by Grade Level
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {growthData.gradeDistribution.map((gd) => (
                <div key={gd.grade} className="rounded-lg border p-3 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{gd.grade}</span>
                    <span className="text-muted-foreground font-mono">{gd.percentage}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${gd.percentage}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{gd.count.toLocaleString()} students</span>
                </div>
              ))}
            </div>
          </div>

          {/* City Demographics & Plan popularity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 border rounded-xl p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Geographic Distribution (Cities)
              </h4>
              <div className="space-y-2 pt-1">
                {growthData.cityDemographics.slice(0, 6).map((c) => (
                  <div key={c.city} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{c.city}</span>
                    <span className="font-mono text-muted-foreground">{c.count} students ({c.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border rounded-xl p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Subscription Packages
              </h4>
              <div className="space-y-2 pt-1">
                {growthData.planPopularity.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{p.plan}</span>
                    <span className="font-mono text-muted-foreground">{p.count} active ({p.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
