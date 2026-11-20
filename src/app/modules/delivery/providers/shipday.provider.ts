import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryStatus,
} from '@/types';

interface ShipdayOrderResponse {
  success: boolean;
  orderId?: number;
  trackingLink?: string;
  expectedDeliveryDate?: string;
  expectedDeliveryTime?: string;
}

interface ShipdayDetailsResponse {
  orderId: number;
  orderStatus: {
    orderStatus: string;
    incomplete: boolean;
    accepted: boolean;
    started: boolean;
    pickedUp: boolean;
    delivered: boolean;
    failedDelivery: boolean;
  };
}

export class ShipdayProvider implements IDeliveryProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://dispatch.shipday.com/api';

  constructor(config?: Record<string, string>) {
    this.apiKey = config?.['apiKey'] ?? process.env['SHIPDAY_API_KEY']!;
  }

  private getAuthHeader(): string {
    const encoded = Buffer.from(`${this.apiKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  async getQuote(_request: DeliveryQuoteRequest): Promise<DeliveryQuote> {
    // Shipday does not offer a dynamic quote API; return fixed estimate
    return {
      provider: 'shipday',
      priceGbp: 5.5,
      etaMinutes: 35,
      quoteId: `shipday_fixed_${Date.now()}`,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResult> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderNumber: request.orderId,
        customerName: request.dropoff.contactName,
        customerAddress: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
        customerPhoneNumber: request.customerPhone,
        restaurantName: request.pickup.contactName,
        restaurantAddress: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
        restaurantPhoneNumber: request.pickup.contactPhone,
        deliveryInstruction: request.notes,
        orderItem: (request.items ?? []).map((i) => ({
          name: i.name,
          unitPrice: 0,
          quantity: i.quantity,
        })),
      }),
    });

    const data = (await response.json()) as ShipdayOrderResponse;
    const jobId = String(data.orderId ?? request.orderId);
    return {
      jobId,
      trackingUrl: data.trackingLink ?? `https://dispatch.shipday.com/track/${jobId}`,
    };
  }

  async cancelDelivery(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/orders/${jobId}`, {
      method: 'DELETE',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });
  }

  async getStatus(jobId: string): Promise<DeliveryStatus> {
    const response = await fetch(`${this.baseUrl}/orderQuery/${jobId}`, {
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });
    const data = (await response.json()) as ShipdayDetailsResponse;
    const s = data.orderStatus;
    if (!s) return 'PENDING';
    if (s.failedDelivery) return 'FAILED';
    if (s.delivered) return 'DELIVERED';
    if (s.pickedUp || s.started) return 'PICKED_UP';
    if (s.accepted) return 'DRIVER_ASSIGNED';
    if (s.incomplete) return 'PENDING';

    const statusMap: Record<string, DeliveryStatus> = {
      NOT_ASSIGNED: 'PENDING',
      UNASSIGNED: 'PENDING',
      ASSIGNED: 'DRIVER_ASSIGNED',
      ACCEPTED: 'DRIVER_ASSIGNED',
      STARTED: 'PICKED_UP',
      PICKED_UP: 'PICKED_UP',
      ON_THE_WAY: 'PICKED_UP',
      DELIVERED: 'DELIVERED',
      COMPLETED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
      FAILED_DELIVERY: 'FAILED',
    };
    return statusMap[s.orderStatus] ?? 'PENDING';
  }
}
