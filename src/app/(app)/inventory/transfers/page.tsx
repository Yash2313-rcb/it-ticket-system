import { StockPage } from '@/components/inventory/stock-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <StockPage sp={await searchParams} basePath="/inventory/transfers" title="Stock transfers" description="Storage location moves and authorised stock adjustments." types={['transfer', 'adjustment']} dialogs={[{ type: 'transfer', label: 'Transfer stock' }, { type: 'adjustment', label: 'Stock adjustment', adminOnly: true }]} />;
}
