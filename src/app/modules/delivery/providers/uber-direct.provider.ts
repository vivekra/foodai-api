import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryStatus,
} from '@/types';

interface UberToken {
  access_token: string;
  expires_in: number;
}

interface UberQuoteResponse {
  fee: { total: number };
  duration: number;
  id: string;
}

interface UberDeliveryResponse {
  id: string;
  tracking_url: string;
  pickup_eta: string;
  dropoff_eta: string;
}

interface UberStatusResponse {
  status: string;
}

export class UberDirectProvider implements IDeliveryProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly customerId: string;
  private readonly baseUrl = 'https://api.uber.com/v1/eats/deliveries';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config?: Record<string, string>) {
    this.clientId = config?.['clientId'] ?? process.env['UBER_DIRECT_CLIENT_ID']!;
    this.clientSecret = config?.['clientSecret'] ?? process.env['UBER_DIRECT_CLIENT_SECRET']!;
    this.customerId = config?.['customerId'] ?? process.env['UBER_DIRECT_CUSTOMER_ID']!;
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }
    const response = await fetch('https://login.uber.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'eats.deliveries',
      }),
    });
    const data = await response.json() as UberToken;
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }

  async getQuote(request: DeliveryQuoteRequest): Promise<DeliveryQuote> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
        dropoff_address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
        pickup_latitude: request.pickup.latitude,
        pickup_longitude: request.pickup.longitude,
        dropoff_latitude: request.dropoff.latitude,
        dropoff_longitude: request.dropoff.longitude,
      }),
    });
    const data = await response.json() as UberQuoteResponse;
    return {
      provider: 'uber_direct',
      priceGbp: data.fee.total / 100,
      etaMinutes: Math.ceil(data.duration / 60),
      quoteId: data.id,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResult> {
    const token = await this.getAccessToken();
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: request.quoteId,
        pickup_name: request.pickup.contactName,
        pickup_address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
        pickup_phone_number: request.pickup.contactPhone,
        dropoff_name: request.dropoff.contactName,
        dropoff_address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
        dropoff_phone_number: request.customerPhone,
        dropoff_notes: request.notes,
        manifest_items: (request.items ?? []).map((i) => ({
          name: i.name, quantity: i.quantity,
        })),
      }),
    });
    const data = await response.json() as UberDeliveryResponse;
    return {
      jobId: data.id,
      trackingUrl: data.tracking_url,
      estimatedPickupAt: new Date(data.pickup_eta),
      estimatedDropoffAt: new Date(data.dropoff_eta),
    };
  }

  async cancelDelivery(jobId: string): Promise<void> {
    const token = await this.getAccessToken();
    await fetch(`${this.baseUrl}/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getStatus(jobId: string): Promise<DeliveryStatus> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json() as UberStatusResponse;
    const statusMap: Record<string, DeliveryStatus> = {
      pending: 'PENDING',
      pickup: 'DRIVER_ASSIGNED',
      pickup_complete: 'PICKED_UP',
      dropoff: 'PICKED_UP',
      delivered: 'DELIVERED',
      canceled: 'CANCELLED',
      returned: 'FAILED',
    };
    return statusMap[data.status] ?? 'PENDING';
  }
}
