"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  SparklesIcon,
  BotIcon,
  ShieldCheckIcon,
  ListChecksIcon,
  KeyIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiAdmin } from "./ai-admin";
import { RolesAdmin } from "./roles-admin";
import { AssistantAdmin } from "./assistant-admin";
import { HrAiAdmin } from "./hr-ai-admin";
import type { HrAiConfig } from "@/server/hr-ai";

export function AssistantTabsClient({
  aiConfig,
  usage,
  models,
  savedModels,
  roles,
  roleOpts,
  rc,
  ops,
  cfg,
  stats,
  flows,
  hrAiConfig,
}: {
  aiConfig: any;
  usage: any;
  models: any[];
  savedModels: any[];
  roles: any[];
  roleOpts: any;
  rc: any;
  ops: any[];
  cfg: any;
  stats: any;
  flows: any[];
  hrAiConfig: HrAiConfig;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentTab = sp.get("tab") || "models";

  return (
    <Tabs
      value={currentTab}
      onValueChange={(t) => router.replace(`/admin/assistant?tab=${t}`)}
      className="space-y-4"
    >
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1">
        <TabsTrigger value="models" className="flex items-center gap-1.5 text-xs py-2">
          <KeyIcon className="size-3.5 text-purple-600" /> AI Models &amp; Providers
        </TabsTrigger>
        <TabsTrigger value="hr" className="flex items-center gap-1.5 text-xs py-2">
          <BotIcon className="size-3.5 text-emerald-600" /> HR AI Agent &amp; Rules
        </TabsTrigger>
        <TabsTrigger value="roles" className="flex items-center gap-1.5 text-xs py-2">
          <ShieldCheckIcon className="size-3.5 text-blue-600" /> Role Actions &amp; Matrix
        </TabsTrigger>
        <TabsTrigger value="flows" className="flex items-center gap-1.5 text-xs py-2">
          <ListChecksIcon className="size-3.5 text-amber-600" /> Written Flows &amp; Usage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="models" className="space-y-4">
        <AiAdmin
          config={aiConfig}
          usage={usage}
          models={models}
          roles={roles}
          savedModels={savedModels}
        />
      </TabsContent>

      <TabsContent value="hr" className="space-y-4">
        <HrAiAdmin initialConfig={hrAiConfig} />
      </TabsContent>

      <TabsContent value="roles" className="space-y-4">
        <RolesAdmin roles={roles} ops={ops} options={roleOpts} routines={rc} />
      </TabsContent>

      <TabsContent value="flows" className="space-y-4">
        <AssistantAdmin config={cfg} stats={stats} flows={flows} roles={roles} />
      </TabsContent>
    </Tabs>
  );
}

