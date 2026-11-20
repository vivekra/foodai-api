import type { Request, Response } from 'express';
import { prisma } from '../../../utils/prisma.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendSuccess, sendNoContent } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const getRestaurantMenu = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId } = req.params;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  sendSuccess(res, categories);
});

export const createCategory = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId, name, description, imageUrl, sortOrder } = req.body;

  if (!restaurantId || !name) {
    throw AppError.badRequest('restaurantId and name are required');
  }

  const category = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name,
      description,
      imageUrl,
      sortOrder: sortOrder ?? 0,
    },
  });

  sendCreated(res, category, 'Menu category created');
});

export const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, imageUrl, sortOrder, isActive } = req.body;

  const category = await prisma.menuCategory.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  sendSuccess(res, category, 'Menu category updated');
});

export const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.menuCategory.delete({
    where: { id },
  });

  sendNoContent(res);
});

export const createMenuItem = catchAsync(async (req: Request, res: Response) => {
  const {
    restaurantId,
    categoryId,
    name,
    description,
    basePrice,
    imageUrl,
    sizes,
    addons,
    calories,
    ingredients,
    dietary,
    spiceLevel,
    allergens,
    isFeatured,
  } = req.body;

  if (!restaurantId || !categoryId || !name || basePrice === undefined) {
    throw AppError.badRequest('restaurantId, categoryId, name, and basePrice are required');
  }

  const item = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId,
      name,
      description,
      basePrice,
      imageUrl,
      sizes: sizes ?? [],
      addons: addons ?? [],
      calories: calories ?? null,
      ingredients: ingredients ?? [],
      dietary: dietary ?? [],
      spiceLevel: spiceLevel ?? 0,
      allergens: allergens ?? [],
      isFeatured: isFeatured ?? false,
    },
  });

  sendCreated(res, item, 'Menu item created');
});

export const updateMenuItem = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  delete updateData.id;
  delete updateData.restaurantId;

  const item = await prisma.menuItem.update({
    where: { id },
    data: updateData,
  });

  sendSuccess(res, item, 'Menu item updated');
});

export const toggleItemAvailability = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    throw AppError.badRequest('isActive boolean is required');
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: { isActive },
  });

  sendSuccess(res, item, `Item availability set to ${isActive ? 'in stock' : 'sold out'}`);
});

export const deleteMenuItem = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.menuItem.delete({
    where: { id },
  });

  sendNoContent(res);
});
