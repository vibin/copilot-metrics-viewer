import type { CopilotMetrics } from "@/model/Copilot_Metrics";
import { convertToMetrics } from '@/model/MetricsToUsageConverter';
import type { MetricsApiResponse } from "@/types/metricsApiResponse";
import { resolve } from 'path';
import { GitHubApiClient, resolveEndpoint } from '../utils/copilotApiClient';

export default defineEventHandler(async (event) => {

    const apiClient = new GitHubApiClient(event);

    const endpoint = resolveEndpoint(event.context.scope, {
        team: ({ org, team }) => ({
            url: `https://api.github.com/orgs/${org}/team/${team}/copilot/metrics`,
            // no team test data available, using org data
            mockPath: resolve('public/mock-data/organization_metrics_response_sample.json'),
            description: 'metrics data'
        }),
        org: ({ org }) => ({
            url: `https://api.github.com/orgs/${org}/copilot/metrics`,
            mockPath: resolve('public/mock-data/organization_metrics_response_sample.json'),
            description: 'metrics data'
        }),
        ent: ({ ent }) => ({
            url: `https://api.github.com/enterprises/${ent}/copilot/metrics`,
            mockPath: resolve('public/mock-data/enterprise_metrics_response_sample.json'),
            description: 'metrics data'
        })
    }, event.context);

    if (endpoint instanceof Response) {
        return endpoint;
    }

    const mockResponse = apiClient.readMock(endpoint.mockPath, (data) => {
        // usage is the new API format
        const usageData = ensureCopilotMetrics(data as CopilotMetrics[]);
        // metrics is the old API format
        const metricsData = convertToMetrics(usageData);
        return { metrics: metricsData, usage: usageData } as MetricsApiResponse;
    });

    if (mockResponse) {
        return mockResponse;
    }

    const authError = apiClient.ensureAuth();

    if (authError) {
        return authError;
    }

    const apiResponse = await apiClient.fetchJson(endpoint.url, {
        description: endpoint.description,
        transform: (response) => {
            const usageData = ensureCopilotMetrics(response as CopilotMetrics[]);
            const metricsData = convertToMetrics(usageData);
            return { metrics: metricsData, usage: usageData } as MetricsApiResponse;
        }
    });

    return apiResponse;
})

function ensureCopilotMetrics(data: CopilotMetrics[]): CopilotMetrics[] {
    return data.map(item => {
        if (!item.copilot_ide_code_completions) {
            item.copilot_ide_code_completions = { editors: [], total_engaged_users: 0, languages: [] };
        }
        item.copilot_ide_code_completions.editors?.forEach((editor) => {
            editor.models?.forEach((model) => {
                if (!model.languages) {
                    model.languages = [];
                }
            });
        });
        return item as CopilotMetrics;
    });
};