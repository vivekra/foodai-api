import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryStatus,
} from '@/types';

interface DeliverooQuoteResponse {
  quote_id: string;
  fee: {
    amount: number;
    currency: string;
  };
  duration_minutes: number;
}

interface DeliverooDeliveryResponse {
  delivery_id: string;
  tracking_url?: string;
  estimated_pickup_at?: string;
  estimated_dropoff_at?: string;
}

interface DeliverooStatusResponse {
  status: string;
}

export class DeliverooExpressProvider implements IDeliveryProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.deliveroo.com/orderpad';

  constructor(config?: Record<string, string>) {
    this.apiKey = config?.['apiKey'] ?? process.env['DELIVEROO_API_KEY']!;
  }

  async getQuote(request: DeliveryQuoteRequest): Promise<DeliveryQuote> {
    const response = await fetch(`${this.baseUrl}/quotes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickup: {
          address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
          lat: request.pickup.latitude,
          lon: request.pickup.longitude,
        },
        dropoff: {
          address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
          lat: request.dropoff.latitude,
          lon: request.dropoff.longitude,
        },
      }),
    });

    const data = (await response.json()) as DeliverooQuoteResponse;
    const feeGbp = data.fee?.amount ? (data.fee.amount > 100 ? data.fee.amount / 100 : data.fee.amount) : 5.0;

    return {
      provider: 'deliveroo_express',
      priceGbp: feeGbp,
      etaMinutes: data.duration_minutes ?? 25,
      quoteId: data.quote_id ?? `deliv_${Date.now()}`,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResult> {
    const response = await fetch(`${this.baseUrl}/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quote_id: request.quoteId,
        order_reference: request.orderId,
        pickup: {
          address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
          contact_name: request.pickup.contactName,
          phone: request.pickup.contactPhone,
        },
        dropoff: {
          address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
          contact_name: request.dropoff.contactName,
          phone: request.customerPhone,
          instructions: request.notes,
        },
        items: (request.items ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
        })),
      }),
    });

    const data = (await response.json()) as DeliverooDeliveryResponse;
    return {
      jobId: data.delivery_id,
      trackingUrl: data.tracking_url,
      estimatedPickupAt: data.estimated_pickup_at ? new Date(data.estimated_pickup_at) : undefined,
      estimatedDropoffAt: data.estimated_dropoff_at ? new Date(data.estimated_dropoff_at) : undefined,
    };
  }

  async cancelDelivery(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/deliveries/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getStatus(jobId: string): Promise<DeliveryStatus> {
    const response = await fetch(`${this.baseUrl}/deliveries/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const data = (await response.json()) as DeliverooStatusResponse;
    const statusMap: Record<string, DeliveryStatus> = {
      pending: 'PENDING',
      searching: 'SEARCHING',
      assigned: 'DRIVER_ASSIGNED',
      accepted: 'DRIVER_ASSIGNED',
      arrived_at_pickup: 'DRIVER_ASSIGNED',
      collected: 'PICKED_UP',
      in_transit: 'PICKED_UP',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
      failed: 'FAILED',
    };
    return statusMap[data.status] ?? 'PENDING';
  }
}
