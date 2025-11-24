import { Seat } from "@/model/Seat";
import { resolve } from 'path';
import { GitHubApiClient, resolveEndpoint } from '../utils/copilotApiClient';

export default defineEventHandler(async (event) => {

  const apiClient = new GitHubApiClient(event);

  const endpoint = resolveEndpoint(event.context.scope, {
    team: ({ org }) => ({
      url: `https://api.github.com/orgs/${org}/copilot/billing/seats`,
      mockPath: resolve('public/mock-data/organization_seats_response_sample.json'),
      description: 'seats data'
    }),
    org: ({ org }) => ({
      url: `https://api.github.com/orgs/${org}/copilot/billing/seats`,
      mockPath: resolve('public/mock-data/organization_seats_response_sample.json'),
      description: 'seats data'
    }),
    ent: ({ ent }) => ({
      url: `https://api.github.com/enterprises/${ent}/copilot/billing/seats`,
      mockPath: resolve('public/mock-data/enterprise_seats_response_sample.json'),
      description: 'seats data'
    })
  }, event.context);

  if (endpoint instanceof Response) {
    return endpoint;
  }

  const mockResponse = apiClient.readMock(endpoint.mockPath, (data) => {
    const seatsJson = (data as { seats: unknown[] }).seats;
    return seatsJson.map((item: unknown) => new Seat(item));
  });

  if (mockResponse) {
    return mockResponse;
  }

  const authError = apiClient.ensureAuth();

  if (authError) {
    return authError;
  }

  const perPage = 100;
  let page = 1;
  const firstPage = await apiClient.fetchJson(endpoint.url, {
    description: `${endpoint.description} (page ${page})`,
    params: {
      per_page: perPage,
      page: page
    },
    transform: (response) => {
      const payload = response as { seats: unknown[], total_seats: number };
      return {
        seats: payload.seats.map((item: unknown) => new Seat(item)),
        totalSeats: payload.total_seats
      };
    }
  });

  if (firstPage instanceof Response) {
    return firstPage;
  }

  let seatsData = firstPage.seats;

  // Calculate the total pages
  const totalSeats = firstPage.totalSeats;
  const totalPages = Math.ceil(totalSeats / perPage);

  // Fetch the remaining pages
  for (page = 2; page <= totalPages; page++) {
    const nextPage = await apiClient.fetchJson(endpoint.url, {
      description: `${endpoint.description} (page ${page})`,
      params: {
        per_page: perPage,
        page: page
      },
      transform: (response) => {
        const payload = response as { seats: unknown[] };
        return payload.seats.map((item: unknown) => new Seat(item));
      }
    });

    if (nextPage instanceof Response) {
      return nextPage;
    }

    seatsData = seatsData.concat(nextPage);
  }

  return seatsData;
})