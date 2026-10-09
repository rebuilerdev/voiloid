"use client"

import { useState } from "react"

import { useI18n } from "@/components/providers"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** 運営コンソールの Worker 画面: 公式Worker / 自鯖Worker */
export function WorkerTabs({ official, private: privateWorkers }: { official: React.ReactNode; private: React.ReactNode }) {
  const { t } = useI18n()
  const [tab, setTab] = useState("official")
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <TabsList>
        <TabsTrigger value="official">{t.ops.tabOfficial}</TabsTrigger>
        <TabsTrigger value="private">{t.ops.tabPrivate}</TabsTrigger>
      </TabsList>
      <TabsContent value="official" className="flex flex-col gap-4">
        {official}
      </TabsContent>
      <TabsContent value="private" className="flex flex-col gap-4">
        {privateWorkers}
      </TabsContent>
    </Tabs>
  )
}
