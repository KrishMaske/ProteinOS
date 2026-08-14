import { useQuery } from '@tanstack/react-query';
import { getTodayDashboard } from '@/features/today/api/today';
export function useToday(date: string) { return useQuery({ queryKey: ['today', date], queryFn: () => getTodayDashboard(date) }); }
