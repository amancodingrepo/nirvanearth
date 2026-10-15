import { roundMoney } from "@nirvan/rules";

export function money(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return roundMoney(Number(value.toString()));
}

export function dec(value: number): string {
  return roundMoney(value).toFixed(2);
}
