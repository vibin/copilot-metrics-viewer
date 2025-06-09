import type { CopilotMetrics } from "@/model/Copilot_Metrics";
import type { Metrics } from "@/model/Metrics";

export interface MetricsApiResponse {
    metrics: Metrics[];
    usage: CopilotMetrics[];
}