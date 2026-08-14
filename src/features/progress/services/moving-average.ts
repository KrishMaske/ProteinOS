export type DatedValue = { date: string; value: number };

export function sevenDayMovingAverage(points: DatedValue[]) {
  const dayMs = 86_400_000;
  return points.map((point, index) => {
    const end = new Date(point.date).getTime();
    const window = points.slice(0, index + 1).filter((candidate) => {
      const time = new Date(candidate.date).getTime();
      return time >= end - 6 * dayMs && time <= end;
    });
    return { date: point.date, value: window.reduce((sum, item) => sum + item.value, 0) / window.length };
  });
}
