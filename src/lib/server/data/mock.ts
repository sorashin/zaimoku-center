import type {
  Listing,
  ListingFilter,
  ListingSort,
  ListingWithSeller,
  PurchaseRequest,
  Seller,
} from '@/lib/types';
import { seedListings, seedSellers } from '@/data/seed';
import type { DataLayer } from './types';

// ===== インメモリストア =====
// モジュールスコープでシードから初期化。ミューテーションは dev サーバー生存中のみ保持。

const sellers = new Map<string, Seller>(seedSellers.map((s) => [s.id, s]));
const listings: Listing[] = seedListings.map((l) => ({ ...l, photos: [...l.photos] }));
// userId -> Set<listingId>
const favorites = new Map<string, Set<string>>();
const purchaseRequests: PurchaseRequest[] = [];

let idCounter = 1000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function withSeller(listing: Listing): ListingWithSeller {
  const seller = sellers.get(listing.sellerId);
  if (!seller) {
    throw new Error(`seller not found: ${listing.sellerId}`);
  }
  return { ...listing, seller };
}

function applyFilter(list: Listing[], filter?: ListingFilter): Listing[] {
  const status = filter?.status ?? 'published';
  return list.filter((l) => {
    if (l.status !== status) return false;
    if (filter?.sellerId && l.sellerId !== filter.sellerId) return false;
    if (filter?.sawnOnly && !filter.irregularOnly && l.shape !== 'sawn') return false;
    if (filter?.irregularOnly && !filter.sawnOnly && l.shape !== 'irregular') return false;
    if (filter?.query) {
      const q = filter.query.trim().toLowerCase();
      if (q) {
        const hay = `${l.title} ${l.species}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
    }
    return true;
  });
}

function applySort(list: Listing[], sort?: ListingSort): Listing[] {
  const sorted = [...list];
  if (sort === 'price_asc') {
    sorted.sort((a, b) => a.price - b.price);
  } else {
    // newest（既定）
    sorted.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }
  return sorted;
}

export const mockDataLayer: DataLayer = {
  async getSellers() {
    return [...sellers.values()];
  },

  async getSeller(id) {
    return sellers.get(id) ?? null;
  },

  async getListings(filter, sort) {
    const filtered = applyFilter(listings, filter);
    const sorted = applySort(filtered, sort);
    return sorted.map(withSeller);
  },

  async getListing(id) {
    const found = listings.find((l) => l.id === id);
    return found ? withSeller(found) : null;
  },

  async getSellerListings(sellerId, includeAll = false) {
    const filtered = includeAll
      ? listings.filter((l) => l.sellerId === sellerId)
      : applyFilter(listings, { sellerId, status: 'published' });
    return applySort(filtered, 'newest').map(withSeller);
  },

  async getAllListings() {
    // 全出品者・全ステータス（admin 管理画面用）。
    return applySort([...listings], 'newest').map(withSeller);
  },

  async getRelatedListings(listing, limit = 6) {
    // 同じ出品者の他の材を優先、足りなければ同じ樹種
    const sameSeller = listings.filter(
      (l) => l.id !== listing.id && l.sellerId === listing.sellerId && l.status === 'published'
    );
    const sameSpecies = listings.filter(
      (l) =>
        l.id !== listing.id &&
        l.sellerId !== listing.sellerId &&
        l.species === listing.species &&
        l.status === 'published'
    );
    const combined = [...sameSeller, ...sameSpecies].slice(0, limit);
    return combined.map(withSeller);
  },

  async createListing(input) {
    const listing: Listing = {
      ...input,
      id: nextId('listing'),
      photos: [...input.photos],
      postedAt: new Date().toISOString(),
    };
    listings.unshift(listing);
    return withSeller(listing);
  },

  async updateListing(id, patch) {
    const idx = listings.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    const existing = listings[idx]!;
    const updated: Listing = {
      ...existing,
      ...patch,
      id: existing.id,
      photos: patch.photos ? [...patch.photos] : existing.photos,
    };
    listings[idx] = updated;
    return withSeller(updated);
  },

  async deleteListing(id) {
    const idx = listings.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    listings.splice(idx, 1);
    return true;
  },

  async toggleFavorite(userId, listingId) {
    let set = favorites.get(userId);
    if (!set) {
      set = new Set<string>();
      favorites.set(userId, set);
    }
    if (set.has(listingId)) {
      set.delete(listingId);
      return false;
    }
    set.add(listingId);
    return true;
  },

  async getFavoriteIds(userId) {
    return [...(favorites.get(userId) ?? new Set<string>())];
  },

  async getFavoriteListings(userId) {
    const ids = favorites.get(userId) ?? new Set<string>();
    return listings
      .filter((l) => ids.has(l.id) && l.status === 'published')
      .map(withSeller);
  },

  async createPurchaseRequest(input) {
    const req: PurchaseRequest = {
      ...input,
      id: nextId('req'),
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    purchaseRequests.push(req);
    return req;
  },
};
