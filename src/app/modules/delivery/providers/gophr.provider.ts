import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryStatus,
} from '@/types';

interface GophrQuoteResponse {
  quote_id: string;
  fee_net: number;
  fee_gross?: number;
  pickup_eta_minutes?: number;
  duration_minutes?: number;
}

interface GophrJobResponse {
  job_id: string;
  tracking_url?: string;
  pickup_eta?: string;
  delivery_eta?: string;
}

interface GophrStatusResponse {
  status: string;
}

export class GophrProvider implements IDeliveryProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.gophr.com/v1';

  constructor(config?: Record<string, string>) {
    this.apiKey = config?.['apiKey'] ?? process.env['GOPHR_API_KEY']!;
  }

  async getQuote(request: DeliveryQuoteRequest): Promise<DeliveryQuote> {
    const response = await fetch(`${this.baseUrl}/quotes`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickup_postcode: request.pickup.postcode,
        pickup_address: `${request.pickup.line1}, ${request.pickup.city}`,
        pickup_lat: request.pickup.latitude,
        pickup_lng: request.pickup.longitude,
        delivery_postcode: request.dropoff.postcode,
        delivery_address: `${request.dropoff.line1}, ${request.dropoff.city}`,
        delivery_lat: request.dropoff.latitude,
        delivery_lng: request.dropoff.longitude,
        vehicle_type: 'bicycle',
      }),
    });

    const data = (await response.json()) as GophrQuoteResponse;
    const price = data.fee_net ?? data.fee_gross ?? 5.5;

    return {
      provider: 'gophr',
      priceGbp: price > 100 ? price / 100 : price,
      etaMinutes: data.duration_minutes ?? (data.pickup_eta_minutes ? data.pickup_eta_minutes + 20 : 30),
      quoteId: data.quote_id ?? `gophr_${Date.now()}`,
    };
  }

  async createDelivery(request: CreateDeliveryRequest): Promise<DeliveryResult> {
    const response = await fetch(`${this.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quote_id: request.quoteId,
        external_id: request.orderId,
        pickup_contact_name: request.pickup.contactName,
        pickup_mobile_number: request.pickup.contactPhone,
        pickup_address: `${request.pickup.line1}, ${request.pickup.city}, ${request.pickup.postcode}`,
        delivery_contact_name: request.dropoff.contactName,
        delivery_mobile_number: request.customerPhone,
        delivery_address: `${request.dropoff.line1}, ${request.dropoff.city}, ${request.dropoff.postcode}`,
        delivery_instructions: request.notes,
        parcel_description: (request.items ?? []).map((i) => `${i.quantity}x ${i.name}`).join(', '),
      }),
    });

    const data = (await response.json()) as GophrJobResponse;
    return {
      jobId: data.job_id,
      trackingUrl: data.tracking_url,
      estimatedPickupAt: data.pickup_eta ? new Date(data.pickup_eta) : undefined,
      estimatedDropoffAt: data.delivery_eta ? new Date(data.delivery_eta) : undefined,
    };
  }

  async cancelDelivery(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async getStatus(jobId: string): Promise<DeliveryStatus> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      headers: {
        'X-API-KEY': this.apiKey,
      },
    });
    const data = (await response.json()) as GophrStatusResponse;
    const statusMap: Record<string, DeliveryStatus> = {
      pending: 'PENDING',
      created: 'PENDING',
      allocating: 'SEARCHING',
      assigned: 'DRIVER_ASSIGNED',
      accepted: 'DRIVER_ASSIGNED',
      collected: 'PICKED_UP',
      in_transit: 'PICKED_UP',
      completed: 'DELIVERED',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
      failed: 'FAILED',
    };
    return statusMap[data.status] ?? 'PENDING';
  }
}
