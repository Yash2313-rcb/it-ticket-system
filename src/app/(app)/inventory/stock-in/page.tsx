import { StockPage } from '@/components/inventory/stock-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <StockPage sp={await searchParams} basePath="/inventory/stock-in" title="Stock in" description="Purchases and returned items added to stock." types={['stock_in', 'returned']} dialogs={[{ type: 'stock_in', label: 'Stock in' }, { type: 'returned', label: 'Returned stock' }]} />;
}
