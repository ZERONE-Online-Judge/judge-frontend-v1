export const CAFE_MENU = [
  '아메리카노',
  '라떼',
  '바닐라라떼',
  '카푸치노',
  '레모네이드',
  '녹차',
];
export type ReceiptItem = { menu: string; quantity: number };
export type CafeQuestion = { receipts: ReceiptItem[][]; target: string };

export function createCafeQuestion(
  random: () => number = Math.random,
): CafeQuestion {
  const receipts = Array.from({ length: 3 }, () => {
    const menu = [...CAFE_MENU];
    for (let index = menu.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [menu[index], menu[swap]] = [menu[swap], menu[index]];
    }
    return menu.slice(0, 3 + Math.floor(random() * 3)).map((name) => ({
      menu: name,
      quantity: 1 + Math.floor(random() * 3),
    }));
  });
  const ordered = [...new Set(receipts.flat().map((item) => item.menu))];
  return { receipts, target: ordered[Math.floor(random() * ordered.length)] };
}

export function countDrink({ receipts, target }: CafeQuestion): number {
  return receipts
    .flat()
    .reduce((sum, item) => sum + (item.menu === target ? item.quantity : 0), 0);
}
