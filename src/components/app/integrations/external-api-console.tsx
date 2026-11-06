"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CopyIcon, GlobeIcon, KeyRoundIcon, Loader2Icon, MessageSquareIcon, PhoneCallIcon, ReceiptIcon, RefreshCwIcon, SaveIcon, SendIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveExternalApiConfigAction, testExternalApiAction } from "@/app/actions/external-api";
import type { ExternalApiConfig } from "@/server/external-api";

export function ExternalApiConsole({ config }: { config: ExternalApiConfig }) {
  const router = useRouter();
  const [f, setF] = React.useState<ExternalApiConfig>(config);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, { ok: boolean; message: string; ms?: number }>>({});

  const save = async () => {
    setBusy(true);
    const res = await saveExternalApiConfigAction(f);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Failed to save API configuration");
    toast.success("External API Integration Console settings saved.");
    router.refresh();
  };

  const runTest = async (service: "academy" | "finance" | "sms") => {
    setTesting(service);
    const res = await testExternalApiAction(service);
    setTesting(null);
    if (!res.ok) {
      setTestResults((prev) => ({ ...prev, [service]: { ok: false, message: res.error || "Connection test failed" } }));
      toast.error(res.error || "Connection failed");
      return;
    }
    const d = res.data;
    setTestResults((prev) => ({ ...prev, [service]: { ok: !!d?.ok, message: d?.message || "", ms: d?.ms } }));
    if (d?.ok) toast.success(`${service.toUpperCase()} connection healthy (${d.ms}ms)`);
    else toast.error(d?.message || "Connection failed");
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl font-bold tracking-tight">External API Integration Console</h2>
          <p className="text-xs text-muted-foreground">
            Configure external endpoints so Customer Support can fetch student/parent mobile numbers, Finance can review revenue and manual receipts, and check SMS gateway balance.
          </p>
        </div>
        <Button onClick={save} disabled={busy} size="sm">
          {busy ? <Loader2Icon className="size-4 animate-spin mr-1.5" /> : <SaveIcon className="size-4 mr-1.5" />}
          Save API Settings
        </Button>
      </div>

      <Tabs defaultValue="academy" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="academy" className="flex items-center gap-1.5 text-xs">
            <PhoneCallIcon className="size-3.5" /> Student Academy API (Support)
          </TabsTrigger>
          <TabsTrigger value="finance" className="flex items-center gap-1.5 text-xs">
            <ReceiptIcon className="size-3.5" /> Finance & Receipts API
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-1.5 text-xs">
            <MessageSquareIcon className="size-3.5" /> SMS Gateway API
          </TabsTrigger>
        </TabsList>

        {/* 1. Student Academy API */}
        <TabsContent value="academy" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <GlobeIcon className="size-4 text-primary" /> Main Academy & Student Portal API
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Allows Customer Support agents to search for enrolled students and fetch parent phone numbers to call.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="acad-enable" className="text-xs">Enable Integration</Label>
                  <Switch
                    id="acad-enable"
                    checked={f.academy.enabled}
                    onCheckedChange={(v) => setF({ ...f, academy: { ...f.academy, enabled: v } })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="acad-url" className="text-xs">Base API URL</Label>
                  <Input
                    id="acad-url"
                    value={f.academy.baseUrl}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, baseUrl: e.target.value } })}
                    placeholder="https://academy.myseed.com.et/api/v1"
                  />
                  <p className="text-[11px] text-muted-foreground">The root address where your external Academy API is hosted.</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="acad-key" className="text-xs">API Key / Bearer Secret Token</Label>
                  <Input
                    id="acad-key"
                    type="password"
                    value={f.academy.apiKey}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, apiKey: e.target.value } })}
                    placeholder="sk_live_..."
                  />
                  <p className="text-[11px] text-muted-foreground">Sent as Authorization: Bearer &lt;token&gt; or X-API-Key.</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="acad-timeout" className="text-xs">Request Timeout (ms)</Label>
                  <Input
                    id="acad-timeout"
                    type="number"
                    value={f.academy.timeoutMs}
                    onChange={(e) => setF({ ...f, academy: { ...f.academy, timeoutMs: Number(e.target.value) || 8000 } })}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t">
                <div className="text-xs">
                  {testResults.academy && (
                    <span className={`flex items-center gap-1 font-medium ${testResults.academy.ok ? "text-[#188038]" : "text-destructive"}`}>
                      {testResults.academy.ok ? <CheckCircle2Icon className="size-4" /> : <XCircleIcon className="size-4" />}
                      {testResults.academy.message} {testResults.academy.ms ? `(${testResults.academy.ms}ms)` : ""}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "academy" || !f.academy.baseUrl}
                  onClick={() => runTest("academy")}
                >
                  {testing === "academy" ? <Loader2Icon className="size-3.5 animate-spin mr-1.5" /> : <RefreshCwIcon className="size-3.5 mr-1.5" />}
                  Test Academy Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Endpoint Specification Guide */}
          <Card className="bg-muted/20 border-dashed">
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span>API Endpoint Contract for your Academy site developers:</span>
                <Button size="icon-xs" variant="ghost" onClick={() => copyCode("GET /api/v1/students/search?q={query}")}>
                  <CopyIcon className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="text-muted-foreground">Implement this endpoint on your student website to supply real-time parent contact details:</p>
              <pre className="p-3 bg-muted rounded-md text-[11px] overflow-x-auto font-mono">
{`GET /api/v1/students/search?q={student_name_or_id_or_phone}
Headers:
  Authorization: Bearer <YOUR_API_KEY>

Response (JSON 200 OK):
[
  {
    "studentId": "STU-1082",
    "studentName": "Abebe Bikila",
    "grade": "Grade 9",
    "parentName": "Kassahun Bikila",
    "parentPhone": "+251911223344",
    "secondaryPhone": "+251922334455",
    "email": "parent@example.com",
    "enrollmentStatus": "active",
    "activeCourses": ["Grade 9 Physics", "Grade 9 Mathematics"]
  }
]`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Finance & Receipts API */}
        <TabsContent value="finance" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ReceiptIcon className="size-4 text-primary" /> External Revenue & Manual Receipts API
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Allows Finance officers to view sales revenue and review/approve manual bank transfer slips uploaded by students.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="fin-enable" className="text-xs">Enable Integration</Label>
                  <Switch
                    id="fin-enable"
                    checked={f.finance.enabled}
                    onCheckedChange={(v) => setF({ ...f, finance: { ...f.finance, enabled: v } })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="fin-url" className="text-xs">Finance API Base URL</Label>
                  <Input
                    id="fin-url"
                    value={f.finance.baseUrl}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, baseUrl: e.target.value } })}
                    placeholder="https://academy.myseed.com.et/api/v1/finance"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fin-key" className="text-xs">API Key / Secret</Label>
                  <Input
                    id="fin-key"
                    type="password"
                    value={f.finance.apiKey}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, apiKey: e.target.value } })}
                    placeholder="sk_fin_..."
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="fin-timeout" className="text-xs">Request Timeout (ms)</Label>
                  <Input
                    id="fin-timeout"
                    type="number"
                    value={f.finance.timeoutMs}
                    onChange={(e) => setF({ ...f, finance: { ...f.finance, timeoutMs: Number(e.target.value) || 8000 } })}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t">
                <div className="text-xs">
                  {testResults.finance && (
                    <span className={`flex items-center gap-1 font-medium ${testResults.finance.ok ? "text-[#188038]" : "text-destructive"}`}>
                      {testResults.finance.ok ? <CheckCircle2Icon className="size-4" /> : <XCircleIcon className="size-4" />}
                      {testResults.finance.message} {testResults.finance.ms ? `(${testResults.finance.ms}ms)` : ""}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "finance" || !f.finance.baseUrl}
                  onClick={() => runTest("finance")}
                >
                  {testing === "finance" ? <Loader2Icon className="size-3.5 animate-spin mr-1.5" /> : <RefreshCwIcon className="size-3.5 mr-1.5" />}
                  Test Finance Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Endpoint Specification Guide */}
          <Card className="bg-muted/20 border-dashed">
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-semibold">API Endpoints Contract for Finance & Receipts:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <pre className="p-3 bg-muted rounded-md text-[11px] overflow-x-auto font-mono">
{`# 1. Revenue Summary
GET /api/v1/finance/revenue-summary
Response: { "currency": "ETB", "totalRevenue": 284500, "thisMonthRevenue": 64200, "pendingReceiptsCount": 2 }

# 2. List Pending Bank Transfer Receipts
GET /api/v1/finance/receipts?status=pending
Response:
[
  {
    "id": "rcpt_901",
    "studentId": "STU-3094",
    "studentName": "Natnael Tadesse",
    "bankName": "Commercial Bank of Ethiopia",
    "referenceNumber": "FT263109X719",
    "amount": 1500,
    "currency": "ETB",
    "receiptUrl": "https://cdn.myseed.com.et/receipts/img901.jpg",
    "submittedAt": "2026-11-06T12:00:00Z"
  }
]

# 3. Approve or Reject a Receipt
POST /api/v1/finance/receipts/{receiptId}/review
Body: { "decision": "approve" | "reject", "reason": "optional note", "reviewerName": "Abebe" }
Response: { "ok": true }`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. SMS Gateway API */}
        <TabsContent value="sms" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquareIcon className="size-4 text-primary" /> SMS Gateway API (AfroMessage / Ethio Telecom)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Monitors remaining SMS credits, delivery rates, and gateway connectivity.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="sms-enable" className="text-xs">Enable Integration</Label>
                  <Switch
                    id="sms-enable"
                    checked={f.sms.enabled}
                    onCheckedChange={(v) => setF({ ...f, sms: { ...f.sms, enabled: v } })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sms-url" className="text-xs">Gateway API URL</Label>
                  <Input
                    id="sms-url"
                    value={f.sms.baseUrl}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, baseUrl: e.target.value } })}
                    placeholder="https://api.afromessage.com/api/v1"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sms-sender" className="text-xs">Sender ID / Brand Name</Label>
                  <Input
                    id="sms-sender"
                    value={f.sms.senderId}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, senderId: e.target.value } })}
                    placeholder="MySeed"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sms-key" className="text-xs">API Key / Token</Label>
                  <Input
                    id="sms-key"
                    type="password"
                    value={f.sms.apiKey}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, apiKey: e.target.value } })}
                    placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sms-timeout" className="text-xs">Request Timeout (ms)</Label>
                  <Input
                    id="sms-timeout"
                    type="number"
                    value={f.sms.timeoutMs}
                    onChange={(e) => setF({ ...f, sms: { ...f.sms, timeoutMs: Number(e.target.value) || 8000 } })}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t">
                <div className="text-xs">
                  {testResults.sms && (
                    <span className={`flex items-center gap-1 font-medium ${testResults.sms.ok ? "text-[#188038]" : "text-destructive"}`}>
                      {testResults.sms.ok ? <CheckCircle2Icon className="size-4" /> : <XCircleIcon className="size-4" />}
                      {testResults.sms.message} {testResults.sms.ms ? `(${testResults.sms.ms}ms)` : ""}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === "sms" || !f.sms.baseUrl}
                  onClick={() => runTest("sms")}
                >
                  {testing === "sms" ? <Loader2Icon className="size-3.5 animate-spin mr-1.5" /> : <RefreshCwIcon className="size-3.5 mr-1.5" />}
                  Check SMS Gateway Status
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
