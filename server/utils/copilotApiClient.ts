import { readFileSync } from 'fs';
import type { H3Event } from 'h3';
import { useRuntimeConfig } from '#imports';

export type Scope = 'team' | 'org' | 'ent';

export interface EndpointDefinition {
  url: string;
  mockPath: string;
  description: string;
}

export interface EndpointFactoryContext {
  org?: string;
  ent?: string;
  team?: string;
}

export type EndpointFactory = (context: EndpointFactoryContext) => EndpointDefinition;

export function resolveEndpoint(
  scope: Scope,
  endpoints: Partial<Record<Scope, EndpointFactory>>,
  context: EndpointFactoryContext
): EndpointDefinition | Response {
  const endpointFactory = endpoints[scope];

  if (!endpointFactory) {
    return new Response('Invalid configuration/parameters for the request', { status: 400 });
  }

  return endpointFactory(context);
}

export class GitHubApiClient {
  private logger: Console;
  private runtimeConfig: ReturnType<typeof useRuntimeConfig>;

  constructor(private event: H3Event, logger: Console = console) {
    this.logger = logger;
    this.runtimeConfig = useRuntimeConfig(event);
  }

  private get headers() {
    return this.event.context.headers;
  }

  readMock<T>(mockPath: string, transform: (data: unknown) => T): T | null {
    if (!this.runtimeConfig.public.isDataMocked) {
      return null;
    }

    const data = JSON.parse(readFileSync(mockPath, 'utf8'));
    this.logger.info('Using mocked data');
    return transform(data);
  }

  ensureAuth(): Response | null {
    if (!this.headers.has('Authorization')) {
      this.logger.error('No Authentication provided');
      return new Response('No Authentication provided', { status: 401 });
    }

    return null;
  }

  async fetchJson<T>(url: string, {
    params,
    description,
    transform,
  }: {
    params?: Record<string, string | number>;
    description: string;
    transform: (data: unknown) => T;
  }): Promise<T | Response> {
    this.logger.info(`Fetching ${description} from ${url}`);

    try {
      const response = await $fetch(url, {
        headers: this.headers,
        params
      }) as unknown;

      return transform(response);
    } catch (error: unknown) {
      this.logger.error(`Error fetching ${description}:`, error);
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
      return new Response(`Error fetching ${description}: ${error}`, { status: statusCode || 500 });
    }
  }
}
