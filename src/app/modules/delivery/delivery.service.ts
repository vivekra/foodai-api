import type {
  IDeliveryProvider,
  DeliveryQuoteRequest,
  DeliveryQuote,
  CreateDeliveryRequest,
  DeliveryResult,
  DeliveryProvider,
} from '@/types';
import { decrypt } from '../../../utils/encryption.js';
import { prisma } from '../../../utils/prisma.js';
import { AppError } from '../../../shared/AppError.js';

export async function getDeliveryProvider(
  restaurantId: string,
  providerName: string
): Promise<IDeliveryProvider> {
  const config = await prisma.restaurantDeliveryConfig.findUnique({
    where: { restaurantId_provider: { restaurantId, provider: providerName } },
  });

  if (!config || !config.isEnabled) {
    throw AppError.badRequest(
      `Delivery provider ${providerName} is not enabled for this restaurant`
    );
  }

  let providerConfig: Record<string, string> = {};
  if (config.mode === 'byok' && config.encryptedConfig) {
    providerConfig = JSON.parse(decrypt(config.encryptedConfig)) as Record<string, string>;
  }

  const byokConfig = config.mode === 'byok' ? providerConfig : undefined;

  switch (providerName as DeliveryProvider) {
    case 'uber_direct': {
      const { UberDirectProvider } = await import('./providers/uber-direct.provider.js');
      return new UberDirectProvider(byokConfig);
    }
    case 'stuart': {
      const { StuartProvider } = await import('./providers/stuart.provider.js');
      return new StuartProvider(byokConfig);
    }
    case 'deliveroo_express': {
      const { DeliverooExpressProvider } = await import('./providers/deliveroo-express.provider.js');
      return new DeliverooExpressProvider(byokConfig);
    }
    case 'gophr': {
      const { GophrProvider } = await import('./providers/gophr.provider.js');
      return new GophrProvider(byokConfig);
    }
    case 'shipday': {
      const { ShipdayProvider } = await import('./providers/shipday.provider.js');
      return new ShipdayProvider(byokConfig);
    }
    default:
      throw AppError.badRequest(`Unknown delivery provider: ${providerName}`);
  }
}

export async function getAllQuotes(
  restaurantId: string,
  request: DeliveryQuoteRequest
): Promise<DeliveryQuote[]> {
  const configs = await prisma.restaurantDeliveryConfig.findMany({
    where: { restaurantId, isEnabled: true },
    select: { provider: true },
  });

  const quoteResults = await Promise.allSettled(
    configs.map(async ({ provider }) => {
      const p = await getDeliveryProvider(restaurantId, provider);
      return p.getQuote(request);
    })
  );

  return quoteResults
    .filter(
      (r): r is PromiseFulfilledResult<DeliveryQuote> =>
        r.status === 'fulfilled'
    )
    .map((r) => r.value)
    .sort((a, b) => a.priceGbp - b.priceGbp);
}
