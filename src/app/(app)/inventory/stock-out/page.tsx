import { StockPage } from '@/components/inventory/stock-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <StockPage sp={await searchParams} basePath="/inventory/stock-out" title="Stock out" description="Items issued to employees, and damaged stock written off." types={['stock_out', 'damaged']} dialogs={[{ type: 'stock_out', label: 'Issue stock' }, { type: 'damaged', label: 'Damaged stock' }]} />;
}
