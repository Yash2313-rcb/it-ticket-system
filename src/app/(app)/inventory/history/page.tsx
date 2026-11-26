import { StockPage } from '@/components/inventory/stock-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <StockPage sp={await searchParams} basePath="/inventory/history" title="Stock history" description="Every stock transaction, newest first." types={['stock_in', 'stock_out', 'transfer', 'adjustment', 'damaged', 'returned']} dialogs={[{ type: 'stock_in', label: 'Stock in' }, { type: 'stock_out', label: 'Issue stock' }]} />;
}
