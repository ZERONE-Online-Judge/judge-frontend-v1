import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';

type AnimatedNumberProps = {
  durationMs?: number;
  value?: number | null;
  scope?: string;
};

export default function AnimatedNumber({
  durationMs = 450,
  value,
  scope,
}: AnimatedNumberProps) {
  const display = useAnimatedValue(value ?? 0, scope, durationMs);
  return (display ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}
