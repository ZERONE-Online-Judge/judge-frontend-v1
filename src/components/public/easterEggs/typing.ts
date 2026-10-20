export const TYPING_SOURCE = `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;

export function typingSpeed(source: string, input: string, elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  const correct = [...input].filter(
    (character, index) => character === source[index],
  ).length;
  return Math.round((correct * 60_000) / Math.max(1000, elapsedMs));
}
