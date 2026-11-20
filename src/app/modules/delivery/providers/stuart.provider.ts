import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryStatus,
} from '@/types';

interface StuartToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface StuartPricingResponse {
  amount: number;
  currency: string;
  duration?: number;
}

interface StuartJobResponse {
  id: number;
  status: string;
  deliveries?: Array<{
    id: number;
    status: string;
    tracking_url?: string;
    eta?: {
      pickup?: string;
      dropoff?: string;
    };
  }>;
}

interface StuartStatusResponse {
  id: number;
  status: string;
}

export class StuartProvider implements IDeliveryProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl = 'https://api.stuart.com';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config?: Record<string, string>) {
    this.clientId = config?.['clientId'] ?? process.env['STUART_CLIENT_ID']!;
    this.clientSecret = config?.['clientSecret'] ?? process.env['STUART_CLIENT_SECRET']!;
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'api',
      }),
    });
    const data = (await response.json()) as StuartToken;
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }

  async getQuote(request: DeliveryQuoteRequest): Promise<DeliveryQuote> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/jobs/pricing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: {
          pickups: [
            {
              address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
            },
          ],
          dropoffs: [
            {
              address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
              package_type: 'standard',
            },
          ],
        },
      }),
    });
    const data = (await response.json()) as StuartPricingResponse;
    return {
      provider: 'stuart',
      priceGbp: data.amount,
      etaMinutes: data.duration ?? 30,
      quoteId: `stuart_quote_${Date.now()}`,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResult> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: {
          assignment_code: request.orderId,
          pickups: [
            {
              address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
              contact: {
                firstname: request.pickup.contactName,
                phone: request.pickup.contactPhone,
              },
            },
          ],
          dropoffs: [
            {
              address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
              contact: {
                firstname: request.dropoff.contactName,
                phone: request.customerPhone,
              },
              client_reference: request.orderId,
              comments: request.notes ?? '',
              package_description: (request.items ?? []).map((i) => `${i.quantity}x ${i.name}`).join(', '),
            },
          ],
        },
      }),
    });
    const data = (await response.json()) as StuartJobResponse;
    const firstDelivery = data.deliveries?.[0];
    return {
      jobId: String(data.id),
      trackingUrl: firstDelivery?.tracking_url,
      estimatedPickupAt: firstDelivery?.eta?.pickup ? new Date(firstDelivery.eta.pickup) : undefined,
      estimatedDropoffAt: firstDelivery?.eta?.dropoff ? new Date(firstDelivery.eta.dropoff) : undefined,
    };
  }

  async cancelDelivery(jobId: string): Promise<void> {
    const token = await this.getAccessToken();
    await fetch(`${this.baseUrl}/v2/jobs/${jobId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getStatus(jobId: string): Promise<DeliveryStatus> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as StuartStatusResponse;
    const statusMap: Record<string, DeliveryStatus> = {
      new: 'PENDING',
      searching: 'SEARCHING',
      in_progress: 'DRIVER_ASSIGNED',
      picking: 'DRIVER_ASSIGNED',
      almost_picking: 'DRIVER_ASSIGNED',
      delivering: 'PICKED_UP',
      almost_delivering: 'PICKED_UP',
      finished: 'DELIVERED',
      cancelled: 'CANCELLED',
      expired: 'FAILED',
    };
    return statusMap[data.status] ?? 'PENDING';
  }
}
