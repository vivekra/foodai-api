import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FoodAI Platform...');

  // Create default active pricing config
  const existing = await prisma.platformPricingConfig.findFirst({
    where: { isActive: true },
  });

  if (!existing) {
    await prisma.platformPricingConfig.create({
      data: {
        version: 1,
        isActive: true,
        freeCommissionRate: 15.00,
        starterCommissionRate: 8.00,
        proCommissionRate: 5.00,
        enterpriseCommissionRate: 2.00,
        voiceSurchargeRate: 2.00,
        starterMonthlyGbp: 29.00,
        proMonthlyGbp: 79.00,
        enterpriseMonthlyGbp: 199.00,
        updatedBy: 'seed',
        changeReason: 'Initial platform pricing configuration',
      },
    });
    console.log('✅ Created default pricing config');
  }

  console.log('🌱 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
