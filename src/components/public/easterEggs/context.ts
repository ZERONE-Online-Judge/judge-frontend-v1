import { createContext, useContext } from 'react';

export type EggOrigin = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
export type EggPoint = { x: number; y: number };
export type PublicEggActions = {
  openTyping: (origin: EggOrigin) => void;
  tapSpotlight: (point: EggPoint) => void;
  celebrate: () => void;
};
export const PublicEggContext = createContext<PublicEggActions>({
  openTyping: () => {},
  tapSpotlight: () => {},
  celebrate: () => {},
});
export function usePublicEasterEggs() {
  return useContext(PublicEggContext);
}
export function isPublicEggPath(pathname: string) {
  return !/^\/(?:operator|admin|presentation)(?:\/|$)/.test(pathname);
}
