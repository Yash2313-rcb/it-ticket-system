import { ModulePage } from '@/components/modules/module-page';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ModulePage configKey="maintenance_schedules" basePath="/maintenance/schedule" sp={await searchParams} />;
}
