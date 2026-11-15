"use client";

import React from "react";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { useDashboard } from "@/components/DashboardContext";

export default function AnalyticsPage() {
  const {
    data,
    rpmHistory,
    selectedKeyId,
    setSelectedKeyId,
    selectedModelId,
    setSelectedModelId,
  } = useDashboard();

  if (!data) return null;

  return (
    <AnalyticsCharts
      keys={data.keys}
      models={data.models}
      usage={data.usage}
      cooldowns={data.cooldowns}
      rpmHistory={rpmHistory}
      selectedKeyId={selectedKeyId}
      onSelectKey={setSelectedKeyId}
      selectedModelId={selectedModelId}
      onSelectModel={setSelectedModelId}
    />
  );
}