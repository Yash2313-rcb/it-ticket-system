import { ModulePage } from '@/components/modules/module-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ModulePage configKey="amc_contracts" basePath="/maintenance/amc" sp={await searchParams} />;
}
